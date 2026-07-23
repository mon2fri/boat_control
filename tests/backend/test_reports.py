import pytest
from apps.reports.services import export_csv, export_html
from django.test import TestCase
from rest_framework.test import APIClient  # type: ignore[import-untyped]


@pytest.fixture
def sample_result() -> dict:
    return {
        "comparison": {
            "total_rows_a": 100,
            "total_rows_b": 100,
            "rows_with_changes": 5,
            "total_attribute_changes": 10,
            "row_details": [
                {
                    "row_index": 1,
                    "key_columns": {"id": "123"},
                    "attribute_changes": [
                        {"column": "score", "file_a_value": "10", "file_b_value": "15"}
                    ],
                    "change_count": 1,
                }
            ],
        },
        "validation": {
            "total_violations": 3,
            "distinct_violating_rows": 1,
            "distinct_violating_attributes": 1,
            "violations_by_rule": {
                "R001": [
                    {
                        "row_index": 5,
                        "rule_id": "R001",
                        "rule_name": "Test Rule",
                        "key_columns": {"id": "456"},
                        "details": "Violated R001",
                        "violating_column": "score",
                        "violating_value": "10",
                        "comparison_value": "15",
                        "rule_logic": "score lt '20'",
                    }
                ]
            },
            "violation_count_by_rule": {"R001": 3},
            "violating_rows_by_rule": {"R001": 1},
            "violating_attributes_by_rule": {"R001": 1},
            "rule_summaries": {
                "R001": {
                    "name": "Test Rule",
                    "logic": "score lt '20'",
                    "condition": "Condition 1: region equals 'EMEA'",
                    "condition_grouping": "Condition 1 AND Condition 2",
                },
                "R002": {"name": "No exception", "logic": "score eq '15'"},
            },
        },
        "target_columns": ["score"],
        "common_columns": ["id", "score", "region"],
        "key_columns": ["id"],
        "filters_applied": [],
    }


class TestExportHtml:
    def test_generates_valid_html(self, sample_result: dict) -> None:
        result = export_html(sample_result, "Test Report")
        assert "<!DOCTYPE html>" in result
        assert "Test Report" in result
        assert "100" in result
        assert "Overall result" in result
        assert "Rows with rule exception" in result
        assert "Attribute changes" in result
        assert "Exception Rule Summary" in result
        assert "Exception records" in result
        assert "Comparing columns" in result
        assert "<span class='tag'>score</span>" in result
        assert "In Baseline" in result
        assert "In Comparison" in result
        assert "Rationale" in result
        assert "R001 — Test Rule" in result
        assert "score less than &#x27;20&#x27;" in result
        assert "Condition 1: region equals &#x27;EMEA&#x27;" in result
        assert "Grouping:" in result
        assert "Expectation:" in result
        assert "R002 — No exception" in result
        assert "Nil exception detected under current rule." in result

        summary_position = result.index("Exception Rule Summary")
        changes_position = result.index("<h2>Attribute changes</h2>")
        comparing_position = result.index("Comparing columns")
        aggregation_position = result.find("Attribute change aggregation")
        assert summary_position < changes_position < comparing_position
        if aggregation_position != -1:
            assert comparing_position < aggregation_position

    def test_escapes_html_injection(self, sample_result: dict) -> None:
        xss = "<script>alert('xss')</script>"
        sample_result["comparison"]["row_details"][0]["key_columns"]["id"] = xss
        result = export_html(sample_result, "Test")
        assert "<script>" not in result
        assert "&lt;script&gt;" in result

    def test_exports_every_detail_row_without_viewport_truncation(
        self, sample_result: dict
    ) -> None:
        changes = sample_result["comparison"]["row_details"][0]["attribute_changes"]
        changes[:] = [
            {"column": f"score_{index}", "file_a_value": index, "file_b_value": index + 1}
            for index in range(15)
        ]
        result = export_html(sample_result, "Full table")
        assert result.count("<td>Values differ</td>") == 15

    def test_aggregation_cards_match_result_page_layout_and_start_collapsed(
        self, sample_result: dict
    ) -> None:
        sample_result["group_statistics"] = {
            "overall": [
                {
                    "column": f"group_{index}",
                    "unique_count": index + 1,
                    "attribute_count": 99,
                    "rows": [
                        {
                            "value": "Total",
                            "unique_count": index + 1,
                            "attribute_count": 99,
                        }
                    ],
                }
                for index in range(5)
            ],
            "attribute_changes": [],
            "validation_rules": {},
        }

        result = export_html(sample_result, "Aggregation layout")

        assert result.count("<details class='group-stats-card'>") == 5
        assert "<details open" not in result
        assert "group-stats-row--3" in result
        assert "group-stats-row--2" in result
        assert "Exception records: 1" in result
        assert "Unique Count" not in result
        assert "Attribute Count" not in result


class TestExportCsv:
    def test_generates_csv(self, sample_result: dict) -> None:
        result = export_csv(sample_result, "Test Report")
        assert "Section,Metric,Value" in result
        assert "100" in result

    def test_prevents_formula_injection(self, sample_result: dict) -> None:
        formula = "=SUM(A1:A10)"
        changes = sample_result["comparison"]["row_details"][0]["attribute_changes"]
        changes[0]["file_a_value"] = formula
        result = export_csv(sample_result, "Test")
        assert "'=SUM(A1:A10)" in result


class TestExportEndpoint(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_export_requires_post(self) -> None:
        response = self.client.get("/api/reports/export/")
        self.assertEqual(response.status_code, 405)

    def test_export_rejects_missing_data(self) -> None:
        response = self.client.post(
            "/api/reports/export/",
            {"format": "html"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
