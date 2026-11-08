from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

import polars as pl

from apps.families.resolver import expand_filter_grouping
from apps.rules.services import (
    GroupingBranch,
    GroupingLeaf,
    Rule,
    load_rules,
)
from apps.runs.grouped_logic import (
    GroupingValidationError,
    NormalizedOutcomes,
    describe_outcomes,
    evaluate_grouping_tree,
    evaluate_outcomes,
    family_members,
    is_family_reference,
    match_condition_value,
    normalize_rule_outcomes,
    outcome_columns,
    parse_grouping_tree,
    serialize_grouping_tree,
    validate_filter_grouping,
)
from apps.runs.template_columns import validate_concrete_columns


def _evaluate_grouping_tree(
    node: GroupingLeaf | GroupingBranch, cond_results: list[bool]
) -> bool:
    return evaluate_grouping_tree(node, cond_results)


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
    grouping_values: dict[str, Any] = field(default_factory=dict)
    extra_values: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class NewBookRow:
    row_index: int
    key_columns: dict[str, Any]
    grouping_values: dict[str, Any] = field(default_factory=dict)
    extra_values: dict[str, Any] = field(default_factory=dict)


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
    comparison_value: Any = None
    extra_values: dict[str, Any] = field(default_factory=dict)
    grouping_values: dict[str, Any] = field(default_factory=dict)
    rule_identifier: str | None = None
    detail_values: dict[str, str] = field(default_factory=dict)
    exception_id: str | None = None
    exception_status: str | None = None
    outcome_columns: tuple[str, ...] = ()
    outcome_values: dict[str, Any] = field(default_factory=dict)
    outcome_results: dict[str, bool] = field(default_factory=dict)


@dataclass(frozen=True)
class ComparisonResult:
    total_rows_a: int
    total_rows_b: int
    matched_rows: int
    rows_with_changes: int
    total_attribute_changes: int
    row_details: list[RowComparison]
    new_book_count: int = 0
    new_book_rows: list[NewBookRow] = field(default_factory=list)


@dataclass(frozen=True)
class ValidationResult:
    total_violations: int
    distinct_violating_rows: int
    distinct_violating_attributes: int
    violations_by_rule: dict[str, list[ValidationViolation]]
    violation_count_by_rule: dict[str, int]
    violating_rows_by_rule: dict[str, int]
    violating_attributes_by_rule: dict[str, int]
    rule_summaries: dict[str, dict[str, Any]] = field(default_factory=dict)


@dataclass(frozen=True)
class ExecutionResult:
    comparison: ComparisonResult
    validation: ValidationResult
    common_columns: list[str]
    target_columns: list[str]
    key_columns: list[str]
    filters_applied: list[dict[str, str]]
    aggregation_columns: list[str] = field(default_factory=list)
    aggregation_column_labels: dict[str, str] = field(default_factory=dict)
    nested_aggregation_enabled: bool = False
    comparison_sections: list[dict[str, Any]] = field(default_factory=list)
    exception_columns: list[str] = field(default_factory=list)
    extra_column_display: dict[str, bool] = field(default_factory=dict)
    group_statistics: dict[str, Any] | None = None
    rule_bindings: dict[str, str] = field(default_factory=dict)
    as_of_date: date | None = None
    commentary_template_columns: list[str] = field(default_factory=list)
    new_exceptions_only: bool = True
    filter_relation: str | None = None
    filter_grouping_tree: dict[str, Any] | None = None


def _filter_values(filter_row: dict[str, Any]) -> tuple[str, ...]:
    values = filter_row.get("filter_values")
    if isinstance(values, list):
        return tuple(str(value) for value in values if str(value) != "")
    legacy = filter_row.get("filter_value", "")
    return (str(legacy),) if legacy != "" else ()


def _filter_expression(filter_row: dict[str, Any]) -> pl.Expr | None:
    """Build one literal, null/blank-aware filter predicate."""

    column = str(filter_row["column"])
    operator = str(filter_row["operator"])
    values = _filter_values(filter_row)
    if not values:
        return None

    text = pl.col(column).cast(pl.Utf8, strict=False)
    blank = text.is_null() | (text == "")

    if operator == "eq":
        return ~blank & text.is_in(list(values))
    if operator == "neq":
        # Null and empty-string input satisfies a negative operator.
        return blank | ~text.is_in(list(values))
    if operator == "contains":
        contained = pl.lit(False)
        for value in values:
            contained = contained | text.str.contains(value, literal=True)
        return ~blank & contained
    if operator == "ncontains":
        contained = pl.lit(False)
        for value in values:
            contained = contained | text.str.contains(value, literal=True)
        return blank | ~contained
    raise ValueError(
        f"Invalid filter operator '{operator}'. Must be one of: "
        "eq, neq, contains, ncontains"
    )


