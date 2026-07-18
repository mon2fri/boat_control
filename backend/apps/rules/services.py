from __future__ import annotations

import re
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import yaml
from django.conf import settings

_rules_lock = threading.Lock()

ConditionOperator = Literal["eq", "neq", "contains", "ncontains"]
LogicOperator = Literal["and", "or"]
LogicFormat = Literal["value_vs_column", "column_vs_column"]

VALID_CONDITION_OPERATORS: set[ConditionOperator] = {"eq", "neq", "contains", "ncontains"}
VALID_LOGIC_OPERATORS: set[LogicOperator] = {"and", "or"}
VALID_LOGIC_FORMATS: set[LogicFormat] = {"value_vs_column", "column_vs_column"}


@dataclass(frozen=True)
class Condition:
    column_name: str
    operator: ConditionOperator
    filter_value: str


@dataclass(frozen=True)
class LogicClause:
    format: LogicFormat
    column_name: str
    operator: str
    target_value: str


@dataclass(frozen=True)
class Rule:
    rule_id: str
    name: str
    description: str
    conditions: list[Condition]
    condition_relation: LogicOperator | None
    grouping: list[str] | None
    logic: LogicClause


@dataclass(frozen=True)
class RuleValidationResult:
    valid: bool
    errors: list[str]


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
    target = path or settings.RULES_FILE
    if not target.exists():
        return RulesFile(version=1, rules=[], next_index=1)

    with open(target) as f:
        data = yaml.safe_load(f) or {}

    rules = []
    for r in data.get("rules", []):
        conditions = [
            Condition(
                column_name=c["column_name"],
                operator=c["operator"],
                filter_value=c["filter_value"],
            )
            for c in r.get("conditions", [])
        ]
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
    target = path or settings.RULES_FILE
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
                }
                for c in rule.conditions
            ]
        if rule.condition_relation:
            rule_data["condition_relation"] = rule.condition_relation
        if rule.grouping:
            rule_data["grouping"] = rule.grouping

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
        if "target_value" not in logic:
            errors.append("Logic target_value is required.")

    conditions = rule_data.get("conditions", [])
    if len(conditions) >= 2 and not rule_data.get("condition_relation"):
        errors.append("condition_relation is required when there are 2+ conditions.")

    cond_rel = rule_data.get("condition_relation")
    if cond_rel and cond_rel not in VALID_LOGIC_OPERATORS:
        valid_ops = ", ".join(sorted(VALID_LOGIC_OPERATORS))
        errors.append(f"Invalid condition_relation. Must be one of: {valid_ops}")

    if len(conditions) >= 3 and rule_data.get("grouping"):
        grouping = rule_data["grouping"]
        if not isinstance(grouping, list) or len(grouping) < 2:
            errors.append("grouping must be a list with at least 2 elements for 3+ conditions.")

    return RuleValidationResult(valid=len(errors) == 0, errors=errors)


def create_rule(rules_file: RulesFile, rule_data: dict[str, Any]) -> tuple[RulesFile, Rule]:
    validation = validate_rule(rule_data)
    if not validation.valid:
        raise ValueError(f"Invalid rule: {'; '.join(validation.errors)}")

    rule_id = _format_rule_id(rules_file.next_index)
    conditions = [
        Condition(
            column_name=c["column_name"],
            operator=c["operator"],
            filter_value=c["filter_value"],
        )
        for c in rule_data.get("conditions", [])
    ]
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
            conditions = [
                Condition(
                    column_name=c["column_name"],
                    operator=c["operator"],
                    filter_value=c["filter_value"],
                )
                for c in rule_data.get("conditions", [])
            ]
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


def load_remote_rules(url: str) -> RulesFile:
    import urllib.request

    allowed_roots = [settings.CONFIG_DIR, settings.DATA_DIR]
    is_local = False
    for root in allowed_roots:
        try:
            Path(url).resolve().relative_to(root.resolve())
            is_local = True
            break
        except ValueError:
            continue

    if not is_local:
        raise ValueError(
            f"Remote rules must be within allowed directories: "
            f"{', '.join(str(r) for r in allowed_roots)}"
        )

    with urllib.request.urlopen(url, timeout=30) as response:
        data = yaml.safe_load(response.read())

    rules = []
    for r in data.get("rules", []):
        conditions = [
            Condition(
                column_name=c["column_name"],
                operator=c["operator"],
                filter_value=c["filter_value"],
            )
            for c in r.get("conditions", [])
        ]
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
                logic=logic,
            )
        )

    return RulesFile(
        version=data.get("version", 1),
        rules=rules,
        next_index=data.get("next_index", len(rules) + 1),
    )
