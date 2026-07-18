"""Backend contract validation tests.

Validates that Django serializer output conforms to the v1 contract schema
and examples. These tests ensure the backend produces the shapes documented
in docs/20260718_contract_api_final.md.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from rest_framework.test import APIClient  # type: ignore[import-untyped]

from tests.contracts import CONTRACT_VERSION

FIXTURES_DIR = Path(__file__).parent / "v1"


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def csv_a(tmp_path: Path) -> Path:
    p = tmp_path / "a.csv"
    p.write_text("id,name,status,score\n1,alice,active,10\n2,bob,inactive,20\n3,carol,active,30\n")
    return p


@pytest.fixture
def csv_b(tmp_path: Path) -> Path:
    p = tmp_path / "b.csv"
    p.write_text("id,name,status,score\n1,alice,active,15\n2,bob,active,25\n3,carol,active,30\n")
    return p


@pytest.fixture
def session(api_client: APIClient, csv_a: Path, csv_b: Path) -> dict:
    with open(csv_a, "rb") as fa, open(csv_b, "rb") as fb:
        resp = api_client.post(
            "/api/files/upload/",
            {"file_a": fa, "file_b": fb},
            format="multipart",
        )
    assert resp.status_code == 200
    return resp.json()


class TestContractVersion:
    def test_contract_version_is_1(self) -> None:
        assert CONTRACT_VERSION == 1

    def test_examples_file_exists(self) -> None:
        examples_path = FIXTURES_DIR / "examples.json"
        assert examples_path.exists(), f"Contract examples not found at {examples_path}"

    def test_schema_file_exists(self) -> None:
        schema_path = FIXTURES_DIR / "contract_schema.json"
        assert schema_path.exists(), f"Contract schema not found at {schema_path}"


class TestHealthContract:
    def test_health_matches_contract(self, api_client: APIClient) -> None:
        resp = api_client.get("/api/health/")
        assert resp.status_code == 200
        data = resp.json()
        assert data == {"status": "ok"}
        assert set(data.keys()) == {"status"}


class TestUploadContract:
    def test_upload_response_shape(self, session: dict) -> None:
        required = {"session_id", "file_a_name", "file_b_name", "inspection"}
        assert required.issubset(session.keys())
        assert not {"file_a_path", "file_b_path"}.intersection(session.keys())

        inspection = session["inspection"]
        assert {"columns_a", "columns_b", "common_columns", "only_in_a", "only_in_b"} == set(
            inspection.keys()
        )
        assert isinstance(inspection["common_columns"], list)


class TestInspectContract:
    def test_inspect_response_shape(self, api_client: APIClient, session: dict) -> None:
        resp = api_client.post(
            "/api/files/inspect/",
            {"session_id": session["session_id"]},
            format="json",
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "session_id" in data
        assert "inspection" in data
        assert set(data["inspection"].keys()) == {
            "columns_a", "columns_b", "common_columns", "only_in_a", "only_in_b"
        }


class TestFilterPrepareContract:
    def test_prepare_response_shape(self, api_client: APIClient, session: dict) -> None:
        resp = api_client.post(
            "/api/files/filters/prepare/",
            {
                "session_id": session["session_id"],
                "common_columns": session["inspection"]["common_columns"],
            },
            format="json",
        )
        assert resp.status_code == 200
        data = resp.json()
        required = {
            "session_id", "columns", "column_values",
            "total_rows_a", "total_rows_b", "requires_confirmation",
        }
        assert required.issubset(data.keys())
        assert isinstance(data["column_values"], dict)
        assert isinstance(data["requires_confirmation"], bool)


class TestFilterValidateContract:
    def test_validate_response_shape(self, api_client: APIClient, session: dict) -> None:
        common = session["inspection"]["common_columns"]
        if not common:
            pytest.skip("No common columns in test data")
        resp = api_client.post(
            "/api/files/filters/validate/",
            {
                "session_id": session["session_id"],
                "column": common[0],
                "operator": "eq",
                "filter_value": "test",
            },
            format="json",
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "valid" in data
        assert "errors" in data
        assert isinstance(data["valid"], bool)
        assert isinstance(data["errors"], list)


class TestTargetValidateContract:
    def test_validate_target_shape(self, api_client: APIClient, session: dict) -> None:
        resp = api_client.post(
            "/api/files/targets/validate/",
            {
                "session_id": session["session_id"],
                "target_columns": ["id"],
            },
            format="json",
        )
        assert resp.status_code == 200
        data = resp.json()
        required = {"session_id", "valid_columns", "invalid_columns", "all_common_columns"}
        assert required.issubset(data.keys())


class TestRulesContract:
    def test_rules_list_shape(self, api_client: APIClient) -> None:
        resp = api_client.get("/api/rules/")
        assert resp.status_code == 200
        data = resp.json()
        assert "version" in data
        assert "rules" in data
        assert isinstance(data["rules"], list)

    def test_rule_create_and_detail_shape(self, api_client: APIClient) -> None:
        resp = api_client.post(
            "/api/rules/",
            {
                "name": "Contract Test Rule",
                "logic": {
                    "format": "value_vs_column",
                    "column_name": "status",
                    "operator": "eq",
                    "target_value": "active",
                },
            },
            format="json",
        )
        assert resp.status_code == 201
        create_data = resp.json()
        assert "rule_id" in create_data
        assert "message" in create_data
        assert create_data["rule_id"].startswith("R")

        rule_id = create_data["rule_id"]
        resp = api_client.get(f"/api/rules/{rule_id}/")
        assert resp.status_code == 200
        detail = resp.json()
        assert detail["rule_id"] == rule_id
        assert "name" in detail
        assert "logic" in detail
        assert "conditions" in detail
        assert isinstance(detail["conditions"], list)

        resp = api_client.delete(f"/api/rules/{rule_id}/")
        assert resp.status_code == 200


class TestExecuteContract:
    def test_execute_response_shape(self, api_client: APIClient, session: dict) -> None:
        resp = api_client.post(
            "/api/runs/execute/",
            {
                "session_id": session["session_id"],
                "target_columns": None,
                "key_columns": ["id"],
                "filters": [],
                "rule_ids": [],
            },
            format="json",
        )
        assert resp.status_code == 200
        data = resp.json()
        assert {"run_id", "report_name", "created_at", "result"}.issubset(data.keys())

        result = data["result"]
        expected = {
            "comparison", "validation", "common_columns",
            "target_columns", "filters_applied",
        }
        assert expected.issubset(result.keys())
        # key_columns is included when provided in the request
        assert isinstance(result.get("key_columns", []), list)

        comparison = result["comparison"]
        expected = {
            "total_rows_a", "total_rows_b", "rows_with_changes",
            "total_attribute_changes", "row_details",
        }
        assert expected.issubset(comparison.keys())

        validation = result["validation"]
        assert {
            "total_violations",
            "distinct_violating_rows",
            "distinct_violating_attributes",
            "violations_by_rule",
            "violation_count_by_rule",
            "violating_rows_by_rule",
            "violating_attributes_by_rule",
        }.issubset(validation.keys())

    def test_execute_empty_rule_ids(self, api_client: APIClient, session: dict) -> None:
        resp = api_client.post(
            "/api/runs/execute/",
            {
                "session_id": session["session_id"],
                "target_columns": None,
                "key_columns": ["id"],
                "filters": [],
                "rule_ids": [],
            },
            format="json",
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["result"]["validation"]["total_violations"] == 0


class TestHistoryContract:
    def test_history_response_shape(self, api_client: APIClient) -> None:
        resp = api_client.get("/api/runs/")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        if data:
            item = data[0]
            assert {"run_id", "report_name", "created_at"}.issubset(item.keys())
            assert "file_path" not in item


class TestRenameContract:
    def test_rename_response_shape(self, api_client: APIClient, session: dict) -> None:
        exec_resp = api_client.post(
            "/api/runs/execute/",
            {
                "session_id": session["session_id"],
                "target_columns": None,
                "key_columns": ["id"],
                "filters": [],
                "rule_ids": [],
            },
            format="json",
        )
        run_id = exec_resp.json()["run_id"]

        resp = api_client.put(
            f"/api/runs/{run_id}/rename/",
            {"report_name": "Contract Test Report"},
            format="json",
        )
        assert resp.status_code == 200
        data = resp.json()
        assert {"run_id", "report_name", "created_at"}.issubset(data.keys())
        assert data["report_name"] == "Contract Test Report"


class TestErrorEnvelopeContract:
    def test_error_envelope_format(self, api_client: APIClient) -> None:
        resp = api_client.post(
            "/api/files/inspect/",
            {},
            format="json",
        )
        assert resp.status_code == 400
        data = resp.json()
        assert "error" in data
        assert isinstance(data["error"], str)
        assert len(data["error"]) > 0
        assert set(data.keys()) == {"error"}
