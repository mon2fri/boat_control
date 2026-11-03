"""Real-dependency integration boundary for run capture.

These tests are intentionally skipped while Worker A/B commits are absent from the
checkout. They are the final-verification guard: once the accepted storage and API
commits are integrated they must run without mocks and prove that a real execute
call writes real tracking rows and that the real results workbook resolves the
persisted run date.

Run after the reviewer integrates Worker A's `apps.exception_tracking.store` and
Worker B's API/workbook/settings commits.
"""

from __future__ import annotations

import io
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from apps.rules.services import Rule, RulesFile
from apps.runs.persistence import load_run, save_run
from apps.runs.services import ComparisonResult, ExecutionResult, ValidationResult
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test.utils import override_settings
from openpyxl import load_workbook
from rest_framework.test import APIClient  # type: ignore[import-untyped]

pytestmark = pytest.mark.django_db

pytest.importorskip("apps.exception_tracking.store")
pytest.importorskip("apps.exception_tracking.repository")
pytest.importorskip("apps.exception_tracking.workbook")
pytest.importorskip("apps.exception_tracking.views")

IDENTIFIER = "CBR1_00000000000000000000"


def _rule() -> Rule:
    from apps.rules.services import LogicClause

    return Rule(
        rule_id="R001",
        name="Status must be active",
        description="",
        conditions=[],
        condition_relation=None,
        grouping=None,
        grouping_tree=None,
        logic=LogicClause("value_vs_column", "status", "eq", "active"),
        rule_identifier=IDENTIFIER,
    )


def _empty_result() -> ExecutionResult:
    comparison = ComparisonResult(
        total_rows_a=0,
        total_rows_b=0,
        matched_rows=0,
        rows_with_changes=0,
        total_attribute_changes=0,
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
    return ExecutionResult(
        comparison=comparison,
        validation=validation,
        common_columns=["id"],
        target_columns=["id"],
        key_columns=["id"],
        filters_applied=[],
    )


def _upload(client: APIClient, date_text: str) -> str:
    file_a = SimpleUploadedFile(
        "a.csv", b"id,status\n1,active\n2,active\n", content_type="text/csv"
    )
    file_b = SimpleUploadedFile(
        "b.csv", b"id,status\n1,inactive\n2,active\n", content_type="text/csv"
    )
    response = client.post(
        "/api/files/upload/",
        {"file_a": file_a, "file_b": file_b, "as_of_date": date_text},
        format="multipart",
    )
    assert response.status_code == 200
    return str(response.json()["session_id"])


def _execute(client: APIClient, session_id: str, as_of_date: str) -> dict[str, Any]:
    response = client.post(
        "/api/runs/execute/",
        {
            "session_id": session_id,
            "comparison_columns": ["id", "status"],
            "target_columns": ["status"],
            "key_columns": ["id"],
            "rule_ids": ["R001"],
            "as_of_date": as_of_date,
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    return dict(response.json())


def test_real_capture_round_trip_and_results_workbook(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from apps.exception_tracking.repository import ExceptionTrackingRepository
    from apps.settings.services import get_exception_tracking_path

    monkeypatch.setattr(
        "apps.runs.services.load_rules",
        lambda: RulesFile(version=1, rules=[_rule()], next_index=2),
    )
    client = APIClient()
    with override_settings(
        UPLOADS_DIR=tmp_path / "uploads",
        RESULTS_DIR=tmp_path / "results",
    ):
        session_id = _upload(client, "2026-10-30")
        first = _execute(client, session_id, "2026-10-30")

        repository = ExceptionTrackingRepository(get_exception_tracking_path())
        records = repository.list_exceptions(date(2026, 10, 30))
        assert len(records) == 1
        assert records[0].exception_id == f"{IDENTIFIER}_1"
        assert records[0].exception_commentary == ""
        assert str(records[0].exception_first_seen_as_of_date) == "2026-10-30"

        repository.update_commentaries(date(2026, 10, 30), {records[0].exception_id: "Known"})
        second = _execute(client, session_id, "2026-10-30")
        assert second["run_id"] != first["run_id"]
        records = repository.list_exceptions(date(2026, 10, 30))
        assert records[0].exception_commentary == "Known"

        export = client.get(
            f"/api/exception-tracking/export/?run_id={second['run_id']}"
        )
        assert export.status_code == 200
        workbook = load_workbook(filename=io.BytesIO(export.content))
        values = [
            str(cell.value)
            for row in workbook["Exceptions"].iter_rows(min_row=2)
            for cell in row
        ]
        assert f"{IDENTIFIER}_1" in values
        assert "Known" in values

        loaded = load_run(second["run_id"])
        assert loaded is not None
        assert loaded["as_of_date"] == "2026-10-30"


def test_real_capture_second_date_is_not_commented_and_legacy_export_is_rejected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from apps.exception_tracking.repository import ExceptionTrackingRepository
    from apps.settings.services import get_exception_tracking_path

    monkeypatch.setattr(
        "apps.runs.services.load_rules",
        lambda: RulesFile(version=1, rules=[_rule()], next_index=2),
    )
    client = APIClient()
    with override_settings(
        UPLOADS_DIR=tmp_path / "uploads",
        RESULTS_DIR=tmp_path / "results",
    ):
        session_id = _upload(client, "2026-09-30")
        _execute(client, session_id, "2026-09-30")
        second = _execute(client, session_id, "2026-10-30")

        repository = ExceptionTrackingRepository(get_exception_tracking_path())
        records = repository.list_exceptions(date(2026, 10, 30))
        assert str(records[0].exception_first_seen_as_of_date) == "2026-09-30"
        assert str(records[0].exception_last_seen_as_of_date) == "2026-10-30"
        assert records[0].exception_commentary == ""

        legacy = save_run(_empty_result(), "a.csv", "b.csv")
        response = client.get(f"/api/exception-tracking/export/?run_id={legacy.run_id}")
        assert response.status_code == 400
        assert response.json()["code"] == "run_has_no_as_of_date"

        loaded = load_run(second["run_id"])
        assert loaded is not None
        assert loaded["as_of_date"] == "2026-10-30"
