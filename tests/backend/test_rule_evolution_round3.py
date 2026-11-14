"""Round-3 regression evidence: same-date revision supersession + clear-to-review.

Bug 1: after a modify-current revision (R095 -> R096), a same-date table can
hold BOTH the predecessor and the successor exception for the same book
(two runs straddling the revision). The current exception-tracking view must
represent the book under the successor identifier only, while the store
preserves every historical occurrence, original ID, commentary, and
provenance (no ID rewriting).

Bug 2: for an exception currently requiring recertification, uploading
``Commentary Recertify = Updated`` with empty (or whitespace-only) commentary
must clear the commentary, clear pending recertification, and read exactly
``Not Commented`` — never ``New`` — and stay there across reload, recapture,
export, and recurrence.

All stores are isolated under ``tmp_path``; live databases are never touched.
"""

from __future__ import annotations

import io
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from apps.exception_tracking import api_services
from apps.exception_tracking.domain import ExceptionOccurrence
from apps.exception_tracking.lineage import InMemoryLineageResolver
from apps.exception_tracking.repository import ExceptionTrackingRepository
from apps.exception_tracking.workbook import RECERTIFY_COLUMN
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import load_workbook
from rest_framework.test import APIClient

OCT_30 = date(2026, 10, 30)
NOV_3 = date(2026, 11, 3)
NOV_4 = date(2026, 11, 4)
NOV_5 = date(2026, 11, 5)

R095 = "CBR1_1QECTTZ5EDRVM6W18H1Z"
R096 = "CBR1_09ZGBK98QSKPZHQE39AS"
R097 = "CBR1_05ZPX9ZE5RP8BTMX121Q"
OTHER_RULE = "CBR1_1FB1N7BHJ3WTCD3BB1KW"

EVENT_96 = "event-r095-r096-modify"
EVENT_97 = "event-r096-r097-modify"
LINEAGE = "lineage-686f-round3"


def _edge(source: str, target: str, event: str, revision: int) -> dict[str, Any]:
    return {
        "event_id": event,
        "lineage_id": LINEAGE,
        "revision_number": revision,
        "source_identifier": source,
        "target_identifier": target,
        "relationship": "revision",
        "change_type": "executable_revision",
        "save_decision": "modify_current",
        "commentary_policy": "carry_forward_recertification",
    }


def _resolver(*edges: dict[str, Any]) -> InMemoryLineageResolver:
    return InMemoryLineageResolver(list(edges))


def _occurrence(
    rule: str,
    day: date,
    *,
    book: str,
    commentary: str | None = None,
) -> ExceptionOccurrence:
    return ExceptionOccurrence(
        exception_rule_identifier=rule,
        key_columns={"book": book},
        key_column_order=["book"],
        exception_timestamp=datetime(day.year, day.month, day.day, 8, 0, tzinfo=UTC),
        exception_commentary=commentary,
        exception_rule_index="R095",
    )


def _ids(records: Any) -> list[str]:
    if records and isinstance(records[0], dict):
        return sorted(str(item["exception_id"]) for item in records)
    return sorted(str(item.exception_id) for item in records)


def _seed_nov4_duplicate(tmp_path: Path) -> tuple[ExceptionTrackingRepository, Any]:
    """Recreate the reported shape: two Nov-4 runs straddling the revision."""

    repo = ExceptionTrackingRepository(tmp_path / "tracking.db")
    resolver = _resolver(_edge(R095, R096, EVENT_96, 3))
    repo.record_exceptions(
        OCT_30,
        [
            _occurrence(R095, OCT_30, book="Alice", commentary="KZ note"),
            _occurrence(R095, OCT_30, book="Karen"),
        ],
        lineage_resolver=resolver,
    )
    repo.record_exceptions(
        NOV_3,
        [
            _occurrence(R095, NOV_3, book="Alice"),
            _occurrence(R095, NOV_3, book="Karen"),
        ],
        lineage_resolver=resolver,
    )
    assert repo.get_exception(NOV_3, f"{R095}_Alice").exception_commentary == "KZ note"
    # First Nov-4 run while R095 is still current.
    repo.record_exceptions(
        NOV_4,
        [
            _occurrence(R095, NOV_4, book="Alice"),
            _occurrence(R095, NOV_4, book="Karen"),
        ],
        lineage_resolver=resolver,
    )
    # Modify-current revision, then the Nov-4 re-run under R096. Karen no
    # longer violates, so only Alice recurs under the successor.
    repo.record_exceptions(
        NOV_4, [_occurrence(R096, NOV_4, book="Alice")], lineage_resolver=resolver
    )
    return repo, resolver


