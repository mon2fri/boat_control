from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import polars as pl

from apps.rules.services import Rule, load_rules


@dataclass(frozen=True)
class AttributeChange:
    column: str
    file_a_value: Any
    file_b_value: Any


@dataclass(frozen=True)
class RowComparison:
    row_index: int
    key_columns: dict[str, Any]
    attribute_changes: list[AttributeChange]
    change_count: int


@dataclass(frozen=True)
class ValidationViolation:
    row_index: int
    rule_id: str
    rule_name: str
    key_columns: dict[str, Any]
    details: str


@dataclass(frozen=True)
class ComparisonResult:
    total_rows_a: int
    total_rows_b: int
    rows_with_changes: int
    total_attribute_changes: int
    row_details: list[RowComparison]


@dataclass(frozen=True)
class ValidationResult:
    total_violations: int
    violations_by_rule: dict[str, list[ValidationViolation]]
    violation_count_by_rule: dict[str, int]


@dataclass(frozen=True)
class ExecutionResult:
    comparison: ComparisonResult
    validation: ValidationResult
    common_columns: list[str]
    target_columns: list[str]
    filters_applied: list[dict[str, str]]


def apply_filters(
    df_a: pl.LazyFrame, df_b: pl.LazyFrame, filters: list[dict[str, str]]
) -> tuple[pl.LazyFrame, pl.LazyFrame]:
    for f in filters:
        col = f["column"]
        op = f["operator"]
        val = f["filter_value"]

        if op == "eq":
            df_a = df_a.filter(pl.col(col) == val)
            df_b = df_b.filter(pl.col(col) == val)
        elif op == "neq":
            df_a = df_a.filter(pl.col(col) != val)
            df_b = df_b.filter(pl.col(col) != val)
        elif op == "contains":
            df_a = df_a.filter(pl.col(col).str.contains(val))
            df_b = df_b.filter(pl.col(col).str.contains(val))
        elif op == "ncontains":
            df_a = df_a.filter(~pl.col(col).str.contains(val))
            df_b = df_b.filter(~pl.col(col).str.contains(val))

    return df_a, df_b


def compare_rows(
    df_a: pl.DataFrame,
    df_b: pl.DataFrame,
    target_columns: list[str],
    key_columns: list[str],
) -> ComparisonResult:
    total_a = df_a.height
    total_b = df_b.height

    if not key_columns:
        key_columns = [df_a.columns[0]] if df_a.columns else []

    if not key_columns:
        return ComparisonResult(
            total_rows_a=total_a,
            total_rows_b=total_b,
            rows_with_changes=0,
            total_attribute_changes=0,
            row_details=[],
        )

    merged = df_a.join(
        df_b,
        on=key_columns,
        how="full",
        suffix="_b",
        coalesce=True,
    )

    rows_with_changes = 0
    total_changes = 0
    row_details: list[RowComparison] = []

    for idx in range(merged.height):
        row = merged.row(idx, named=True)
        changes: list[AttributeChange] = []

        for col in target_columns:
            col_b = f"{col}_b"
            val_a = row.get(col)
            val_b = row.get(col_b)

            if col_b in row:
                val_a = row[col]
                val_b = row[col_b]

            if val_a != val_b:
                changes.append(
                    AttributeChange(
                        column=col,
                        file_a_value=val_a,
                        file_b_value=val_b,
                    )
                )

        if changes:
            rows_with_changes += 1
            total_changes += len(changes)
            key_vals = {k: row[k] for k in key_columns if k in row}
            row_details.append(
                RowComparison(
                    row_index=idx,
                    key_columns=key_vals,
                    attribute_changes=changes,
                    change_count=len(changes),
                )
            )

    return ComparisonResult(
        total_rows_a=total_a,
        total_rows_b=total_b,
        rows_with_changes=rows_with_changes,
        total_attribute_changes=total_changes,
        row_details=row_details,
    )


def validate_rows(
    df: pl.DataFrame,
    rules: list[Rule],
    target_columns: list[str],
) -> ValidationResult:
    violations_by_rule: dict[str, list[ValidationViolation]] = {}
    violation_count_by_rule: dict[str, int] = {}

    for rule in rules:
        violations: list[ValidationViolation] = []

        for idx in range(df.height):
            row = df.row(idx, named=True)
            if _check_rule(row, rule, target_columns):
                key_cols = {col: row[col] for col in df.columns[:3]}
                violations.append(
                    ValidationViolation(
                        row_index=idx,
                        rule_id=rule.rule_id,
                        rule_name=rule.name,
                        key_columns=key_cols,
                        details=f"Violated {rule.rule_id}: {rule.name}",
                    )
                )

        violations_by_rule[rule.rule_id] = violations
        violation_count_by_rule[rule.rule_id] = len(violations)

    total = sum(violation_count_by_rule.values())
    return ValidationResult(
        total_violations=total,
        violations_by_rule=violations_by_rule,
        violation_count_by_rule=violation_count_by_rule,
    )


