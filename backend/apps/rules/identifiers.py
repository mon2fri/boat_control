"""Canonical business-rule identity primitives.

This module intentionally has no Django, filesystem, or application-service dependency.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from typing import Any, cast

SCHEMA = "canonical_business_rule/v1"
# Multi-outcome rules add a deterministic outcome expression. The legacy
# single-outcome shape above is intentionally untouched so historical
# identifiers remain valid.
OUTCOME_SCHEMA = "canonical_business_rule/v1+outcomes"
IDENTIFIER_PREFIX = "CBR1_"
_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_DEFAULT_COMPARISON_MODE = "comparison_vs_baseline"


class RuleIdentityError(ValueError):
    """Raised when an identity cannot be safely calculated or verified."""


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    if hasattr(value, "__dict__"):
        return cast(Mapping[str, Any], vars(value))
    raise RuleIdentityError("Rule identity values must be mappings or authored objects")


def _tree_mapping(node: Any) -> Mapping[str, Any]:
    data = dict(_as_mapping(node))
    # ``GroupingLeaf`` dataclasses store ``condition_id`` while the wire form
    # uses ``conditionId``. Accept both so identity works on Rule objects and
    # on authored payloads without ambiguity.
    if "kind" not in data and "condition_id" in data:
        data["kind"] = "leaf"
        data["conditionId"] = data["condition_id"]
    return data


def _values(value: Any, legacy: Any = "") -> list[str]:
    raw = value if isinstance(value, Sequence) and not isinstance(value, (str, bytes)) else None
    if raw is None or (len(raw) == 0 and legacy != ""):
        raw = [legacy] if legacy != "" else []
    # Exact strings are part of the identity. Numeric values are not coerced.
    result = [item if isinstance(item, str) else str(item) for item in raw]
    return sorted(set(result))


def _condition(condition: Mapping[str, Any] | Any) -> dict[str, Any]:
    data = _as_mapping(condition)
    return {
        "column_name": data.get("column_name", ""),
        "operator": data.get("operator", ""),
        "values": _values(data.get("filter_values"), data.get("filter_value", "")),
    }


def _logic_clause(clause: Mapping[str, Any] | Any) -> dict[str, Any]:
    data = _as_mapping(clause)
    return {
        "format": data.get("format", ""),
        "column_name": data.get("column_name", ""),
        "operator": data.get("operator", ""),
        "values": _values(data.get("target_values"), data.get("target_value", "")),
        "comparison_mode": data.get("comparison_mode", _DEFAULT_COMPARISON_MODE),
    }


def _leaf(condition_id: str, conditions: list[dict[str, Any]]) -> dict[str, Any]:
    if not condition_id.startswith("c"):
        raise RuleIdentityError(f"Invalid grouping condition reference: {condition_id}")
    try:
        index = int(condition_id[1:])
    except ValueError as exc:
        raise RuleIdentityError(f"Invalid grouping condition reference: {condition_id}") from exc
    if index < 0 or index >= len(conditions):
        raise RuleIdentityError(f"Grouping condition reference is out of range: {condition_id}")
    return conditions[index]


def _node(node: Mapping[str, Any] | Any, conditions: list[dict[str, Any]]) -> dict[str, Any]:
    data = _tree_mapping(node)
    kind = data.get("kind")
    if kind == "leaf":
        return {"condition": _leaf(str(data.get("conditionId", "")), conditions)}
    if kind not in {"and", "or"}:
        raise RuleIdentityError(f"Invalid grouping operator: {kind}")
    children = data.get("children")
    if not isinstance(children, Sequence) or isinstance(children, (str, bytes)):
        raise RuleIdentityError("Grouping branch children must be a sequence")
    flattened: list[dict[str, Any]] = []
    for child in children:
        child_node = _node(child, conditions)
        if child_node.get("operator") == kind:
            flattened.extend(child_node["children"])
        else:
            flattened.append(child_node)
    flattened.sort(key=serialize_canonical_rule)
    return {"operator": kind, "children": flattened}


def _outcome_leaf(
    condition_id: str, clauses: list[dict[str, Any]]
) -> dict[str, Any]:
    if not condition_id.startswith("c"):
        raise RuleIdentityError(f"Invalid outcome clause reference: {condition_id}")
    try:
        index = int(condition_id[1:])
    except ValueError as exc:
        raise RuleIdentityError(
            f"Invalid outcome clause reference: {condition_id}"
        ) from exc
    if index < 0 or index >= len(clauses):
        raise RuleIdentityError(
            f"Outcome clause reference is out of range: {condition_id}"
        )
    return {"clause": clauses[index]}


def _outcome_node(
    node: Mapping[str, Any] | Any, clauses: list[dict[str, Any]]
) -> dict[str, Any]:
    data = _tree_mapping(node)
    kind = data.get("kind")
    if kind == "leaf":
        return _outcome_leaf(str(data.get("conditionId", "")), clauses)
    if kind not in {"and", "or"}:
        raise RuleIdentityError(f"Invalid outcome grouping operator: {kind}")
    children = data.get("children")
    if not isinstance(children, Sequence) or isinstance(children, (str, bytes)):
        raise RuleIdentityError("Outcome grouping branch children must be a sequence")
    flattened: list[dict[str, Any]] = []
    for child in children:
        child_node = _outcome_node(child, clauses)
        if child_node.get("operator") == kind:
            flattened.extend(child_node["children"])
        else:
            flattened.append(child_node)
    flattened.sort(key=serialize_canonical_rule)
    return {"operator": kind, "children": flattened}


def _outcome_expression(
    rule: Mapping[str, Any], clauses: list[dict[str, Any]]
) -> dict[str, Any]:
    tree = rule.get("logic_grouping_tree")
    if tree is not None:
        return _outcome_node(tree, clauses)
    relation = rule.get("logic_relation")
    if relation not in {"and", "or"}:
        raise RuleIdentityError(f"Invalid logic relation: {relation}")
    children: list[dict[str, Any]] = [{"clause": clause} for clause in clauses]
    children.sort(key=serialize_canonical_rule)
    return {"operator": relation, "children": children}


def _scope(rule: Mapping[str, Any], conditions: list[dict[str, Any]]) -> dict[str, Any]:
    tree = rule.get("grouping_tree")
    if tree is not None:
        return _node(tree, conditions)
    if not conditions:
        return {"scope": "unconditional"}

    legacy_groups = rule.get("grouping")
    if isinstance(legacy_groups, Sequence) and not isinstance(legacy_groups, (str, bytes)):
        if len(legacy_groups) != len(conditions):
            raise RuleIdentityError("Legacy grouping must contain one group per condition")
        groups: dict[str, list[dict[str, Any]]] = {}
        for index, group in enumerate(legacy_groups):
            groups.setdefault(str(group), []).append({"condition": conditions[index]})
        branches = []
        for members in groups.values():
            members.sort(key=serialize_canonical_rule)
            branches.append(
                {"operator": "or", "children": members} if len(members) > 1 else members[0]
            )
        branches.sort(key=serialize_canonical_rule)
        return {"operator": "and", "children": branches} if len(branches) > 1 else branches[0]

    relation = rule.get("condition_relation") or "and"
    if relation not in {"and", "or"}:
        raise RuleIdentityError(f"Invalid condition relation: {relation}")
    children: list[dict[str, Any]] = [{"condition": condition} for condition in conditions]
    children.sort(key=serialize_canonical_rule)
    return children[0] if len(children) == 1 else {"operator": relation, "children": children}


def canonicalize_rule(rule_or_draft: Mapping[str, Any] | Any) -> dict[str, object]:
    """Return the versioned, deterministic representation used for hashing."""
    if not isinstance(rule_or_draft, Mapping):
        if hasattr(rule_or_draft, "authored_payload"):
            rule_or_draft = rule_or_draft.authored_payload
        elif hasattr(rule_or_draft, "__dict__"):
            rule_or_draft = vars(rule_or_draft)
        else:
            raise RuleIdentityError("Rule must be a mapping or authored object")
    raw_conditions = rule_or_draft.get("conditions", [])
    if not isinstance(raw_conditions, Sequence) or isinstance(raw_conditions, (str, bytes)):
        raise RuleIdentityError("conditions must be a sequence")
    conditions = [_condition(item) for item in raw_conditions]

    clauses_raw = rule_or_draft.get("logic_clauses")
    if (
        isinstance(clauses_raw, Sequence)
        and not isinstance(clauses_raw, (str, bytes))
        and len(clauses_raw) > 0
    ):
        clauses = [_logic_clause(item) for item in clauses_raw]
        # A one-clause expression is identical to the legacy form and keeps the
        # legacy canonical payload (and therefore the same historical hash).
        if len(clauses) == 1:
            return {
                "schema": SCHEMA,
                "scope": _scope(rule_or_draft, conditions),
                "logic": clauses[0],
            }
        return {
            "schema": OUTCOME_SCHEMA,
            "scope": _scope(rule_or_draft, conditions),
            "outcomes": _outcome_expression(rule_or_draft, clauses),
        }

    logic_raw = rule_or_draft.get("logic")
    if logic_raw is None:
        raise RuleIdentityError("logic must be an object")
    logic = _logic_clause(logic_raw)
    return {"schema": SCHEMA, "scope": _scope(rule_or_draft, conditions), "logic": logic}


def serialize_canonical_rule(payload: Mapping[str, object]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _encode_96_bits(digest: bytes) -> str:
    value = int.from_bytes(digest[:12], "big")
    chars = []
    for shift in range(95, -1, -5):
        chars.append(_CROCKFORD[(value >> shift) & 31])
    return "".join(chars)


def calculate_rule_identity_details(rule_or_draft: Mapping[str, Any] | Any) -> tuple[str, str, str]:
    payload = canonicalize_rule(rule_or_draft)
    serialized = serialize_canonical_rule(payload)
    digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    return f"{IDENTIFIER_PREFIX}{_encode_96_bits(bytes.fromhex(digest))}", digest, serialized


def calculate_rule_identifier(rule_or_draft: Mapping[str, Any] | Any) -> str:
    return calculate_rule_identity_details(rule_or_draft)[0]


def verify_identity(identifier: str, full_digest: str, canonical_payload: str) -> None:
    if not identifier.startswith(IDENTIFIER_PREFIX) or len(identifier) != 25:
        raise RuleIdentityError("Invalid canonical rule identifier")
    digest = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()
    if digest != full_digest:
        raise RuleIdentityError("Canonical payload does not match its full digest")
    if f"{IDENTIFIER_PREFIX}{_encode_96_bits(bytes.fromhex(digest))}" != identifier:
        raise RuleIdentityError("Full digest does not match the shortened identifier")
