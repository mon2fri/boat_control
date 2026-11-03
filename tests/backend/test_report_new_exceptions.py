from __future__ import annotations

import io
from datetime import date
from pathlib import Path

import pytest
from apps.runs.persistence import load_run, save_run
from apps.runs.services import (
    ComparisonResult,
    ExecutionResult,
    ValidationResult,
    ValidationViolation,
)
from django.test.utils import override_settings
from openpyxl import load_workbook
from rest_framework.test import APIClient  # type: ignore[import-untyped]

pytestmark = pytest.mark.django_db


def _violation(key: str, status: str | None) -> ValidationViolation:
    return ValidationViolation(
        row_index=0 if key == "NEWKEY" else 1,
        rule_id="R001",
        rule_name="Rule",
        key_columns={"id": key},
        details="bad",
        violating_column="status",
        violating_value="inactive",
        rule_logic="status equals 'active'",
        rule_identifier="CBR1_00000000000000000000",
        exception_id=f"EXC_{key}",
        exception_status=status,
    )


def _result(
    violations: list[ValidationViolation], *, new_exceptions_only: bool = True
) -> ExecutionResult:
    validation = ValidationResult(
        total_violations=len(violations),
        distinct_violating_rows=len(violations),
        distinct_violating_attributes=len(violations),
        violations_by_rule={"R001": violations},
        violation_count_by_rule={"R001": len(violations)},
        violating_rows_by_rule={"R001": len(violations)},
        violating_attributes_by_rule={"R001": len(violations)},
        rule_summaries={
            "R001": {
                "name": "Rule",
                "rule_identifier": "CBR1_00000000000000000000",
            }
        },
    )
    comparison = ComparisonResult(
        total_rows_a=2,
        total_rows_b=2,
        matched_rows=2,
        rows_with_changes=0,
        total_attribute_changes=0,
        row_details=[],
    )
    return ExecutionResult(
        comparison=comparison,
        validation=validation,
        common_columns=["id", "status"],
        target_columns=["status"],
        key_columns=["id"],
        filters_applied=[],
        new_exceptions_only=new_exceptions_only,
    )


def _save(tmp_path: Path, violations: list[ValidationViolation]) -> str:
    metadata = save_run(
        _result(violations),
        "a.csv",
        "b.csv",
        as_of_date=date(2026, 10, 30),
    )
    return metadata.run_id


def _post_export(run_id: str, fmt: str, **extra: object) -> object:
    return APIClient().post(
        "/api/reports/export/",
        {"run_id": run_id, "format": fmt, **extra},
        format="json",
    )


def test_html_export_defaults_to_new_and_not_commented_only(tmp_path: Path) -> None:
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        run_id = _save(
            tmp_path,
            [_violation("NEWKEY", "New"), _violation("OLDKEY", "Commented")],
        )
        response = _post_export(run_id, "html")

    assert response.status_code == 200
    body = response.content.decode()
    assert "NEWKEY" in body
    assert "OLDKEY" not in body
    assert "Exception Table (1 rows)" in body


def test_excel_export_can_include_all_exceptions_when_unchecked(tmp_path: Path) -> None:
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        run_id = _save(
            tmp_path,
            [_violation("NEWKEY", "New"), _violation("OLDKEY", "Commented")],
        )
        response = _post_export(run_id, "excel", new_exceptions_only=False)

    assert response.status_code == 200
    workbook = load_workbook(filename=io.BytesIO(response.content))
    values = [
        str(cell.value)
        for row in workbook["Exception Table"].iter_rows(min_row=4)
        for cell in row
        if cell.value is not None
    ]
    assert "NEWKEY" in values
    assert "OLDKEY" in values


def test_excel_export_defaults_to_filtered_scope(tmp_path: Path) -> None:
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        run_id = _save(
            tmp_path,
            [_violation("NEWKEY", "New"), _violation("OLDKEY", "Commented")],
        )
        response = _post_export(run_id, "excel")

    workbook = load_workbook(filename=io.BytesIO(response.content))
    values = [
        str(cell.value)
        for row in workbook["Exception Table"].iter_rows(min_row=4)
        for cell in row
        if cell.value is not None
    ]
    assert "NEWKEY" in values
    assert "OLDKEY" not in values


def test_saved_run_still_contains_all_exceptions(tmp_path: Path) -> None:
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        run_id = _save(
            tmp_path,
            [_violation("NEWKEY", "New"), _violation("OLDKEY", "Commented")],
        )
        stored = load_run(run_id)

    assert stored is not None
    assert len(stored["result"]["validation"]["violations_by_rule"]["R001"]) == 2


def test_all_commented_export_is_an_empty_but_valid_report(tmp_path: Path) -> None:
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        run_id = _save(
            tmp_path,
            [_violation("OLDKEY", "Commented"), _violation("OLDERKEY", "Commented")],
        )
        response = _post_export(run_id, "html")

    assert response.status_code == 200
    body = response.content.decode()
    assert "Exception Table (0 rows)" in body
    assert "OLDKEY" not in body
