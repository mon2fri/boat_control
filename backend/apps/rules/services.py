from __future__ import annotations

import re
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import yaml

from apps.settings.services import get_rules_file

_rules_lock = threading.Lock()

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


@dataclass(frozen=True)
class GroupingLeaf:
    condition_id: str


@dataclass(frozen=True)
class GroupingBranch:
    kind: LogicOperator
    children: tuple[GroupingLeaf | GroupingBranch, ...]


GroupingNode = GroupingLeaf | GroupingBranch


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


@dataclass(frozen=True)
class RuleValidationResult:
    valid: bool
    errors: list[str]


def _parse_grouping_tree(data: Any) -> GroupingNode | None:
    if data is None:
        return None
    if not isinstance(data, dict):
        return None
    kind = data.get("kind")
    if kind == "leaf":
        cid = data.get("conditionId", "")
        return GroupingLeaf(condition_id=cid)
    if kind in ("and", "or"):
        children_raw = data.get("children", [])
        children = []
        for child in children_raw:
            parsed = _parse_grouping_tree(child)
            if parsed is None:
                return None
            children.append(parsed)
        return GroupingBranch(kind=kind, children=tuple(children))
    return None


def _serialize_grouping_tree(node: GroupingNode | None) -> Any:
    if node is None:
        return None
    if isinstance(node, GroupingLeaf):
        return {"kind": "leaf", "conditionId": node.condition_id}
    return {
        "kind": node.kind,
        "children": [_serialize_grouping_tree(c) for c in node.children],
    }


def _validate_grouping_tree(
    node: GroupingNode | None,
    condition_count: int,
    seen_ids: set[str] | None = None,
) -> list[str]:
    errors: list[str] = []
    if node is None:
        return errors

    if seen_ids is None:
        seen_ids = set()

    if isinstance(node, GroupingLeaf):
        cid = node.condition_id
        if not cid.startswith("c"):
            errors.append(f"Invalid condition ID format: {cid}")
            return errors
        try:
            idx = int(cid[1:])
        except ValueError:
            errors.append(f"Invalid condition ID format: {cid}")
            return errors
        if idx < 0 or idx >= condition_count:
            errors.append(
                f"Condition ID '{cid}' references non-existent condition "
                f"(valid: c0..c{condition_count - 1})"
            )
        if cid in seen_ids:
            errors.append(f"Duplicate condition ID '{cid}' in grouping_tree")
        seen_ids.add(cid)
        return errors

    if isinstance(node, GroupingBranch):
        if len(node.children) < 2:
            errors.append(f"Grouping node '{node.kind}' must have at least 2 children")
        for child in node.children:
            errors.extend(_validate_grouping_tree(child, condition_count, seen_ids))
    return errors


def _collect_condition_ids(node: GroupingNode | None) -> set[str]:
    if node is None:
        return set()
    if isinstance(node, GroupingLeaf):
        return {node.condition_id}
    result: set[str] = set()
    for child in node.children:
        result |= _collect_condition_ids(child)
    return result


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


def load_rules(path: Path | None = None) -> RulesFile:
    target = path or get_rules_file()
    if not target.exists():
        return RulesFile(version=1, rules=[], next_index=1)

    with open(target) as f:
        data = yaml.safe_load(f) or {}

    rules = []
    for r in data.get("rules", []):
        conditions = [_make_condition(c) for c in r.get("conditions", [])]
        logic_data = r.get("logic", {})
        logic = LogicClause(
            format=logic_data["format"],
            column_name=logic_data["column_name"],
            operator=logic_data["operator"],
            target_value=logic_data["target_value"],
        )
        rules.append(
            Rule(
                rule_id=r["rule_id"],
                name=r["name"],
                description=r.get("description", ""),
                conditions=conditions,
                condition_relation=r.get("condition_relation"),
                grouping=r.get("grouping"),
                grouping_tree=_parse_grouping_tree(r.get("grouping_tree")),
                logic=logic,
            )
        )

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
            "name": rule.name,
            "description": rule.description,
            "logic": {
                "format": rule.logic.format,
                "column_name": rule.logic.column_name,
                "operator": rule.logic.operator,
                "target_value": rule.logic.target_value,
            },
        }
        if rule.conditions:
            rule_data["conditions"] = [
                {
                    "column_name": c.column_name,
                    "operator": c.operator,
                    "filter_value": c.filter_value,
                    "filter_values": list(c.filter_values or (c.filter_value,)),
                }
                for c in rule.conditions
            ]
        if rule.condition_relation:
            rule_data["condition_relation"] = rule.condition_relation
        if rule.grouping:
            rule_data["grouping"] = rule.grouping
        serialized_tree = _serialize_grouping_tree(rule.grouping_tree)
        if serialized_tree is not None:
            rule_data["grouping_tree"] = serialized_tree

        rules_list.append(rule_data)

    with tempfile.NamedTemporaryFile(
        mode="w", dir=target.parent, delete=False, suffix=".yaml"
    ) as tmp:
        yaml.dump(data, tmp, default_flow_style=False, sort_keys=False)
        tmp_path = Path(tmp.name)

    tmp_path.replace(target)


