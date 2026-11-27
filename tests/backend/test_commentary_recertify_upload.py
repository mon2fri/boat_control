"""Round-2 commentary-recertify template + upload evidence (Worker D).

Covers the Round-2 requirements against the REAL SQLite repository in
isolated ``tmp_path`` stores (never live data):

- Downloaded templates (BOTH run-scoped and date-scoped downloads, reached
  through the single export endpoint used by the result page and the
  tracking page): new column set with no visible provenance columns,
  ``Exception Status`` present, ``Commentary Recertify`` default blank with
  a ``Keep Current``/``Updated`` dropdown; legacy templates still import;
  extra columns and formula protection intact; membership unchanged.
- Authoritative upload matrix decided from CURRENT database state:
  pending x {Keep Current, Updated+empty, Updated+nonempty, Blank} x
  {DB nonempty, DB empty}; ordinary Commented x {nonempty, empty,
  whitespace-only} including stale templates; invalid dropdown values
  rejected with row-specific errors and atomicity; retries; unrelated rows
  preserved; whitespace trimming; no ID normalization.
- Explicit contrast: pending Updated+empty clears, while ordinary
  Commented+empty preserves.
- End-to-end through the real HTTP views: capture -> export -> upload ->
  list/export, plus the single-``RecertificationRequired`` status wire
  shape and first-seen behavior for genuinely new IDs.

Only ``backend/apps/exception_tracking/**`` (plus runs template-column
reservation) is exercised; no frontend or worker-owned files are touched.
"""

from __future__ import annotations

import io
import sqlite3
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import pytest
from apps.exception_tracking import api_services
from apps.exception_tracking.domain import CommentaryUploadDecision, ExceptionOccurrence
from apps.exception_tracking.identity import quote_identifier, table_name_for_date
from apps.exception_tracking.lineage import InMemoryLineageResolver
from apps.exception_tracking.repository import ExceptionTrackingRepository
from apps.exception_tracking.workbook import (
    RECERTIFY_COLUMN,
    STANDARD_EXCEPTION_HEADERS,
    build_commentary_workbook,
)
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import load_workbook
from rest_framework.test import APIClient

V1 = "CBR1_" + "A" * 20
V2 = "CBR1_" + "B" * 20
V3 = "CBR1_" + "C" * 20

SEPT_30 = date(2026, 9, 30)
OCT_30 = date(2026, 10, 30)

EVENT = "event-oct15-revision"


def _occurrence(
    rule: str,
    day: date,
    *,
    commentary: str | None = None,
    book: str = "xxxx",
) -> ExceptionOccurrence:
    return ExceptionOccurrence(
        exception_rule_identifier=rule,
        key_columns={"book": book},
        key_column_order=["book"],
        exception_timestamp=datetime(day.year, day.month, day.day, 8, 0, tzinfo=UTC),
        exception_commentary=commentary,
        exception_rule_index="R001",
    )


@pytest.fixture
def resolver() -> InMemoryLineageResolver:
    return InMemoryLineageResolver(
        [
            {
                "event_id": EVENT,
                "lineage_id": "lineage-1",
                "revision_number": 2,
                "source_identifier": V1,
                "target_identifier": V2,
                "relationship": "revision",
                "change_type": "executable_revision",
                "save_decision": "modify_current",
                "commentary_policy": "carry_forward_recertification",
            }
        ]
    )


@pytest.fixture
def repo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> ExceptionTrackingRepository:
    repository = ExceptionTrackingRepository(tmp_path / "tracking.db")
    monkeypatch.setattr(api_services, "get_repository", lambda: repository)
    return repository


def _pending_id() -> str:
    return f"{V2}_xxxx"


