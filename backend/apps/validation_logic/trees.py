"""Pure grouping-tree parsing, validation, serialization and evaluation.

Wire shape (shared with the frontend)::

    {"kind": "leaf", "conditionId": "c0"}
    {"kind": "and" | "or", "children": [<node>, ...]}

Leaf identifiers are positional references into the ordered clause list that
owns the tree (row filters, rule conditions, or rule outcome clauses). Trees are
never interpreted with an incidental default when malformed: callers receive
validation errors and must reject the configuration.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal, cast

DEFAULT_MAX_TREE_DEPTH = 32
DEFAULT_MAX_TREE_NODES = 1000


class TreeValidationError(ValueError):
    """A grouping tree is malformed, unsafe or references invalid leaves."""


@dataclass(frozen=True)
class GroupingLeaf:
    condition_id: str


@dataclass(frozen=True)
class GroupingBranch:
    kind: Literal["and", "or"]
    children: tuple[GroupingNode, ...]


type GroupingNode = GroupingLeaf | GroupingBranch


def _is_sequence(value: Any) -> bool:
    return isinstance(value, Sequence) and not isinstance(value, (str, bytes))


def _parse_node(
    data: Any,
    *,
    depth: int,
    max_depth: int,
    counter: list[int],
    max_nodes: int,
) -> GroupingNode:
    counter[0] += 1
    if counter[0] > max_nodes:
        raise TreeValidationError(f"Grouping tree exceeds maximum size of {max_nodes} nodes")
    if depth > max_depth:
        raise TreeValidationError(f"Grouping tree exceeds maximum depth of {max_depth}")

    if not isinstance(data, Mapping):
        raise TreeValidationError("Grouping tree node must be an object")

    kind = data.get("kind")
    if kind == "leaf":
        condition_id = data.get("conditionId")
        if not isinstance(condition_id, str) or not condition_id:
            raise TreeValidationError("Grouping leaf requires a non-empty conditionId string")
        return GroupingLeaf(condition_id=condition_id)

    if kind in ("and", "or"):
        children_raw = data.get("children")
        if not _is_sequence(children_raw):
            raise TreeValidationError(f"Grouping node '{kind}' requires a children array")
        children = tuple(
            _parse_node(
                child,
                depth=depth + 1,
                max_depth=max_depth,
                counter=counter,
                max_nodes=max_nodes,
            )
            for child in cast(Sequence[Any], children_raw)
        )
        return GroupingBranch(kind=kind, children=children)

    raise TreeValidationError(f"Invalid grouping node kind: {kind!r}")


def parse_grouping_tree(
    data: Any,
    *,
    max_depth: int = DEFAULT_MAX_TREE_DEPTH,
    max_nodes: int = DEFAULT_MAX_TREE_NODES,
) -> GroupingNode | None:
    """Parse the wire representation into immutable nodes.

    ``None`` means no tree was supplied. Any malformed, too-deep or too-large
    structure raises :class:`TreeValidationError` instead of silently becoming
    an empty expression.
    """

    if data is None:
        return None
    return _parse_node(
        data,
        depth=1,
        max_depth=max_depth,
        counter=[0],
        max_nodes=max_nodes,
    )


def serialize_grouping_tree(node: GroupingNode | None) -> Any:
    """Return the wire representation, preserving leaf order and grouping."""

    if node is None:
        return None
    if isinstance(node, GroupingLeaf):
        return {"kind": "leaf", "conditionId": node.condition_id}
    return {
        "kind": node.kind,
        "children": [serialize_grouping_tree(child) for child in node.children],
    }


def collect_leaf_ids(node: GroupingNode | None) -> set[str]:
    """Collect every leaf reference in a parsed tree (including duplicates)."""

    if node is None:
        return set()
    if isinstance(node, GroupingLeaf):
        return {node.condition_id}
    result: set[str] = set()
    for child in node.children:
        result |= collect_leaf_ids(child)
    return result


def _leaf_index(condition_id: str, prefix: str) -> int | None:
    if not condition_id.startswith(prefix):
        return None
    suffix = condition_id[len(prefix) :]
    if not suffix.isdigit():
        return None
    return int(suffix)


def validate_grouping_tree(
    node: GroupingNode | None,
    *,
    item_count: int | None = None,
    expected_ids: Sequence[str] | None = None,
    identifier_prefix: str = "c",
    label: str = "grouping_tree",
    max_depth: int = DEFAULT_MAX_TREE_DEPTH,
    max_nodes: int = DEFAULT_MAX_TREE_NODES,
) -> list[str]:
    """Validate references, completeness and structural safety.

    ``item_count`` bounds positional references (``c0..cN-1``).
    ``expected_ids`` additionally checks that every configured clause occurs
    exactly once; omitted references are reported. Duplicate references are
    always rejected.
    """

    errors: list[str] = []
    if node is None:
        return errors

    expected = list(expected_ids) if expected_ids is not None else None
    if item_count is None and expected is not None:
        item_count = len(expected)

    seen: set[str] = set()
    node_count = [0]
    reported_size = [False]

    def visit(current: GroupingNode, depth: int) -> None:
        node_count[0] += 1
        if node_count[0] > max_nodes:
            if not reported_size[0]:
                errors.append(f"Grouping tree exceeds maximum size of {max_nodes} nodes")
                reported_size[0] = True
            return
        if depth > max_depth:
            errors.append(f"Grouping tree exceeds maximum depth of {max_depth}")
            return

        if isinstance(current, GroupingLeaf):
            cid = current.condition_id
            index = _leaf_index(cid, identifier_prefix)
            if index is None:
                errors.append(f"Invalid condition ID format: {cid}")
                return
            if item_count is not None and (index < 0 or index >= item_count):
                errors.append(
                    f"Condition ID '{cid}' references non-existent condition "
                    f"(valid: c0..c{item_count - 1})"
                )
            if cid in seen:
                errors.append(f"Duplicate condition ID '{cid}' in {label}")
            seen.add(cid)
            return

        if current.kind not in ("and", "or"):
            errors.append(f"Invalid grouping node kind: {current.kind!r}")
            return
        if len(current.children) < 2:
            errors.append(f"Grouping node '{current.kind}' must have at least 2 children")
        for child in current.children:
            visit(child, depth + 1)

    visit(node, 1)

    if expected is not None:
        missing = set(expected) - seen
        if missing:
            errors.append(f"{label} omits conditions: {', '.join(sorted(missing))}")
    return errors


def evaluate_grouping_tree(
    node: GroupingNode | None,
    leaf_results: Mapping[str, bool] | Sequence[bool],
) -> bool:
    """Evaluate a parsed tree against leaf results.

    ``leaf_results`` may be a mapping keyed by ``conditionId`` or an ordered
    sequence indexed by the numeric suffix (``c0`` -> index 0). Unknown leaves
    evaluate false; callers should validate before execution.
    """

    if node is None:
        return True
    if isinstance(node, GroupingLeaf):
        if isinstance(leaf_results, Mapping):
            return bool(leaf_results.get(node.condition_id, False))
        index = _leaf_index(node.condition_id, "c")
        if index is None or index >= len(leaf_results):
            return False
        return bool(leaf_results[index])
    if node.kind == "and":
        return all(evaluate_grouping_tree(child, leaf_results) for child in node.children)
    if node.kind == "or":
        return any(evaluate_grouping_tree(child, leaf_results) for child in node.children)
    return False
