import json
from datetime import UTC, date, datetime
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
    NewBookRow,
    ValidationResult,
    ValidationViolation,
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
    def test_round_trips_bindings_and_violation_identifier(
        self, mock_result: ExecutionResult, tmp_path: Path
    ) -> None:
        from dataclasses import replace

        violation = ValidationViolation(
            row_index=1,
            rule_id="R001",
            rule_identifier="CBR1_00000000000000000000",
            rule_name="Status",
            key_columns={"id": "1"},
            details="bad",
            violating_column="status",
            violating_value="inactive",
            rule_logic="status equals 'active'",
        )
        validation = replace(
            mock_result.validation,
            total_violations=1,
            violations_by_rule={"R001": [violation]},
            violation_count_by_rule={"R001": 1},
            rule_summaries={
                "R001": {
                    "name": "Status",
                    "rule_identifier": "CBR1_00000000000000000000",
                }
            },
        )
        result = replace(
            mock_result,
            validation=validation,
            rule_bindings={"R001": "CBR1_00000000000000000000"},
        )
        with override_settings(RESULTS_DIR=str(tmp_path / "results")):
            meta = save_run(result, "a.csv", "b.csv")
            loaded = load_run(meta.run_id)

        assert loaded is not None
        stored = loaded["result"]
        assert stored["rule_bindings"] == {"R001": "CBR1_00000000000000000000"}
        assert stored["validation"]["violations_by_rule"]["R001"][0]["rule_identifier"] == (
            "CBR1_00000000000000000000"
        )

    def test_save_creates_file(self, mock_result: ExecutionResult) -> None:
        meta = save_run(mock_result, "a.csv", "b.csv")
        assert meta.run_id
        assert meta.report_name == "a_vs_b"

    def test_load_returns_data(self, mock_result: ExecutionResult) -> None:
        meta = save_run(mock_result, "a.csv", "b.csv")
        data = load_run(meta.run_id)
        assert data is not None
        assert data["run_id"] == meta.run_id

    def test_preserves_new_book_details(self, mock_result: ExecutionResult, tmp_path: Path) -> None:
        from dataclasses import replace

        with override_settings(RESULTS_DIR=str(tmp_path / "results")):
            result = replace(
                mock_result,
                comparison=replace(
                    mock_result.comparison,
                    new_book_count=1,
                    new_book_rows=[NewBookRow(row_index=7, key_columns={"id": "new-1"})],
                ),
            )
            meta = save_run(result, "a.csv", "b.csv")
            data = load_run(meta.run_id)
            assert data is not None
            comparison = data["result"]["comparison"]
            assert comparison["new_book_details"] == [
                {
                    "row_index": 7,
                    "key_columns": {"id": "new-1"},
                    "grouping_values": {},
                    "extra_values": {},
                },
            ]
            assert "new_book_rows" not in comparison

    def test_list_runs_returns_all(self, mock_result: ExecutionResult) -> None:
        save_run(mock_result, "a.csv", "b.csv")
        save_run(mock_result, "c.csv", "d.csv")
        runs = list_runs()
        assert len(runs) >= 2

    def test_persists_nested_aggregation_and_comparison_sections(
        self, mock_result: ExecutionResult, tmp_path: Path
    ) -> None:
        from dataclasses import replace

        results_dir = tmp_path / "results"
        with override_settings(RESULTS_DIR=str(results_dir)):
            result = replace(
                mock_result,
                nested_aggregation_enabled=True,
                aggregation_column_labels={"status": "In HR System"},
                comparison_sections=[
                    {"id": "s1", "name": "Region", "columns": ["region"]},
                ],
            )
            meta = save_run(result, "a.csv", "b.csv")
            data = load_run(meta.run_id)
            assert data is not None
            assert data["result"]["nested_aggregation_enabled"] is True
            assert data["result"]["aggregation_column_labels"] == {
                "status": "In HR System",
            }
            assert data["result"]["comparison_sections"] == [
                {"id": "s1", "name": "Region", "columns": ["region"]},
            ]

    def test_backward_compat_loads_old_document_without_new_fields(
        self, mock_result: ExecutionResult, tmp_path: Path
    ) -> None:
        import json

        results_dir = tmp_path / "results"
        with override_settings(RESULTS_DIR=str(results_dir)):
            meta = save_run(mock_result, "a.csv", "b.csv")
            # File is saved as {run_id}_{report_name}.json
            path = results_dir / f"{meta.run_id}_a_vs_b.json"
            with open(path) as f:
                doc = json.load(f)
            doc["result"].pop("nested_aggregation_enabled", None)
            doc["result"].pop("comparison_sections", None)
            doc["result"].pop("aggregation_column_labels", None)
            with open(path, "w") as f:
                json.dump(doc, f)

            data = load_run(meta.run_id)
            assert data is not None
            assert data["result"]["nested_aggregation_enabled"] is False
            assert data["result"]["comparison_sections"] == []
            assert data["result"]["aggregation_column_labels"] == {}
            assert data["result"]["rule_bindings"] == {}


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


