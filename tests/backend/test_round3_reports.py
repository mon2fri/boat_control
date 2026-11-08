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
