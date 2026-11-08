from __future__ import annotations

import re
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import yaml

from apps.settings.services import get_rules_file
from apps.validation_logic.trees import (
    GroupingBranch,
    GroupingLeaf,
    GroupingNode,
    TreeValidationError,
)
from apps.validation_logic.trees import (
    collect_leaf_ids as _pure_collect_leaf_ids,
)
from apps.validation_logic.trees import (
    parse_grouping_tree as _parse_grouping_tree_strict,
)
from apps.validation_logic.trees import (
    serialize_grouping_tree as _serialize_grouping_tree,
)
from apps.validation_logic.trees import (
    validate_grouping_tree as _pure_validate_grouping_tree,
)

_rules_lock = threading.Lock()

__all__ = [
    "Condition",
    "GroupingBranch",
    "GroupingLeaf",
    "GroupingNode",
    "LogicClause",
    "LogicExpression",
    "Rule",
    "RuleValidationResult",
    "RulesFile",
    "create_rule",
    "delete_rule",
    "load_rules",
    "normalize_rule_draft",
    "reorder_rules",
    "replace_rules",
    "rule_definition_payload",
    "rule_from_payload",
    "save_rules",
    "serialize_logic_clause",
    "update_rule",
    "validate_rule",
]

ConditionOperator = Literal["eq", "neq", "contains", "ncontains", "gt", "lt"]
LogicOperator = Literal["and", "or"]
LogicFormat = Literal["value_vs_column", "column_vs_column"]

VALID_CONDITION_OPERATORS: set[ConditionOperator] = {
    "eq",
    "neq",
    "contains",
    "ncontains",
    "gt",
    "lt",
}
VALID_LOGIC_OPERATORS: set[LogicOperator] = {"and", "or"}
VALID_LOGIC_FORMATS: set[LogicFormat] = {"value_vs_column", "column_vs_column"}
VALID_LOGIC_CLAUSE_OPERATORS: set[str] = {
    "eq",
    "neq",
    "contains",
    "ncontains",
    "gt",
    "lt",
    "gte",
    "lte",
}


@dataclass(frozen=True)
class Condition:
    column_name: str
    operator: ConditionOperator
    filter_value: str
    filter_values: tuple[str, ...] = ()


def _condition_values(data: dict[str, Any]) -> tuple[str, ...]:
    values = data.get("filter_values")
    if isinstance(values, list):
        return tuple(str(value) for value in values if str(value) != "")
    legacy = data.get("filter_value", "")
    return (str(legacy),) if legacy != "" else ()


def _make_condition(data: dict[str, Any]) -> Condition:
    values = _condition_values(data)
    return Condition(
        column_name=data["column_name"],
        operator=data["operator"],
        filter_value=values[0] if values else "",
        filter_values=values,
    )


@dataclass(frozen=True)
class LogicClause:
    format: LogicFormat
    column_name: str
    operator: str
    target_value: str
    target_values: tuple[str, ...] = ()
    comparison_mode: str = "comparison_vs_baseline"


@dataclass(frozen=True)
class LogicExpression:
    """Normalized outcome expression consumed by runtime integration.

    ``clauses`` is the complete ordered outcome list. ``logic`` on :class:`Rule`
    is retained as the first clause for legacy consumers, but callers must read
    this accessor (``rule.outcome_expression``) so a multi-outcome rule is never
    silently reduced to its first clause. For a single clause with no tree or
    relation, ``relation`` is ``None`` and meaning is exactly the legacy
    single-outcome form.
    """

    clauses: tuple[LogicClause, ...]
    relation: LogicOperator | None = None
    grouping_tree: GroupingNode | None = None
    representation: Literal["legacy", "clauses"] = "legacy"

    @property
    def is_single(self) -> bool:
        return len(self.clauses) == 1

    @property
    def flat_relation(self) -> LogicOperator:
        """Relation for a flat expression; only ``and`` is a safe fallback."""

        return self.relation or "and"