def validate_rule(rule_data: dict[str, Any]) -> RuleValidationResult:
    errors: list[str] = []

    if not rule_data.get("name"):
        errors.append("Rule name is required.")

    logic = rule_data.get("logic")
    if not logic:
        errors.append("Logic section is required.")
    else:
        if logic.get("format") not in VALID_LOGIC_FORMATS:
            valid_formats = ", ".join(sorted(VALID_LOGIC_FORMATS))
            errors.append(f"Invalid logic format. Must be one of: {valid_formats}")
        if not logic.get("column_name"):
            errors.append("Logic column_name is required.")
        if not logic.get("operator"):
            errors.append("Logic operator is required.")
        elif logic.get("operator") not in VALID_LOGIC_CLAUSE_OPERATORS:
            valid_ops = ", ".join(sorted(VALID_LOGIC_CLAUSE_OPERATORS))
            errors.append(
                f"Invalid logic operator '{logic.get('operator')}'. Must be one of: {valid_ops}"
            )
        if "target_value" not in logic:
            errors.append("Logic target_value is required.")

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
        tree = _parse_grouping_tree(grouping_tree_raw)
        if tree is None:
            errors.append("Invalid grouping_tree structure.")
        else:
            tree_errors = _validate_grouping_tree(tree, len(conditions))
            errors.extend(tree_errors)
            expected_ids = {f"c{i}" for i in range(len(conditions))}
            actual_ids = _collect_condition_ids(tree)
            missing = expected_ids - actual_ids
            if missing:
                errors.append(f"grouping_tree omits conditions: {', '.join(sorted(missing))}")

    return RuleValidationResult(valid=len(errors) == 0, errors=errors)


def create_rule(rules_file: RulesFile, rule_data: dict[str, Any]) -> tuple[RulesFile, Rule]:
    validation = validate_rule(rule_data)
    if not validation.valid:
        raise ValueError(f"Invalid rule: {'; '.join(validation.errors)}")

    rule_id = _format_rule_id(rules_file.next_index)
    conditions = [_make_condition(c) for c in rule_data.get("conditions", [])]
    logic_data = rule_data["logic"]
    logic = LogicClause(
        format=logic_data["format"],
        column_name=logic_data["column_name"],
        operator=logic_data["operator"],
        target_value=logic_data["target_value"],
    )

    rule = Rule(
        rule_id=rule_id,
        name=rule_data["name"],
        description=rule_data.get("description", ""),
        conditions=conditions,
        condition_relation=rule_data.get("condition_relation"),
        grouping=rule_data.get("grouping"),
        grouping_tree=_parse_grouping_tree(rule_data.get("grouping_tree")),
        logic=logic,
    )

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
    for rule in rules_file.rules:
        if rule.rule_id == rule_id:
            found = True
            conditions = [_make_condition(c) for c in rule_data.get("conditions", [])]
            logic_data = rule_data["logic"]
            logic = LogicClause(
                format=logic_data["format"],
                column_name=logic_data["column_name"],
                operator=logic_data["operator"],
                target_value=logic_data["target_value"],
            )
            updated_rules.append(
                Rule(
                    rule_id=rule_id,
                    name=rule_data["name"],
                    description=rule_data.get("description", ""),
                    conditions=conditions,
                    condition_relation=rule_data.get("condition_relation"),
                    grouping=rule_data.get("grouping"),
                    grouping_tree=_parse_grouping_tree(rule_data.get("grouping_tree")),
                    logic=logic,
                )
            )
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
