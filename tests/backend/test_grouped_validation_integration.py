"""Cross-layer regressions using A's materialized rule model and B's runtime."""

from __future__ import annotations

from pathlib import Path

import polars as pl
from apps.rules.services import rule_from_payload, validate_rule
from apps.runs.services import apply_filters, validate_rows


def _leaf(index: int) -> dict[str, str]:
    return {"kind": "leaf", "conditionId": f"c{index}"}


def _and(*children: dict[str, object]) -> dict[str, object]:
    return {"kind": "and", "children": list(children)}


def test_materialized_nested_outcome_rule_runs_exact_y_n_truth_table() -> None:
    rule = rule_from_payload(
        "R-MATERIALIZED",
        {
            "name": "Only opposite flags",
            "description": "",
            "conditions": [],
            "logic_clauses": [
                {
                    "format": "value_vs_column",
                    "column_name": "SA",
                    "operator": "eq",
                    "target_value": "Y",
                },
                {
                    "format": "value_vs_column",
                    "column_name": "CVA",
                    "operator": "eq",
                    "target_value": "N",
                },
                {
                    "format": "value_vs_column",
                    "column_name": "SA",
                    "operator": "eq",
                    "target_value": "N",
                },
                {
                    "format": "value_vs_column",
                    "column_name": "CVA",
                    "operator": "eq",
                    "target_value": "Y",
                },
            ],
            "logic_relation": "or",
            "logic_grouping_tree": {
                "kind": "or",
                "children": [
                    _and(_leaf(0), _leaf(1)),
                    _and(_leaf(2), _leaf(3)),
                ],
            },
        },
    )

    # This is the actual form A materializes, not the wire dict used by the
    # independent runtime tests: the tree is an immutable GroupingBranch.
    assert not isinstance(rule.logic_grouping_tree, dict)
    records = pl.DataFrame(
        {
            "SA": ["Y", "N", "Y", "N", "X", "Y", "N"],
            "CVA": ["N", "Y", "Y", "N", "N", None, ""],
        },
        schema={"SA": pl.String, "CVA": pl.String},
    )

    result = validate_rows(records, [rule], ["SA", "CVA"])

    assert result.total_violations == 5
    violations = result.violations_by_rule["R-MATERIALIZED"]
    assert [records.row(item.row_index, named=True) for item in violations] == [
        {"SA": "Y", "CVA": "Y"},
        {"SA": "N", "CVA": "N"},
        {"SA": "X", "CVA": "N"},
        {"SA": "Y", "CVA": None},
        {"SA": "N", "CVA": ""},
    ]
    assert all(item.outcome_columns == ("SA", "CVA") for item in violations)
    assert all(set(item.outcome_values) == {"SA", "CVA"} for item in violations)


def test_single_outcome_clause_cannot_silently_discard_grouping_fields() -> None:
    result = validate_rule({
        "name": "Contradictory single outcome",
        "conditions": [],
        "logic_clauses": [{
            "format": "value_vs_column",
            "column_name": "status",
            "operator": "eq",
            "target_value": "Active",
        }],
        "logic_relation": "or",
    })
    assert result.valid is False
    assert any("Single-outcome" in error for error in result.errors)


def test_reproducible_sample_population_has_documented_11_rows() -> None:
    sample_dir = Path(__file__).resolve().parents[2] / "samples" / "grouped_validation"
    baseline = pl.scan_csv(sample_dir / "baseline.csv", infer_schema_length=0)
    comparison = pl.scan_csv(sample_dir / "comparison.csv", infer_schema_length=0)
    filters = [
        {"column": "BOOK_TYPE", "operator": "eq", "filter_value": "MO"},
        {"column": "SYSTEM", "operator": "eq", "filter_value": "Traded Risk"},
        {"column": "BOOK_TYPE", "operator": "eq", "filter_value": "FO"},
        {"column": "STATUS", "operator": "eq", "filter_value": "Active"},
        {"column": "RG_REGION", "operator": "eq", "filter_value": "Asia Pacific"},
    ]
    tree = {
        "kind": "and",
        "children": [
            {
                "kind": "or",
                "children": [
                    _and(_leaf(0), _leaf(1)),
                    _leaf(2),
                ],
            },
            _leaf(3),
            _leaf(4),
        ],
    }

    _, filtered_comparison = apply_filters(baseline, comparison, filters, "and", tree)

    selected = filtered_comparison.collect()
    assert selected.height == 11
    assert selected.get_column("ID").to_list() == [
        "1", "2", "3", "4", "5", "6", "8", "9", "10", "14", "15",
    ]