def _combine_filter_expressions(
    expressions: list[pl.Expr | None],
    relation: str | None,
    grouping_tree: Any,
) -> pl.Expr | None:
    usable = [
        expression if expression is not None else pl.lit(True)
        for expression in expressions
    ]
    if not usable:
        return None

    node = grouping_tree
    if isinstance(node, dict) or node is None:
        node = parse_grouping_tree(node)
    if node is not None:
        def _walk(current: Any) -> pl.Expr:
            if isinstance(current, GroupingLeaf):
                try:
                    index = int(current.condition_id[1:])
                except (TypeError, ValueError):
                    return pl.lit(False)
                if (
                    current.condition_id.startswith("c")
                    and 0 <= index < len(usable)
                ):
                    return usable[index]
                return pl.lit(False)
            children = [_walk(child) for child in current.children]
            if not children:
                return pl.lit(current.kind == "and")
            combined = children[0]
            for child in children[1:]:
                combined = combined & child if current.kind == "and" else combined | child
            return combined

        return _walk(node)

    if len(usable) == 1:
        return usable[0]
    relation = relation or "and"
    if relation not in {"and", "or"}:
        raise ValueError(
            f"Invalid filter_relation '{relation}'. Must be one of: and, or"
        )
    combined = usable[0]
    for expression in usable[1:]:
        combined = combined & expression if relation == "and" else combined | expression
    return combined


def apply_filters(
    df_a: pl.LazyFrame,
    df_b: pl.LazyFrame,
    filters: list[dict[str, Any]],
    filter_relation: str | None = None,
    filter_grouping_tree: Any = None,
) -> tuple[pl.LazyFrame, pl.LazyFrame]:
    """Apply the grouped overall filter expression to the comparison file.

    Row Filters are evaluated as one expression over ``df_b``.  ``df_a``
    (baseline) is left unfiltered; the caller joins baseline rows using the
    filtered comparison keys.  With no grouping fields the legacy AND
    combination is preserved exactly.
    """

    expressions = [_filter_expression(filter_row) for filter_row in filters]
    expression = _combine_filter_expressions(
        expressions, filter_relation, filter_grouping_tree
    )
    if expression is not None:
        df_b = df_b.filter(expression)
    return df_a, df_b