def _seed_pending_text(
    repo: ExceptionTrackingRepository,
    resolver: InMemoryLineageResolver,
    october_text: str,
) -> str:
    """Seed a pending OCT_30 row whose CURRENT database text is ``october_text``.

    The carry path always inherits the September note, so the October text
    is then adjusted to the target state with a direct row write (setup
    only; the flag is preserved). Returns the exception ID.
    """

    repo.record_exceptions(
        SEPT_30, [_occurrence(V1, SEPT_30, commentary="September review note")]
    )
    repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    target_id = _pending_id()
    row = repo.get_exception(OCT_30, target_id)
    assert row is not None and row.status == "RecertificationRequired"
    if row.exception_commentary != october_text:
        connection = sqlite3.connect(str(repo.database_path))
        try:
            connection.execute(
                f"UPDATE {quote_identifier(table_name_for_date(OCT_30))} "
                "SET exception_commentary = ? WHERE exception_id = ?",
                (october_text, target_id),
            )
            connection.commit()
        finally:
            connection.close()
    return target_id


def _upload(content: bytes, name: str = "template.xlsx") -> SimpleUploadedFile:
    return SimpleUploadedFile(
        name,
        content,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def _with_cells(
    content: bytes, choices: dict[str, tuple[str | None, str | None]]
) -> bytes:
    """Rewrite Commentary/Commentary Recertify cells per exception ID.

    ``None`` leaves that cell untouched, bypassing the Excel dropdown the
    same way a hostile spreadsheet would.
    """

    workbook = load_workbook(io.BytesIO(content))
    sheet = workbook["Exceptions"]
    headers = [cell.value for cell in sheet[1]]
    id_column = headers.index("Exception ID") + 1
    commentary_column = headers.index("Commentary") + 1
    recertify_column = headers.index(RECERTIFY_COLUMN) + 1
    for row in range(2, sheet.max_row + 1):
        exception_id = sheet.cell(row, id_column).value
        if exception_id in choices:
            commentary, action = choices[exception_id]
            if commentary is not None:
                sheet.cell(row, commentary_column).value = commentary
            if action is not None:
                sheet.cell(row, recertify_column).value = action
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _export(as_of: date) -> bytes:
    response = APIClient().get(f"/api/exception-tracking/export/?as_of_date={as_of.isoformat()}")
    assert response.status_code == 200
    assert isinstance(response.content, bytes)
    return response.content


def _import(content: bytes, as_of: date) -> Any:
    return APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(content), "as_of_date": as_of.isoformat()},
        format="multipart",
    )


def _row(repo: ExceptionTrackingRepository, exception_id: str) -> Any:
    row = repo.get_exception(OCT_30, exception_id)
    assert row is not None
    return row


# ---------------------------------------------------------------- templates