def _check_rule(row: dict[str, Any], rule: Rule, target_columns: list[str]) -> bool:
    if rule.conditions:
        cond_results: list[bool] = []
        for cond in rule.conditions:
            if cond.column_name not in row:
                cond_results.append(False)
                continue
            raw = row[cond.column_name]
            if raw is None:
                cond_results.append(False)
                continue
            val = str(raw)
            if cond.operator == "eq":
                cond_results.append(val == cond.filter_value)
            elif cond.operator == "neq":
                cond_results.append(val != cond.filter_value)
            elif cond.operator == "contains":
                cond_results.append(cond.filter_value in val)
            elif cond.operator == "ncontains":
                cond_results.append(cond.filter_value not in val)
            else:
                cond_results.append(False)

        if rule.grouping and len(rule.grouping) == len(cond_results):
            groups: dict[str, list[bool]] = {}
            for gid, res in zip(rule.grouping, cond_results, strict=True):
                groups.setdefault(gid, []).append(res)
            group_passed = [
                any(results) for results in groups.values()
            ]
            if not all(group_passed):
                return False
        elif (
            rule.condition_relation == "and" and not all(cond_results)
        ) or (
            rule.condition_relation == "or" and not any(cond_results)
        ):
            return False

    logic = rule.logic
    if logic.column_name not in row:
        return False

    raw = row[logic.column_name]
    if raw is None:
        return False
    val = str(raw)

    if logic.format == "column_vs_column":
        if logic.target_value not in row:
            return False
        raw_target = row[logic.target_value]
        if raw_target is None:
            return False
        target = str(raw_target)
    else:
        target = logic.target_value

    if logic.operator == "eq":
        return val == target
    elif logic.operator == "neq":
        return val != target
    elif logic.operator == "contains":
        return target in val
    elif logic.operator == "ncontains":
        return target not in val
    elif logic.operator == "gt":
        try:
            return float(val) > float(target)
        except ValueError:
            return False
    elif logic.operator == "lt":
        try:
            return float(val) < float(target)
        except ValueError:
            return False
    elif logic.operator == "gte":
        try:
            return float(val) >= float(target)
        except ValueError:
            return False
    elif logic.operator == "lte":
        try:
            return float(val) <= float(target)
        except ValueError:
            return False

    return False


def execute_comparison(
    path_a: Path,
    path_b: Path,
    target_columns: list[str] | None,
    filters: list[dict[str, str]],
    rule_ids: list[str] | None = None,
    key_columns: list[str] | None = None,
) -> ExecutionResult:
    df_a = pl.scan_csv(path_a)
    df_b = pl.scan_csv(path_b)

    df_a_materialized = df_a.collect()
    df_b_materialized = df_b.collect()

    common_columns = [
        c for c in df_a_materialized.columns if c in df_b_materialized.columns
    ]

    valid_filter_cols = set(df_a_materialized.columns)
    for f in filters:
        if f["column"] not in valid_filter_cols:
            raise ValueError(
                f"Filter column '{f['column']}' not found in data"
            )

    df_a_filtered = pl.scan_csv(path_a)
    df_b_filtered = pl.scan_csv(path_b)
    df_a_filtered, df_b_filtered = apply_filters(
        df_a_filtered, df_b_filtered, filters
    )
    df_a_final = df_a_filtered.collect()
    df_b_final = df_b_filtered.collect()

    if target_columns:
        invalid = [c for c in target_columns if c not in common_columns]
        if invalid:
            raise ValueError(
                f"Invalid target columns: {', '.join(invalid)}"
            )
    effective_targets = target_columns or common_columns

    if key_columns:
        invalid = [c for c in key_columns if c not in common_columns]
        if invalid:
            raise ValueError(
                f"Invalid key columns: {', '.join(invalid)}"
            )
    effective_keys = key_columns or common_columns[:1]

    comparison = compare_rows(df_a_final, df_b_final, effective_targets, effective_keys)

    rules_file = load_rules()
    rules = (
        [r for r in rules_file.rules if r.rule_id in rule_ids]
        if rule_ids
        else rules_file.rules
    )

    for rule in rules:
        if rule.logic.column_name not in valid_filter_cols:
            raise ValueError(
                f"Rule '{rule.rule_id}' references unknown column "
                f"'{rule.logic.column_name}'"
            )
        if (
            rule.logic.format == "column_vs_column"
            and rule.logic.target_value not in valid_filter_cols
        ):
            raise ValueError(
                f"Rule '{rule.rule_id}' references unknown target "
                f"column '{rule.logic.target_value}'"
            )

    validation = validate_rows(df_a_final, rules, effective_targets)

    return ExecutionResult(
        comparison=comparison,
        validation=validation,
        common_columns=common_columns,
        target_columns=effective_targets,
        filters_applied=filters,
    )