@dataclass(frozen=True)
class Rule:
    rule_id: str
    name: str
    description: str
    conditions: list[Condition]
    condition_relation: LogicOperator | None
    grouping: list[str] | None
    grouping_tree: GroupingNode | None
    logic: LogicClause
    extra_columns: tuple[str, ...] = ()
    hide_comparison: bool = False
    rule_identifier: str | None = None
    logic_clauses: tuple[LogicClause, ...] = ()
    logic_relation: LogicOperator | None = None
    logic_grouping_tree: GroupingNode | None = None

    @property
    def outcome_clauses(self) -> tuple[LogicClause, ...]:
        return self.logic_clauses or (self.logic,)

    @property
    def outcome_expression(self) -> LogicExpression:
        representation: Literal["legacy", "clauses"] = (
            "clauses" if self.logic_clauses else "legacy"
        )
        return LogicExpression(
            clauses=self.outcome_clauses,
            relation=self.logic_relation,
            grouping_tree=self.logic_grouping_tree,
            representation=representation,
        )


@dataclass(frozen=True)
class RuleValidationResult:
    valid: bool
    errors: list[str]


def _parse_grouping_tree(data: Any) -> GroupingNode | None:
    """Compatibility wrapper: malformed trees become ``None`` for old callers."""

    try:
        return _parse_grouping_tree_strict(data)
    except TreeValidationError:
        return None


def _validate_grouping_tree(
    node: GroupingNode | None,
    condition_count: int,
    seen_ids: set[str] | None = None,
) -> list[str]:
    # ``seen_ids`` remains accepted for older callers; the pure validator owns
    # duplicate tracking so partial state cannot hide a duplicate reference.
    _ = seen_ids
    return _pure_validate_grouping_tree(
        node,
        item_count=condition_count,
        label="grouping_tree",
    )


def _collect_condition_ids(node: GroupingNode | None) -> set[str]:
    return _pure_collect_leaf_ids(node)


@dataclass(frozen=True)
class RulesFile:
    version: int
    rules: list[Rule]
    next_index: int


_RULE_ID_PATTERN = re.compile(r"^R(\d{3,})$")


def _parse_rule_id(rule_id: str) -> int:
    match = _RULE_ID_PATTERN.match(rule_id)
    if not match:
        raise ValueError(f"Invalid rule ID format: {rule_id}")
    return int(match[1])


def _format_rule_id(index: int) -> str:
    return f"R{index:03d}"


def serialize_logic_clause(
    clause: LogicClause,
    *,
    include_empty_target_values: bool = False,
) -> dict[str, Any]:
    """Serialize one outcome clause without dropping any configured field."""

    result: dict[str, Any] = {
        "format": clause.format,
        "column_name": clause.column_name,
        "operator": clause.operator,
        "target_value": clause.target_value,
    }
    if clause.target_values or include_empty_target_values:
        result["target_values"] = list(clause.target_values)
    result["comparison_mode"] = clause.comparison_mode
    return result


def _logic_clause_from_data(data: Any) -> LogicClause:
    if not isinstance(data, dict):
        raise ValueError("Logic clause must be an object.")
    target_values_raw = data.get("target_values", [])
    if target_values_raw is None:
        target_values_raw = []
    if not isinstance(target_values_raw, list):
        raise ValueError("Logic target_values must be a list.")
    return LogicClause(
        format=data["format"],
        column_name=data["column_name"],
        operator=data["operator"],
        target_value=data.get("target_value", ""),
        target_values=tuple(str(value) for value in target_values_raw),
        comparison_mode=data.get("comparison_mode", "comparison_vs_baseline"),
    )