# ------------------------------------------------------------------ bug 1


def test_same_date_current_view_shows_successor_only(tmp_path: Path) -> None:
    repo, resolver = _seed_nov4_duplicate(tmp_path)

    full = repo.list_exceptions(NOV_4)
    assert _ids(full) == [f"{R096}_Alice", f"{R095}_Alice", f"{R095}_Karen"]

    current = repo.list_current_exceptions(NOV_4, lineage_resolver=resolver)
    assert _ids(current) == [f"{R096}_Alice", f"{R095}_Karen"]

    successor = repo.get_exception(NOV_4, f"{R096}_Alice")
    assert successor is not None
    assert successor.exception_commentary == "KZ note"
    assert successor.status == "RecertificationRequired"
    assert successor.carried_from_exception_id == f"{R095}_Alice"
    assert successor.carried_from_rule_identifier == R095
    assert successor.rule_evolution_event_id == EVENT_96


def test_supersession_preserves_history_and_older_dates(tmp_path: Path) -> None:
    repo, resolver = _seed_nov4_duplicate(tmp_path)

    # Original IDs, commentary, and provenance stay addressable in the store.
    predecessor = repo.get_exception(NOV_4, f"{R095}_Alice")
    assert predecessor is not None
    assert predecessor.exception_commentary == "KZ note"
    assert predecessor.carried_from_exception_id == ""
    history = repo.list_exception_history(f"{R095}_Alice")
    assert sorted(item.exception_as_of_date for item in history) == [
        OCT_30,
        NOV_3,
        NOV_4,
    ]
    # Older dates predate the successor: no hiding there.
    assert _ids(repo.list_current_exceptions(OCT_30, lineage_resolver=resolver)) == [
        f"{R095}_Alice",
        f"{R095}_Karen",
    ]


def test_predecessor_without_successor_is_preserved_not_manufactured(
    tmp_path: Path,
) -> None:
    repo, resolver = _seed_nov4_duplicate(tmp_path)

    # Karen no longer violates R096: no successor row is manufactured, her
    # commentary is not carried anywhere, and her history stays intact.
    assert repo.get_exception(NOV_4, f"{R096}_Karen") is None
    karen = repo.get_exception(NOV_4, f"{R095}_Karen")
    assert karen is not None and karen.status == "NotCommented"
    assert f"{R095}_Karen" in _ids(
        repo.list_current_exceptions(NOV_4, lineage_resolver=resolver)
    )
    assert [
        item.exception_as_of_date
        for item in repo.list_exception_history(f"{R095}_Karen")
    ] == [OCT_30, NOV_3, NOV_4]


