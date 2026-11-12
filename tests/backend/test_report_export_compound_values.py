"""Focused round 1 regressions for compound report/export cell values.

Grouped rule outcomes store ``violating_value`` as a flat map of observed
columns, for example ``{"sa_flag": "Yes", "cva_flag": "Yes"}``. openpyxl only
accepts CSV scalars, so the report layer must format these maps explicitly
without changing the stored/API contract or legacy scalar exports.
"""

from __future__ import annotations

from dataclasses import asdict
from io import BytesIO
from typing import Any

import polars as pl
from apps.reports.services import export_excel, export_html
from apps.rules.services import Rule, rule_from_payload
from apps.runs.services import validate_rows
from django.test import TestCase
from openpyxl import load_workbook
from rest_framework.test import APIClient  # type: ignore[import-untyped]


def _grouped_rule() -> Rule:
    return rule_from_payload(
        "R079",
        {
            "name": "Opposite flags only",
            "description": "Compound observed values reach reports as a map.",
            "conditions": [],
            "logic_clauses": [
                {
                    "format": "value_vs_column",
                    "column_name": "sa_flag",
                    "operator": "eq",
                    "target_value": "Yes",
                },
                {
                    "format": "value_vs_column",
                    "column_name": "cva_flag",
                    "operator": "eq",
                    "target_value": "No",
                },
                {
                    "format": "value_vs_column",
                    "column_name": "sa_flag",
                    "operator": "eq",
                    "target_value": "No",
                },
                {
                    "format": "value_vs_column",
                    "column_name": "cva_flag",
                    "operator": "eq",
                    "target_value": "Yes",
                },
            ],
            "logic_relation": "or",
            "logic_grouping_tree": {
                "kind": "or",
                "children": [
                    {
                        "kind": "and",
                        "children": [
                            {"kind": "leaf", "conditionId": "c0"},
                            {"kind": "leaf", "conditionId": "c1"},
                        ],
                    },
                    {
                        "kind": "and",
                        "children": [
                            {"kind": "leaf", "conditionId": "c2"},
                            {"kind": "leaf", "conditionId": "c3"},
                        ],
                    },
                ],
            },
        },
    )


def _flags_frame() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "id": ["1", "2", "3", "4", "5"],
            "sa_flag": ["Yes", "Yes", "Yes", None, "No"],
            "cva_flag": ["Yes", "No", None, "Yes", ""],
        }
    )


def _grouped_document() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rule = _grouped_rule()
    validation = validate_rows(
        _flags_frame(),
        [rule],
        target_columns=["sa_flag", "cva_flag"],
        key_columns=["id"],
    )
    violations = [asdict(item) for item in validation.violations_by_rule["R079"]]
    document: dict[str, Any] = {
        "comparison": {
            "total_rows_a": 5,
            "total_rows_b": 5,
            "rows_with_changes": 0,
            "total_attribute_changes": 0,
            "row_details": [],
            "new_book_count": 0,
            "new_book_details": [],
        },
        "validation": {
            "total_violations": validation.total_violations,
            "distinct_violating_rows": validation.distinct_violating_rows,
            "distinct_violating_attributes": validation.distinct_violating_attributes,
            "violations_by_rule": {"R079": violations},
            "violation_count_by_rule": validation.violation_count_by_rule,
            "violating_rows_by_rule": validation.violating_rows_by_rule,
            "violating_attributes_by_rule": validation.violating_attributes_by_rule,
            "rule_summaries": validation.rule_summaries,
        },
        "target_columns": ["sa_flag", "cva_flag"],
        "common_columns": ["id", "sa_flag", "cva_flag"],
        "key_columns": ["id"],
        "filters_applied": [],
    }
    return document, violations


def _scalar_document(violating_value: Any) -> dict[str, Any]:
    return {
        "comparison": {
            "total_rows_a": 1,
            "total_rows_b": 1,
            "rows_with_changes": 0,
            "total_attribute_changes": 0,
            "row_details": [],
            "new_book_count": 0,
            "new_book_details": [],
        },
        "validation": {
            "total_violations": 1,
            "violations_by_rule": {
                "R001": [
                    {
                        "row_index": 0,
                        "rule_id": "R001",
                        "rule_identifier": "CBR1_00000000000000000000",
                        "rule_name": "Legacy scalar rule",
                        "key_columns": {"id": "1"},
                        "details": "Legacy scalar",
                        "violating_column": "score",
                        "violating_value": violating_value,
                        "comparison_value": "15",
                        "rule_logic": "score lt '20'",
                    }
                ]
            },
            "violation_count_by_rule": {"R001": 1},
            "violating_rows_by_rule": {"R001": 1},
            "violating_attributes_by_rule": {"R001": 1},
            "rule_summaries": {
                "R001": {
                    "name": "Legacy scalar rule",
                    "description": "",
                    "logic": "score lt '20'",
                    "condition": "",
                    "condition_grouping": "",
                    "rule_identifier": "CBR1_00000000000000000000",
                }
            },
        },
        "target_columns": ["score"],
        "common_columns": ["id", "score"],
        "key_columns": ["id"],
        "filters_applied": [],
    }