def _parse_logic_expression(rule_data: dict[str, Any]) -> LogicExpression:
    """Read either the legacy single form or the grouped outcome form."""

    clauses_raw = rule_data.get("logic_clauses")
    if clauses_raw is not None:
        if not isinstance(clauses_raw, list) or not clauses_raw:
            raise ValueError("logic_clauses must be a non-empty list.")
        clauses = tuple(_logic_clause_from_data(item) for item in clauses_raw)
        relation = rule_data.get("logic_relation")
        if relation not in (None, "and", "or"):
            raise ValueError("Invalid logic_relation.")
        tree_raw = rule_data.get("logic_grouping_tree")
        tree = _parse_grouping_tree_strict(tree_raw)
        expression = LogicExpression(
            clauses=clauses,
            relation=relation,
            grouping_tree=tree,
            representation="clauses",
        )
        # New writers use the legacy form for a single outcome. Normalizing
        # here (after validation) guarantees storage and identity stay legacy.
        if len(clauses) == 1:
            return LogicExpression(clauses=clauses, representation="legacy")
        return expression

    logic_raw = rule_data.get("logic")
    if not isinstance(logic_raw, dict):
        raise ValueError("Logic section is required.")
    return LogicExpression(
        clauses=(_logic_clause_from_data(logic_raw),),
        representation="legacy",
    )


def normalize_rule_draft(rule_data: dict[str, Any]) -> dict[str, Any]:
    """Normalize a validated draft so single outcomes use the legacy form."""

    clauses = rule_data.get("logic_clauses")
    if not isinstance(clauses, list) or len(clauses) != 1:
        return rule_data
    clause = clauses[0]
    if not isinstance(clause, dict):
        return rule_data
    normalized = {
        key: value
        for key, value in rule_data.items()
        if key not in {"logic_clauses", "logic_relation", "logic_grouping_tree"}
    }
    normalized["logic"] = dict(clause)
    return normalized


def _build_rule(
    rule_id: str,
    rule_data: dict[str, Any],
    *,
    rule_identifier: str | None = None,
) -> Rule:
    expression = _parse_logic_expression(rule_data)
    return Rule(
        rule_id=rule_id,
        rule_identifier=rule_identifier,
        name=rule_data.get("name", ""),
        description=rule_data.get("description", ""),
        conditions=[_make_condition(c) for c in rule_data.get("conditions", [])],
        condition_relation=rule_data.get("condition_relation"),
        grouping=rule_data.get("grouping"),
        grouping_tree=_parse_grouping_tree(rule_data.get("grouping_tree")),
        logic=expression.clauses[0],
        extra_columns=tuple(str(c) for c in rule_data.get("extra_columns", [])),
        hide_comparison=bool(rule_data.get("hide_comparison", False)),
        logic_clauses=(
            expression.clauses if expression.representation == "clauses" else ()
        ),
        logic_relation=expression.relation,
        logic_grouping_tree=expression.grouping_tree,
    )


def rule_from_payload(
    rule_id: str,
    payload: dict[str, Any],
    *,
    rule_identifier: str | None = None,
) -> Rule:
    """Materialize a stored/authored payload with both outcome forms supported."""

    return _build_rule(rule_id, payload, rule_identifier=rule_identifier)


def rule_definition_payload(
    rule: Rule,
    *,
    include_empty_target_values: bool = False,
) -> dict[str, Any]:
    """Serialize the editable definition, including the complete outcome form."""

    result: dict[str, Any] = {
        "name": rule.name,
        "description": rule.description,
        "conditions": [
            {
                "column_name": condition.column_name,
                "operator": condition.operator,
                "filter_value": condition.filter_value,
                "filter_values": list(condition.filter_values or (condition.filter_value,)),
            }
            for condition in rule.conditions
        ],
        "extra_columns": list(rule.extra_columns),
        "hide_comparison": rule.hide_comparison,
    }
    if rule.condition_relation is not None:
        result["condition_relation"] = rule.condition_relation
    if rule.grouping is not None:
        result["grouping"] = rule.grouping
    tree = _serialize_grouping_tree(rule.grouping_tree)
    if tree is not None:
        result["grouping_tree"] = tree

    expression = rule.outcome_expression
    if expression.representation == "clauses" and not expression.is_single:
        result["logic_clauses"] = [
            serialize_logic_clause(
                clause,
                include_empty_target_values=include_empty_target_values,
            )
            for clause in expression.clauses
        ]
        if expression.relation is not None:
            result["logic_relation"] = expression.relation
        outcome_tree = _serialize_grouping_tree(expression.grouping_tree)
        if outcome_tree is not None:
            result["logic_grouping_tree"] = outcome_tree
    else:
        result["logic"] = serialize_logic_clause(
            expression.clauses[0],
            include_empty_target_values=include_empty_target_values,
        )
    return result