class TestAsOfDatePersistence:
    def test_save_run_persists_as_of_date_and_utc_created_at(
        self, tmp_path: Path, mock_result: ExecutionResult
    ) -> None:
        created_at = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
        with override_settings(RESULTS_DIR=tmp_path / "results"):
            metadata = save_run(
                mock_result,
                "a.csv",
                "b.csv",
                as_of_date=date(2026, 10, 30),
                created_at=created_at,
            )
            loaded = load_run(metadata.run_id)

        assert metadata.as_of_date == "2026-10-30"
        assert metadata.created_at == "2026-10-30T12:00:00+00:00"
        assert loaded is not None
        assert loaded["as_of_date"] == "2026-10-30"
        assert loaded["created_at"] == "2026-10-30T12:00:00+00:00"

    def test_result_as_of_date_is_used_when_argument_is_omitted(
        self, tmp_path: Path, mock_result: ExecutionResult
    ) -> None:
        from dataclasses import replace

        result = replace(mock_result, as_of_date=date(2026, 9, 30))
        with override_settings(RESULTS_DIR=tmp_path / "results"):
            metadata = save_run(result, "a.csv", "b.csv")
            loaded = load_run(metadata.run_id)

        assert metadata.as_of_date == "2026-09-30"
        assert loaded is not None
        assert loaded["as_of_date"] == "2026-09-30"

    def test_runs_without_tracking_date_remain_readable(
        self, tmp_path: Path, mock_result: ExecutionResult
    ) -> None:
        with override_settings(RESULTS_DIR=tmp_path / "results"):
            metadata = save_run(mock_result, "a.csv", "b.csv")
            loaded = load_run(metadata.run_id)

        assert metadata.as_of_date is None
        assert loaded is not None
        assert loaded["as_of_date"] is None

    def test_rename_preserves_as_of_date(
        self, tmp_path: Path, mock_result: ExecutionResult
    ) -> None:
        with override_settings(RESULTS_DIR=tmp_path / "results"):
            metadata = save_run(
                mock_result,
                "a.csv",
                "b.csv",
                as_of_date=date(2026, 10, 30),
            )
            renamed = rename_run(metadata.run_id, "Renamed")
            listed = list_runs()

        assert renamed.as_of_date == "2026-10-30"
        assert listed[0].as_of_date == "2026-10-30"

    def test_legacy_index_and_document_without_date_load_as_null(
        self, tmp_path: Path, mock_result: ExecutionResult
    ) -> None:
        results_dir = tmp_path / "results"
        results_dir.mkdir()
        run_path = results_dir / "legacy_run.json"
        run_path.write_text(
            json.dumps(
                {
                    "run_id": "legacy",
                    "report_name": "legacy",
                    "file_a_name": "a.csv",
                    "file_b_name": "b.csv",
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "result": {},
                }
            )
        )
        (results_dir / "index.json").write_text(
            json.dumps(
                {
                    "runs": [
                        {
                            "run_id": "legacy",
                            "report_name": "legacy",
                            "file_a_name": "a.csv",
                            "file_b_name": "b.csv",
                            "created_at": "2026-01-01T00:00:00+00:00",
                            "file_path": str(run_path),
                        }
                    ]
                }
            )
        )

        with override_settings(RESULTS_DIR=results_dir):
            loaded = load_run("legacy")
            listed = list_runs()

        assert loaded is not None
        assert loaded["as_of_date"] is None
        assert listed[0].as_of_date is None

    def test_index_date_is_used_when_document_omits_it(
        self, tmp_path: Path, mock_result: ExecutionResult
    ) -> None:
        results_dir = tmp_path / "results"
        results_dir.mkdir()
        run_path = results_dir / "legacy_run.json"
        run_path.write_text(
            json.dumps(
                {
                    "run_id": "legacy",
                    "report_name": "legacy",
                    "file_a_name": "a.csv",
                    "file_b_name": "b.csv",
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "result": {},
                }
            )
        )
        (results_dir / "index.json").write_text(
            json.dumps(
                {
                    "runs": [
                        {
                            "run_id": "legacy",
                            "report_name": "legacy",
                            "file_a_name": "a.csv",
                            "file_b_name": "b.csv",
                            "created_at": "2026-01-01T00:00:00+00:00",
                            "file_path": str(run_path),
                            "as_of_date": "2026-10-30",
                        }
                    ]
                }
            )
        )

        with override_settings(RESULTS_DIR=results_dir):
            loaded = load_run("legacy")

        assert loaded is not None
        assert loaded["as_of_date"] == "2026-10-30"


