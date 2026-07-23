from __future__ import annotations

from typing import Any

from apps.families.services import get_family


def available_members(
    family_name: str, eligible_columns: set[str]
) -> list[str]:
    """Return saved family columns that are present in eligible_columns."""
    family = get_family(family_name)
    if family is None or family.get("kind") != "column":
        return []
    saved = family.get("columns", [])
    return [c for c in saved if c in eligible_columns]


def missing_members(
    family_name: str, eligible_columns: set[str]
) -> list[str]:
    """Return saved family columns absent from eligible_columns."""
    family = get_family(family_name)
    if family is None or family.get("kind") != "column":
        return []
    saved = family.get("columns", [])
    return [c for c in saved if c not in eligible_columns]


def is_selectable(family_name: str, eligible_columns: set[str]) -> bool:
    return len(available_members(family_name, eligible_columns)) >= 1


def expand_column_references(
    items: list[str],
    eligible_columns: set[str],
) -> tuple[list[str], list[str], list[str]]:
    """Expand a list that may contain both direct column names and Column
    Family names prefixed with ``family:``. Returns (effective_columns,
    resolved_families, families_with_zero_members).

    Direct column names pass through unchanged.
    Family references are expanded to their available member columns.
    """
    effective: list[str] = []
    resolved_families: list[str] = []
    zero_member_families: list[str] = []

    for item in items:
        if item.startswith("family:"):
            fname = item[len("family:"):]
            members = available_members(fname, eligible_columns)
            if not members:
                zero_member_families.append(fname)
            else:
                resolved_families.append(fname)
                effective.extend(members)
        else:
            effective.append(item)

    # Deduplicate while preserving order
    seen: set[str] = set()
    deduped: list[str] = []
    for c in effective:
        if c not in seen:
            seen.add(c)
            deduped.append(c)

    return deduped, resolved_families, zero_member_families


def resolve_comparison_columns(
    comparison_columns: list[str],
    eligible_columns: set[str],
) -> tuple[list[str], list[str], list[str]]:
    """Expand family references in comparison columns selection."""
    return expand_column_references(comparison_columns, eligible_columns)


def resolve_key_columns(
    key_columns: list[str],
    eligible_columns: set[str],
) -> tuple[list[str], list[str], list[str]]:
    """Expand family references in identifier columns selection."""
    return expand_column_references(key_columns, eligible_columns)


def resolve_aggregation_columns(
    aggregation_columns: list[str],
    eligible_columns: set[str],
) -> tuple[list[str], list[str], list[str]]:
    """Expand family references in aggregation columns selection."""
    return expand_column_references(aggregation_columns, eligible_columns)


def is_family_reference(value: str) -> bool:
    return value.startswith("family:")


def family_name_from_reference(value: str) -> str:
    return value[len("family:"):] if value.startswith("family:") else value


def expand_rule_column(
    column: str,
    eligible_columns: set[str],
) -> tuple[list[str], bool]:
    """If ``column`` is a family reference, expand to available members.
    Returns (expanded_columns, is_family).
    """
    if is_family_reference(column):
        fname = family_name_from_reference(column)
        members = available_members(fname, eligible_columns)
        return members, True
    return [column], False


def evaluate_family_predicate(
    row_value: Any | None,
    operator: str,
    filter_values: list[str],
) -> bool:
    """Evaluate a predicate against a single row value.

    Positive operators (eq, contains) return True if ANY filter_value matches.
    Negative operators (neq, ncontains) return True if ALL filter_values pass
    the negative test (logical inverse of the positive).
    """
    if row_value is None:
        return False
    val = str(row_value)

    if operator == "eq":
        return val in filter_values
    elif operator == "neq":
        return val not in filter_values
    elif operator == "contains":
        return any(tv in val for tv in filter_values)
    elif operator == "ncontains":
        return all(tv not in val for tv in filter_values)
    return False


