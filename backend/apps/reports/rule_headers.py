"""Multiline Excel headers, including a bounded fallback for historical summaries."""

from __future__ import annotations

import re
from typing import Any

from apps.runs.report_metadata import grouping_lines


def rule_sort_key(index: str) -> tuple[int, int, str]:
    match = re.fullmatch(r"R(\d+)", index, re.IGNORECASE)
    return (0, int(match[1]), index) if match else (1, 0, index)


def _legacy_grouping(expression: str, noun: str) -> str:
    """Parse only numbered references and AND/OR, never arbitrary author text."""
    pattern = rf"{noun} \d+|AND|OR|[()]"
    tokens = re.findall(pattern, expression)
    if not tokens or len(tokens) > 1000 or re.sub(pattern, "", expression).strip():
        return expression
    position = 0

    def atom(depth: int) -> dict[str, Any]:
        nonlocal position
        if depth > 50 or position >= len(tokens):
            raise ValueError("Invalid historical expression")
        token = tokens[position]
        position += 1
        if token == "(":
            node = join("OR", depth + 1)
            if position >= len(tokens) or tokens[position] != ")":
                raise ValueError("Unclosed group")
            position += 1
            return node
        if not token.startswith(noun + " "):
            raise ValueError("Expected numbered clause")
        return {"kind": "leaf", "conditionId": f"c{int(token.split()[-1]) - 1}"}

    def join(operator: str, depth: int) -> dict[str, Any]:
        nonlocal position
        children = [join("AND", depth) if operator == "OR" else atom(depth)]
        while position < len(tokens) and tokens[position] == operator:
            position += 1
            children.append(join("AND", depth) if operator == "OR" else atom(depth))
        return (
            children[0] if len(children) == 1 else {"kind": operator.lower(), "children": children}
        )

    try:
        tree = join("OR", 0)
        return grouping_lines(tree, noun) if position == len(tokens) else expression
    except (ValueError, RecursionError):
        return expression


def excel_rule_headers(
    summary: dict[str, Any], fallback_logic: str = ""
) -> tuple[str, str, str, str]:
    conditions = summary.get("condition_clauses")
    if conditions is None:
        conditions = re.split(r";\s*(?=Condition \d+:)", summary.get("condition") or "")
    expectations = summary.get("expectation_clauses")
    expression = str(summary.get("logic") or fallback_logic or "")
    if expectations is None:
        matches = list(re.finditer(r"\b(?:Outcome|Expectation) (\d+):\s*", expression))
        expectations = []
        if matches:
            for i, match in enumerate(matches):
                end = matches[i + 1].start() if i + 1 < len(matches) else len(expression)
                text = expression[match.end() : end]
                text = re.sub(r"\)*\s+(?:AND|OR)\s+\(*\s*$", "", text).strip()
                text = re.sub(r"(?<=[\"'])\)+$", "", text)
                expectations.append(f"Expectation {match[1]}: {text}")
            # Remove full descriptions after extraction so grouping keeps its exact operators.
            for match, label in zip(matches, expectations, strict=True):
                description = label.split(": ", 1)[1]
                expression = expression.replace(
                    match.group() + description, f"Expectation {match[1]}", 1
                )
        elif expression:
            expectations = [f"Expectation 1: {expression}"]
            expression = ""
    condition_groups = summary.get("condition_groupings")
    if condition_groups is None:
        condition_groups = _legacy_grouping(
            str(summary.get("condition_grouping") or ""), "Condition"
        )
    expectation_groups = summary.get("expectation_groupings")
    if expectation_groups is None:
        expectation_groups = (
            _legacy_grouping(expression, "Expectation") if len(expectations) > 1 else ""
        )
    return (
        "\n".join(conditions),
        str(condition_groups),
        "\n".join(expectations),
        str(expectation_groups),
    )