def test_unrelated_lineages_books_and_copies_stay_separate(tmp_path: Path) -> None:
    repo = ExceptionTrackingRepository(tmp_path / "tracking.db")
    resolver = _resolver(_edge(R095, R096, EVENT_96, 3))
    save_as_new_target = "CBR1_" + "S" * 20
    copy_target = "CBR1_" + "P" * 20
    repo.record_exceptions(
        NOV_4,
        [
            # Same book, save-as-new root: the stub resolver holds no chain
            # for it, so it must never suppress the predecessor.
            _occurrence(R095, NOV_4, book="Alice"),
            _occurrence(R096, NOV_4, book="Alice"),
            _occurrence(save_as_new_target, NOV_4, book="Alice"),
            # Same chain, different book: keys never match.
            _occurrence(R095, NOV_4, book="Zoe"),
            _occurrence(R096, NOV_4, book="Zoe2"),
            # Copy starts a new lineage: no recorded edge, stays separate.
            _occurrence(R095, NOV_4, book="Mia"),
            _occurrence(copy_target, NOV_4, book="Mia"),
        ],
        lineage_resolver=resolver,
    )
    current = repo.list_current_exceptions(NOV_4, lineage_resolver=resolver)
    # Alice IS superseded (recorded modify-current edge, same book): only the
    # successor shows. Every unrelated pair stays as two independent rows.
    assert f"{R095}_Alice" not in _ids(current)
    assert f"{R096}_Alice" in _ids(current)
    for identifier, book in [
        (save_as_new_target, "Alice"),
        (R095, "Zoe"),
        (R096, "Zoe2"),
        (R095, "Mia"),
        (copy_target, "Mia"),
    ]:
        assert f"{identifier}_{book}" in _ids(current)


def test_repeated_capture_is_idempotent_and_keeps_target_edits(
    tmp_path: Path,
) -> None:
    repo, resolver = _seed_nov4_duplicate(tmp_path)

    before = _ids(repo.list_current_exceptions(NOV_4, lineage_resolver=resolver))
    summary = repo.record_exceptions(
        NOV_4, [_occurrence(R096, NOV_4, book="Alice")], lineage_resolver=resolver
    )
    assert summary.carry_warnings == ()
    assert _ids(repo.list_current_exceptions(NOV_4, lineage_resolver=resolver)) == before

    # A direct target edit (e.g. an accepted recertification text) survives.
    repo.record_exceptions(
        NOV_4,
        [_occurrence(R096, NOV_4, book="Alice", commentary="accepted v96")],
        lineage_resolver=resolver,
    )
    successor = repo.get_exception(NOV_4, f"{R096}_Alice")
    assert successor is not None
    assert successor.exception_commentary == "accepted v96"
    assert f"{R095}_Alice" not in _ids(
        repo.list_current_exceptions(NOV_4, lineage_resolver=resolver)
    )


def test_multi_hop_same_date_keeps_only_head(tmp_path: Path) -> None:
    repo = ExceptionTrackingRepository(tmp_path / "tracking.db")
    resolver = _resolver(
        _edge(R095, R096, EVENT_96, 3), _edge(R096, R097, EVENT_97, 4)
    )
    repo.record_exceptions(
        OCT_30,
        [_occurrence(R095, OCT_30, book="Alice", commentary="KZ note")],
        lineage_resolver=resolver,
    )
    for rule in (R095, R096, R097):
        repo.record_exceptions(
            NOV_4, [_occurrence(rule, NOV_4, book="Alice")], lineage_resolver=resolver
        )
    assert _ids(repo.list_exceptions(NOV_4)) == [
        f"{R097}_Alice",
        f"{R096}_Alice",
        f"{R095}_Alice",
    ]
    assert _ids(repo.list_current_exceptions(NOV_4, lineage_resolver=resolver)) == [
        f"{R097}_Alice"
    ]


def test_list_view_and_date_export_use_current_view(tmp_path: Path,
                                                    monkeypatch: Any) -> None:
    repo, resolver = _seed_nov4_duplicate(tmp_path)
    monkeypatch.setattr(api_services, "get_repository", lambda: repo)
    monkeypatch.setattr(
        "apps.exception_tracking.repository._default_lineage_resolver",
        lambda: resolver,
    )
    response = APIClient().get(
        "/api/exception-tracking/", {"as_of_date": NOV_4.isoformat()}
    )
    assert response.status_code == 200
    payload = response.json()
    assert sorted(item["exception_id"] for item in payload["exceptions"]) == [
        f"{R096}_Alice",
        f"{R095}_Karen",
    ]
    assert payload["total"] == 2 and payload["unfiltered_total"] == 2

    exported = APIClient().get(
        "/api/exception-tracking/export/", {"as_of_date": NOV_4.isoformat()}
    )
    assert exported.status_code == 200
    sheet = load_workbook(io.BytesIO(exported.content))["Exceptions"]
    headers = [cell.value for cell in sheet[1]]
    id_column = headers.index("Exception ID") + 1
    assert sorted(
        sheet.cell(row, id_column).value for row in range(2, sheet.max_row + 1)
    ) == [f"{R096}_Alice", f"{R095}_Karen"]