def evaluate_rule_predicate_for_family(
    row: dict[str, Any],
    family_name: str,
    operator: str,
    target_values: list[str],
    eligible_columns: set[str],
    baseline_row: dict[str, Any] | None = None,
    logic_format: str = "value",
    target_column: str | None = None,
) -> tuple[bool, str, Any]:
    """Evaluate a rule predicate where the column operand is a Column Family.

    For positive operators (eq, contains, gt, lt, gte, lte):
        ANY member column matching is a pass (returns no violation).

    For negative operators (neq, ncontains):
        ALL member columns must pass the negative test (returns no violation
        only when every member satisfies the negative condition).

    When format is ``column_vs_column`` and target is also a family,
    compare only identically-named members (intersection).
    """
    members = available_members(family_name, eligible_columns)
    if not members:
        return (False, "", None)

    is_positive = operator not in ("neq", "ncontains")

    if logic_format == "column_vs_column" and target_column and is_family_reference(target_column):
        # Both sides are families: compare only same-named members
        target_family = family_name_from_reference(target_column)
        target_members = available_members(target_family, eligible_columns)
        shared = [c for c in members if c in target_members]
        if not shared:
            return (
                True,
                family_name,
                f"Families '{family_name}' and '{target_family}' have no common members",
            )
        if is_positive:
            for col in shared:
                if col not in row or row[col] is None:
                    continue
                val = str(row[col])
                target_val = (
                    str(baseline_row[col])
                    if baseline_row and col in baseline_row and baseline_row[col] is not None
                    else ""
                )
                if _single_value_match(val, target_val, operator):
                    return (False, "", None)
            return (True, shared[0] if shared else family_name, row.get(shared[0]))
        else:
            for col in shared:
                if col not in row or row[col] is None:
                    continue
                val = str(row[col])
                target_val = (
                    str(baseline_row[col])
                    if baseline_row and col in baseline_row and baseline_row[col] is not None
                    else ""
                )
                if not _single_value_match(val, target_val, operator):
                    return (True, col, row.get(col))
            return (False, "", None)
    elif logic_format == "column_vs_column" and target_column:
        # Column family vs single column
        if is_positive:
            for col in members:
                if col not in row or row[col] is None:
                    continue
                val = str(row[col])
                target_val = (
                    str(baseline_row[target_column]) if (
                        baseline_row
                        and target_column in baseline_row
                        and baseline_row[target_column] is not None
                    )
                    else ""
                )
                if _single_value_match(val, target_val, operator):
                    return (False, "", None)
            return (True, members[0], row.get(members[0]))
        else:
            for col in members:
                if col not in row or row[col] is None:
                    continue
                val = str(row[col])
                target_val = (
                    str(baseline_row[target_column])
                    if (
                        baseline_row
                        and target_column in baseline_row
                        and baseline_row[target_column] is not None
                    )
                    else ""
                )
                if not _single_value_match(val, target_val, operator):
                    return (True, col, row.get(col))
            return (False, "", None)
    else:
        # Value-vs-column: compare each member against target_values
        if is_positive:
            for col in members:
                if col not in row or row[col] is None:
                    continue
                if evaluate_family_predicate(row[col], operator, target_values):
                    return (False, "", None)
            return (True, members[0], row.get(members[0]))
        else:
            # Negative predicates: ALL members must pass the negative test.
            # If any member fails (evaluate_family_predicate returns False),
            # the row is a violation.
            for col in members:
                if col not in row or row[col] is None:
                    continue
                if not evaluate_family_predicate(row[col], operator, target_values):
                    return (True, col, row.get(col))
            return (False, "", None)


def _single_value_match(val: str, target: str, operator: str) -> bool:
    if operator == "eq":
        return val == target
    elif operator == "neq":
        return val != target
    elif operator == "contains":
        return target in val
    elif operator == "ncontains":
        return target not in val
    elif operator == "gt":
        try:
            return float(val) > float(target)
        except (TypeError, ValueError):
            return False
    elif operator == "lt":
        try:
            return float(val) < float(target)
        except (TypeError, ValueError):
            return False
    elif operator == "gte":
        try:
            return float(val) >= float(target)
        except (TypeError, ValueError):
            return False
    elif operator == "lte":
        try:
            return float(val) <= float(target)
        except (TypeError, ValueError):
            return False
    return False


def get_value_family_values(value_family_name: str) -> list[str]:
    """Return the stored values from a Value Family."""
    family = get_family(value_family_name)
    if family is None or family.get("kind") != "value":
        return []
    return family.get("values", [])


def get_column_family_union_values(
    family_name: str,
    comparison_file_column_values: dict[str, list[str]],
) -> list[str]:
    """Get the union of all distinct comparison-file values across all
    available members of a Column Family."""
    family = get_family(family_name)
    if family is None or family.get("kind") != "column":
        return []
    columns = family.get("columns", [])
    union: list[str] = []
    seen: set[str] = set()
    for col in columns:
        if col in comparison_file_column_values:
            for val in comparison_file_column_values[col]:
                if val not in seen:
                    seen.add(val)
                    union.append(val)
    return union
