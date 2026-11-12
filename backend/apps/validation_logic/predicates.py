"""Pure textual/numeric predicate helpers with agreed null/blank semantics.

Agreed requirement semantics for the four textual operators (single- and
multi-value, value-against-column and column-against-column):

===========  =========================
operator     null/blank operand result
===========  =========================
eq           false
contains     false
neq          true
ncontains    true
===========  =========================

Whitespace-only strings are literal values: this module never trims or changes
case. Substring operators use literal Python substring matching, not regular
expressions. Numeric operators keep their previous behaviour (a missing or
non-numeric operand does not satisfy the comparison).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Literal

Operator = Literal["eq", "neq", "contains", "ncontains", "gt", "lt", "gte", "lte"]

TEXT_OPERATORS: frozenset[str] = frozenset({"eq", "neq", "contains", "ncontains"})
NEGATIVE_TEXT_OPERATORS: frozenset[str] = frozenset({"neq", "ncontains"})
NUMERIC_OPERATORS: frozenset[str] = frozenset({"gt", "lt", "gte", "lte"})


def is_null_or_blank(value: Any) -> bool:
    """Return true for a missing cell (``None``) or an empty string.

    Whitespace-only strings are intentionally **not** blank here.
    """

    return value is None or (isinstance(value, str) and value == "")


def _as_text(value: Any) -> str | None:
    if is_null_or_blank(value):
        return None
    return value if isinstance(value, str) else str(value)


def _expected_values(expected_values: Any) -> tuple[Any, ...]:
    if isinstance(expected_values, Sequence) and not isinstance(expected_values, (str, bytes)):
        return tuple(expected_values)
    return (expected_values,)


def _numeric_match(actual: Any, operator: str, expected: Any) -> bool:
    if is_null_or_blank(actual) or is_null_or_blank(expected):
        return False
    try:
        left = float(actual)
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


def matches_value(actual: Any, operator: str, expected: Any) -> bool:
    """Match one expected operand (also used for column-against-column).

    If either operand is null/blank, positive textual operators are false and
    negative textual operators are true. Numeric operators remain unchanged.
    """

    if operator in TEXT_OPERATORS:
        left = _as_text(actual)
        right = _as_text(expected)
        if left is None or right is None:
            return operator in NEGATIVE_TEXT_OPERATORS
        if operator == "eq":
            return left == right
        if operator == "neq":
            return left != right
        if operator == "contains":
            return right in left
        if operator == "ncontains":
            return right not in left
        return False
    if operator in NUMERIC_OPERATORS:
        return _numeric_match(actual, operator, expected)
    return False


def matches_values(actual: Any, operator: str, expected_values: Any) -> bool:
    """Match an ordered value list using the existing within-clause semantics.

    ``eq``/``contains``/numeric operators match **any** configured value;
    ``neq``/``ncontains`` require that **none** of the values match. A
    null/blank actual value therefore satisfies negative operators regardless
    of the configured list and fails positive operators.
    """

    values = _expected_values(expected_values)
    if operator in NEGATIVE_TEXT_OPERATORS:
        if is_null_or_blank(actual):
            return True
        return all(matches_value(actual, operator, value) for value in values)
    if operator in {"eq", "contains"}:
        if is_null_or_blank(actual):
            return False
        return any(matches_value(actual, operator, value) for value in values)
    if operator in NUMERIC_OPERATORS:
        if is_null_or_blank(actual):
            return False
        return any(matches_value(actual, operator, value) for value in values)
    return False
