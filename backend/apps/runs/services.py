from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import polars as pl

from apps.rules.services import (
    GroupingBranch,
    GroupingLeaf,
    Rule,
    load_rules,
)


def _evaluate_grouping_tree(
    node: GroupingLeaf | GroupingBranch, cond_results: list[bool]
) -> bool:
    if isinstance(node, GroupingLeaf):
        cid = node.condition_id
        if not cid.startswith("c"):
            return False
        try:
            idx = int(cid[1:])
        except ValueError:
            return False
        if 0 <= idx < len(cond_results):
            return cond_results[idx]
        return False
    if isinstance(node, GroupingBranch):
        child_results = [
            _evaluate_grouping_tree(child, cond_results)
            for child in node.children
        ]
        if node.kind == "and":
            return all(child_results)
        return any(child_results)
    return False


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
    violating_column: str
    violating_value: Any
    rule_logic: str


@dataclass(frozen=True)
class ComparisonResult:
    total_rows_a: int
    total_rows_b: int
    matched_rows: int
    rows_with_changes: int
    total_attribute_changes: int
    row_details: list[RowComparison]


@dataclass(frozen=True)
class ValidationResult:
    total_violations: int
    distinct_violating_rows: int
    distinct_violating_attributes: int
    violations_by_rule: dict[str, list[ValidationViolation]]
    violation_count_by_rule: dict[str, int]
    violating_rows_by_rule: dict[str, int]
    violating_attributes_by_rule: dict[str, int]


@dataclass(frozen=True)
class ExecutionResult:
    comparison: ComparisonResult
    validation: ValidationResult
    common_columns: list[str]
    target_columns: list[str]
    key_columns: list[str]
    filters_applied: list[dict[str, str]]


def apply_filters(
    df_a: pl.LazyFrame, df_b: pl.LazyFrame, filters: list[dict[str, str]]
) -> tuple[pl.LazyFrame, pl.LazyFrame]:
    for f in filters:
        col = f["column"]
        op = f["operator"]
        # Support both filter_value (legacy) and filter_values (new)
        values = f.get("filter_values") or ([f["filter_value"]] if f.get("filter_value") else [])

        if not values:
            continue

        if op == "eq":
            # IN semantics: value matches any in the list (OR within row)
            df_a = df_a.filter(pl.col(col).is_in(values))
            df_b = df_b.filter(pl.col(col).is_in(values))
        elif op == "neq":
            # NOT IN: value must not be any in the list (AND across values)
            df_a = df_a.filter(~pl.col(col).is_in(values))
            df_b = df_b.filter(~pl.col(col).is_in(values))
        elif op == "contains":
            # OR across values: match if any value is contained
            cond_a = pl.lit(False)
            cond_b = pl.lit(False)
            for val in values:
                cond_a = cond_a | pl.col(col).str.contains(val)
                cond_b = cond_b | pl.col(col).str.contains(val)
            df_a = df_a.filter(cond_a)
            df_b = df_b.filter(cond_b)
        elif op == "ncontains":
            # AND across values: must not contain any of the values
            for val in values:
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
            matched_rows=0,
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

    inner_joined = df_a.join(df_b, on=key_columns, how="inner", coalesce=True)
    matched_rows = inner_joined.height

    change_conditions = [
        pl.col(col) != pl.col(f"{col}_b")
        for col in target_columns
        if f"{col}_b" in merged.columns
    ]
    if not change_conditions:
        return ComparisonResult(
            total_rows_a=total_a,
            total_rows_b=total_b,
            matched_rows=matched_rows,
            rows_with_changes=0,
            total_attribute_changes=0,
            row_details=[],
        )

    merged = merged.with_row_index("_idx")
    changed = merged.filter(pl.any_horizontal(change_conditions))

    rows_with_changes = 0
    total_changes = 0
    row_details: list[RowComparison] = []

    for row in changed.iter_rows(named=True):
        changes: list[AttributeChange] = []
        for col in target_columns:
            col_b = f"{col}_b"
            if col_b not in row:
                continue
            val_a = row[col]
            val_b = row[col_b]
            if val_a != val_b:
                changes.append(
                    AttributeChange(column=col, file_a_value=val_a, file_b_value=val_b)
                )
        if changes:
            rows_with_changes += 1
            total_changes += len(changes)
            key_vals = {k: row[k] for k in key_columns if k in row}
            row_details.append(
                RowComparison(
                    row_index=int(row["_idx"]),
                    key_columns=key_vals,
                    attribute_changes=changes,
                    change_count=len(changes),
                )
            )

    return ComparisonResult(
        total_rows_a=total_a,
        total_rows_b=total_b,
        matched_rows=matched_rows,
        rows_with_changes=rows_with_changes,
        total_attribute_changes=total_changes,
        row_details=row_details,
    )


