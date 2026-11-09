"""Round 4 enhancement 3: empty-rule hints in exported HTML/Excel.

Synthetic isolated data only. Covers enabled zero-exception rules, mixed and
all-empty outputs, grouping/identity preservation, numeric ordering, and rules
emptied by the New Exceptions Only projection.
"""

from io import BytesIO

from apps.reports.services import _EMPTY_RULE_HINT, export_csv, export_excel, export_html
from apps.runs.tracking_context import filter_result_for_new_exceptions
from openpyxl import load_workbook

HINT = "Nil exception was captured by thie rule."


def _summary(rule_id, name="Rule", identifier="CID_X"):
    return {
        "name": name,
        "description": f"{name} description.",
        "condition": "Condition 1: region equals 'EMEA'",
        "condition_grouping": "Overall: Group 1\nGroup 1: Condition 1",
        "logic": "Expectation 1: score lt '20'",
        "condition_clauses": ["Condition 1: region equals 'EMEA'"],
        "condition_groupings": "Overall: Group 1\nGroup 1: Condition 1",
        "expectation_clauses": ["Expectation 1: score less than '20'"],
        "expectation_groupings": "Overall: Group 1\nGroup 1: Expectation 1",
        "rule_identifier": identifier,
    }


def _violation(rule_id, row=5, key="456", identifier="CID_X"):
    return {
        "row_index": row,
        "rule_id": rule_id,
        "rule_identifier": identifier,
        "rule_name": f"{rule_id} name",
        "key_columns": {"id": key},
        "violating_column": "score",
        "violating_value": "10",
        "comparison_value": "15",
        "rule_logic": "score lt '20'",
        "exception_status": "New",
    }


def _base_result(rule_ids=("R001", "R002"), populated=("R001",)):
    violations = {}
    row_counts = {}
    for rule_id in rule_ids:
        if rule_id in populated:
            violations[rule_id] = [_violation(rule_id)]
            row_counts[rule_id] = 1
        else:
            violations[rule_id] = []
            row_counts[rule_id] = 0
    summaries = {
        rule_id: _summary(rule_id, name=f"{rule_id} name", identifier=f"CID_{rule_id}")
        for rule_id in rule_ids
    }
    return {
        "comparison": {
            "total_rows_a": 10,
            "total_rows_b": 10,
            "rows_with_changes": 0,
            "total_attribute_changes": 0,
            "row_details": [],
            "new_book_count": 0,
            "new_book_details": [],
        },
        "validation": {
            "total_violations": len(populated),
            "distinct_violating_rows": len(populated),
            "distinct_violating_attributes": len(populated),
            "violations_by_rule": violations,
            "violation_count_by_rule": {r: (1 if r in populated else 0) for r in rule_ids},
            "violating_rows_by_rule": dict(row_counts),
            "violating_attributes_by_rule": dict(row_counts),
            "rule_summaries": summaries,
        },
        "target_columns": ["score"],
        "key_columns": ["id"],
        "filters_applied": [],
    }


def _rule_section(rendered, rule_id):
    marker = f"id='rule-{rule_id}'"
    assert marker in rendered
    return rendered.split(marker, 1)[1].split("</section>", 1)[0]


class TestEmptyRuleHintHtml:
    def test_constant_matches_requirement_copy(self):
        assert _EMPTY_RULE_HINT == HINT

    def test_enabled_zero_exception_rule_shows_hint_no_table(self):
        rendered = export_html(_base_result(), "R")
        section = _rule_section(rendered, "R002")
        assert HINT in section
        assert "R002 — R002 name" in section
        assert "Condition 1: region equals" in section
        assert "Grouping:" in section
        assert "Expectation:" in section
        assert "CID_R002" in section
        assert "<table>" not in section
        # Old copy must not be duplicated alongside the new hint.
        assert "Nil exception detected under current rule." not in rendered

    def test_mixed_populated_table_unchanged(self):
        rendered = export_html(_base_result(), "R")
        populated = _rule_section(rendered, "R001")
        assert "<table>" in populated
        assert HINT not in populated
        assert "456" in populated

    def test_all_empty_output(self):
        result = _base_result(populated=())
        result["validation"]["total_violations"] = 0
        result["validation"]["distinct_violating_rows"] = 0
        result["validation"]["distinct_violating_attributes"] = 0
        rendered = export_html(result, "R")
        for rule_id in ("R001", "R002"):
            section = _rule_section(rendered, rule_id)
            assert HINT in section
            assert "<table>" not in section
        # No placeholder records inflate counts.
        assert "Exception Table (0 rows)" in rendered

    def test_numeric_order_and_toc(self):
        result = _base_result(rule_ids=("R010", "R002", "R001"), populated=("R010",))
        rendered = export_html(result, "R")
        toc = rendered.split("<nav", 1)[1].split("</nav>", 1)[0]
        assert toc.index("R001") < toc.index("R002") < toc.index("R010")
        assert rendered.index("id='rule-R001'") < rendered.index("id='rule-R002'")
        assert rendered.index("id='rule-R002'") < rendered.index("id='rule-R010'")

    def test_rule_emptied_by_new_exceptions_only(self):
        result = _base_result(rule_ids=("R001",), populated=("R001",))
        result["validation"]["violations_by_rule"]["R001"][0]["exception_status"] = (
            "Commented"
        )
        filtered = filter_result_for_new_exceptions(result, True)
        assert filtered["validation"]["violations_by_rule"]["R001"] == []
        assert filtered["validation"]["violating_rows_by_rule"]["R001"] == 0
        rendered = export_html(filtered, "R")
        section = _rule_section(rendered, "R001")
        assert HINT in section
        assert "<table>" not in section
        assert "CID_R001" in section
        # Scope checkbox stays truthful.
        assert "checked" in rendered


