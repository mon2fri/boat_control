"""B/A integration boundary: real repository + B workbook/API services.

This file is skipped until the reviewer integrates Worker A's repository
commit. It is intentionally not a mock: it exercises the accepted storage
contract, cross-date history/status, commentary carry-forward, and rollback
behavior with the real SQLite implementation.
"""

from __future__ import annotations

import io
from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from apps.exception_tracking.api_services import (
    TrackingAPIError,
    export_commentary,
    import_commentary,
    list_exceptions,
)
from apps.exception_tracking.workbook import build_commentary_workbook
from openpyxl import load_workbook

try:
    from apps.exception_tracking import domain as domain_module
    from apps.exception_tracking import repository as repository_module

    _REPOSITORY_AVAILABLE = True
except ImportError:  # Worker A foundation is integrated separately
    domain_module = None  # type: ignore[assignment]
    repository_module = None  # type: ignore[assignment]
    _REPOSITORY_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not _REPOSITORY_AVAILABLE,
    reason="Worker A exception tracking repository is not integrated yet",
)

RULE_IDENTIFIER = "CBR1_00000000000000000000"
FIRST_DATE = date(2026, 9, 30)
SECOND_DATE = date(2026, 10, 30)


def _occurrence(
    *, commentary: str | None = None, timestamp: datetime | None = None
):  # type: ignore[no-untyped-def]
    return domain_module.ExceptionOccurrence(
        exception_rule_identifier=RULE_IDENTIFIER,
        key_columns={"id": "A", "region": "EMEA"},
        key_column_order=["id", "region"],
        exception_timestamp=timestamp or datetime(2026, 9, 30, 9, 0, tzinfo=UTC),
        exception_commentary=commentary,
    )


def test_real_store_round_trip_prefill_and_carry_forward(tmp_path: Path) -> None:
    repository = repository_module.ExceptionTrackingRepository(tmp_path / "tracking.db")
    repository.record_exceptions(FIRST_DATE, [_occurrence(commentary="Known upstream defect")])
    repository.record_exceptions(SECOND_DATE, [_occurrence()])

    first_records = list_exceptions(FIRST_DATE, repository)
    second_records = list_exceptions(SECOND_DATE, repository)
    assert first_records[0]["status"] == "Commented"
    assert first_records[0]["exception_first_seen_as_of_date"] == "2026-09-30"
    assert first_records[0]["exception_last_seen_as_of_date"] == "2026-10-30"
    assert second_records[0]["exception_commentary"] == "Known upstream defect"
    assert second_records[0]["status"] == "Commented"

    template = export_commentary(SECOND_DATE, repository)
    workbook = load_workbook(io.BytesIO(template))
    assert workbook["Template"]["B3"].value == "2026-10-30"
    assert workbook["Exceptions"]["E2"].value == "Known upstream defect"

    edited = build_commentary_workbook(
        [{**second_records[0], "exception_commentary": "Reviewed"}], SECOND_DATE
    )
    result = import_commentary(
        edited, requested_as_of_date="2026-10-30", repository=repository
    )
    assert result["updated"] == 1
    assert result["exceptions"][0]["exception_commentary"] == "Reviewed"
    assert result["exceptions"][0]["status"] == "Commented"


def test_real_store_blank_commentary_clears_selected_date_only(tmp_path: Path) -> None:
    repository = repository_module.ExceptionTrackingRepository(tmp_path / "tracking.db")
    repository.record_exceptions(FIRST_DATE, [_occurrence(commentary="Known")])
    repository.record_exceptions(SECOND_DATE, [_occurrence(commentary="Known")])
    second_records = list_exceptions(SECOND_DATE, repository)

    cleared = build_commentary_workbook(
        [{**second_records[0], "exception_commentary": ""}], SECOND_DATE
    )
    result = import_commentary(
        cleared, requested_as_of_date="2026-10-30", repository=repository
    )

    assert result["cleared"] == 1
    assert result["exceptions"][0]["status"] == "NotCommented"
    assert list_exceptions(FIRST_DATE, repository)[0]["exception_commentary"] == "Known"


def test_real_store_is_untouched_when_workbook_ids_do_not_match(tmp_path: Path) -> None:
    repository = repository_module.ExceptionTrackingRepository(tmp_path / "tracking.db")
    repository.record_exceptions(FIRST_DATE, [_occurrence(commentary="Original")])
    record = list_exceptions(FIRST_DATE, repository)[0]
    template = build_commentary_workbook(
        [{**record, "exception_id": "UNKNOWN_ID", "exception_commentary": "Changed"}],
        FIRST_DATE,
    )

    with pytest.raises(TrackingAPIError) as error:
        import_commentary(template, requested_as_of_date="2026-09-30", repository=repository)

    assert error.value.code == "unknown_exception_ids"
    assert list_exceptions(FIRST_DATE, repository)[0]["exception_commentary"] == "Original"