def load_rules(path: Path | None = None) -> RulesFile:
    if path is None:
        # The explicit-path form remains a legacy/config parser. Live execution
        # reads the committed catalog so changing a YAML artifact cannot alter a run.
        from apps.rules.models import RuleStoreState
        from apps.rules.repository import list_enabled_catalog_rules

        try:
            initialized = RuleStoreState.objects.filter(
                singleton_key=1, initialized=True
            ).exists()
            if initialized:
                snapshots = list_enabled_catalog_rules()
                state = RuleStoreState.objects.get(singleton_key=1)
                return RulesFile(
                    version=2,
                    rules=[snapshot.rule for snapshot in snapshots],
                    next_index=state.next_index,
                )
        except RuntimeError as exc:
            if "Database access not allowed" not in str(exc):
                raise

    target = path or get_rules_file()
    if not target.exists():
        return RulesFile(version=1, rules=[], next_index=1)

    with open(target) as f:
        data = yaml.safe_load(f) or {}

    rules = [
        _build_rule(r.get("rule_id") or _format_rule_id(index), r)
        for index, r in enumerate(data.get("rules", []), start=1)
    ]

    next_index = data.get("next_index", 1)
    return RulesFile(
        version=data.get("version", 1),
        rules=rules,
        next_index=next_index,
    )


def save_rules(rules_file: RulesFile, path: Path | None = None) -> None:
    target = path or get_rules_file()
    target.parent.mkdir(parents=True, exist_ok=True)

    rules_list: list[dict[str, Any]] = []
    data: dict[str, Any] = {
        "version": rules_file.version,
        "next_index": rules_file.next_index,
        "rules": rules_list,
    }

    for rule in rules_file.rules:
        rule_data: dict[str, Any] = {
            "rule_id": rule.rule_id,
            **rule_definition_payload(rule),
        }
        rules_list.append(rule_data)

    with tempfile.NamedTemporaryFile(
        mode="w", dir=target.parent, delete=False, suffix=".yaml"
    ) as tmp:
        yaml.dump(data, tmp, default_flow_style=False, sort_keys=False)
        tmp_path = Path(tmp.name)

    tmp_path.replace(target)


def reorder_rules(rules_file: RulesFile, rule_ids: list[str]) -> RulesFile:
    existing = {rule.rule_id: rule for rule in rules_file.rules}
    requested = set(rule_ids)
    if requested != set(existing) or len(rule_ids) != len(existing):
        missing = sorted(set(existing) - requested)
        unknown = sorted(requested - set(existing))
        details = []
        if missing:
            details.append(f"missing: {', '.join(missing)}")
        if unknown:
            details.append(f"unknown: {', '.join(unknown)}")
        raise ValueError(f"Rule order must contain every rule exactly once ({'; '.join(details)}).")
    return RulesFile(
        version=rules_file.version,
        rules=[existing[rule_id] for rule_id in rule_ids],
        next_index=rules_file.next_index,
    )