class TestEmptyRuleHintExcel:
    def test_mixed_empty_and_populated_sheets(self):
        workbook = load_workbook(BytesIO(export_excel(_base_result(), "R")))
        assert workbook.sheetnames.index("R001") < workbook.sheetnames.index("R002")
        empty = workbook["R002"]
        assert empty["A1"].value == "R002 - R002 name"
        assert empty["A2"].value == "Conditions:"
        assert "Condition 1" in str(empty["B2"].value)
        assert empty["A3"].value == "Condition Groupings:"
        assert empty["A4"].value == "Expectations:"
        assert empty["A5"].value == "Expectation Groupings:"
        assert empty["A6"].value == "Rule Identifier:"
        assert empty["B6"].value == "CID_R002"
        assert empty.cell(8, 1).value == HINT
        # No empty detail table headers.
        row8 = [empty.cell(8, c).value for c in range(1, 5)]
        assert "id" not in row8
        assert "Column" not in row8
        assert empty.cell(9, 1).value is None

        populated = workbook["R001"]
        assert [populated.cell(8, c).value for c in range(1, 5)] == [
            "id",
            "Column",
            "In Baseline",
            "In Comparison",
        ]
        assert populated.cell(9, 1).value == "456"

        # Summary metadata retained with truthful zero counts.
        overall = workbook["Overall"]
        assert any(
            cell.value == "Exception Rule Summary" for row in overall for cell in row
        )
        summary = workbook["Rule Summary"]
        rows = {
            summary.cell(r, 1).value: summary.cell(r, 4).value
            for r in range(4, 6)
        }
        assert rows["R001"] == 1
        assert rows["R002"] == 0

    def test_all_empty_sheets(self):
        result = _base_result(populated=())
        workbook = load_workbook(BytesIO(export_excel(result, "R")))
        for rule_id in ("R001", "R002"):
            sheet = workbook[rule_id]
            assert sheet.cell(8, 1).value == HINT
            assert sheet.cell(9, 1).value is None

    def test_numeric_sheet_order(self):
        result = _base_result(rule_ids=("R010", "R002", "R001"), populated=("R010",))
        workbook = load_workbook(BytesIO(export_excel(result, "R")))
        assert workbook.sheetnames.index("R001") < workbook.sheetnames.index("R002")
        assert workbook.sheetnames.index("R002") < workbook.sheetnames.index("R010")

    def test_rule_emptied_by_new_exceptions_only(self):
        result = _base_result(rule_ids=("R001",), populated=("R001",))
        result["validation"]["violations_by_rule"]["R001"][0]["exception_status"] = (
            "Commented"
        )
        filtered = filter_result_for_new_exceptions(result, True)
        workbook = load_workbook(BytesIO(export_excel(filtered, "R")))
        sheet = workbook["R001"]
        assert sheet.cell(8, 1).value == HINT
        assert sheet.cell(9, 1).value is None
        assert sheet["B6"].value == "CID_R001"
        summary = workbook["Rule Summary"]
        assert summary.cell(4, 1).value == "R001"
        assert summary.cell(4, 4).value == 0


class TestCsvHasNoPerRuleSections:
    def test_csv_flat_format_lists_only_real_violations(self):
        # CSV is a flat Section/Metric/Value log with no per-rule sections, so
        # there is nowhere to attach a per-rule hint without breaking the
        # flat contract. Empty rules simply contribute no Violation rows.
        mixed = export_csv(_base_result(), "R")
        assert "R001" in mixed
        assert HINT not in mixed
        empty = export_csv(_base_result(populated=()), "R")
        assert "\nViolation," not in empty
        assert HINT not in empty
