from pathlib import Path

import pytest
from apps.runs.persistence import (
    _default_report_name,
    _sanitize_report_name,
    delete_run,
    list_runs,
    load_run,
    rename_run,
    save_run,
)
from apps.runs.services import (
    ComparisonResult,
    ExecutionResult,
    ValidationResult,
)
from django.test import TestCase
from django.test.utils import override_settings
from rest_framework.test import APIClient  # type: ignore[import-untyped]


@pytest.fixture
def mock_result() -> ExecutionResult:
    comparison = ComparisonResult(
        total_rows_a=100,
        total_rows_b=100,
        matched_rows=95,
        rows_with_changes=5,
        total_attribute_changes=10,
        row_details=[],
    )
    validation = ValidationResult(
        total_violations=3,
        distinct_violating_rows=2,
        distinct_violating_attributes=3,
        violations_by_rule={},
        violation_count_by_rule={},
        violating_rows_by_rule={},
        violating_attributes_by_rule={},
    )
    return ExecutionResult(
        comparison=comparison,
        validation=validation,
        common_columns=["id", "name"],
        target_columns=["name"],
        key_columns=["id"],
        filters_applied=[],
    )


class TestSanitizeReportName:
    def test_removes_dangerous_chars(self) -> None:
        result = _sanitize_report_name("../../../etc/passwd")
        assert ".." not in result
        assert "/" not in result

    def test_truncates_long_names(self) -> None:
        result = _sanitize_report_name("a" * 300)
        assert len(result) <= 200

    def test_empty_name_returns_default(self) -> None:
        result = _sanitize_report_name("")
        assert result == "unnamed_run"


class TestDefaultReportName:
    def test_combines_file_names(self) -> None:
        result = _default_report_name("file_a.csv", "file_b.csv")
        assert result == "file_a_vs_file_b"

    def test_handles_extensions(self) -> None:
        result = _default_report_name("data.v2.csv", "data.v3.csv")
        assert result == "data.v2_vs_data.v3"


class TestSaveAndLoadRun:
    def test_save_creates_file(self, mock_result: ExecutionResult) -> None:
        meta = save_run(mock_result, "a.csv", "b.csv")
        assert meta.run_id
        assert meta.report_name == "a_vs_b"

    def test_load_returns_data(self, mock_result: ExecutionResult) -> None:
        meta = save_run(mock_result, "a.csv", "b.csv")
        data = load_run(meta.run_id)
        assert data is not None
        assert data["run_id"] == meta.run_id

    def test_list_runs_returns_all(self, mock_result: ExecutionResult) -> None:
        save_run(mock_result, "a.csv", "b.csv")
        save_run(mock_result, "c.csv", "d.csv")
        runs = list_runs()
        assert len(runs) >= 2


class TestRenameRun:
    def test_rename_updates_name(self, mock_result: ExecutionResult) -> None:
        meta = save_run(mock_result, "a.csv", "b.csv")
        updated = rename_run(meta.run_id, "New Report Name")
        assert updated.report_name == "New Report Name"

    def test_rename_raises_on_missing(self) -> None:
        with pytest.raises(ValueError, match="not found"):
            rename_run("nonexistent", "New Name")


def test_shared_upload_is_removed_only_after_last_run_is_deleted(
    tmp_path: Path, mock_result: ExecutionResult
) -> None:
    uploads_dir = tmp_path / "uploads"
    results_dir = tmp_path / "results"
    uploads_dir.mkdir()
    shared_upload = uploads_dir / "shared.csv"
    shared_upload.write_text("id\n1\n")

    with override_settings(UPLOADS_DIR=uploads_dir, RESULTS_DIR=results_dir):
        first = save_run(
            mock_result,
            "a.csv",
            "b.csv",
            file_a_path=shared_upload,
            file_b_path=shared_upload,
        )
        second = save_run(
            mock_result,
            "a.csv",
            "b.csv",
            file_a_path=shared_upload,
            file_b_path=shared_upload,
        )
        first_document = load_run(first.run_id)
        second_document = load_run(second.run_id)
        assert first_document is not None
        assert second_document is not None
        assert first_document["upload_refs"] == ["shared.csv"]
        assert second_document["upload_refs"] == ["shared.csv"]

        delete_run(first.run_id)
        assert shared_upload.exists()

        delete_run(second.run_id)
        assert not shared_upload.exists()


def test_delete_run_endpoint_removes_history_entry(
    tmp_path: Path, mock_result: ExecutionResult
) -> None:
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        metadata = save_run(mock_result, "a.csv", "b.csv")
        response = APIClient().delete(f"/api/runs/{metadata.run_id}/")

    assert response.status_code == 200
    assert response.json() == {"run_id": metadata.run_id, "deleted": True}


class TestRunsListView(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_list_runs(self) -> None:
        response = self.client.get("/api/runs/")
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json(), list)