def test_date_export_layout_has_no_provenance_columns(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    _seed_pending_text(repo, resolver, "September review note")
    sheet = load_workbook(io.BytesIO(_export(OCT_30)))["Exceptions"]
    headers = [cell.value for cell in sheet[1]]

    assert headers == list(STANDARD_EXCEPTION_HEADERS)
    assert "Exception Status" in headers
    assert RECERTIFY_COLUMN in headers
    for removed in (
        "Recertification Reason",
        "Carried From Exception ID",
        "Carried From As-of Date",
        "Carried From Rule Identifier",
        "Rule Evolution Event ID",
        "Recertified At",
    ):
        assert removed not in headers
    # Pending review shows through Exception Status; the choice is blank.
    assert sheet.cell(2, headers.index("Exception Status") + 1).value == (
        "RecertificationRequired"
    )
    assert sheet.cell(2, headers.index(RECERTIFY_COLUMN) + 1).value in (None, "")
    assert sheet.cell(2, 3).value == "September review note"

    validations = list(sheet.data_validations.dataValidation)
    assert len(validations) == 1
    assert validations[0].type == "list"
    assert validations[0].formula1 == '"Keep Current,Updated"'
    assert validations[0].allow_blank is True


def test_run_export_layout_matches_date_export_with_run_membership(
    repo: ExceptionTrackingRepository,
    resolver: InMemoryLineageResolver,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _seed_pending_text(repo, resolver, "September review note")
    repo.record_exceptions(
        OCT_30, [_occurrence(V3, OCT_30, commentary="other")],
        lineage_resolver=resolver,
    )
    other_id = f"{V3}_xxxx"
    monkeypatch.setattr(
        "apps.runs.persistence.load_run",
        lambda run_id: {
            "run_id": run_id,
            "as_of_date": OCT_30.isoformat(),
            "created_at": "2026-10-30T10:00:00+00:00",
            "result": {
                "validation": {
                    "violations_by_rule": {"R001": [{"exception_id": _pending_id()}]},
                    "rule_summaries": {},
                }
            },
        },
    )

    run_response = APIClient().get("/api/exception-tracking/export/?run_id=run-1")
    assert run_response.status_code == 200
    run_sheet = load_workbook(io.BytesIO(run_response.content))["Exceptions"]
    date_sheet = load_workbook(io.BytesIO(_export(OCT_30)))["Exceptions"]

    assert [cell.value for cell in run_sheet[1]] == [
        cell.value for cell in date_sheet[1]
    ]
    assert [cell.value for cell in run_sheet[1]] == list(STANDARD_EXCEPTION_HEADERS)
    run_ids = [run_sheet.cell(row, 1).value for row in range(2, run_sheet.max_row + 1)]
    assert run_ids == [_pending_id()]
    assert other_id not in run_ids


def test_legacy_v1_template_still_imports(
    repo: ExceptionTrackingRepository,
) -> None:
    from openpyxl import Workbook

    repo.record_exceptions(OCT_30, [_occurrence(V3, OCT_30, commentary="stored")])
    target_id = f"{V3}_xxxx"

    workbook = Workbook()
    template = workbook.active
    template.title = "Template"
    template["B2"] = "exception_commentary/v1"
    template["B3"] = OCT_30.isoformat()
    sheet = workbook.create_sheet("Exceptions")
    sheet.append(
        [
            "Exception ID",
            "Exception Rule Identifier",
            "Key Columns",
            "Exception Timestamp",
            "Exception Commentary",
            "Exception As-of Date",
            "Exception First Seen As-of Date",
            "Exception Last Seen As-of Date",
            "Status",
        ]
    )
    sheet.append(
        [
            target_id,
            V3,
            '{"book":"xxxx"}',
            "2026-10-30T08:00:00+00:00",
            "legacy edit",
            OCT_30.isoformat(),
            OCT_30.isoformat(),
            OCT_30.isoformat(),
            "Commented",
        ]
    )
    buffer = io.BytesIO()
    workbook.save(buffer)

    response = _import(buffer.getvalue(), OCT_30)
    assert response.status_code == 200
    assert response.json()["updated"] == 1
    assert _row(repo, target_id).exception_commentary == "legacy edit"


def test_extra_columns_and_formula_protection_intact(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    target_id = _seed_pending_text(repo, resolver, "September review note")
    repo.record_exceptions(
        OCT_30,
        [
            ExceptionOccurrence(
                exception_rule_identifier=V3,
                key_columns={"book": "yyyy"},
                key_column_order=["book"],
                exception_timestamp=datetime(2026, 10, 30, 8, 0, tzinfo=UTC),
                exception_commentary="plain",
                exception_rule_index="R001",
                exception_extra_values={"Region": "=HYPERLINK(1,2)"},
            )
        ],
        extra_columns=["Region"],
        lineage_resolver=resolver,
    )

    sheet = load_workbook(io.BytesIO(_export(OCT_30)))["Exceptions"]
    headers = [cell.value for cell in sheet[1]]
    assert headers == [*STANDARD_EXCEPTION_HEADERS, "Region"]
    region_column = headers.index("Region") + 1
    other_row = 3 if sheet.cell(2, 1).value == target_id else 2
    assert sheet.cell(other_row, region_column).value == "'=HYPERLINK(1,2)"

    bad = _with_cells(
        _export(OCT_30), {f"{V3}_yyyy": ("=SUM(A1:A2)", None)}
    )
    response = _import(bad, OCT_30)
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_commentary"
    assert _row(repo, f"{V3}_yyyy").exception_commentary == "plain"


# ------------------------------------------------------- pending upload matrix


@pytest.mark.parametrize(
    ("db_text", "action", "supplied", "expected_text", "expected_status", "counter"),
    [
        # Keep Current always reads the current DB value and clears pending.
        ("September review note", "Keep Current", "September review note",
         "September review note", "Commented", "unchanged"),
        ("September review note", "Keep Current", "edited in sheet",
         "September review note", "Commented", "unchanged"),
        ("September review note", "Keep Current", "",
         "September review note", "Commented", "unchanged"),
        ("", "Keep Current", "", "", "NotCommented", "unchanged"),
        ("", "Keep Current", "edited in sheet", "", "NotCommented", "unchanged"),
        # Updated stores the supplied text (empty clears deliberately).
        ("September review note", "Updated", "accepted text",
         "accepted text", "Commented", "updated"),
        ("September review note", "Updated", "September review note",
         "September review note", "Commented", "unchanged"),
        ("September review note", "Updated", "", "", "NotCommented", "cleared"),
        ("", "Updated", "new text", "new text", "Commented", "updated"),
        ("", "Updated", "", "", "NotCommented", "unchanged"),
        # Blank preserves text, status, and the pending mark.
        ("September review note", None, "September review note",
         "September review note", "RecertificationRequired", "unchanged"),
        ("September review note", None, "edited in sheet",
         "September review note", "RecertificationRequired", "unchanged"),
        ("September review note", None, "",
         "September review note", "RecertificationRequired", "unchanged"),
        ("", None, "", "", "RecertificationRequired", "unchanged"),
    ],
)
def test_pending_upload_matrix(
    repo: ExceptionTrackingRepository,
    resolver: InMemoryLineageResolver,
    db_text: str,
    action: str | None,
    supplied: str,
    expected_text: str,
    expected_status: str,
    counter: str,
) -> None:
    target_id = _seed_pending_text(repo, resolver, db_text)
    content = _with_cells(_export(OCT_30), {target_id: (supplied, action)})

    response = _import(content, OCT_30)

    assert response.status_code == 200
    payload = response.json()
    assert payload[counter] == 1, payload
    stored = _row(repo, target_id)
    assert stored.exception_commentary == expected_text
    assert stored.status == expected_status
    if action in ("Keep Current", "Updated"):
        assert stored.status != "RecertificationRequired"
        assert stored.recertified_at is not None
        # Provenance and audit history stay in the database even though the
        # template no longer shows them.
        assert stored.carried_from_exception_id == f"{V1}_xxxx"
        assert stored.rule_evolution_event_id == EVENT
    else:
        assert stored.recertified_at is None


def test_keep_current_reads_current_db_value_not_exported_text(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    target_id = _seed_pending_text(repo, resolver, "September review note")
    exported = _export(OCT_30)
    # The database changes after the template was downloaded.
    repo.record_exceptions(
        OCT_30,
        [_occurrence(V2, OCT_30, commentary="changed after export")],
        lineage_resolver=resolver,
    )
    assert _row(repo, target_id).exception_commentary == "changed after export"

    content = _with_cells(exported, {target_id: (None, "Keep Current")})
    response = _import(content, OCT_30)

    assert response.status_code == 200
    stored = _row(repo, target_id)
    assert stored.exception_commentary == "changed after export"
    assert stored.status == "Commented"


# ------------------------------------------------------ ordinary upload rules


@pytest.mark.parametrize(
    ("db_text", "supplied", "expected_text", "expected_status", "counter"),
    [
        ("stored", "new value", "new value", "Commented", "updated"),
        ("stored", "stored", "stored", "Commented", "unchanged"),
        ("stored", "", "stored", "Commented", "unchanged"),
        ("stored", "   ", "stored", "Commented", "unchanged"),
        ("  padded  ", "  padded  ", "padded", "Commented", "updated"),
    ],
)
def test_ordinary_commented_upload_rules(
    repo: ExceptionTrackingRepository,
    resolver: InMemoryLineageResolver,
    db_text: str,
    supplied: str,
    expected_text: str,
    expected_status: str,
    counter: str,
) -> None:
    repo.record_exceptions(
        OCT_30, [_occurrence(V3, OCT_30, commentary=db_text)],
        lineage_resolver=resolver,
    )
    target_id = f"{V3}_xxxx"
    content = _with_cells(_export(OCT_30), {target_id: (supplied, None)})

    response = _import(content, OCT_30)

    assert response.status_code == 200
    assert response.json()[counter] == 1
    stored = _row(repo, target_id)
    assert stored.exception_commentary == expected_text
    assert stored.status == expected_status


def test_stale_template_accepts_nonempty_but_preserves_on_empty(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    repo.record_exceptions(
        OCT_30, [_occurrence(V3, OCT_30, commentary="original")],
        lineage_resolver=resolver,
    )
    target_id = f"{V3}_xxxx"
    exported = _export(OCT_30)
    repo.record_exceptions(
        OCT_30, [_occurrence(V3, OCT_30, commentary="changed after export")],
        lineage_resolver=resolver,
    )

    stale_full = _with_cells(exported, {target_id: ("stale input", None)})
    assert _import(stale_full, OCT_30).status_code == 200
    assert _row(repo, target_id).exception_commentary == "stale input"

    stale_empty = _with_cells(exported, {target_id: ("", None)})
    response = _import(stale_empty, OCT_30)
    assert response.status_code == 200
    assert response.json()["unchanged"] == 1
    assert _row(repo, target_id).exception_commentary == "stale input"


def test_not_commented_upload_rules(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    repo.record_exceptions(SEPT_30, [_occurrence(V3, SEPT_30, commentary=None)],
                           lineage_resolver=resolver)
    repo.record_exceptions(OCT_30, [_occurrence(V3, OCT_30, commentary=None)],
                           lineage_resolver=resolver)
    target_id = f"{V3}_xxxx"
    assert _row(repo, target_id).status == "NotCommented"

    full = _with_cells(_export(OCT_30), {target_id: ("late note", None)})
    assert _import(full, OCT_30).status_code == 200
    stored = _row(repo, target_id)
    assert (stored.exception_commentary, stored.status) == ("late note", "Commented")

    repo.record_exceptions(SEPT_30, [_occurrence(V3, SEPT_30, commentary=None)],
                           lineage_resolver=resolver)
    empty = _with_cells(_export(OCT_30), {target_id: ("", None)})
    response = _import(empty, OCT_30)
    assert response.status_code == 200
    assert _row(repo, target_id).exception_commentary == "late note"


def test_genuinely_new_id_stays_new_and_upload_follows_nonpending_rules(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    # No predecessor occurrence exists anywhere: the row is genuinely new
    # (first-seen backfill must not invent history for it).
    repo.record_exceptions(OCT_30, [_occurrence(V3, OCT_30, commentary=None)],
                           lineage_resolver=resolver)
    target_id = f"{V3}_xxxx"
    stored = _row(repo, target_id)
    assert stored.status == "New"

    empty = _with_cells(_export(OCT_30), {target_id: ("", None)})
    assert _import(empty, OCT_30).status_code == 200
    assert _row(repo, target_id).status == "New"

    full = _with_cells(_export(OCT_30), {target_id: ("first note", None)})
    assert _import(full, OCT_30).status_code == 200
    stored = _row(repo, target_id)
    assert (stored.exception_commentary, stored.status) == ("first note", "Commented")


def test_pending_updated_empty_clears_while_ordinary_empty_preserves(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    pending_id = _seed_pending_text(repo, resolver, "September review note")
    repo.record_exceptions(
        OCT_30, [_occurrence(V3, OCT_30, commentary="accepted")],
        lineage_resolver=resolver,
    )
    ordinary_id = f"{V3}_xxxx"
    content = _with_cells(
        _export(OCT_30),
        {pending_id: ("", "Updated"), ordinary_id: ("", None)},
    )

    response = _import(content, OCT_30)
    assert response.status_code == 200
    assert response.json()["cleared"] == 1
    assert response.json()["unchanged"] == 1

    pending = _row(repo, pending_id)
    assert pending.exception_commentary == ""
    assert pending.status == "NotCommented"
    ordinary = _row(repo, ordinary_id)
    assert ordinary.exception_commentary == "accepted"
    assert ordinary.status == "Commented"


# ------------------------------------------------- validation before any write


def test_invalid_recertify_values_rejected_atomically(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    first_id = _seed_pending_text(repo, resolver, "September review note")
    repo.record_exceptions(
        OCT_30, [_occurrence(V3, OCT_30, commentary="accepted")],
        lineage_resolver=resolver,
    )
    second_id = f"{V3}_xxxx"
    content = _with_cells(
        _export(OCT_30),
        {first_id: ("September review note", "Keep Current"), second_id: ("x", "Approve")},
    )

    response = _import(content, OCT_30)

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "invalid_recertification_selection"
    assert body["details"]["invalid_rows"] == [
        {"row": 3, "exception_id": second_id, "value": "Approve"}
    ]
    # Atomic: nothing was written, including the valid Keep Current row.
    assert _row(repo, first_id).status == "RecertificationRequired"
    assert _row(repo, second_id).exception_commentary == "accepted"


def test_case_variants_of_choices_are_invalid(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    target_id = _seed_pending_text(repo, resolver, "September review note")
    content = _with_cells(_export(OCT_30), {target_id: (None, "keep current")})

    response = _import(content, OCT_30)

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_recertification_selection"
    assert _row(repo, target_id).status == "RecertificationRequired"


def test_valid_choice_on_nonpending_row_does_not_override_ordinary_rules(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    repo.record_exceptions(
        OCT_30, [_occurrence(V3, OCT_30, commentary="accepted")],
        lineage_resolver=resolver,
    )
    target_id = f"{V3}_xxxx"

    keep_blank = _with_cells(_export(OCT_30), {target_id: ("", "Keep Current")})
    assert _import(keep_blank, OCT_30).status_code == 200
    assert _row(repo, target_id).exception_commentary == "accepted"

    updated_blank = _with_cells(_export(OCT_30), {target_id: ("", "Updated")})
    assert _import(updated_blank, OCT_30).status_code == 200
    assert _row(repo, target_id).exception_commentary == "accepted"


def test_exception_ids_are_not_normalized(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    target_id = _seed_pending_text(repo, resolver, "September review note")
    exported = _export(OCT_30)
    workbook = load_workbook(io.BytesIO(exported))
    # Same letters, different case: without normalization this is an unknown ID.
    workbook["Exceptions"]["A2"] = target_id.lower()
    buffer = io.BytesIO()
    workbook.save(buffer)

    response = _import(buffer.getvalue(), OCT_30)

    assert response.status_code == 400
    assert response.json()["code"] == "unknown_exception_ids"
    assert _row(repo, target_id).status == "RecertificationRequired"


def test_whitespace_only_is_empty_but_internal_whitespace_survives(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    pending_id = _seed_pending_text(repo, resolver, "September review note")
    content = _with_cells(
        _export(OCT_30), {pending_id: ("  hello   world\nsecond line  ", "Updated")}
    )

    assert _import(content, OCT_30).status_code == 200
    assert _row(repo, pending_id).exception_commentary == "hello   world\nsecond line"


def test_retry_after_acceptance_is_a_no_op(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    target_id = _seed_pending_text(repo, resolver, "September review note")
    first = _with_cells(_export(OCT_30), {target_id: (None, "Keep Current")})
    assert _import(first, OCT_30).status_code == 200

    # Repeating the same template: the row is no longer pending, the valid
    # choice is ignored, and identical text is unchanged.
    second = _with_cells(_export(OCT_30), {target_id: (None, "Keep Current")})
    response = _import(second, OCT_30)
    assert response.status_code == 200
    assert response.json()["unchanged"] == 1
    assert _row(repo, target_id).status == "Commented"


def test_unrelated_rows_preserved_by_partial_date_upload(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    pending_id = _seed_pending_text(repo, resolver, "September review note")
    repo.record_exceptions(
        OCT_30, [_occurrence(V3, OCT_30, commentary="untouched")],
        lineage_resolver=resolver,
    )
    other_id = f"{V3}_xxxx"
    partial = build_commentary_workbook(
        [
            {
                "exception_id": pending_id,
                "exception_commentary": "September review note",
                "status": "RecertificationRequired",
            }
        ],
        OCT_30,
    )
    chosen = _with_cells(partial, {pending_id: (None, "Keep Current")})

    response = _import(chosen, OCT_30)

    assert response.status_code == 200
    assert _row(repo, pending_id).status == "Commented"
    assert _row(repo, other_id).exception_commentary == "untouched"


# ------------------------------------------------------------- wire contract


def test_api_lists_single_recertification_status_with_provenance(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    target_id = _seed_pending_text(repo, resolver, "September review note")

    response = APIClient().get(f"/api/exception-tracking/?as_of_date={OCT_30.isoformat()}")

    assert response.status_code == 200
    rows = {row["exception_id"]: row for row in response.json()["exceptions"]}
    row = rows[target_id]
    assert row["status"] == "RecertificationRequired"
    assert row["recertification_required"] is True
    assert row["recertification_reason"] == "Recertification due to rule change"
    assert row["carried_from_exception_id"] == f"{V1}_xxxx"
    assert row["carried_from_as_of_date"] == SEPT_30.isoformat()
    assert row["carried_from_rule_identifier"] == V1
    assert row["rule_evolution_event_id"] == EVENT
    assert row["recertified_at"] in ("", None)
    statuses = {item["status"] for item in response.json()["exceptions"]}
    assert "RecertificationRequired" in statuses


def test_end_to_end_capture_export_upload_list(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    repo.record_exceptions(
        SEPT_30, [_occurrence(V1, SEPT_30, commentary="September review note")]
    )
    repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    target_id = _pending_id()

    exported = _export(OCT_30)
    chosen = _with_cells(exported, {target_id: ("reviewed for v2", "Updated")})
    uploaded = _import(chosen, OCT_30)
    assert uploaded.status_code == 200
    assert uploaded.json()["updated"] == 1

    listing = APIClient().get(
        f"/api/exception-tracking/?as_of_date={OCT_30.isoformat()}"
    ).json()
    rows = {row["exception_id"]: row for row in listing["exceptions"]}
    assert rows[target_id]["status"] == "Commented"
    assert rows[target_id]["exception_commentary"] == "reviewed for v2"

    re_exported = load_workbook(io.BytesIO(_export(OCT_30)))["Exceptions"]
    headers = [cell.value for cell in re_exported[1]]
    text_column = headers.index("Commentary") + 1
    choice_column = headers.index(RECERTIFY_COLUMN) + 1
    found = {
        re_exported.cell(row, 1).value: (
            re_exported.cell(row, text_column).value,
            re_exported.cell(row, choice_column).value,
        )
        for row in range(2, re_exported.max_row + 1)
    }
    assert found[target_id] == ("reviewed for v2", None)


def test_decide_upload_unit_matrix() -> None:
    from apps.exception_tracking.api_services import _decide_upload

    pending = {"exception_commentary": "note", "status": "RecertificationRequired"}
    assert _decide_upload(pending, "ignored", "Keep Current") == (
        CommentaryUploadDecision(commentary=None, clear_recertification=True)
    )
    assert _decide_upload(pending, "new", "Updated") == (
        CommentaryUploadDecision(commentary="new", clear_recertification=True)
    )
    assert _decide_upload(pending, "x", "") is None

    ordinary = {"exception_commentary": "kept", "status": "Commented"}
    assert _decide_upload(ordinary, "", "Updated") is None
    assert _decide_upload(ordinary, "fresh", "Keep Current") == (
        CommentaryUploadDecision(commentary="fresh", clear_recertification=False)
    )
