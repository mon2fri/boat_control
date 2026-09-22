"""Canonical business-rule identity primitives.

This module intentionally has no Django, filesystem, or application-service dependency.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from typing import Any

SCHEMA = "canonical_business_rule/v1"
IDENTIFIER_PREFIX = "CBR1_"
_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_DEFAULT_COMPARISON_MODE = "comparison_vs_baseline"


class RuleIdentityError(ValueError):
    """Raised when an identity cannot be safely calculated or verified."""


def _values(value: Any, legacy: Any = "") -> list[str]:
    raw = value if isinstance(value, Sequence) and not isinstance(value, (str, bytes)) else None
    if raw is None or (len(raw) == 0 and legacy != ""):
        raw = [legacy] if legacy != "" else []
    # Exact strings are part of the identity. Numeric values are not coerced.
    result = [item if isinstance(item, str) else str(item) for item in raw]
    return sorted(set(result))


def _condition(condition: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "column_name": condition.get("column_name", ""),
        "operator": condition.get("operator", ""),
        "values": _values(condition.get("filter_values"), condition.get("filter_value", "")),
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


def _node(node: Mapping[str, Any], conditions: list[dict[str, Any]]) -> dict[str, Any]:
    kind = node.get("kind")
    if kind == "leaf":
        return {"condition": _leaf(str(node.get("conditionId", "")), conditions)}
    if kind not in {"and", "or"}:
        raise RuleIdentityError(f"Invalid grouping operator: {kind}")
    children = node.get("children")
    if not isinstance(children, Sequence) or isinstance(children, (str, bytes)):
        raise RuleIdentityError("Grouping branch children must be a sequence")
    flattened: list[dict[str, Any]] = []
    for child in children:
        if not isinstance(child, Mapping):
            raise RuleIdentityError("Grouping child must be an object")
        child_node = _node(child, conditions)
        if child_node.get("operator") == kind:
            flattened.extend(child_node["children"])
        else:
            flattened.append(child_node)
    flattened.sort(key=serialize_canonical_rule)
    return {"operator": kind, "children": flattened}


def _scope(rule: Mapping[str, Any], conditions: list[dict[str, Any]]) -> dict[str, Any]:
    tree = rule.get("grouping_tree")
    if isinstance(tree, Mapping):
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
    conditions = [_condition(item) for item in raw_conditions if isinstance(item, Mapping)]
    logic_raw = rule_or_draft.get("logic")
    if not isinstance(logic_raw, Mapping):
        raise RuleIdentityError("logic must be an object")
    logic = {
        "format": logic_raw.get("format", ""),
        "column_name": logic_raw.get("column_name", ""),
        "operator": logic_raw.get("operator", ""),
        "values": _values(logic_raw.get("target_values"), logic_raw.get("target_value", "")),
        "comparison_mode": logic_raw.get("comparison_mode", _DEFAULT_COMPARISON_MODE),
    }
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
