"""Grouped row-filter and grouped rule-outcome runtime regressions.

These tests cover the shared truth tables from
``requirements/20261108_requirement_filter_and_rule_logic_grouping.md`` and the
null/blank semantics that apply to filters, conditions and outcomes.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import polars as pl
import pytest
from apps.families.resolver import expand_filter_grouping
from apps.reports.services import export_excel, export_html
from apps.rules.services import Condition, LogicClause, Rule, RulesFile
from apps.runs.grouped_logic import (
    match_column,
    match_value,
    normalize_rule_outcomes,
)
from apps.runs.persistence import load_run, save_run
from apps.runs.services import (
    ComparisonResult,
    ExecutionResult,
    ValidationViolation,
    _check_rule,
    apply_filters,
    execute_comparison,
    validate_rows,
)
from apps.runs.tracking_capture import build_occurrences
from apps.saved_filters.services import create_filter, get_filter, list_filters
from django.test.utils import override_settings
from openpyxl import load_workbook
from rest_framework.test import APIClient


def _leaf(index: int) -> dict[str, str]:
    return {"kind": "leaf", "conditionId": f"c{index}"}


def _branch(kind: str, *children: dict[str, Any]) -> dict[str, Any]:
    return {"kind": kind, "children": list(children)}


def _clause(column: str, operator: str, values: list[str] | None = None) -> dict[str, Any]:
    configured = values or []
    return {
        "format": "value_vs_column",
        "column_name": column,
        "operator": operator,
        "target_value": configured[0] if configured else "",
        "target_values": configured,
        "comparison_mode": "comparison_vs_baseline",
    }


def _grouped_rule(
    clauses: list[dict[str, Any]],
    *,
    relation: str | None = None,
    tree: dict[str, Any] | None = None,
    conditions: list[Any] | None = None,
    rule_id: str = "R100",
    rule_identifier: str | None = "CBR1_00000000000000000000",
) -> SimpleNamespace:
    return SimpleNamespace(
        rule_id=rule_id,
        rule_identifier=rule_identifier,
        name="Grouped outcome",
        description="",
        conditions=conditions or [],
        condition_relation=None,
        grouping=None,
        grouping_tree=None,
        logic=clauses[0],
        logic_clauses=clauses,
        logic_relation=relation,
        logic_grouping_tree=tree,
        extra_columns=(),
        hide_comparison=False,
    )


def _legacy_rule(
    column: str = "result",
    operator: str = "eq",
    values: list[str] | None = None,
    *,
    conditions: list[Condition] | None = None,
) -> Rule:
    configured = values or ["ok"]
    return Rule(
        rule_id="R001",
        name="Legacy",
        description="",
        conditions=conditions or [],
        condition_relation=None,
        grouping=None,
        grouping_tree=None,
        logic=LogicClause(
            "value_vs_column",
            column,
            operator,
            configured[0],
            tuple(configured),
        ),
        rule_identifier="CBR1_00000000000000000000",
    )


def _frame(**columns: list[Any]) -> pl.DataFrame:
    schema = {name: pl.String for name in columns}
    return pl.DataFrame(columns, schema=schema)


# ---------------------------------------------------------------------------
# Predicate semantics
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("operator", "values", "raw", "expected"),
    [
        ("eq", ["Y"], None, False),
        ("eq", ["Y"], "", False),
        ("eq", ["Y"], "Y", True),
        ("neq", ["Y"], None, True),
        ("neq", ["Y"], "", True),
        ("neq", ["Y"], "N", True),
        ("neq", ["Y"], "Y", False),
        ("contains", ["a.c"], None, False),
        ("contains", ["a.c"], "", False),
        ("contains", ["a.c"], "a.c", True),
        ("contains", ["a.c"], "abc", False),  # literal, not regex
        ("ncontains", ["a.c"], None, True),
        ("ncontains", ["a.c"], "", True),
        ("ncontains", ["a.c"], "abc", True),
        ("ncontains", ["a.c"], "a.c", False),
        ("eq", [" "], " ", True),
        ("neq", [" "], " ", False),
        ("contains", [" "], " ", True),
        ("eq", ["Y", "N"], "N", True),
        ("neq", ["Y", "N"], "X", True),
        ("neq", ["Y", "N"], "N", False),
    ],
)
def test_match_value_null_blank_and_literal_semantics(
    operator: str, values: list[str], raw: Any, expected: bool
) -> None:
    assert match_value(raw, operator, values) is expected


@pytest.mark.parametrize(
    ("operator", "left", "right", "expected"),
    [
        ("eq", None, "Y", False),
        ("eq", "", "Y", False),
        ("eq", "Y", None, False),
        ("eq", "Y", "Y", True),
        ("neq", None, "Y", True),
        ("neq", "", "Y", True),
        ("neq", "Y", None, True),
        ("neq", "Y", "Y", False),
        ("contains", None, "Y", False),
        ("contains", "abc", "a.c", False),
        ("contains", "a.c", "a.c", True),
        ("ncontains", None, "Y", True),
        ("ncontains", "", "Y", True),
        ("ncontains", "abc", "a.c", True),
    ],
)
def test_match_column_null_blank_semantics(
    operator: str, left: Any, right: Any, expected: bool
) -> None:
    assert match_column(left, right, operator) is expected


# ---------------------------------------------------------------------------
# Grouped row filters
# ---------------------------------------------------------------------------


def test_grouped_filter_two_alternative_and_groups_truth_table() -> None:
    frame = _frame(
        id=["1", "2", "3", "4", "5", "6", "7"],
        sa=["Y", "N", "Y", "N", "X", None, "N"],
        cva=["N", "Y", "Y", "N", "N", "N", ""],
    )
    filters = [
        {"column": "sa", "operator": "eq", "filter_values": ["Y"]},
        {"column": "cva", "operator": "eq", "filter_values": ["N"]},
        {"column": "sa", "operator": "eq", "filter_values": ["N"]},
        {"column": "cva", "operator": "eq", "filter_values": ["Y"]},
    ]
    tree = _branch(
        "or",
        _branch("and", _leaf(0), _leaf(1)),
        _branch("and", _leaf(2), _leaf(3)),
    )
    _, filtered = apply_filters(frame.lazy(), frame.lazy(), filters, filter_grouping_tree=tree)
    assert filtered.collect()["id"].to_list() == ["1", "2"]


def test_grouped_filter_nested_expression() -> None:
    frame = _frame(
        id=["1", "2", "3", "4", "5"],
        book=["MO", "MO", "FO", "MO", "FO"],
        system=["Traded Risk", "Other", "Other", "Traded Risk", "Other"],
    )
    filters = [
        {"column": "book", "operator": "eq", "filter_value": "MO"},
        {"column": "system", "operator": "eq", "filter_value": "Traded Risk"},
        {"column": "book", "operator": "eq", "filter_value": "FO"},
    ]
    tree = _branch(
        "or",
        _branch("and", _leaf(0), _leaf(1)),
        _leaf(2),
    )
    _, filtered = apply_filters(frame.lazy(), frame.lazy(), filters, filter_grouping_tree=tree)
    assert filtered.collect()["id"].to_list() == ["1", "3", "4", "5"]


def test_filter_relation_and_legacy_and_combination() -> None:
    frame = _frame(
        id=["1", "2", "3", "4"],
        status=["active", "active", "inactive", "pending"],
        region=["EMEA", "APAC", "EMEA", "APAC"],
    )
    filters = [
        {"column": "status", "operator": "eq", "filter_value": "active"},
        {"column": "region", "operator": "eq", "filter_value": "EMEA"},
    ]
    _, legacy = apply_filters(frame.lazy(), frame.lazy(), filters)
    assert legacy.collect()["id"].to_list() == ["1"]
    _, any_match = apply_filters(
        frame.lazy(), frame.lazy(), filters, filter_relation="or"
    )
    assert any_match.collect()["id"].to_list() == ["1", "2", "3"]


def test_tree_overrides_flat_relation() -> None:
    frame = _frame(id=["1", "2", "3"], a=["Y", "Y", "N"], b=["N", "Y", "Y"])
    filters = [
        {"column": "a", "operator": "eq", "filter_value": "Y"},
        {"column": "b", "operator": "eq", "filter_value": "Y"},
    ]
    # The valid tree is OR even though the flat relation says AND.
    _, filtered = apply_filters(
        frame.lazy(),
        frame.lazy(),
        filters,
        filter_relation="and",
        filter_grouping_tree=_branch("or", _leaf(0), _leaf(1)),
    )
    assert filtered.collect()["id"].to_list() == ["1", "2", "3"]


@pytest.mark.parametrize(
    ("operator", "values", "expected_ids"),
    [
        ("eq", ["Y"], ["1"]),
        ("neq", ["Y"], ["2", "3", "4", "5"]),
        ("contains", ["a.c"], ["4"]),
        ("ncontains", ["a.c"], ["1", "2", "3", "5"]),
    ],
)
def test_filter_null_blank_semantics(
    operator: str, values: list[str], expected_ids: list[str]
) -> None:
    frame = _frame(
        id=["1", "2", "3", "4", "5"],
        flag=["Y", None, "", "a.c", "abc"],
    )
    filters = [{"column": "flag", "operator": operator, "filter_values": values}]
    _, filtered = apply_filters(frame.lazy(), frame.lazy(), filters)
    assert filtered.collect()["id"].to_list() == expected_ids


def test_filter_multi_value_negative_semantics_with_null_and_blank() -> None:
    frame = _frame(id=["1", "2", "3", "4"], flag=["Y", None, "", "N"])
    filters = [
        {"column": "flag", "operator": "neq", "filter_values": ["Y", "N"]}
    ]
    _, filtered = apply_filters(frame.lazy(), frame.lazy(), filters)
    assert filtered.collect()["id"].to_list() == ["2", "3"]


# ---------------------------------------------------------------------------
# Rule conditions
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("operator", "values", "applies"),
    [
        ("eq", ["Y"], False),
        ("neq", ["Y"], True),
        ("contains", ["Y"], False),
        ("ncontains", ["Y"], True),
    ],
)
@pytest.mark.parametrize("raw", [None, ""])
def test_condition_null_blank_semantics(
    operator: str, values: list[str], applies: bool, raw: Any
) -> None:
    rule = _legacy_rule(
        conditions=[Condition("scope", operator, values[0], tuple(values))]
    )
    # The outcome fails for this row, so a matching condition produces a
    # violation; a non-matching condition leaves the rule inapplicable.
    is_violation, _, _ = _check_rule(
        {"scope": raw, "result": "bad"}, rule, ["scope", "result"]
    )
    assert is_violation is applies


# ---------------------------------------------------------------------------
# Grouped outcomes
# ---------------------------------------------------------------------------


def _two_group_outcome_rule() -> SimpleNamespace:
    clauses = [
        _clause("sa", "eq", ["Y"]),
        _clause("cva", "eq", ["N"]),
        _clause("sa", "eq", ["N"]),
        _clause("cva", "eq", ["Y"]),
    ]
    tree = _branch(
        "or",
        _branch("and", _leaf(0), _leaf(1)),
        _branch("and", _leaf(2), _leaf(3)),
    )
    return _grouped_rule(clauses, tree=tree)


def test_two_group_mutually_exclusive_outcome_truth_table() -> None:
    frame = _frame(
        id=["1", "2", "3", "4", "5", "6", "7"],
        sa=["Y", "N", "Y", "N", "X", None, "N"],
        cva=["N", "Y", "Y", "N", "N", "N", ""],
    )
    result = validate_rows(
        frame, [_two_group_outcome_rule()], ["sa", "cva"], ["id"]
    )
    violations = result.violations_by_rule["R100"]
    assert [item.key_columns["id"] for item in violations] == [
        "3",
        "4",
        "5",
        "6",
        "7",
    ]
    # Multiple failing clauses still produce one business-rule violation.
    assert len(violations) == 5
    assert result.violation_count_by_rule["R100"] == 5
    summary = result.rule_summaries["R100"]["logic"]
    assert "Outcome 1" in summary and "Outcome 4" in summary
    assert " AND " in summary and " OR " in summary


def test_grouped_outcome_detail_contains_all_outcome_columns_and_values() -> None:
    frame = _frame(id=["1"], sa=["Y"], cva=["Y"])
    result = validate_rows(
        frame, [_two_group_outcome_rule()], ["sa", "cva"], ["id"]
    )
    violation = result.violations_by_rule["R100"][0]
    assert violation.outcome_columns == ("sa", "cva")
    assert violation.outcome_values == {"sa": "Y", "cva": "Y"}
    assert violation.outcome_results == {"sa": False, "cva": False}
    assert violation.extra_values["sa"] == "Y"
    assert violation.extra_values["cva"] == "Y"
    assert "sa" in violation.violating_column
    assert "cva" in violation.violating_column
    assert "Grouped outcome expression" in violation.details


def test_or_outcome_with_null_and_blank() -> None:
    rule = _grouped_rule(
        [_clause("a", "eq", ["Y"]), _clause("b", "eq", ["Y"])],
        relation="or",
    )
    frame = _frame(
        id=["1", "2", "3", "4", "5", "6"],
        a=["Y", "N", "Y", "N", None, None],
        b=["N", "Y", "Y", "N", "Y", "N"],
    )
    result = validate_rows(frame, [rule], ["a", "b"], ["id"])
    assert [v.key_columns["id"] for v in result.violations_by_rule["R100"]] == [
        "4",
        "6",
    ]


def test_and_outcome_with_null_and_blank() -> None:
    rule = _grouped_rule(
        [_clause("a", "eq", ["N"]), _clause("b", "eq", ["N"])],
        relation="and",
    )
    frame = _frame(id=["1", "2", "3", "4"], a=["N", "N", "Y", None], b=["N", "Y", "N", "N"])
    result = validate_rows(frame, [rule], ["a", "b"], ["id"])
    assert [v.key_columns["id"] for v in result.violations_by_rule["R100"]] == [
        "2",
        "3",
        "4",
    ]


def test_nested_outcome_groups_with_condition() -> None:
    clauses = [
        _clause("a", "eq", ["Y"]),
        _clause("b", "eq", ["Y"]),
        _clause("c", "eq", ["Active"]),
    ]
    tree = _branch(
        "and",
        _branch("or", _leaf(0), _leaf(1)),
        _leaf(2),
    )
    rule = _grouped_rule(
        clauses,
        tree=tree,
        conditions=[Condition("scope", "eq", "in", ("in",))],
    )
    frame = _frame(
        id=["1", "2", "3", "4"],
        scope=["in", "in", "in", "out"],
        a=["Y", "N", "N", "N"],
        b=["N", "Y", "N", "N"],
        c=["Active", "Active", "Inactive", "Active"],
    )
    result = validate_rows(frame, [rule], ["a", "b", "c"], ["id"])
    assert [v.key_columns["id"] for v in result.violations_by_rule["R100"]] == [
        "3",
    ]


@pytest.mark.parametrize(
    ("a", "b", "violation"),
    [
        (None, "N", False),
        (None, "Y", True),
        ("", "N", False),
        ("", "Y", True),
        ("X", "N", False),
        ("X", "Y", True),
    ],
)
def test_negative_grouped_outcomes_treat_null_and_blank_as_satisfied(
    a: Any, b: Any, violation: bool
) -> None:
    rule = _grouped_rule(
        [_clause("a", "neq", ["Y"]), _clause("b", "neq", ["Y"])],
        relation="and",
    )
    frame = _frame(id=["1"], a=[a], b=[b])
    result = validate_rows(frame, [rule], ["a", "b"], ["id"])
    assert bool(result.violations_by_rule["R100"]) is violation


def test_grouped_outcomes_reject_incomplete_relation_and_conflicting_legacy() -> None:
    missing_relation = _grouped_rule(
        [_clause("a", "eq", ["Y"]), _clause("b", "eq", ["Y"])]
    )
    with pytest.raises(ValueError, match="logic_relation"):
        normalize_rule_outcomes(missing_relation)

    conflicting = _grouped_rule(
        [_clause("a", "eq", ["Y"]), _clause("b", "eq", ["Y"])],
        relation="or",
    )
    conflicting.logic = _clause("other", "eq", ["Y"])
    with pytest.raises(ValueError, match="conflicts"):
        normalize_rule_outcomes(conflicting)


# ---------------------------------------------------------------------------
# Execution validation: rows, filters and missing columns
# ---------------------------------------------------------------------------


def test_execute_grouped_filters_and_restores_context(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path_a = tmp_path / "a.csv"
    path_b = tmp_path / "b.csv"
    path_a.write_text("id,sa,cva\n1,Y,N\n2,N,Y\n")
    path_b.write_text("id,sa,cva\n1,Y,N\n2,N,Y\n3,Y,Y\n4,N,N\n")

    filters = [
        {"column": "sa", "operator": "eq", "filter_value": "Y"},
        {"column": "cva", "operator": "eq", "filter_value": "N"},
        {"column": "sa", "operator": "eq", "filter_value": "N"},
        {"column": "cva", "operator": "eq", "filter_value": "Y"},
    ]
    tree = _branch(
        "or",
        _branch("and", _leaf(0), _leaf(1)),
        _branch("and", _leaf(2), _leaf(3)),
    )
    monkeypatch.setattr(
        "apps.runs.services.load_rules",
        lambda: RulesFile(version=1, rules=[], next_index=1),
    )
    result = execute_comparison(
        path_a=path_a,
        path_b=path_b,
        comparison_columns=["id", "sa", "cva"],
        target_columns=["sa", "cva"],
        key_columns=["id"],
        filters=filters,
        filter_grouping_tree=tree,
    )

    assert result.filter_grouping_tree == tree
    assert result.filter_relation is None
    assert result.comparison.total_rows_b == 2
    assert result.filters_applied == filters


def test_execute_grouped_outcome_through_run_lifecycle(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path_a = tmp_path / "a.csv"
    path_b = tmp_path / "b.csv"
    path_a.write_text("id,sa,cva\n1,Y,N\n2,N,Y\n3,Y,Y\n4,N,N\n")
    path_b.write_text("id,sa,cva\n1,Y,N\n2,N,Y\n3,Y,Y\n4,N,N\n")
    rule = _two_group_outcome_rule()
    monkeypatch.setattr(
        "apps.runs.services.load_rules",
        lambda: RulesFile(version=1, rules=[rule], next_index=101),
    )

    result = execute_comparison(
        path_a=path_a,
        path_b=path_b,
        comparison_columns=["id", "sa", "cva"],
        target_columns=["sa", "cva"],
        key_columns=["id"],
    )
    assert [v.key_columns["id"] for v in result.validation.violations_by_rule["R100"]] == [
        "3",
        "4",
    ]

    results_dir = tmp_path / "results"
    with override_settings(RESULTS_DIR=str(results_dir)):
        meta = save_run(result, "a.csv", "b.csv")
        loaded = load_run(meta.run_id)
    assert loaded is not None
    stored = loaded["result"]
    violation = stored["validation"]["violations_by_rule"]["R100"][0]
    assert violation["outcome_columns"] == ["sa", "cva"]
    assert violation["outcome_values"] == {"sa": "Y", "cva": "Y"}
    assert violation["extra_values"]["sa"] == "Y"


@pytest.mark.parametrize(
    ("kind", "message"),
    [
        ("condition", "unknown condition column 'missing'"),
        ("outcome", "unknown outcome column 'missing'"),
    ],
)
def test_execute_rejects_missing_schema_columns(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    kind: str,
    message: str,
) -> None:
    path_a = tmp_path / "a.csv"
    path_b = tmp_path / "b.csv"
    path_a.write_text("id,status\n1,active\n")
    path_b.write_text("id,status\n1,active\n")

    if kind == "condition":
        rule = _legacy_rule(
            column="status",
            conditions=[Condition("missing", "eq", "x", ("x",))],
        )
    else:
        rule = _legacy_rule(column="missing")
    monkeypatch.setattr(
        "apps.runs.services.load_rules",
        lambda: RulesFile(version=1, rules=[rule], next_index=2),
    )
    with pytest.raises(ValueError, match=message):
        execute_comparison(
            path_a=path_a,
            path_b=path_b,
            comparison_columns=["id", "status"],
            target_columns=["status"],
            key_columns=["id"],
        )


@pytest.mark.parametrize(
    ("tree", "message"),
    [
        (_branch("and", _leaf(0), _leaf(9)), "references a missing"),
        (_branch("and", _leaf(0), _leaf(0)), "more than once"),
        ({"kind": "and", "children": [_leaf(0)]}, "Invalid filter_grouping_tree"),
    ],
)
def test_execute_rejects_invalid_filter_grouping(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    tree: dict[str, Any],
    message: str,
) -> None:
    path_a = tmp_path / "a.csv"
    path_b = tmp_path / "b.csv"
    path_a.write_text("id,status\n1,active\n")
    path_b.write_text("id,status\n1,active\n")
    monkeypatch.setattr(
        "apps.runs.services.load_rules",
        lambda: RulesFile(version=1, rules=[], next_index=1),
    )
    with pytest.raises(ValueError, match=message):
        execute_comparison(
            path_a=path_a,
            path_b=path_b,
            comparison_columns=["id", "status"],
            target_columns=["status"],
            key_columns=["id"],
            filters=[
                {"column": "status", "operator": "eq", "filter_value": "active"},
                {"column": "status", "operator": "eq", "filter_value": "inactive"},
            ],
            filter_grouping_tree=tree,
        )


# ---------------------------------------------------------------------------
# Family expansion and grouping remapping
# ---------------------------------------------------------------------------


def _write_family(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "Contact.yaml").write_text(
        "kind: column\nname: Contact\ncolumns:\n- email\n- phone\n_version: 1\n"
    )


def test_family_filter_expansion_remaps_positive_leaf_to_or(
    tmp_path: Path,
) -> None:
    families = tmp_path / "families"
    _write_family(families)
    filters = [
        {"column": "family:Contact", "operator": "eq", "filter_values": ["a"]},
        {"column": "city", "operator": "eq", "filter_values": ["NY"]},
    ]
    tree = _branch("and", _leaf(0), _leaf(1))
    with override_settings(FAMILY_CONFIG_DIR=families):
        expanded, relation, remapped = expand_filter_grouping(
            filters, None, tree, {"email", "phone", "city"}
        )
    assert [row["column"] for row in expanded] == ["email", "phone", "city"]
    assert relation is None
    assert remapped == _branch(
        "and",
        _branch("or", _leaf(0), _leaf(1)),
        _leaf(2),
    )


def test_family_filter_expansion_remaps_negative_leaf_to_and(
    tmp_path: Path,
) -> None:
    families = tmp_path / "families"
    _write_family(families)
    filters = [
        {"column": "family:Contact", "operator": "neq", "filter_values": ["x"]}
    ]
    with override_settings(FAMILY_CONFIG_DIR=families):
        expanded, _, remapped = expand_filter_grouping(
            filters, None, None, {"email", "phone"}
        )
    assert [row["column"] for row in expanded] == ["email", "phone"]
    assert remapped == _branch("and", _leaf(0), _leaf(1))


def test_family_filter_expansion_rejects_zero_members(tmp_path: Path) -> None:
    families = tmp_path / "families"
    _write_family(families)
    filters = [
        {"column": "family:Contact", "operator": "eq", "filter_values": ["a"]}
    ]
    with override_settings(FAMILY_CONFIG_DIR=families), pytest.raises(
        ValueError, match="no available members"
    ):
        expand_filter_grouping(filters, None, None, {"city"})


def test_family_rule_outcome_uses_positive_any_and_negative_all(
    tmp_path: Path,
) -> None:
    families = tmp_path / "families"
    _write_family(families)
    with override_settings(FAMILY_CONFIG_DIR=families):
        positive = _legacy_rule(column="family:Contact", values=["a@b.com"])
        assert not _check_rule(
            {"email": "a@b.com", "phone": "555"}, positive, []
        )[0]
        assert _check_rule(
            {"email": "x@y.com", "phone": "555"}, positive, []
        )[0]

        negative = _legacy_rule(
            column="family:Contact", operator="neq", values=["a@b.com"]
        )
        # Positive-any / negative-all: one matching member makes the negative
        # family clause fail, even if another member would pass.
        assert _check_rule(
            {"email": "a@b.com", "phone": "555"}, negative, []
        )[0]
        assert not _check_rule(
            {"email": "x@y.com", "phone": "555"}, negative, []
        )[0]


def test_family_rule_condition_uses_positive_any_and_negative_all(
    tmp_path: Path,
) -> None:
    families = tmp_path / "families"
    _write_family(families)
    with override_settings(FAMILY_CONFIG_DIR=families):
        positive = _legacy_rule(
            conditions=[
                Condition("family:Contact", "eq", "a@b.com", ("a@b.com",))
            ]
        )
        assert _check_rule(
            {"email": "a@b.com", "phone": "555", "result": "bad"},
            positive,
            [],
        )[0]
        assert not _check_rule(
            {"email": "x@y.com", "phone": "555", "result": "bad"},
            positive,
            [],
        )[0]

        negative = _legacy_rule(
            conditions=[
                Condition("family:Contact", "neq", "a@b.com", ("a@b.com",))
            ]
        )
        assert not _check_rule(
            {"email": "a@b.com", "phone": "555", "result": "bad"},
            negative,
            [],
        )[0]
        assert _check_rule(
            {"email": "x@y.com", "phone": "555", "result": "bad"},
            negative,
            [],
        )[0]


# ---------------------------------------------------------------------------
# Saved filters, reports and tracking
# ---------------------------------------------------------------------------


def test_saved_filter_round_trips_grouping_and_values(tmp_path: Path) -> None:
    filters_dir = tmp_path / "filters"
    filters_dir.mkdir()
    tree = _branch(
        "or",
        _branch("and", _leaf(0), _leaf(1)),
        _leaf(2),
    )
    rows = [
        {"column": "sa", "operator": "eq", "filter_values": ["Y"]},
        {"column": "cva", "operator": "eq", "filter_values": ["N"]},
        {"column": "book", "operator": "eq", "filter_values": ["FO", "MO"]},
    ]
    with override_settings(FILTERS_DIR=filters_dir):
        created = create_filter("Two groups", rows, filter_grouping_tree=tree)
        loaded = get_filter(created.id)
        listed = list_filters()

    assert loaded is not None
    assert loaded.filter_grouping_tree is not None
    assert loaded.rows[2].filter_values == ["FO", "MO"]
    assert listed[0].filter_grouping_tree is not None
    assert (
        filters_dir / f"{created.id}.yaml"
    ).read_text().count("filter_grouping_tree") == 1


def test_saved_filter_api_rejects_invalid_tree(tmp_path: Path) -> None:
    filters_dir = tmp_path / "filters"
    filters_dir.mkdir()
    payload = {
        "name": "Broken",
        "rows": [
            {"column": "a", "operator": "eq", "filter_values": ["Y"]},
            {"column": "b", "operator": "eq", "filter_values": ["Y"]},
        ],
        "filter_grouping_tree": _branch("and", _leaf(0), _leaf(0)),
    }
    with override_settings(FILTERS_DIR=filters_dir):
        response = APIClient().post("/api/filters/", payload, format="json")
    assert response.status_code == 400
    assert "more than once" in response.json()["error"]


def test_filter_config_rejects_invalid_grouping(tmp_path: Path) -> None:
    config_dir = tmp_path / "filters-config"
    config_dir.mkdir()
    payload = {
        "name": "broken",
        "content": {
            "rows": [
                {"column": "a", "operator": "eq", "filter_value": "Y"},
                {"column": "b", "operator": "eq", "filter_value": "Y"},
            ],
            "filter_grouping_tree": _branch("and", _leaf(0), _leaf(9)),
        },
    }
    with override_settings(FILTERS_CONFIG_DIR=config_dir):
        response = APIClient().post(
            "/api/filters/configs/", payload, format="json"
        )
    assert response.status_code == 400
    assert "references a missing" in response.json()["error"]


def test_rows_and_columns_config_rejects_invalid_filter_grouping(
    tmp_path: Path,
) -> None:
    config_dir = tmp_path / "rows-config"
    config_dir.mkdir()
    payload = {
        "name": "broken",
        "content": {
            "filters": [
                {"column": "a", "operator": "eq", "filter_value": "Y"},
                {"column": "b", "operator": "eq", "filter_value": "Y"},
            ],
            "filter_grouping_tree": _branch("and", _leaf(0), _leaf(0)),
        },
    }
    with override_settings(ROWS_AND_COLUMNS_CONFIG_DIR=config_dir):
        response = APIClient().post(
            "/api/rows-and-columns/configs/", payload, format="json"
        )
    assert response.status_code == 400
    assert "more than once" in response.json()["error"]


def test_reports_show_grouped_filter_expression() -> None:
    result = {
        "comparison": {},
        "validation": {},
        "target_columns": [],
        "common_columns": [],
        "key_columns": ["id"],
        "filters_applied": [
            {"column": "book", "operator": "eq", "filter_values": ["MO"]},
            {"column": "system", "operator": "eq", "filter_values": ["Traded Risk"]},
            {"column": "book", "operator": "eq", "filter_values": ["FO"]},
        ],
        "filter_grouping_tree": _branch(
            "or",
            _branch("and", _leaf(0), _leaf(1)),
            _leaf(2),
        ),
    }
    html = export_html(result, "Grouped filters")
    assert "Grouping:" in html
    assert "(F1 AND F2) OR F3" in html
    assert "book equals &#x27;MO&#x27;" in html

    from io import BytesIO

    workbook = load_workbook(BytesIO(export_excel(result, "Grouped filters")))
    values = [cell.value for row in workbook["Overall"] for cell in row]
    assert any(
        value and "Grouping:" in str(value) and "(F1 AND F2) OR F3" in str(value)
        for value in values
    )


def test_grouped_outcome_creates_one_tracking_occurrence_per_rule_key() -> None:
    frame = _frame(id=["1"], sa=["Y"], cva=["Y"])
    rule = _two_group_outcome_rule()
    validation = validate_rows(frame, [rule], ["sa", "cva"], ["id"])
    assert len(validation.violations_by_rule["R100"]) == 1

    result = ExecutionResult(
        comparison=ComparisonResult(
            total_rows_a=1,
            total_rows_b=1,
            matched_rows=1,
            rows_with_changes=0,
            total_attribute_changes=0,
            row_details=[],
        ),
        validation=validation,
        common_columns=["id", "sa", "cva"],
        target_columns=["sa", "cva"],
        key_columns=["id"],
        filters_applied=[],
        rule_bindings={"R100": "CBR1_00000000000000000000"},
    )
    occurrences = build_occurrences(result)
    assert len(occurrences) == 1
    assert occurrences[0]["key_columns"] == (("id", "1"),)


def test_violation_dataclass_preserves_outcome_context() -> None:
    violation = ValidationViolation(
        row_index=0,
        rule_id="R100",
        rule_name="Grouped",
        key_columns={"id": "1"},
        details="bad",
        violating_column="sa, cva",
        violating_value={"sa": "Y", "cva": "Y"},
        rule_logic="grouped",
        outcome_columns=("sa", "cva"),
        outcome_values={"sa": "Y", "cva": "Y"},
        outcome_results={"sa": False, "cva": False},
    )
    copied = replace(violation)
    assert copied.outcome_columns == ("sa", "cva")
    assert copied.outcome_values["sa"] == "Y"
