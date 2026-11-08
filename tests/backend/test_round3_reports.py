"""Round 3 report headers, saved-run compatibility and numeric rule presentation."""

from copy import deepcopy
from dataclasses import asdict
from io import BytesIO

from apps.reports.rule_headers import excel_rule_headers
from apps.reports.services import export_excel, export_html
from apps.rules.services import rule_definition_payload, rule_from_payload
from apps.runs.services import validate_rows
from openpyxl import load_workbook

from tests.backend.test_report_export_compound_values import (
    _flags_frame,
    _grouped_document,
    _grouped_rule,
)


def test_rule_metadata_has_numbered_clauses_and_explicit_grouping_lines() -> None:
    payload = rule_definition_payload(_grouped_rule())
    payload["conditions"] = [
        {"column_name": "id", "operator": "neq", "filter_value": str(i)} for i in [-1, -2, -3, -4]
    ]
    payload["grouping_tree"] = deepcopy(payload["logic_grouping_tree"])
    rule = rule_from_payload("R079", payload)
    validation = validate_rows(_flags_frame(), [rule], ["sa_flag", "cva_flag"], ["id"])
    document, _ = _grouped_document()
    document["validation"] = asdict(validation)
    workbook = load_workbook(BytesIO(export_excel(document, "Round 3")))
    sheet = workbook["R079"]
    assert [sheet.cell(i, 1).value for i in range(2, 7)] == [
        "Conditions:",
        "Condition Groupings:",
        "Expectations:",
        "Expectation Groupings:",
        "Rule Identifier:",
    ]
    assert sheet["B2"].value.splitlines() == [
        f"Condition {i}: id does not equal '{-i}'" for i in range(1, 5)
    ]
    assert "Group 1: Condition 1 AND Condition 2" in sheet["B3"].value
    assert "Group 3: Group 1 OR Group 2" in sheet["B3"].value
    assert len(sheet["B4"].value.splitlines()) == 4
    assert sheet["B4"].value.startswith("Expectation 1: sa_flag equals 'Yes'")
    assert "Group 2: Expectation 3 AND Expectation 4" in sheet["B5"].value
    assert "Group 3: Group 1 OR Group 2" in sheet["B5"].value
    assert sheet["B2"].alignment.wrap_text is True
    assert sheet.row_dimensions[2].height >= 60


def test_historical_grouped_summary_exports_numbered_expectations_without_live_rule() -> None:
    document, _ = _grouped_document()
    summary = document["validation"]["rule_summaries"]["R079"]
    for key in [
        "condition_clauses",
        "expectation_clauses",
        "condition_groupings",
        "expectation_groupings",
    ]:
        summary.pop(key, None)
    headers = excel_rule_headers(summary)
    assert headers[2].splitlines() == [
        "Expectation 1: sa_flag equals 'Yes'",
        "Expectation 2: cva_flag equals 'No'",
        "Expectation 3: sa_flag equals 'No'",
        "Expectation 4: cva_flag equals 'Yes'",
    ]
    assert "Group 3: Group 1 OR Group 2" in headers[3]


def test_html_sections_and_excel_sheets_use_numeric_rule_index_order() -> None:
    document, _ = _grouped_document()
    validation = document["validation"]
    validation["violations_by_rule"] = {key: [] for key in ["R100", "R10", "R2"]}
    validation["rule_summaries"] = {
        key: {"name": key, "logic": "status equals 'active'"} for key in ["R100", "R10", "R2"]
    }
    html = export_html(document, "Ordered")
    assert html.index("id='rule-R2'") < html.index("id='rule-R10'") < html.index("id='rule-R100'")
    workbook = load_workbook(BytesIO(export_excel(document, "Ordered")))
    assert [name for name in workbook.sheetnames if name in validation["rule_summaries"]] == [
        "R2",
        "R10",
        "R100",
    ]
    assert "New Exceptions Only help" in html
    assert "role='tooltip'" in html


def test_overall_filter_cells_and_html_keep_numbered_clauses_and_full_expression() -> None:
    document, _ = _grouped_document()
    document["filters_applied"] = [
        {"column": "system", "operator": "contains", "filter_values": ["oomber"]},
        {"column": "status", "operator": "eq", "filter_values": ["active"]},
        {"column": "status", "operator": "eq", "filter_values": ["inactive"]},
    ]
    document["filter_grouping_tree"] = {
        "kind": "and",
        "children": [
            {"kind": "leaf", "conditionId": "c0"},
            {
                "kind": "or",
                "children": [
                    {"kind": "leaf", "conditionId": "c1"},
                    {"kind": "leaf", "conditionId": "c2"},
                ],
            },
        ],
    }
    workbook = load_workbook(BytesIO(export_excel(document, "Filters")))
    sheet = workbook["Overall"]
    cells = {row[0].value: row[1] for row in sheet.iter_rows() if len(row) > 1}
    assert cells["Filters:"].value.splitlines() == [
        "Filter 1: system contains 'oomber'",
        "Filter 2: status equals 'active'",
        "Filter 3: status equals 'inactive'",
    ]
    assert cells["Filter Groupings:"].value.splitlines() == [
        "Overall: Group 2",
        "Group 1: Filter 2 OR Filter 3",
        "Group 2: Filter 1 AND Group 1",
    ]
    assert cells["Filters:"].alignment.wrap_text is True
    import html

    assert (
        "Filters: (Filter 1: system contains 'oomber' AND "
        "(Filter 2: status equals 'active' OR Filter 3: status equals 'inactive'))"
        in html.unescape(export_html(document, "Filters"))
    )


def test_filter_grouping_export_never_flattens_invalid_references() -> None:
    from apps.reports.services import _filter_report_headers, _format_filter_expression

    document = {
        "filters_applied": [{"column": "status", "operator": "eq", "filter_values": ["active"]}],
        "filter_grouping_tree": {"kind": "leaf", "conditionId": "c9"},
    }
    clauses, groups = _filter_report_headers(document)
    assert clauses == "Filter 1: status equals 'active'"
    assert "unavailable" in groups
    assert "unavailable" in _format_filter_expression(document)