def validate_rows(
    df: pl.DataFrame,
    rules: list[Rule],
    target_columns: list[str],
    key_columns: list[str] | None = None,
) -> ValidationResult:
    violations_by_rule: dict[str, list[ValidationViolation]] = {}
    violation_count_by_rule: dict[str, int] = {}
    violating_rows_by_rule: dict[str, int] = {}
    violating_attributes_by_rule: dict[str, int] = {}

    all_violating_rows: set[int] = set()
    all_violating_attrs: set[tuple[int, str]] = set()

    for rule in rules:
        violations: list[ValidationViolation] = []
        rule_rows: set[int] = set()
        rule_attrs: set[tuple[int, str]] = set()

        for idx in range(df.height):
            row = df.row(idx, named=True)
            is_violation, viol_col, viol_val = _check_rule(
                row, rule, target_columns
            )
            if is_violation:
                if key_columns:
                    key_cols = {col: row[col] for col in key_columns if col in row}
                else:
                    key_cols = {col: row[col] for col in df.columns[:3]}
                rule_logic_str = _describe_rule_logic(rule)
                violations.append(
                    ValidationViolation(
                        row_index=idx,
                        rule_id=rule.rule_id,
                        rule_name=rule.name,
                        key_columns=key_cols,
                        details=(
                            f"Column '{viol_col}' has value "
                            f"'{viol_val}' violating {rule.rule_id}"
                        ),
                        violating_column=viol_col,
                        violating_value=viol_val,
                        rule_logic=rule_logic_str,
                    )
                )
                rule_rows.add(idx)
                rule_attrs.add((idx, viol_col))
                all_violating_rows.add(idx)
                all_violating_attrs.add((idx, viol_col))

        violations_by_rule[rule.rule_id] = violations
        violation_count_by_rule[rule.rule_id] = len(violations)
        violating_rows_by_rule[rule.rule_id] = len(rule_rows)
        violating_attributes_by_rule[rule.rule_id] = len(rule_attrs)

    total = sum(violation_count_by_rule.values())
    return ValidationResult(
        total_violations=total,
        distinct_violating_rows=len(all_violating_rows),
        distinct_violating_attributes=len(all_violating_attrs),
        violations_by_rule=violations_by_rule,
        violation_count_by_rule=violation_count_by_rule,
        violating_rows_by_rule=violating_rows_by_rule,
        violating_attributes_by_rule=violating_attributes_by_rule,
    )


def _describe_rule_logic(rule: Rule) -> str:
    logic = rule.logic
    desc = f"{logic.column_name} {logic.operator} "
    if logic.format == "column_vs_column":
        desc += f"column '{logic.target_value}'"
    else:
        desc += f"'{logic.target_value}'"
    return desc


def _check_rule(
    row: dict[str, Any], rule: Rule, target_columns: list[str]
) -> tuple[bool, str, Any]:
    """Check whether a row violates a required-state rule.

    Rule logic describes the state that *must* hold. A row is therefore a
    violation when its condition scope matches but the logic evaluates false.
    This is the frozen API-contract semantics used by the editor and exports.
    """
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

        if rule.grouping_tree is not None:
            tree_result = _evaluate_grouping_tree(
                rule.grouping_tree, cond_results
            )
            if not tree_result:
                return (False, "", None)
        elif rule.grouping and len(rule.grouping) == len(cond_results):
            groups: dict[str, list[bool]] = {}
            for gid, res in zip(rule.grouping, cond_results, strict=True):
                groups.setdefault(gid, []).append(res)
            group_passed = [
                any(results) for results in groups.values()
            ]
            if not all(group_passed):
                return (False, "", None)
        elif (
            rule.condition_relation == "and" and not all(cond_results)
        ) or (
            rule.condition_relation == "or" and not any(cond_results)
        ):
            return (False, "", None)

    logic = rule.logic
    if logic.column_name not in row:
        return (False, "", None)

    raw = row[logic.column_name]
    if raw is None:
        return (False, "", None)
    val = str(raw)

    if logic.format == "column_vs_column":
        if logic.target_value not in row:
            return (False, "", None)
        raw_target = row[logic.target_value]
        if raw_target is None:
            return (False, "", None)
        target = str(raw_target)
        violating_col = logic.target_value
    else:
        target = logic.target_value
        violating_col = logic.column_name

    matched = False
    if logic.operator == "eq":
        matched = val == target
    elif logic.operator == "neq":
        matched = val != target
    elif logic.operator == "contains":
        matched = target in val
    elif logic.operator == "ncontains":
        matched = target not in val
    elif logic.operator == "gt":
        try:
            matched = float(val) > float(target)
        except ValueError:
            matched = False
    elif logic.operator == "lt":
        try:
            matched = float(val) < float(target)
        except ValueError:
            matched = False
    elif logic.operator == "gte":
        try:
            matched = float(val) >= float(target)
        except ValueError:
            matched = False
    elif logic.operator == "lte":
        try:
            matched = float(val) <= float(target)
        except ValueError:
            matched = False

    if not matched:
        return (True, violating_col, row.get(violating_col))
    return (False, "", None)