# ------------------------------------------------------------------ bug 2


def _upload(content: bytes, day: date) -> Any:
    return APIClient().post(
        "/api/exception-tracking/import/",
        {
            "file": SimpleUploadedFile(
                "template.xlsx",
                content,
                content_type=(
                    "application/vnd.openxmlformats-officedocument"
                    ".spreadsheetml.sheet"
                ),
            ),
            "as_of_date": day.isoformat(),
        },
        format="multipart",
    )


def _with_cells(
    content: bytes, choices: dict[str, tuple[str | None, str | None]]
) -> bytes:
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


def _export(day: date) -> bytes:
    response = APIClient().get(
        "/api/exception-tracking/export/", {"as_of_date": day.isoformat()}
    )
    assert response.status_code == 200
    assert isinstance(response.content, bytes)
    return response.content


def test_updated_empty_clears_pending_to_not_commented(
    tmp_path: Path, monkeypatch: Any
) -> None:
    repo, _ = _seed_nov4_duplicate(tmp_path)
    monkeypatch.setattr(api_services, "get_repository", lambda: repo)
    target_id = f"{R096}_Alice"
    assert repo.get_exception(NOV_4, target_id).status == "RecertificationRequired"

    content = _with_cells(_export(NOV_4), {target_id: ("", "Updated")})
    response = _upload(content, NOV_4)

    assert response.status_code == 200
    assert response.json()["cleared"] == 1
    stored = repo.get_exception(NOV_4, target_id)
    assert stored is not None
    assert stored.exception_commentary == ""
    assert stored.recertification_required is False
    assert stored.status == "NotCommented"
    # Provenance and audit history survive the deliberate clear.
    assert stored.carried_from_exception_id == f"{R095}_Alice"
    assert stored.rule_evolution_event_id == EVENT_96
    assert stored.recertified_at is not None


def test_updated_whitespace_only_clears_to_not_commented(
    tmp_path: Path, monkeypatch: Any
) -> None:
    repo, _ = _seed_nov4_duplicate(tmp_path)
    monkeypatch.setattr(api_services, "get_repository", lambda: repo)
    target_id = f"{R096}_Alice"

    content = _with_cells(_export(NOV_4), {target_id: ("   \n  ", "Updated")})
    assert _upload(content, NOV_4).status_code == 200

    stored = repo.get_exception(NOV_4, target_id)
    assert stored is not None
    assert stored.exception_commentary == ""
    assert stored.status == "NotCommented"