class TestTemplateOptimizationPersistence:
    def test_save_run_persists_template_selection_and_display_scope(
        self, tmp_path: Path, mock_result: ExecutionResult
    ) -> None:
        from dataclasses import replace

        result = replace(
            mock_result,
            commentary_template_columns=["Region", "Score"],
            new_exceptions_only=False,
        )
        with override_settings(RESULTS_DIR=tmp_path / "results"):
            metadata = save_run(result, "a.csv", "b.csv")
            loaded = load_run(metadata.run_id)
            listed = list_runs()

        assert metadata.new_exceptions_only is False
        assert loaded is not None
        assert loaded["result"]["commentary_template_columns"] == ["Region", "Score"]
        assert loaded["result"]["new_exceptions_only"] is False
        assert listed[0].new_exceptions_only is False

    def test_rename_preserves_display_scope(
        self, tmp_path: Path, mock_result: ExecutionResult
    ) -> None:
        from dataclasses import replace

        result = replace(mock_result, new_exceptions_only=False)
        with override_settings(RESULTS_DIR=tmp_path / "results"):
            metadata = save_run(result, "a.csv", "b.csv")
            renamed = rename_run(metadata.run_id, "Renamed")

        assert renamed.new_exceptions_only is False

    def test_legacy_result_defaults_template_fields_and_checked_scope(
        self, tmp_path: Path
    ) -> None:
        results_dir = tmp_path / "results"
        results_dir.mkdir()
        run_path = results_dir / "legacy_run.json"
        run_path.write_text(
            json.dumps(
                {
                    "run_id": "legacy",
                    "report_name": "legacy",
                    "file_a_name": "a.csv",
                    "file_b_name": "b.csv",
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "result": {
                        "validation": {
                            "violations_by_rule": {
                                "R001": [
                                    {
                                        "row_index": 0,
                                        "rule_id": "R001",
                                        "rule_name": "Legacy",
                                        "key_columns": {"id": "1"},
                                        "details": "bad",
                                        "violating_column": "status",
                                        "violating_value": "inactive",
                                        "rule_logic": "status equals 'active'",
                                    }
                                ]
                            }
                        }
                    },
                }
            )
        )
        (results_dir / "index.json").write_text(
            json.dumps(
                {
                    "runs": [
                        {
                            "run_id": "legacy",
                            "report_name": "legacy",
                            "file_a_name": "a.csv",
                            "file_b_name": "b.csv",
                            "created_at": "2026-01-01T00:00:00+00:00",
                            "file_path": str(run_path),
                        }
                    ]
                }
            )
        )

        with override_settings(RESULTS_DIR=results_dir):
            loaded = load_run("legacy")
            listed = list_runs()

        assert loaded is not None
        assert loaded["result"]["commentary_template_columns"] == []
        assert loaded["result"]["new_exceptions_only"] is True
        violation = loaded["result"]["validation"]["violations_by_rule"]["R001"][0]
        assert violation["detail_values"] == {}
        assert violation["exception_id"] is None
        assert violation["exception_status"] is None
        assert listed[0].new_exceptions_only is True