def execute_comparison(
    path_a: Path,
    path_b: Path,
    target_columns: list[str] | None,
    filters: list[dict[str, str]],
    rule_ids: list[str] | None = None,
    key_columns: list[str] | None = None,
) -> ExecutionResult:
    headers_a = pl.scan_csv(path_a).head(1).collect().columns
    headers_b = pl.scan_csv(path_b).head(1).collect().columns

    common_columns = [c for c in headers_a if c in headers_b]
    valid_filter_cols = set(headers_a)

    for f in filters:
        if f["column"] not in valid_filter_cols:
            raise ValueError(
                f"Filter column '{f['column']}' not found in data"
            )

    effective_targets: list[str]
    if target_columns:
        invalid = [c for c in target_columns if c not in common_columns]
        if invalid:
            raise ValueError(
                f"Invalid target columns: {', '.join(invalid)}"
            )
        effective_targets = target_columns
    else:
        effective_targets = common_columns

    if not key_columns:
        raise ValueError(
            "key_columns is required. Provide at least one common column "
            "to use as record identity."
        )
    invalid = [c for c in key_columns if c not in common_columns]
    if invalid:
        raise ValueError(
            f"Invalid key columns: {', '.join(invalid)}"
        )
    effective_keys = key_columns

    needed_columns = set(effective_keys)
    needed_columns.update(effective_targets)
    for f in filters:
        needed_columns.add(f["column"])

    rules_file = load_rules()
    if rule_ids is not None:
        rules = [r for r in rules_file.rules if r.rule_id in rule_ids]
    else:
        rules = rules_file.rules

    for rule in rules:
        if rule.logic.column_name not in valid_filter_cols:
            raise ValueError(
                f"Rule '{rule.rule_id}' references unknown column "
                f"'{rule.logic.column_name}'"
            )
        needed_columns.add(rule.logic.column_name)
        if (
            rule.logic.format == "column_vs_column"
            and rule.logic.target_value not in valid_filter_cols
        ):
            raise ValueError(
                f"Rule '{rule.rule_id}' references unknown target "
                f"column '{rule.logic.target_value}'"
            )
        if rule.logic.format == "column_vs_column":
            needed_columns.add(rule.logic.target_value)
        for cond in rule.conditions:
            if cond.column_name in valid_filter_cols:
                needed_columns.add(cond.column_name)

    if not needed_columns:
        raise ValueError("No columns to process")

    needed_list = sorted(needed_columns)

    df_a_lazy = pl.scan_csv(path_a).select(pl.col(needed_list))
    df_b_lazy = pl.scan_csv(path_b).select(pl.col(needed_list))

    df_a_lazy, df_b_lazy = apply_filters(df_a_lazy, df_b_lazy, filters)

    df_a_final = df_a_lazy.collect()
    df_b_final = df_b_lazy.collect()

    for key_col in effective_keys:
        null_count_a = df_a_final.filter(
            pl.col(key_col).is_null()
        ).height
        null_count_b = df_b_final.filter(
            pl.col(key_col).is_null()
        ).height
        if null_count_a > 0 or null_count_b > 0:
            raise ValueError(
                f"Key column '{key_col}' contains null values "
                f"({null_count_a} in file A, {null_count_b} in file B)"
            )

    dupes_a = (
        df_a_final.group_by(effective_keys)
        .agg(pl.len().alias("cnt"))
        .filter(pl.col("cnt") > 1)
    )
    dupes_b = (
        df_b_final.group_by(effective_keys)
        .agg(pl.len().alias("cnt"))
        .filter(pl.col("cnt") > 1)
    )
    if dupes_a.height > 0 or dupes_b.height > 0:
        total_dupes = dupes_a.height + dupes_b.height
        raise ValueError(
            f"Key columns contain {total_dupes} duplicate key "
            f"combinations across both files"
        )

    comparison = compare_rows(df_a_final, df_b_final, effective_targets, effective_keys)

    validation = validate_rows(df_a_final, rules, effective_targets, effective_keys)

    return ExecutionResult(
        comparison=comparison,
        validation=validation,
        common_columns=common_columns,
        target_columns=effective_targets,
        key_columns=effective_keys,
        filters_applied=filters,
    )
