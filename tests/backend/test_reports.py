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
            "violations_by_rule": {
                "R001": [
                    {
                        "row_index": 5,
                        "rule_id": "R001",
                        "rule_name": "Test Rule",
                        "key_columns": {"id": "456"},
                        "details": "Violated R001",
                    }
                ]
            },
            "violation_count_by_rule": {"R001": 3},
        },
        "target_columns": ["score"],
    }


class TestExportHtml:
    def test_generates_valid_html(self, sample_result: dict) -> None:
        result = export_html(sample_result, "Test Report")
        assert "<!DOCTYPE html>" in result
        assert "Test Report" in result
        assert "100" in result

    def test_escapes_html_injection(self, sample_result: dict) -> None:
        xss = "<script>alert('xss')</script>"
        sample_result["comparison"]["row_details"][0]["key_columns"]["id"] = xss
        result = export_html(sample_result, "Test")
        assert "<script>" not in result
        assert "&lt;script&gt;" in result


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
