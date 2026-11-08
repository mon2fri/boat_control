"""Presentation-only rule metadata captured with a run, independent of the live catalog."""

from __future__ import annotations

from typing import Any


def grouping_lines(tree: dict[str, Any] | None, noun: str) -> str:
    if not tree or tree.get("kind") == "leaf":
        return ""
    labels: dict[int, str] = {}
    lines: list[str] = []

    def visit(node: dict[str, Any]) -> str:
        if node["kind"] == "leaf":
            return f"{noun} {int(node['conditionId'][1:]) + 1}"
        children = [visit(child) for child in node["children"]]
        name = f"Group {len(labels) + 1}"
        labels[id(node)] = name
        lines.append(f"{name}: {f' {node["kind"].upper()} '.join(children)}")
        return name

    root = visit(tree)
    return "\n".join([f"Overall: {root}", *lines])