def test_grouped_execution_keeps_one_exception_per_rule_key() -> None:
    _, violations = _grouped_document()

    keys = [violation["key_columns"]["id"] for violation in violations]
    assert keys == ["1", "3", "4", "5"]
    assert len(keys) == len(set(keys)) == 4
    assert [violation["violating_value"] for violation in violations] == [
        {"sa_flag": "Yes", "cva_flag": "Yes"},
        {"sa_flag": "Yes", "cva_flag": None},
        {"sa_flag": None, "cva_flag": "Yes"},
        {"sa_flag": "No", "cva_flag": ""},
    ]


def test_excel_formats_compound_values_and_preserves_null_blank_context() -> None:
    document, _ = _grouped_document()

    workbook = load_workbook(BytesIO(export_excel(document, "Grouped export")))

    rule_sheet = workbook["R079"]
    assert [rule_sheet.cell(8, column).value for column in range(1, 7)] == [
        "id",
        "sa_flag",
        "cva_flag",
        "Column",
        "In Baseline",
        "In Comparison",
    ]
    assert [rule_sheet.cell(9, column).value for column in range(1, 7)] == [
        "1",
        "Yes",
        "Yes",
        "cva_flag, sa_flag",
        None,
        "sa_flag=Yes, cva_flag=Yes",
    ]
    exported_values = [
        rule_sheet.cell(row, 6).value for row in range(9, rule_sheet.max_row + 1)
    ]
    assert exported_values == [
        "sa_flag=Yes, cva_flag=Yes",
        "sa_flag=Yes, cva_flag=(null)",
        "sa_flag=(null), cva_flag=Yes",
        "sa_flag=No, cva_flag=(blank)",
    ]
    assert len(exported_values) == len(set(exported_values)) == 4

    assert not any(
        isinstance(cell.value, dict) or str(cell.value).startswith("{")
        for sheet in workbook.worksheets
        for row in sheet.iter_rows()
        for cell in row
    )


def test_excel_scalar_export_and_formula_protection_are_unchanged() -> None:
    workbook = load_workbook(BytesIO(export_excel(_scalar_document("10"), "Scalar")))
    assert workbook["R001"]["D9"].value == "10"

    protected = load_workbook(
        BytesIO(export_excel(_scalar_document("=SUM(A1:A2)"), "Scalar"))
    )
    assert protected["R001"]["D9"].value == "'=SUM(A1:A2)"

    compound_protected = _scalar_document(
        {"=observed": "@SUM(A1:A2)", "safe": "Yes"}
    )
    protected_workbook = load_workbook(
        BytesIO(export_excel(compound_protected, "Compound formula"))
    )
    cell = protected_workbook["R001"]["D9"]
    assert cell.value == "'=observed=@SUM(A1:A2), safe=Yes"
    assert cell.data_type == "s"


def test_html_export_renders_compound_values_readably_and_escapes_them() -> None:
    document, _ = _grouped_document()
    document["validation"]["violations_by_rule"]["R079"][0]["violating_value"] = {
        "sa_flag": "<script>alert('x')</script>",
        "cva_flag": None,
        "blank": "",
    }

    rendered = export_html(document, "Grouped export")

    assert "sa_flag=&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;" in rendered
    assert "cva_flag=(null)" in rendered
    assert "blank=(blank)" in rendered
    assert "{&#x27;sa_flag&#x27;" not in rendered
    assert "<script>alert('x')</script>" not in rendered


class TestExportEndpointWithCompoundValues(TestCase):
    def test_export_endpoint_returns_real_xlsx_for_compound_result(self) -> None:
        document, _ = _grouped_document()

        response = APIClient().post(
            "/api/reports/export/",
            {
                "format": "excel",
                "report_name": "Round 1 grouped",
                "result_data": document,
                "new_exceptions_only": False,
            },
            format="json",
        )

        assert response.status_code == 200, response.content
        workbook = load_workbook(BytesIO(response.content))
        rule_sheet = workbook["R079"]
        assert [
            rule_sheet.cell(row, 6).value for row in range(9, rule_sheet.max_row + 1)
        ] == [
            "sa_flag=Yes, cva_flag=Yes",
            "sa_flag=Yes, cva_flag=(null)",
            "sa_flag=(null), cva_flag=Yes",
            "sa_flag=No, cva_flag=(blank)",
        ]