def _validate_logic_clause(
    clause: Any,
    label: str,
    errors: list[str],
) -> None:
    if not isinstance(clause, dict):
        errors.append(f"{label} must be an object.")
        return
    if clause.get("format") not in VALID_LOGIC_FORMATS:
        valid_formats = ", ".join(sorted(VALID_LOGIC_FORMATS))
        errors.append(f"Invalid {label.lower()} format. Must be one of: {valid_formats}")
    if not clause.get("column_name"):
        errors.append(f"{label} column_name is required.")
    if not clause.get("operator"):
        errors.append(f"{label} operator is required.")
    elif clause.get("operator") not in VALID_LOGIC_CLAUSE_OPERATORS:
        valid_ops = ", ".join(sorted(VALID_LOGIC_CLAUSE_OPERATORS))
        errors.append(
            f"Invalid {label.lower()} operator '{clause.get('operator')}'. "
            f"Must be one of: {valid_ops}"
        )
    if "target_value" not in clause:
        errors.append(f"{label} target_value is required.")
    comparison_mode = clause.get("comparison_mode", "comparison_vs_baseline")
    if comparison_mode not in {
        "comparison_vs_baseline",
        "comparison_vs_comparison",
    }:
        errors.append(f"Invalid {label.lower()} comparison_mode.")


def _validate_outcome_form(rule_data: dict[str, Any], errors: list[str]) -> None:
    logic_present = rule_data.get("logic") is not None
    clauses_present = rule_data.get("logic_clauses") is not None

    if logic_present and clauses_present:
        errors.append("Provide either logic or logic_clauses, not both.")
        return
    if not logic_present and not clauses_present:
        errors.append("Logic section is required.")
        return

    if logic_present:
        _validate_logic_clause(rule_data.get("logic"), "Logic", errors)
        if rule_data.get("logic_relation") is not None:
            errors.append("logic_relation requires logic_clauses.")
        if rule_data.get("logic_grouping_tree") is not None:
            errors.append("logic_grouping_tree requires logic_clauses.")
        return

    clauses = rule_data.get("logic_clauses")
    if not isinstance(clauses, list):
        errors.append("logic_clauses must be a list.")
        return
    if not clauses:
        errors.append("logic_clauses must contain at least one clause.")
        return
    for index, clause in enumerate(clauses, start=1):
        _validate_logic_clause(clause, f"Logic clause {index}", errors)
    if any(
        isinstance(clause, dict) and clause.get("format") == "column_vs_column"
        for clause in clauses
    ):
        errors.append("Multi-outcome logic_clauses support value_vs_column only.")

    relation = rule_data.get("logic_relation")
    if relation is not None and relation not in VALID_LOGIC_OPERATORS:
        valid_ops = ", ".join(sorted(VALID_LOGIC_OPERATORS))
        errors.append(f"Invalid logic_relation. Must be one of: {valid_ops}")

    tree_raw = rule_data.get("logic_grouping_tree")
    if len(clauses) >= 2 and relation is None and tree_raw is None:
        errors.append("logic_relation is required when there are 2+ logic clauses.")
    if tree_raw is not None:
        try:
            tree = _parse_grouping_tree_strict(tree_raw)
        except TreeValidationError as exc:
            errors.append(f"Invalid logic_grouping_tree structure: {exc}")
        else:
            expected_ids = [f"c{index}" for index in range(len(clauses))]
            errors.extend(
                _pure_validate_grouping_tree(
                    tree,
                    item_count=len(clauses),
                    expected_ids=expected_ids,
                    label="logic_grouping_tree",
                )
            )