def compare_rows(
    df_a: pl.DataFrame,
    df_b: pl.DataFrame,
    target_columns: list[str],
    key_columns: list[str],
    aggregation_columns: list[str] | None = None,
    extra_columns: list[str] | None = None,
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

    agg_cols = aggregation_columns or []
    extra_cols = extra_columns or []

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
        pl.col(col).ne_missing(pl.col(f"{col}_b"))
        for col in target_columns if f"{col}_b" in merged.columns
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

    # Detect B-only rows: rows in df_b with no matching key in df_a
    b_only_df = df_b.join(df_a.select(key_columns), on=key_columns, how="anti")
    new_book_count = b_only_df.height
    new_book_rows: list[NewBookRow] = []
    for row in b_only_df.iter_rows(named=True):
        key_vals = {k: row[k] for k in key_columns if k in row}
        agg_vals = {g: row.get(g) for g in agg_cols}
        extra_vals = {c: row.get(c) for c in extra_cols}
        new_book_rows.append(
            NewBookRow(
                row_index=-1,
                key_columns=key_vals,
                grouping_values=agg_vals,
                extra_values=extra_vals,
            )
        )

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
                changes.append(AttributeChange(column=col, file_a_value=val_a, file_b_value=val_b))
        if changes:
            rows_with_changes += 1
            total_changes += len(changes)
            key_vals = {k: row[k] for k in key_columns if k in row}
            agg_vals = {g: row.get(g) for g in agg_cols if g in row or f"{g}_b" in row}
            agg_vals = {g: row.get(f"{g}_b", row.get(g)) for g in agg_cols}
            extra_vals = {c: row.get(f"{c}_b", row.get(c)) for c in extra_cols}
            row_details.append(
                RowComparison(
                    row_index=int(row["_idx"]),
                    key_columns=key_vals,
                    attribute_changes=changes,
                    change_count=len(changes),
                    grouping_values=agg_vals,
                    extra_values=extra_vals,
                )
            )

    return ComparisonResult(
        total_rows_a=total_a,
        total_rows_b=total_b,
        matched_rows=matched_rows,
        rows_with_changes=rows_with_changes,
        total_attribute_changes=total_changes,
        row_details=row_details,
        new_book_count=new_book_count,
        new_book_rows=new_book_rows,
    )


def _detail_text(value: Any) -> str:
    """Render a captured detail value as lossless literal text."""

    if value is None:
        return ""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def validate_rows(
    df: pl.DataFrame,
    rules: list[Rule],
    target_columns: list[str],
    key_columns: list[str] | None = None,
    comparison_df: pl.DataFrame | None = None,
    aggregation_columns: list[str] | None = None,
    exception_columns: list[str] | None = None,
    commentary_template_columns: list[str] | None = None,
) -> ValidationResult:
    """Validate rows from the comparison file against rules.

    `df` is the comparison DataFrame (source of truth for rule evaluation).
    `comparison_df` is the baseline DataFrame, used for column-vs-column logic.
    """
    agg_cols = aggregation_columns or []
    violations_by_rule: dict[str, list[ValidationViolation]] = {}
    violation_count_by_rule: dict[str, int] = {}
    violating_rows_by_rule: dict[str, int] = {}
    violating_attributes_by_rule: dict[str, int] = {}
    rule_summaries: dict[str, dict[str, Any]] = {}

    all_violating_rows: set[int] = set()
    all_violating_attrs: set[tuple[int, str]] = set()

    baseline_by_key: dict[tuple[Any, ...], dict[str, Any]] = {}
    if comparison_df is not None and key_columns:
        baseline_by_key = {
            tuple(row.get(column) for column in key_columns): row
            for row in comparison_df.iter_rows(named=True)
        }

    for rule in rules:
        try:
            outcomes = normalize_rule_outcomes(rule)
        except GroupingValidationError as exc:
            raise ValueError(
                f"Rule '{rule.rule_id}' has an invalid outcome expression: {exc}"
            ) from exc
        summary = {
            "name": rule.name,
            "description": rule.description,
            "logic": describe_outcomes(outcomes),
            "condition": _describe_rule_conditions(rule),
            "condition_grouping": _describe_condition_grouping(rule),
            "hide_comparison": rule.hide_comparison,
        }
        if rule.rule_identifier is not None:
            summary["rule_identifier"] = rule.rule_identifier
        rule_summaries[rule.rule_id] = summary
        violations: list[ValidationViolation] = []
        rule_rows: set[int] = set()
        rule_attrs: set[tuple[int, str]] = set()

        for idx in range(df.height):
            row = df.row(idx, named=True)
            baseline_row = (
                baseline_by_key.get(tuple(row.get(column) for column in key_columns))
                if key_columns
                else None
            )
            is_violation, viol_col, viol_val = _check_rule(
                row, rule, target_columns, baseline_row, outcomes
            )
            if is_violation:
                if key_columns:
                    key_cols = {col: row[col] for col in key_columns if col in row}
                else:
                    key_cols = {col: row[col] for col in df.columns[:3]}
                agg_vals = {g: row.get(g) for g in agg_cols}
                rule_logic_str = describe_outcomes(outcomes)
                comparison_value = (
                    baseline_row.get(viol_col)
                    if (
                        not outcomes.grouped
                        and baseline_row is not None
                        and viol_col in baseline_row
                    )
                    else None
                )
                extra_values: dict[str, Any] = {}
                for column in rule.extra_columns:
                    extra_values[column] = row.get(column)
                for column in (exception_columns or []):
                    extra_values[column] = row.get(column)
                outcome_map: dict[str, Any] = {}
                outcome_results: dict[str, bool] = {}
                if outcomes.grouped:
                    evaluation = evaluate_outcomes(row, outcomes, baseline_row)
                    for index, clause in enumerate(outcomes.clauses):
                        outcome_map[clause.column_name] = (
                            evaluation.clause_results[index].observed
                        )
                        outcome_results[clause.column_name] = (
                            outcome_results.get(clause.column_name, True)
                            and evaluation.clause_results[index].matched
                        )
                    for column, value in outcome_map.items():
                        extra_values[column] = value
                detail_values: dict[str, str] = {}
                for column in commentary_template_columns or []:
                    if column in row:
                        raw_detail = row.get(column)
                    elif baseline_row is not None and column in baseline_row:
                        raw_detail = baseline_row.get(column)
                    else:
                        raw_detail = None
                    detail_values[column] = _detail_text(raw_detail)
                violations.append(
                    ValidationViolation(
                        row_index=idx,
                        rule_id=rule.rule_id,
                        rule_name=rule.name,
                        key_columns=key_cols,
                        details=(
                            (
                                "Grouped outcome expression failed for columns "
                                f"'{viol_col}' violating {rule.rule_id}"
                            )
                            if outcomes.grouped
                            else (
                                f"Column '{viol_col}' has value '{viol_val}' "
                                f"violating {rule.rule_id}"
                            )
                        ),
                        violating_column=viol_col,
                        violating_value=viol_val,
                        rule_logic=rule_logic_str,
                        comparison_value=comparison_value,
                        extra_values=extra_values,
                        grouping_values=agg_vals,
                        rule_identifier=rule.rule_identifier,
                        detail_values=detail_values,
                        outcome_columns=(
                            outcome_columns(outcomes) if outcomes.grouped else ()
                        ),
                        outcome_values=outcome_map,
                        outcome_results=outcome_results,
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
        rule_summaries=rule_summaries,
    )


def _describe_rule_logic(rule: Rule) -> str:
    return describe_outcomes(normalize_rule_outcomes(rule))


def _describe_condition(rule_condition: Any) -> str:
    operator = {
        "eq": "equals",
        "neq": "does not equal",
        "contains": "contains",
        "ncontains": "does not contain",
        "gt": "greater than",
        "lt": "less than",
    }.get(rule_condition.operator, rule_condition.operator.replace("_", " "))
    values = rule_condition.filter_values or (rule_condition.filter_value,)
    # The multi-value connector mirrors the evaluator's semantics, so the
    # human-readable description cannot be misread as the opposite polarity:
    #   eq / contains      → "or"  (matches any)
    #   neq / ncontains    → "and" (matches none — "not any")
    connector = " and " if rule_condition.operator in ("neq", "ncontains") else " or "
    rendered_values = connector.join(f"'{value}'" for value in values)
    return f"{rule_condition.column_name} {operator} {rendered_values}"


def _describe_rule_conditions(rule: Rule) -> str:
    if not rule.conditions:
        return ""
    return "; ".join(
        f"Condition {index}: {_describe_condition(condition)}"
        for index, condition in enumerate(rule.conditions, start=1)
    )


def _grouping_leaf_label(condition_id: str) -> str:
    if condition_id.startswith("c") and condition_id[1:].isdigit():
        return f"Condition {int(condition_id[1:]) + 1}"
    return f"Condition {condition_id}"


def _describe_grouping_node(node: GroupingLeaf | GroupingBranch) -> str:
    if isinstance(node, GroupingLeaf):
        return _grouping_leaf_label(node.condition_id)
    joined = f" {node.kind.upper()} ".join(
        _describe_grouping_node(child) for child in node.children
    )
    return f"({joined})"


def _describe_condition_grouping(rule: Rule) -> str:
    if len(rule.conditions) <= 1:
        return ""
    if rule.grouping_tree is not None:
        rendered = _describe_grouping_node(rule.grouping_tree)
        return rendered[1:-1] if rendered.startswith("(") and rendered.endswith(")") else rendered
    if rule.grouping and len(rule.grouping) == len(rule.conditions):
        grouped: dict[str, list[str]] = {}
        for index, group_id in enumerate(rule.grouping, start=1):
            grouped.setdefault(group_id, []).append(f"Condition {index}")
        return " AND ".join(
            (
                f"({' OR '.join(condition_labels)})"
                if len(condition_labels) > 1
                else condition_labels[0]
            )
            for condition_labels in grouped.values()
        )
    relation = (rule.condition_relation or "and").upper()
    return f" {relation} ".join(
        f"Condition {index}" for index in range(1, len(rule.conditions) + 1)
    )


def _check_rule(
    row: dict[str, Any],
    rule: Rule,
    target_columns: list[str],
    baseline_row: dict[str, Any] | None = None,
    outcomes: NormalizedOutcomes | None = None,
) -> tuple[bool, str, Any]:
    """Check whether a row violates a required-state rule.

    Rule logic describes the state that *must* hold. A row is therefore a
    violation when its condition scope matches but the outcome expression
    evaluates false. Conditions decide applicability; grouped outcomes decide
    pass/fail. Null and blank inputs follow the shared predicate semantics, so
    a negative operator can be satisfied by a missing cell.
    """
    if rule.conditions:
        cond_results: list[bool] = []
        for cond in rule.conditions:
            if (
                not cond.column_name.startswith("family:")
                and cond.column_name not in row
            ):
                # Schema-column validation happens before execution. In a
                # direct call, a missing column cannot make the rule apply.
                cond_results.append(False)
                continue
            values = cond.filter_values or (cond.filter_value,)
            cond_results.append(
                match_condition_value(
                    row,
                    cond.column_name,
                    cond.operator,
                    values,
                    baseline_row,
                )
            )

        if rule.grouping_tree is not None:
            tree_result = _evaluate_grouping_tree(rule.grouping_tree, cond_results)
            if not tree_result:
                return (False, "", None)
        elif rule.grouping and len(rule.grouping) == len(cond_results):
            groups: dict[str, list[bool]] = {}
            for gid, res in zip(rule.grouping, cond_results, strict=True):
                groups.setdefault(gid, []).append(res)
            group_passed = [any(results) for results in groups.values()]
            if not all(group_passed):
                return (False, "", None)
        else:
            # A single condition has no stored relation and behaves like AND.
            # Multi-condition rules are validated to have a relation unless a
            # grouping tree supplies the combination logic.
            scope_matches = (
                any(cond_results) if rule.condition_relation == "or" else all(cond_results)
            )
            if not scope_matches:
                return (False, "", None)

    normalized = outcomes or normalize_rule_outcomes(rule)
    evaluation = evaluate_outcomes(row, normalized, baseline_row)
    if evaluation.passed:
        return (False, "", None)

    if normalized.grouped:
        columns = list(outcome_columns(normalized))
        failed_columns = [
            normalized.clauses[index].column_name
            for index in evaluation.failed_indexes
        ]
        violating_column = ", ".join(dict.fromkeys(failed_columns)) or ", ".join(columns)
        observed = {
            clause.column_name: evaluation.clause_results[index].observed
            for index, clause in enumerate(normalized.clauses)
        }
        return (True, violating_column or "Outcome group", observed)

    failed = evaluation.clause_results[evaluation.failed_indexes[0]]
    column = normalized.clauses[0].column_name
    return (True, column, failed.observed)


def _sort_group_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sort group stat rows: Total first, then alphabetical, then Empty, then Null."""

    def _sort_key(row: dict[str, Any]) -> tuple[int, str]:
        val = row["value"]
        if val == "Total":
            return (0, "")
        if val is None:
            return (3, "")
        if val == "":
            return (2, "")
        return (1, str(val))

    return sorted(rows, key=_sort_key)


def _build_group_stats(
    column: str,
    items: list[tuple[dict[str, Any], dict[str, Any], int]],
) -> dict[str, Any]:
    """Build GroupStatistics for one grouping column.

    Each item is (key_columns_dict, grouping_values_dict, occurrence_count).
    Returns the stats with rows sorted correctly and a Total row at the top.
    """
    groups: dict[Any, list[tuple[dict[str, Any], dict[str, Any], int]]] = {}
    for key_vals, grp_vals, weight in items:
        gval = grp_vals.get(column)
        groups.setdefault(gval, []).append((key_vals, grp_vals, weight))

    rows: list[dict[str, Any]] = []
    all_keys: set[tuple[Any, ...]] = set()
    total_attr_count = 0

    for gval, group_items in groups.items():
        unique_keys: set[tuple[Any, ...]] = set()
        attr_count = 0
        for key_vals, _, weight in group_items:
            unique_keys.add(tuple(sorted(key_vals.items())))
            attr_count += weight
        all_keys.update(unique_keys)
        total_attr_count += attr_count
        display_val = "Null" if gval is None else ("Empty" if gval == "" else gval)
        rows.append({
            "value": display_val,
            "unique_count": len(unique_keys),
            "attribute_count": attr_count,
        })

    total_row = {
        "value": "Total",
        "unique_count": len(all_keys),
        "attribute_count": total_attr_count,
    }
    rows = _sort_group_rows(rows)
    return {
        "column": column,
        "unique_count": len(all_keys),
        "attribute_count": total_attr_count,
        "rows": [total_row] + rows,
    }


def compute_group_statistics(
    comparison_rows: list[RowComparison],
    violations: dict[str, list[ValidationViolation]],
    aggregation_columns: list[str],
    new_book_rows: list[NewBookRow] | None = None,
) -> dict[str, Any]:
    """Compute group statistics for all aggregation columns across all sections."""
    if not aggregation_columns:
        return {"overall": [], "attribute_changes": [], "validation_rules": {}}

    # Collect items per section
    change_items: list[tuple[dict[str, Any], dict[str, Any], int]] = [
        (rc.key_columns, rc.grouping_values, rc.change_count)
        for rc in comparison_rows
    ]
    violation_items_by_rule: dict[str, list[tuple[dict[str, Any], dict[str, Any], int]]] = {}
    for rule_id, viols in violations.items():
        violation_items_by_rule[rule_id] = [
            (v.key_columns, v.grouping_values, 1) for v in viols
        ]

    overall_items: list[tuple[dict[str, Any], dict[str, Any], int]] = list(change_items)
    for rule_viols in violation_items_by_rule.values():
        overall_items.extend(rule_viols)

    # De-duplicate overall by key_columns for Unique Count,
    # but Attribute Count sums ALL occurrence weights.
    seen_keys: set[tuple[Any, ...]] = set()
    deduped_overall: list[tuple[dict[str, Any], dict[str, Any], int]] = []
    for key_vals, grp_vals, weight in overall_items:
        k = tuple(sorted(key_vals.items()))
        if k not in seen_keys:
            seen_keys.add(k)
            deduped_overall.append((key_vals, grp_vals, weight))
        else:
            # Keep a second entry with zero unique_count weight to preserve
            # attribute_count while not double-counting unique keys.
            deduped_overall.append((key_vals, grp_vals, weight))

    result: dict[str, Any] = {
        "overall": [],
        "attribute_changes": [],
        "validation_rules": {},
        "new_books": [],
    }

    for col in aggregation_columns:
        result["overall"].append(_build_group_stats(col, deduped_overall))
        result["attribute_changes"].append(_build_group_stats(col, change_items))

    for rule_id, rule_items in violation_items_by_rule.items():
        result["validation_rules"].setdefault(rule_id, [])
        for col in aggregation_columns:
            result["validation_rules"][rule_id].append(
                _build_group_stats(col, rule_items)
            )

    if new_book_rows:
        new_book_items: list[tuple[dict[str, Any], dict[str, Any], int]] = [
            (r.key_columns, r.grouping_values, 1) for r in new_book_rows
        ]
        for col in aggregation_columns:
            result["new_books"].append(_build_group_stats(col, new_book_items))

    return result


def execute_comparison(
    path_a: Path,
    path_b: Path,
    comparison_columns: list[str] | None = None,
    target_columns: list[str] | None = None,
    filters: list[dict[str, Any]] | None = None,
    filter_relation: str | None = None,
    filter_grouping_tree: Any = None,
    rule_ids: list[str] | None = None,
    key_columns: list[str] | None = None,
    aggregation_columns: list[str] | None = None,
    aggregation_column_labels: dict[str, str] | None = None,
    nested_aggregation_enabled: bool = False,
    comparison_sections: list[dict[str, Any]] | None = None,
    exception_columns: list[str] | None = None,
    extra_column_display: dict[str, bool] | None = None,
    as_of_date: date | None = None,
    commentary_template_columns: list[str] | None = None,
    new_exceptions_only: bool = True,
) -> ExecutionResult:
    if filters is None:
        filters = []

    headers_a = pl.scan_csv(path_a, infer_schema=False).head(1).collect().columns
    headers_b = pl.scan_csv(path_b, infer_schema=False).head(1).collect().columns
    template_columns = validate_concrete_columns(commentary_template_columns)
    missing_template_columns = [
        column
        for column in template_columns
        if column not in headers_a and column not in headers_b
    ]
    if missing_template_columns:
        raise ValueError(
            "Invalid commentary template columns: "
            f"{', '.join(missing_template_columns)}"
        )

    all_common_columns = [c for c in headers_a if c in headers_b]

    # Use the user's comparison-column selection; fall back to all common
    # columns when the caller omits the field (backward compat).
    if comparison_columns is None:
        comparison_columns = all_common_columns

    valid_filter_cols = set(comparison_columns)

    try:
        filters, filter_relation, filter_grouping_tree = expand_filter_grouping(
            filters,
            filter_relation,
            filter_grouping_tree,
            valid_filter_cols,
        )
    except ValueError as exc:
        raise ValueError(f"Invalid row filter grouping: {exc}") from exc

    filter_tree_errors = validate_filter_grouping(
        filters, filter_relation, filter_grouping_tree
    )
    if filter_tree_errors:
        raise ValueError(
            "Invalid row filter grouping: " + "; ".join(filter_tree_errors)
        )
    parsed_filter_tree = parse_grouping_tree(filter_grouping_tree)

    for index, filter_row in enumerate(filters, start=1):
        column = filter_row.get("column")
        if not isinstance(column, str) or not column:
            raise ValueError(f"Filter {index} requires a column.")
        if column not in valid_filter_cols:
            raise ValueError(f"Filter column '{column}' not found in data")
        operator = filter_row.get("operator")
        if operator not in {"eq", "neq", "contains", "ncontains"}:
            raise ValueError(
                f"Invalid filter operator at filter {index}: '{operator}'."
            )
        if not _filter_values(filter_row):
            raise ValueError(f"Filter {index} requires at least one value.")

    effective_targets: list[str]
    if target_columns:
        invalid = [c for c in target_columns if c not in comparison_columns]
        if invalid:
            raise ValueError(f"Invalid target columns: {', '.join(invalid)}")
        effective_targets = target_columns
    else:
        effective_targets = comparison_columns

    if not key_columns:
        raise ValueError(
            "key_columns is required. Provide at least one common column to use as record identity."
        )
    invalid = [c for c in key_columns if c not in comparison_columns]
    if invalid:
        raise ValueError(f"Invalid key columns: {', '.join(invalid)}")
    effective_keys = key_columns

    needed_columns = set(effective_keys)
    needed_columns.update(effective_targets)
    for f in filters:
        needed_columns.add(f["column"])
    # Aggregation columns must be loaded so per-value breakdowns have data to
    # bucket on. Without this, _build_group_stats sees None for every value
    # and emits only ["Total", "Null"].
    for col in aggregation_columns or []:
        if col in valid_filter_cols:
            needed_columns.add(col)

    rules_file = load_rules()
    if rule_ids is not None:
        rules = [r for r in rules_file.rules if r.rule_id in rule_ids]
    else:
        rules = rules_file.rules

    # The catalog load is one immutable in-memory snapshot for this run. Keep
    # bindings for selected rules even when validation produces no violations.
    rule_bindings = {
        rule.rule_id: rule.rule_identifier
        for rule in rules
        if rule.rule_identifier is not None
    }

    for rule in rules:
        try:
            outcomes = normalize_rule_outcomes(rule)
        except GroupingValidationError as exc:
            raise ValueError(
                f"Rule '{rule.rule_id}' has an invalid outcome expression: {exc}"
            ) from exc
        for clause in outcomes.clauses:
            if is_family_reference(clause.column_name):
                members = family_members(clause.column_name, valid_filter_cols)
                if not members:
                    raise ValueError(
                        f"Rule '{rule.rule_id}' references column family "
                        f"'{clause.column_name}' with no available members."
                    )
                needed_columns.update(members)
            elif clause.column_name not in valid_filter_cols:
                raise ValueError(
                    f"Rule '{rule.rule_id}' references unknown outcome "
                    f"column '{clause.column_name}'"
                )
            else:
                needed_columns.add(clause.column_name)
            if clause.format == "column_vs_column":
                if is_family_reference(clause.target_value):
                    target_members = family_members(
                        clause.target_value, valid_filter_cols
                    )
                    if not target_members:
                        raise ValueError(
                            f"Rule '{rule.rule_id}' references column family "
                            f"'{clause.target_value}' with no available members."
                        )
                    needed_columns.update(target_members)
                elif clause.target_value not in valid_filter_cols:
                    raise ValueError(
                        f"Rule '{rule.rule_id}' references unknown target "
                        f"column '{clause.target_value}'"
                    )
                else:
                    needed_columns.add(clause.target_value)
        for cond in rule.conditions:
            if is_family_reference(cond.column_name):
                members = family_members(cond.column_name, valid_filter_cols)
                if not members:
                    raise ValueError(
                        f"Rule '{rule.rule_id}' references column family "
                        f"'{cond.column_name}' with no available members."
                    )
                needed_columns.update(members)
            elif cond.column_name not in valid_filter_cols:
                raise ValueError(
                    f"Rule '{rule.rule_id}' references unknown condition "
                    f"column '{cond.column_name}'"
                )
            else:
                needed_columns.add(cond.column_name)
        invalid_extras = [
            column for column in rule.extra_columns if column not in valid_filter_cols
        ]
        if invalid_extras:
            raise ValueError(
                f"Rule '{rule.rule_id}' references unknown extra columns: "
                f"{', '.join(invalid_extras)}"
            )
        needed_columns.update(rule.extra_columns)

    for col in (exception_columns or []):
        if col in valid_filter_cols:
            needed_columns.add(col)
    needed_columns.update(template_columns)

    if not needed_columns:
        raise ValueError("No columns to process")

    needed_a = sorted(column for column in needed_columns if column in headers_a)
    needed_b = sorted(column for column in needed_columns if column in headers_b)

    df_a_lazy = pl.scan_csv(path_a, infer_schema=False).select(pl.col(needed_a))
    df_b_lazy = pl.scan_csv(path_b, infer_schema=False).select(pl.col(needed_b))

    # Phase 2: filter only the comparison file (df_b)
    _, df_b_lazy = apply_filters(
        df_a_lazy,
        df_b_lazy,
        filters,
        filter_relation=filter_relation,
        filter_grouping_tree=parsed_filter_tree,
    )

    df_b_final = df_b_lazy.collect()

    # Join baseline using the filtered comparison keys
    if effective_keys:
        filtered_keys_df = df_b_final.select(effective_keys)
        df_a_final = df_a_lazy.join(
            filtered_keys_df.lazy(), on=effective_keys, how="semi", coalesce=True,
        ).collect()
    else:
        df_a_final = df_a_lazy.collect()

    for key_col in effective_keys:
        null_count_a = df_a_final.filter(pl.col(key_col).is_null()).height
        null_count_b = df_b_final.filter(pl.col(key_col).is_null()).height
        if null_count_a > 0 or null_count_b > 0:
            raise ValueError(
                f"Key column '{key_col}' contains null values "
                f"({null_count_a} in file A, {null_count_b} in file B)"
            )

    dupes_a = (
        df_a_final.group_by(effective_keys).agg(pl.len().alias("cnt")).filter(pl.col("cnt") > 1)
    )
    dupes_b = (
        df_b_final.group_by(effective_keys).agg(pl.len().alias("cnt")).filter(pl.col("cnt") > 1)
    )
    if dupes_a.height > 0 or dupes_b.height > 0:
        total_dupes = dupes_a.height + dupes_b.height
        raise ValueError(
            f"Key columns contain {total_dupes} duplicate key combinations across both files"
        )

    section_extra_columns = list(dict.fromkeys(
        column
        for section in (comparison_sections or [])
        for column in section.get("extra_columns", [])
    ))
    display = extra_column_display or {}
    display.setdefault("exception_tables", True)
    comparison_extra_columns = list(
        dict.fromkeys(
            [
                *section_extra_columns,
                *(
                    (exception_columns or [])
                    if (
                        display.get("overall_result_page")
                        or display.get("overall_html_report")
                        or display.get("overall_excel_report")
                        or display.get("new_books_result_page")
                        or display.get("new_books_html_report")
                        or display.get("new_books_excel_report")
                    )
                    else []
                ),
            ]
        )
    )
    comparison = compare_rows(
        df_a_final, df_b_final, effective_targets, effective_keys,
        aggregation_columns=aggregation_columns or [],
        extra_columns=comparison_extra_columns,
    )

    # Phase 2: rule evaluation against comparison (df_b) rows
    validation = validate_rows(
        df_b_final,
        rules,
        effective_targets,
        effective_keys,
        comparison_df=df_a_final,
        aggregation_columns=aggregation_columns or [],
        exception_columns=(exception_columns or []) if display.get("exception_tables") else [],
        commentary_template_columns=template_columns,
    )

    grp_stats = None
    effective_agg = aggregation_columns or []
    if effective_agg:
        grp_stats = compute_group_statistics(
            comparison.row_details,
            validation.violations_by_rule,
            effective_agg,
            new_book_rows=comparison.new_book_rows,
        )

    return ExecutionResult(
        comparison=comparison,
        validation=validation,
        common_columns=comparison_columns,
        target_columns=effective_targets,
        key_columns=effective_keys,
        filters_applied=filters,
        aggregation_columns=effective_agg,
        aggregation_column_labels=aggregation_column_labels or {},
        nested_aggregation_enabled=nested_aggregation_enabled,
        comparison_sections=comparison_sections or [],
        exception_columns=exception_columns or [],
        extra_column_display=display,
        group_statistics=grp_stats,
        rule_bindings=rule_bindings,
        as_of_date=as_of_date,
        commentary_template_columns=template_columns,
        new_exceptions_only=new_exceptions_only,
        filter_relation=filter_relation,
        filter_grouping_tree=serialize_grouping_tree(parsed_filter_tree),
    )
