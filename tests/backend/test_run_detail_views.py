"""Tests for the paginated run-detail view.

Covers the section-column filter (`columns=col1,col2`) so each named
comparison section's paginated table only shows its own rows.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from apps.runs.persistence import save_run
from apps.runs.services import (
    AttributeChange,
    ComparisonResult,
    ExecutionResult,
    RowComparison,
    ValidationResult,
)
from django.test import override_settings
from rest_framework.test import APIClient  # type: ignore[import-untyped]


@pytest.fixture
def mock_result_with_details() -> ExecutionResult:
    """Build an ExecutionResult with rows that change in different columns.

    Two rows, each with two attribute changes in different columns. A
    section pinned to one column must only see that row's change for that
    column.
    """
    row_a = RowComparison(
        row_index=0,
        key_columns={"id": "1"},
        attribute_changes=[
            AttributeChange(column="status", file_a_value="active", file_b_value="inactive"),
            AttributeChange(column="region", file_a_value="EMEA", file_b_value="APAC"),
        ],
        change_count=2,
        grouping_values={"status": "active", "region": "EMEA"},
    )
    row_b = RowComparison(
        row_index=1,
        key_columns={"id": "2"},
        attribute_changes=[
            AttributeChange(column="status", file_a_value="active", file_b_value="active"),
            AttributeChange(column="region", file_a_value="APAC", file_b_value="EMEA"),
        ],
        change_count=2,
        grouping_values={"status": "active", "region": "APAC"},
    )
    return ExecutionResult(
        comparison=ComparisonResult(
            total_rows_a=2,
            total_rows_b=2,
            matched_rows=2,
            rows_with_changes=2,
            total_attribute_changes=4,
            row_details=[row_a, row_b],
        ),
        validation=ValidationResult(
            total_violations=0,
            distinct_violating_rows=0,
            distinct_violating_attributes=0,
            violations_by_rule={},
            violation_count_by_rule={},
            violating_rows_by_rule={},
            violating_attributes_by_rule={},
        ),
        common_columns=["id", "status", "region"],
        target_columns=["status", "region"],
        key_columns=["id"],
        filters_applied=[],
    )


def _save_and_get_run_id(result: ExecutionResult, tmp_path: Path) -> str:
    with override_settings(RESULTS_DIR=str(tmp_path / "results")):
        meta = save_run(result, "a.csv", "b.csv")
    return meta.run_id


def test_section_columns_filter_restricts_paginated_details(
    mock_result_with_details: ExecutionResult, tmp_path: Path
) -> None:
    run_id = _save_and_get_run_id(mock_result_with_details, tmp_path)
    with override_settings(RESULTS_DIR=str(tmp_path / "results")):
        # Without a section filter, every row's change shows up.
        all_response = APIClient().get(f"/api/runs/{run_id}/details/?section=changes")
        assert all_response.status_code == 200
        all_payload = all_response.json()
        assert all_payload["total"] == 4

        # With a section filter pinned to `status`, only status changes are
        # returned — two rows each have one status change.
        status_response = APIClient().get(
            f"/api/runs/{run_id}/details/?section=changes&columns=status"
        )
        assert status_response.status_code == 200
        status_payload = status_response.json()
        assert status_payload["total"] == 2
        for detail in status_payload["details"]:
            assert detail["column"] == "status"

        # And pinned to `region` we only see region changes.
        region_response = APIClient().get(
            f"/api/runs/{run_id}/details/?section=changes&columns=region"
        )
        assert region_response.json()["total"] == 2
        for detail in region_response.json()["details"]:
            assert detail["column"] == "region"

        # The column facet is also restricted so the user cannot select
        # columns not in this section.
        assert set(status_response.json()["available_filters"]["column"]) == {"status"}
        assert set(region_response.json()["available_filters"]["column"]) == {"region"}


def test_section_columns_filter_with_comma_separated_list(
    mock_result_with_details: ExecutionResult, tmp_path: Path
) -> None:
    run_id = _save_and_get_run_id(mock_result_with_details, tmp_path)
    with override_settings(RESULTS_DIR=str(tmp_path / "results")):
        response = APIClient().get(
            f"/api/runs/{run_id}/details/?section=changes&columns=status,region"
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 4
        for detail in payload["details"]:
            assert detail["column"] in {"status", "region"}


def test_invalid_section_returns_400(
    mock_result_with_details: ExecutionResult, tmp_path: Path
) -> None:
    run_id = _save_and_get_run_id(mock_result_with_details, tmp_path)
    with override_settings(RESULTS_DIR=str(tmp_path / "results")):
        response = APIClient().get(f"/api/runs/{run_id}/details/?section=invalid")
        assert response.status_code == 400
