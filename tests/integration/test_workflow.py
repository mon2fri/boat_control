from pathlib import Path

import pytest
from apps.runs.persistence import save_run
from apps.runs.services import (
    ComparisonResult,
    ExecutionResult,
    ValidationResult,
)
from django.conf import settings
from rest_framework.test import APIClient  # type: ignore[import-untyped]


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def csv_files(tmp_path: Path) -> tuple[Path, Path]:
    a = tmp_path / "file_a.csv"
    b = tmp_path / "file_b.csv"
    a.write_text("id,name,status,score\n1,alice,active,10\n2,bob,inactive,20\n")
    b.write_text("id,name,status,score\n1,alice,active,15\n2,bob,active,25\n")
    return a, b


class TestFullWorkflow:
    def test_upload_inspect_export_flow(
        self, api_client: APIClient, csv_files: tuple[Path, Path]
    ) -> None:
        a, b = csv_files

        with open(a, "rb") as fa, open(b, "rb") as fb:
            response = api_client.post(
                "/api/files/upload/",
                {"file_a": fa, "file_b": fb},
                format="multipart",
            )
        assert response.status_code == 200
        data = response.json()
        # Upload paths are deliberately not exposed to clients; all later
        # workflow calls use this opaque server-owned session identifier.
        assert isinstance(data["session_id"], str)
        assert data["session_id"]
        assert data["file_a_name"] == "file_a.csv"
        assert data["file_b_name"] == "file_b.csv"
        assert "inspection" in data
        assert len(data["inspection"]["common_columns"]) > 0

        response = api_client.post(
            "/api/files/inspect/",
            {"session_id": data["session_id"]},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["session_id"] == data["session_id"]


class TestRulesWorkflow:
    def test_crud_workflow(
        self, api_client: APIClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        isolated_rules = tmp_path / "rules.yaml"
        isolated_rules.write_text("version: 1\nnext_index: 1\nrules: []\n")
        monkeypatch.setattr(settings, "RULES_FILE", isolated_rules)
        response = api_client.post(
            "/api/rules/",
            {
                "name": "Integration Rule",
                "logic": {
                    "format": "value_vs_column",
                    "column_name": "status",
                    "operator": "eq",
                    "target_value": "active",
                },
            },
            format="json",
        )
        assert response.status_code == 201
        rule_id = response.json()["rule_id"]

        response = api_client.get("/api/rules/")
        assert response.status_code == 200
        rules = response.json()["rules"]
        assert any(r["rule_id"] == rule_id for r in rules)

        response = api_client.put(
            f"/api/rules/{rule_id}/",
            {
                "name": "Updated Rule",
                "logic": {
                    "format": "value_vs_column",
                    "column_name": "status",
                    "operator": "eq",
                    "target_value": "inactive",
                },
            },
            format="json",
        )
        assert response.status_code == 200

        response = api_client.delete(f"/api/rules/{rule_id}/")
        assert response.status_code == 200


class TestRunsWorkflow:
    def test_list_and_load(self, api_client: APIClient) -> None:
        comparison = ComparisonResult(
            total_rows_a=10,
            total_rows_b=10,
            matched_rows=8,
            rows_with_changes=2,
            total_attribute_changes=4,
            row_details=[],
        )
        validation = ValidationResult(
            total_violations=1,
            distinct_violating_rows=0,
            distinct_violating_attributes=0,
            violations_by_rule={},
            violation_count_by_rule={},
            violating_rows_by_rule={},
            violating_attributes_by_rule={},
        )
        result = ExecutionResult(
            comparison=comparison,
            validation=validation,
            common_columns=["id"],
            target_columns=["id"],
            key_columns=["id"],
            filters_applied=[],
        )
        meta = save_run(result, "test_a.csv", "test_b.csv")

        response = api_client.get("/api/runs/")
        assert response.status_code == 200
        runs = response.json()
        assert any(r["run_id"] == meta.run_id for r in runs)

        response = api_client.get(f"/api/runs/{meta.run_id}/")
        assert response.status_code == 200
        assert response.json()["run_id"] == meta.run_id

        response = api_client.put(
            f"/api/runs/{meta.run_id}/rename/",
            {"report_name": "New Name"},
            format="json",
        )
        assert response.status_code == 200


class TestExportWorkflow:
    def test_export_by_run_id(self, api_client: APIClient) -> None:
        comparison = ComparisonResult(
            total_rows_a=5,
            total_rows_b=5,
            matched_rows=5,
            rows_with_changes=1,
            total_attribute_changes=2,
            row_details=[],
        )
        validation = ValidationResult(
            total_violations=0,
            distinct_violating_rows=0,
            distinct_violating_attributes=0,
            violations_by_rule={},
            violation_count_by_rule={},
            violating_rows_by_rule={},
            violating_attributes_by_rule={},
        )
        result = ExecutionResult(
            comparison=comparison,
            validation=validation,
            common_columns=["id"],
            target_columns=["id"],
            key_columns=["id"],
            filters_applied=[],
        )
        meta = save_run(result, "a.csv", "b.csv")

        response = api_client.post(
            "/api/reports/export/",
            {"run_id": meta.run_id, "format": "html"},
            format="json",
        )
        assert response.status_code == 200
        assert "text/html" in response["Content-Type"]

        response = api_client.post(
            "/api/reports/export/",
            {"run_id": meta.run_id, "format": "csv"},
            format="json",
        )
        assert response.status_code == 200
        assert "text/csv" in response["Content-Type"]