def validate_rule(rule_data: dict[str, Any]) -> RuleValidationResult:
    errors: list[str] = []

    if not rule_data.get("name"):
        errors.append("Rule name is required.")

    _validate_outcome_form(rule_data, errors)

    conditions = rule_data.get("conditions", [])
    if (
        len(conditions) >= 2
        and not rule_data.get("condition_relation")
        and not rule_data.get("grouping_tree")
    ):
        errors.append("condition_relation is required when there are 2+ conditions.")

    for index, condition in enumerate(conditions, start=1):
        if condition.get("operator") not in VALID_CONDITION_OPERATORS:
            errors.append(f"Invalid condition operator at condition {index}.")
        values = _condition_values(condition)
        if not values:
            errors.append(f"Condition {index} requires at least one value.")
        if condition.get("operator") in {"gt", "lt"}:
            try:
                for value in values:
                    float(value)
            except (TypeError, ValueError):
                errors.append(
                    f"Condition {index} requires numeric values for {condition.get('operator')}."
                )

    cond_rel = rule_data.get("condition_relation")
    if cond_rel and cond_rel not in VALID_LOGIC_OPERATORS:
        valid_ops = ", ".join(sorted(VALID_LOGIC_OPERATORS))
        errors.append(f"Invalid condition_relation. Must be one of: {valid_ops}")

    if len(conditions) >= 3 and rule_data.get("grouping"):
        grouping = rule_data["grouping"]
        if not isinstance(grouping, list) or len(grouping) < 2:
            errors.append("grouping must be a list with at least 2 elements for 3+ conditions.")

    grouping_tree_raw = rule_data.get("grouping_tree")
    if grouping_tree_raw is not None:
        try:
            tree = _parse_grouping_tree_strict(grouping_tree_raw)
        except TreeValidationError as exc:
            errors.append(f"Invalid grouping_tree structure: {exc}")
        else:
            expected_ids = [f"c{index}" for index in range(len(conditions))]
            errors.extend(
                _pure_validate_grouping_tree(
                    tree,
                    item_count=len(conditions),
                    expected_ids=expected_ids,
                    label="grouping_tree",
                )
            )

    return RuleValidationResult(valid=len(errors) == 0, errors=errors)


def create_rule(rules_file: RulesFile, rule_data: dict[str, Any]) -> tuple[RulesFile, Rule]:
    validation = validate_rule(rule_data)
    if not validation.valid:
        raise ValueError(f"Invalid rule: {'; '.join(validation.errors)}")

    rule_id = _format_rule_id(rules_file.next_index)
    rule = _build_rule(rule_id, normalize_rule_draft(rule_data))

    new_rules = list(rules_file.rules) + [rule]
    new_file = RulesFile(
        version=rules_file.version,
        rules=new_rules,
        next_index=rules_file.next_index + 1,
    )
    return new_file, rule


def update_rule(rules_file: RulesFile, rule_id: str, rule_data: dict[str, Any]) -> RulesFile:
    validation = validate_rule(rule_data)
    if not validation.valid:
        raise ValueError(f"Invalid rule: {'; '.join(validation.errors)}")

    updated_rules = []
    found = False
    normalized = normalize_rule_draft(rule_data)
    for rule in rules_file.rules:
        if rule.rule_id == rule_id:
            found = True
            updated_rules.append(_build_rule(rule_id, normalized))
        else:
            updated_rules.append(rule)

    if not found:
        raise ValueError(f"Rule {rule_id} not found.")

    return RulesFile(
        version=rules_file.version,
        rules=updated_rules,
        next_index=rules_file.next_index,
    )


def delete_rule(rules_file: RulesFile, rule_id: str) -> RulesFile:
    new_rules = [r for r in rules_file.rules if r.rule_id != rule_id]
    if len(new_rules) == len(rules_file.rules):
        raise ValueError(f"Rule {rule_id} not found.")
    return RulesFile(
        version=rules_file.version,
        rules=new_rules,
        next_index=rules_file.next_index,
    )


def replace_rules(
    rule_drafts: list[dict[str, Any]], path: Path | None = None
) -> RulesFile:
    """Replace the entire rule collection with validated drafts.

    Validates every draft first. On validation failure the existing rule
    file is left untouched. On success the new rules are assigned sequential
    IDs starting at R001 and written atomically.

    Returns the new RulesFile. Raises ValueError on any validation error.
    """
    target = path or get_rules_file()

    rules: list[Rule] = []
    for index, draft in enumerate(rule_drafts, start=1):
        validation = validate_rule(draft)
        if not validation.valid:
            raise ValueError(
                f"Rule {index} invalid: {'; '.join(validation.errors)}"
            )

        rules.append(
            _build_rule(
                _format_rule_id(index),
                normalize_rule_draft(draft),
            )
        )

    new_file = RulesFile(
        version=1,
        rules=rules,
        next_index=len(rules) + 1,
    )
    save_rules(new_file, target)
    return new_file