def test_updated_empty_repairs_prefixed_first_seen_from_provenance(
    tmp_path: Path, monkeypatch: Any
) -> None:
    """Pre-fix rows (target-date first-seen) clear to Not Commented too.

    Rows captured before the continuity fix carry the target date as
    first-seen even though recorded carried-from provenance exists. The
    deliberate Updated+empty clear backfills the continuity origin from
    that provenance instead of leaving the row New.
    """
    import sqlite3 as _sqlite3

    from apps.exception_tracking.identity import quote_identifier as _quote
    from apps.exception_tracking.identity import table_name_for_date as _table

    repo, _ = _seed_nov4_duplicate(tmp_path)
    monkeypatch.setattr(api_services, "get_repository", lambda: repo)
    target_id = f"{R096}_Alice"
    pending = repo.get_exception(NOV_4, target_id)
    assert pending is not None and pending.status == "RecertificationRequired"

    # Simulate the pre-fix birth: target-date first-seen despite provenance.
    connection = _sqlite3.connect(str(repo.database_path))
    try:
        connection.execute(
            f"UPDATE {_quote(_table(NOV_4))} SET "
            "exception_first_seen_as_of_date = ? WHERE exception_id = ?",
            (NOV_4.isoformat(), target_id),
        )
        connection.commit()
    finally:
        connection.close()
    assert repo.get_exception(NOV_4, target_id).exception_first_seen_as_of_date == NOV_4

    content = _with_cells(_export(NOV_4), {target_id: ("", "Updated")})
    assert _upload(content, NOV_4).status_code == 200

    stored = repo.get_exception(NOV_4, target_id)
    assert stored is not None
    assert stored.exception_commentary == ""
    assert stored.recertification_required is False
    assert stored.status == "NotCommented"
    assert stored.exception_first_seen_as_of_date == OCT_30
    assert stored.carried_from_exception_id == f"{R095}_Alice"
    assert stored.rule_evolution_event_id == EVENT_96


def test_cleared_row_stays_not_commented(
    tmp_path: Path, monkeypatch: Any
) -> None:
    repo, resolver = _seed_nov4_duplicate(tmp_path)
    monkeypatch.setattr(api_services, "get_repository", lambda: repo)
    monkeypatch.setattr(
        "apps.exception_tracking.repository._default_lineage_resolver",
        lambda: resolver,
    )
    target_id = f"{R096}_Alice"
    assert _upload(
        _with_cells(_export(NOV_4), {target_id: ("", "Updated")}), NOV_4
    ).status_code == 200
    assert repo.get_exception(NOV_4, target_id).status == "NotCommented"

    # Reload through the read APIs.
    assert repo.get_exception(NOV_4, target_id).status == "NotCommented"
    assert [
        item.status
        for item in repo.list_exceptions(NOV_4)
        if item.exception_id == target_id
    ] == ["NotCommented"]
    assert [
        item["status"]
        for item in api_services.list_exceptions(NOV_4, repo)
        if item["exception_id"] == target_id
    ] == ["NotCommented"]
    assert [
        item["status"]
        for item in api_services.list_current_exceptions(NOV_4, repo)
        if item["exception_id"] == target_id
    ] == ["NotCommented"]

    # Same-date recapture preserves the cleared state (update path).
    repo.record_exceptions(
        NOV_4, [_occurrence(R096, NOV_4, book="Alice")], lineage_resolver=resolver
    )
    recaptured = repo.get_exception(NOV_4, target_id)
    assert recaptured is not None
    assert recaptured.exception_commentary == ""
    assert recaptured.status == "NotCommented"

    # Date export still renders the cleared successor as Not Commented.
    sheet = load_workbook(io.BytesIO(_export(NOV_4)))["Exceptions"]
    headers = [cell.value for cell in sheet[1]]
    id_column = headers.index("Exception ID") + 1
    status_column = headers.index("Exception Status") + 1
    statuses = {
        sheet.cell(row, id_column).value: sheet.cell(row, status_column).value
        for row in range(2, sheet.max_row + 1)
    }
    assert statuses[target_id] == "NotCommented"

    # Recurrence on a later date under the same ID keeps continuity.
    repo.record_exceptions(
        NOV_5, [_occurrence(R096, NOV_5, book="Alice")], lineage_resolver=resolver
    )
    recurred = repo.get_exception(NOV_5, target_id)
    assert recurred is not None
    assert recurred.exception_commentary == ""
    assert recurred.status == "NotCommented"

    # The unrelated-rule store is untouched by the whole sequence.
    other = ExceptionTrackingRepository(tmp_path / "other.db")
    other.record_exceptions(
        NOV_4, [_occurrence(OTHER_RULE, NOV_4, book="Alice")],
        lineage_resolver=resolver,
    )
    assert other.get_exception(NOV_4, f"{OTHER_RULE}_Alice").status == "New"
