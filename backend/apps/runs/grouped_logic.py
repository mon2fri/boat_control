"""Runtime support for grouped row filters and grouped rule outcomes.

The persisted wire shape is the shared grouping tree::

    {"kind": "leaf", "conditionId": "c0"}
    {"kind": "and" | "or", "children": [...]}

Worker A owns the rule schema and canonical identity.  This module is the
run-side adapter: it reads A's normalized outcome fields when present, keeps
legacy ``Rule.logic`` working, validates grouping references, and evaluates the
resulting expression against one record.

Null/blank semantics (agreed requirement section 3) are centralised here so
Row Filters, Rule Conditions and Rule Logic cannot drift:

* ``eq`` / ``contains`` are false for a null or empty-string input value;
* ``neq`` / ``ncontains`` are true for a null or empty-string input value;
* whitespace-only strings remain literal (no trimming or case folding);
* numeric operators keep their existing behaviour and never treat a missing
  value as a match.

Missing *schema columns* are handled by ``execute_comparison`` validation, not
by pretending the cell is null.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from apps.families.resolver import (
    available_members,
    family_name_from_reference,
    is_family_reference,
)
from apps.rules.services import GroupingBranch, GroupingLeaf

GroupingNode = GroupingLeaf | GroupingBranch
GroupingKind = Literal["and", "or"]
STRING_OPERATORS = frozenset({"eq", "neq", "contains", "ncontains"})
NEGATIVE_OPERATORS = frozenset({"neq", "ncontains"})
NUMERIC_OPERATORS = frozenset({"gt", "lt", "gte", "lte"})
VALID_RELATIONS = frozenset({"and", "or"})
MAX_TREE_DEPTH = 50
MAX_TREE_NODES = 1000


class GroupingValidationError(ValueError):
    """A grouping expression is malformed or references invalid clauses."""


class OutcomeClause(Protocol):
    """The subset of a logic clause used by the runtime evaluator."""

    format: str
    column_name: str
    operator: str
    target_value: str
    target_values: tuple[str, ...]
    comparison_mode: str


@dataclass(frozen=True)
class NormalizedOutcomeClause:
    format: str
    column_name: str
    operator: str
    target_value: str
    target_values: tuple[str, ...] = ()
    comparison_mode: str = "comparison_vs_baseline"

    @property
    def values(self) -> tuple[str, ...]:
        return self.target_values or (
            (self.target_value,) if self.target_value != "" else ()
        )


@dataclass(frozen=True)
class NormalizedOutcomes:
    clauses: tuple[NormalizedOutcomeClause, ...]
    relation: str | None
    tree: GroupingNode | None
    source: Literal["legacy", "grouped"]

    @property
    def grouped(self) -> bool:
        return self.source == "grouped"


@dataclass(frozen=True)
class ClauseEvaluation:
    matched: bool
    observed: Any = None
    compared: Any = None
    missing_column: bool = False


@dataclass(frozen=True)
class OutcomeEvaluation:
    passed: bool
    clause_results: tuple[ClauseEvaluation, ...]
    failed_indexes: tuple[int, ...] = field(default_factory=tuple)


# ---------------------------------------------------------------------------
# Grouping tree parsing / validation / rendering
# ---------------------------------------------------------------------------


def parse_grouping_tree(raw: Any) -> GroupingNode | None:
    """Parse a persisted grouping tree, returning ``None`` when malformed."""

    if raw is None:
        return None
    if not isinstance(raw, dict):
        return None
    kind = raw.get("kind")
    if kind == "leaf":
        condition_id = raw.get("conditionId")
        if not isinstance(condition_id, str) or not condition_id:
            return None
        return GroupingLeaf(condition_id=condition_id)
    if kind in ("and", "or"):
        children_raw = raw.get("children")
        if not isinstance(children_raw, list) or len(children_raw) < 2:
            return None
        children: list[GroupingNode] = []
        for child in children_raw:
            parsed = parse_grouping_tree(child)
            if parsed is None:
                return None
            children.append(parsed)
        return GroupingBranch(kind=kind, children=tuple(children))
    return None


def serialize_grouping_tree(node: GroupingNode | None) -> Any:
    if node is None:
        return None
    if isinstance(node, GroupingLeaf):
        return {"kind": "leaf", "conditionId": node.condition_id}
    return {
        "kind": node.kind,
        "children": [serialize_grouping_tree(child) for child in node.children],
    }


def _walk_tree(
    node: GroupingNode,
    *,
    depth: int = 1,
    seen_nodes: list[int] | None = None,
) -> list[str]:
    errors: list[str] = []
    if seen_nodes is None:
        seen_nodes = []
    seen_nodes.append(1)
    if len(seen_nodes) > MAX_TREE_NODES:
        return [f"Grouping tree exceeds the maximum of {MAX_TREE_NODES} nodes."]
    if depth > MAX_TREE_DEPTH:
        return [f"Grouping tree exceeds the maximum depth of {MAX_TREE_DEPTH}."]
    if isinstance(node, GroupingBranch):
        if len(node.children) < 2:
            errors.append(
                f"Grouping node '{node.kind}' must have at least 2 children."
            )
        for child in node.children:
            errors.extend(
                _walk_tree(child, depth=depth + 1, seen_nodes=seen_nodes)
            )
    return errors


def _leaf_index(condition_id: str) -> int | None:
    if not condition_id.startswith("c"):
        return None
    try:
        index = int(condition_id[1:])
    except ValueError:
        return None
    return index if index >= 0 else None


def validate_grouping_tree(
    node: GroupingNode | None,
    clause_count: int,
    *,
    label: str = "Clause",
    prefix: str = "c",
) -> list[str]:
    """Return actionable errors for an invalid grouping tree.

    Every configured clause must occur exactly once.  Unknown, duplicate and
    omitted references are all rejected rather than silently ignored.
    """

    if node is None:
        return []
    errors = _walk_tree(node)
    seen: list[str] = []

    def _visit(current: GroupingNode) -> None:
        if isinstance(current, GroupingLeaf):
            condition_id = current.condition_id
            index = _leaf_index(condition_id)
            if index is None or not condition_id.startswith(prefix):
                errors.append(
                    f"Invalid {label.lower()} ID format: {condition_id!r}."
                )
                return
            if index >= clause_count:
                errors.append(
                    f"{label} ID '{condition_id}' references a missing "
                    f"{label.lower()} (valid: {prefix}0..{prefix}{clause_count - 1})."
                )
            if condition_id in seen:
                errors.append(
                    f"{label} ID '{condition_id}' is referenced more than once."
                )
            seen.append(condition_id)
            return
        for child in current.children:
            _visit(child)

    _visit(node)
    expected = {f"{prefix}{index}" for index in range(clause_count)}
    missing = sorted(expected - set(seen))
    if missing:
        errors.append(f"Grouping tree omits {label.lower()} IDs: {', '.join(missing)}.")
    return errors


def validate_relation(relation: Any, *, label: str = "relation") -> list[str]:
    if relation is None:
        return []
    if relation not in VALID_RELATIONS:
        return [f"Invalid {label} '{relation}'. Must be one of: and, or."]
    return []


def evaluate_grouping_tree(
    node: GroupingNode | None, clause_results: Sequence[bool]
) -> bool:
    if node is None:
        return False
    if isinstance(node, GroupingLeaf):
        index = _leaf_index(node.condition_id)
        if index is None or index >= len(clause_results):
            return False
        return bool(clause_results[index])
    child_results = [
        evaluate_grouping_tree(child, clause_results) for child in node.children
    ]
    if node.kind == "and":
        return all(child_results)
    return any(child_results)


def _describe_tree_node(
    node: GroupingNode,
    labels: Sequence[str],
) -> str:
    if isinstance(node, GroupingLeaf):
        index = _leaf_index(node.condition_id)
        if index is not None and index < len(labels):
            return labels[index]
        return f"Clause {node.condition_id}"
    joined = f" {node.kind.upper()} ".join(
        _describe_tree_node(child, labels) for child in node.children
    )
    return f"({joined})"


def validate_filter_grouping(
    filters: Sequence[Any],
    relation: Any = None,
    tree: Any = None,
) -> list[str]:
    """Validate filter clause references without requiring data columns."""

    errors: list[str] = []
    if not isinstance(filters, Sequence) or isinstance(filters, (str, bytes)):
        return ["filters must be a list."]
    errors.extend(validate_relation(relation, label="filter_relation"))
    if tree is None:
        return errors
    parsed = parse_grouping_tree(tree)
    if parsed is None:
        errors.append("Invalid filter_grouping_tree structure.")
        return errors
    errors.extend(
        validate_grouping_tree(
            parsed, len(filters), label="Filter", prefix="c"
        )
    )
    return errors


def require_filter_grouping(
    filters: Sequence[Any],
    relation: Any = None,
    tree: Any = None,
) -> GroupingNode | None:
    errors = validate_filter_grouping(filters, relation, tree)
    if errors:
        raise GroupingValidationError("; ".join(errors))
    return parse_grouping_tree(tree)


# ---------------------------------------------------------------------------
# Null/blank predicate semantics
# ---------------------------------------------------------------------------


def _is_blank(value: Any) -> bool:
    return value is None or value == ""


def _numeric_match(raw_value: Any, operator: str, expected: str) -> bool:
    if _is_blank(raw_value):
        return False
    try:
        left = float(str(raw_value))
        right = float(expected)
    except (TypeError, ValueError):
        return False
    if operator == "gt":
        return left > right
    if operator == "lt":
        return left < right
    if operator == "gte":
        return left >= right
    if operator == "lte":
        return left <= right
    return False


def match_value(raw_value: Any, operator: str, values: Sequence[str]) -> bool:
    """Evaluate one value-against-column predicate on one cell value."""

    if operator in STRING_OPERATORS:
        if operator in NEGATIVE_OPERATORS:
            if _is_blank(raw_value):
                return True
            text = str(raw_value)
            if operator == "neq":
                return all(text != value for value in values)
            return all(value not in text for value in values)
        if _is_blank(raw_value):
            return False
        text = str(raw_value)
        if operator == "eq":
            return any(text == value for value in values)
        if operator == "contains":
            return any(value in text for value in values)
        return False

    if operator in NUMERIC_OPERATORS:
        if not values:
            return False
        matches = [_numeric_match(raw_value, operator, value) for value in values]
        return any(matches)

    return False


def match_column(raw_left: Any, raw_right: Any, operator: str) -> bool:
    """Evaluate one column-against-column predicate.

    Null/blank follows the same conservative rules as value comparison.  For
    string operators ``neq``/``ncontains`` are the logical inverse of
    ``eq``/``contains``, so a null or blank operand satisfies the negative
    operator but never the positive one.
    """

    if operator in STRING_OPERATORS:
        left_blank = _is_blank(raw_left)
        right_blank = _is_blank(raw_right)
        if operator == "eq":
            return (
                not left_blank
                and not right_blank
                and str(raw_left) == str(raw_right)
            )
        if operator == "neq":
            return not (
                not left_blank
                and not right_blank
                and str(raw_left) == str(raw_right)
            )
        if operator == "contains":
            return (
                not left_blank
                and not right_blank
                and str(raw_right) in str(raw_left)
            )
        if operator == "ncontains":
            return not (
                not left_blank
                and not right_blank
                and str(raw_right) in str(raw_left)
            )
        return False

    if operator in NUMERIC_OPERATORS:
        if _is_blank(raw_right):
            return False
        return _numeric_match(raw_left, operator, str(raw_right))

    return False


def family_members(column: str, eligible_columns: set[str]) -> list[str]:
    return available_members(
        family_name_from_reference(column), eligible_columns
    )


def match_condition_value(
    row: dict[str, Any],
    column: str,
    operator: str,
    values: Sequence[str],
    baseline_row: dict[str, Any] | None = None,
) -> bool:
    """Evaluate a rule-condition predicate, expanding column-family leaves."""

    if not is_family_reference(column):
        return match_value(row.get(column), operator, values)
    eligible = set(row)
    if baseline_row is not None:
        eligible.update(baseline_row)
    members = family_members(column, eligible)
    if not members:
        return False
    results = [
        match_value(row.get(member), operator, values) for member in members
    ]
    if operator in NEGATIVE_OPERATORS:
        return all(results)
    return any(results)


def evaluate_family_outcome_clause(
    row: dict[str, Any],
    clause: NormalizedOutcomeClause,
    baseline_row: dict[str, Any] | None = None,
) -> ClauseEvaluation:
    eligible = set(row)
    if baseline_row is not None:
        eligible.update(baseline_row)
    members = family_members(clause.column_name, eligible)
    if not members:
        return ClauseEvaluation(matched=False, missing_column=True)
    observed = {member: row.get(member) for member in members}
    compared: Any = clause.values
    results: list[bool] = []

    if clause.format == "column_vs_column":
        source = (
            row
            if clause.comparison_mode == "comparison_vs_comparison"
            else baseline_row if baseline_row is not None else row
        )
        if is_family_reference(clause.target_value):
            target_members = family_members(clause.target_value, eligible)
            shared = [member for member in members if member in target_members]
            if not shared:
                return ClauseEvaluation(
                    matched=False,
                    observed=observed,
                    missing_column=True,
                )
            compared = {
                member: source.get(member) for member in shared
            }
            results = [
                match_column(row.get(member), source.get(member), clause.operator)
                for member in shared
            ]
        else:
            compared = source.get(clause.target_value)
            results = [
                match_column(
                    row.get(member), compared, clause.operator
                )
                for member in members
            ]
    else:
        results = [
            match_value(row.get(member), clause.operator, clause.values)
            for member in members
        ]

    matched = (
        all(results)
        if clause.operator in NEGATIVE_OPERATORS
        else any(results)
    )
    return ClauseEvaluation(matched=matched, observed=observed, compared=compared)


# ---------------------------------------------------------------------------
# Rule outcome normalization / evaluation
# ---------------------------------------------------------------------------


def _coerce_clause(raw: Any) -> NormalizedOutcomeClause:
    if isinstance(raw, NormalizedOutcomeClause):
        return raw
    if isinstance(raw, dict):
        values = raw.get("target_values")
        format_name = str(raw.get("format", ""))
        column_name = str(raw.get("column_name", ""))
        operator = str(raw.get("operator", ""))
        target_value = str(raw.get("target_value", ""))
        comparison_mode = str(
            raw.get("comparison_mode", "comparison_vs_baseline")
        )
    else:
        values = getattr(raw, "target_values", ())
        format_name = str(getattr(raw, "format", ""))
        column_name = str(getattr(raw, "column_name", ""))
        operator = str(getattr(raw, "operator", ""))
        target_value = str(getattr(raw, "target_value", ""))
        comparison_mode = str(
            getattr(raw, "comparison_mode", "comparison_vs_baseline")
        )
    if not format_name:
        raise GroupingValidationError("Outcome clause is missing a format.")
    if not column_name:
        raise GroupingValidationError("Outcome clause is missing a column.")
    if not operator:
        raise GroupingValidationError("Outcome clause is missing an operator.")
    value_tuple = tuple(str(value) for value in values) if values else ()
    return NormalizedOutcomeClause(
        format=format_name,
        column_name=column_name,
        operator=operator,
        target_value=target_value,
        target_values=value_tuple,
        comparison_mode=comparison_mode,
    )


def _clauses_equal(
    left: NormalizedOutcomeClause, right: NormalizedOutcomeClause
) -> bool:
    return (
        left.format == right.format
        and left.column_name == right.column_name
        and left.operator == right.operator
        and tuple(sorted(left.values)) == tuple(sorted(right.values))
        and left.comparison_mode == right.comparison_mode
    )


def normalize_rule_outcomes(rule: Any) -> NormalizedOutcomes:
    """Read A's normalized outcome form, falling back to legacy ``logic``.

    The new form is authoritative when present.  A legacy ``logic`` value is
    accepted only when it describes one of the configured clauses; a
    contradictory legacy value raises instead of silently selecting one form.
    """

    raw_clauses = getattr(rule, "logic_clauses", None)
    raw_relation = getattr(rule, "logic_relation", None)
    raw_tree = getattr(rule, "logic_grouping_tree", None)
    legacy = getattr(rule, "logic", None)

    if not raw_clauses:
        if legacy is None:
            raise GroupingValidationError("Rule logic is required.")
        if raw_tree is not None:
            raise GroupingValidationError(
                "Rule has logic_grouping_tree without logic_clauses."
            )
        if raw_relation is not None:
            raise GroupingValidationError(
                "Rule has logic_relation without logic_clauses."
            )
        clause = _coerce_clause(legacy)
        return NormalizedOutcomes(
            clauses=(clause,),
            relation=None,
            tree=None,
            source="legacy",
        )

    if isinstance(raw_clauses, (str, bytes)) or not isinstance(
        raw_clauses, Sequence
    ):
        raise GroupingValidationError("logic_clauses must be a list.")
    clauses = tuple(_coerce_clause(clause) for clause in raw_clauses)
    if not clauses:
        raise GroupingValidationError("logic_clauses must not be empty.")
    if len(clauses) > 1 and any(
        clause.format != "value_vs_column" for clause in clauses
    ):
        raise GroupingValidationError(
            "Multiple grouped outcomes support value-against-column clauses only."
        )

    tree: GroupingNode | None = None
    if raw_tree is not None:
        tree = parse_grouping_tree(raw_tree)
        if tree is None:
            raise GroupingValidationError("Invalid logic_grouping_tree structure.")
        tree_errors = validate_grouping_tree(
            tree, len(clauses), label="Outcome", prefix="c"
        )
        if tree_errors:
            raise GroupingValidationError("; ".join(tree_errors))
    relation_errors = validate_relation(raw_relation, label="logic_relation")
    if relation_errors:
        raise GroupingValidationError("; ".join(relation_errors))
    if len(clauses) > 1 and tree is None and raw_relation is None:
        raise GroupingValidationError(
            "Multiple outcomes require an explicit logic_relation or a valid "
            "logic_grouping_tree."
        )

    if legacy is not None:
        legacy_clause = _coerce_clause(legacy)
        if not any(_clauses_equal(legacy_clause, clause) for clause in clauses):
            raise GroupingValidationError(
                "Legacy logic conflicts with logic_clauses; refusing to choose "
                "one silently."
            )

    return NormalizedOutcomes(
        clauses=clauses,
        relation=str(raw_relation) if raw_relation is not None else None,
        tree=tree,
        source="grouped",
    )


def evaluate_outcome_clause(
    row: dict[str, Any],
    clause: NormalizedOutcomeClause,
    baseline_row: dict[str, Any] | None = None,
) -> ClauseEvaluation:
    column = clause.column_name
    if is_family_reference(column):
        return evaluate_family_outcome_clause(row, clause, baseline_row)
    if column not in row:
        return ClauseEvaluation(matched=False, missing_column=True)
    observed = row.get(column)

    if clause.format == "column_vs_column":
        source = (
            row
            if clause.comparison_mode == "comparison_vs_comparison"
            else baseline_row if baseline_row is not None else row
        )
        if clause.target_value not in source:
            return ClauseEvaluation(
                matched=False,
                observed=observed,
                missing_column=True,
            )
        compared = source.get(clause.target_value)
        return ClauseEvaluation(
            matched=match_column(observed, compared, clause.operator),
            observed=observed,
            compared=compared,
        )

    values = clause.values
    return ClauseEvaluation(
        matched=match_value(observed, clause.operator, values),
        observed=observed,
        compared=values,
    )


def evaluate_outcomes(
    row: dict[str, Any],
    outcomes: NormalizedOutcomes,
    baseline_row: dict[str, Any] | None = None,
) -> OutcomeEvaluation:
    clause_results = tuple(
        evaluate_outcome_clause(row, clause, baseline_row)
        for clause in outcomes.clauses
    )
    matched = [result.matched for result in clause_results]
    if outcomes.tree is not None:
        passed = evaluate_grouping_tree(outcomes.tree, matched)
    elif len(matched) == 1:
        passed = matched[0]
    elif outcomes.relation == "or":
        passed = any(matched)
    else:
        passed = all(matched)
    failed = tuple(index for index, value in enumerate(matched) if not value)
    return OutcomeEvaluation(
        passed=passed,
        clause_results=clause_results,
        failed_indexes=failed,
    )


# ---------------------------------------------------------------------------
# Human-readable outcome descriptions
# ---------------------------------------------------------------------------

_OPERATOR_LABELS = {
    "eq": "equals",
    "neq": "does not equal",
    "contains": "contains",
    "ncontains": "does not contain",
    "gt": "greater than",
    "lt": "less than",
    "gte": "greater than or equal to",
    "lte": "less than or equal to",
}


def describe_outcome_clause(clause: NormalizedOutcomeClause) -> str:
    operator = _OPERATOR_LABELS.get(
        clause.operator, clause.operator.replace("_", " ")
    )
    description = f"{clause.column_name} {operator} "
    if clause.format == "column_vs_column":
        return description + f"column '{clause.target_value}'"
    values = clause.values
    if len(values) == 1:
        return description + f"'{values[0]}'"
    connector = (
        "' and '" if clause.operator in NEGATIVE_OPERATORS else "' or '"
    )
    return description + f"'{connector.join(values)}'"


def describe_outcomes(outcomes: NormalizedOutcomes) -> str:
    if not outcomes.grouped:
        return describe_outcome_clause(outcomes.clauses[0])
    clause_labels = [
        f"Outcome {index}: {describe_outcome_clause(clause)}"
        for index, clause in enumerate(outcomes.clauses, start=1)
    ]
    if outcomes.tree is not None:
        return _describe_tree_node(outcomes.tree, clause_labels)
    relation = (outcomes.relation or "and").upper()
    return f" {relation} ".join(clause_labels)


def outcome_columns(outcomes: NormalizedOutcomes) -> tuple[str, ...]:
    return tuple(
        dict.fromkeys(clause.column_name for clause in outcomes.clauses)
    )


__all__ = [
    "ClauseEvaluation",
    "GroupingNode",
    "GroupingValidationError",
    "NormalizedOutcomeClause",
    "NormalizedOutcomes",
    "OutcomeEvaluation",
    "STRING_OPERATORS",
    "NEGATIVE_OPERATORS",
    "NUMERIC_OPERATORS",
    "describe_outcome_clause",
    "describe_outcomes",
    "evaluate_grouping_tree",
    "evaluate_outcome_clause",
    "evaluate_outcomes",
    "family_members",
    "is_family_reference",
    "match_column",
    "match_condition_value",
    "match_value",
    "normalize_rule_outcomes",
    "outcome_columns",
    "parse_grouping_tree",
    "require_filter_grouping",
    "serialize_grouping_tree",
    "validate_filter_grouping",
    "validate_grouping_tree",
    "validate_relation",
]
