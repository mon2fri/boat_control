"""Rule-evolution recertification evidence (Worker B).

Covers cross-date carry without an edit-date run, multi-hop chains,
pending-to-accepted transition with unchanged text, acceptance retry,
stale/unknown IDs, clears (tombstones), future-comment exclusion, target-edit
preservation, key-schema mismatch, equal-date ambiguity, unrelated lineages,
same-date snapshots, legacy tracking upgrade, transactional failure, New
Exceptions Only/report counts, and workbook round trips.

All stores are isolated under ``tmp_path``; the live tracking database and
live rule catalog are never touched.
"""

from __future__ import annotations

import io
import sqlite3
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import pytest
from apps.exception_tracking.domain import (
    RECERTIFICATION_REASON,
    ExceptionOccurrence,
    status_for,
)
from apps.exception_tracking.identity import table_name_for_date
from apps.exception_tracking.lineage import InMemoryLineageResolver
from apps.exception_tracking.repository import (
    ExceptionTrackingRepository,
    list_exceptions,
    record_exceptions,
)
from apps.runs.tracking_context import (
    NEW_EXCEPTION_STATUSES,
    filter_result_for_new_exceptions,
)

V1 = "CBR1_" + "A" * 20
V2 = "CBR1_" + "B" * 20
V3 = "CBR1_" + "C" * 20
OTHER = "CBR1_" + "D" * 20

SEPT_30 = date(2026, 9, 30)
OCT_10 = date(2026, 10, 10)
OCT_15 = date(2026, 10, 15)
OCT_20 = date(2026, 10, 20)
OCT_30 = date(2026, 10, 30)
NOV_30 = date(2026, 11, 30)

LINEAGE = "lineage-1"


def _edge(
    source: str,
    target: str,
    event: str,
    *,
    change_type: str = "executable_revision",
    save_decision: str = "modify_current",
    commentary_policy: str = "carry_forward_recertification",
    lineage: str = LINEAGE,
    revision: int = 0,
) -> dict[str, Any]:
    """One frozen-shape predecessor edge for the focused-test stub.

    Field names mirror Worker A's frozen `PredecessorLink`; the stub filters
    exactly like A (inheritable `modify_current` executable revisions only).
    """

    return {
        "event_id": event,
        "lineage_id": lineage,
        "revision_number": revision,
        "source_identifier": source,
        "target_identifier": target,
        "relationship": "revision",
        "change_type": change_type,
        "save_decision": save_decision,
        "commentary_policy": commentary_policy,
    }


def _occurrence(
    rule: str,
    day: date,
    *,
    book: str = "xxxx",
    order: list[str] | None = None,
    keys: dict[str, Any] | None = None,
    commentary: str | None = None,
    lineage: str | None = None,
) -> ExceptionOccurrence:
    key_values = dict(keys) if keys is not None else {"book": book}
    return ExceptionOccurrence(
        exception_rule_identifier=rule,
        key_columns=key_values,
        key_column_order=order or list(key_values),
        exception_timestamp=datetime(day.year, day.month, day.day, 8, 0, tzinfo=UTC),
        exception_commentary=commentary,
        exception_rule_index="R001",
        lineage_id=lineage,
    )


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "tracking.db"


@pytest.fixture
def resolver() -> InMemoryLineageResolver:
    return InMemoryLineageResolver(
        [
            _edge(V1, V2, "event-oct15-revision", revision=2),
            _edge(V2, V3, "event-oct25-revision", revision=3),
        ]
    )


def _sept_comment(repo: ExceptionTrackingRepository) -> None:
    repo.record_exceptions(
        SEPT_30, [_occurrence(V1, SEPT_30, commentary="September review note")]
    )


# ---------------------------------------------------------------- carry


def test_cross_date_carry_without_edit_date_run(
    db_path: Path, resolver: InMemoryLineageResolver
) -> None:
    """Sept 30 v1 commentary appears on the Oct 30 v2 exception (no Oct 15 run)."""

    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    summary = repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    assert summary.carry_warnings == ()

    old_id = f"{V1}_xxxx"
    new_id = f"{V2}_xxxx"
    assert old_id != new_id

    source = repo.get_exception(SEPT_30, old_id)
    assert source is not None
    assert source.exception_commentary == "September review note"
    assert source.status == "Commented"

    carried = repo.get_exception(OCT_30, new_id)
    assert carried is not None
    # Text verbatim, marker kept out of the text in a separate reason field.
    assert carried.exception_commentary == "September review note"
    assert RECERTIFICATION_REASON not in carried.exception_commentary
    assert carried.status == "RecertificationRequired"
    assert carried.recertification_required is True
    assert carried.recertification_reason == "Recertification due to rule change"
    assert carried.carried_from_exception_id == old_id
    assert carried.carried_from_as_of_date == SEPT_30
    assert carried.carried_from_rule_identifier == V1
    assert carried.rule_evolution_event_id == "event-oct15-revision"
    assert carried.revision_token == "event-oct15-revision"
    assert carried.recertified_at is None
    # Each occurrence keeps its own ID, date, and historical metadata.
    assert carried.exception_as_of_date == OCT_30
    assert carried.exception_first_seen_as_of_date == OCT_30


def test_multi_hop_chain_uses_nearest_edge_with_history(
    db_path: Path, resolver: InMemoryLineageResolver
) -> None:
    """v1 -> v2 -> v3 resolves without any intervening run or occurrence."""

    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    repo.record_exceptions(
        OCT_30, [_occurrence(V3, OCT_30)], lineage_resolver=resolver
    )
    carried = repo.get_exception(OCT_30, f"{V3}_xxxx")
    assert carried is not None
    assert carried.exception_commentary == "September review note"
    assert carried.status == "RecertificationRequired"
    # Provenance names the immediate predecessor edge; the v1 link stays
    # traceable through v2's own (absent here) or the recorded chain.
    assert carried.rule_evolution_event_id == "event-oct25-revision"
    assert carried.carried_from_rule_identifier == V1
    assert carried.carried_from_as_of_date == SEPT_30


def test_never_commented_intermediate_revision_falls_through(
    db_path: Path, resolver: InMemoryLineageResolver
) -> None:
    """A blank-but-never-commented v2 occurrence does not block v1 commentary."""

    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    repo.record_exceptions(OCT_20, [_occurrence(V2, OCT_20)], lineage_resolver=resolver)
    middle = repo.get_exception(OCT_20, f"{V2}_xxxx")
    assert middle is not None
    assert middle.exception_commentary == "September review note"
    assert middle.status == "RecertificationRequired"

    repo.record_exceptions(
        OCT_30, [_occurrence(V3, OCT_30)], lineage_resolver=resolver
    )
    carried = repo.get_exception(OCT_30, f"{V3}_xxxx")
    assert carried is not None
    assert carried.exception_commentary == "September review note"
    assert carried.status == "RecertificationRequired"
    assert carried.rule_evolution_event_id == "event-oct25-revision"


def test_same_date_source_is_not_eligible(
    db_path: Path, resolver: InMemoryLineageResolver
) -> None:
    """Only the immediate previous as-of date carries (Round-1 directive).

    A predecessor occurrence on the target's own date is not eligible: carry
    consults a single strictly-earlier date table, never the write target
    itself and never older dates beyond the immediate previous one.
    """

    repo = ExceptionTrackingRepository(db_path)
    repo.record_exceptions(
        SEPT_30, [_occurrence(V1, SEPT_30, commentary="same-day note")]
    )
    repo.record_exceptions(
        SEPT_30, [_occurrence(V2, SEPT_30)], lineage_resolver=resolver
    )
    target = repo.get_exception(SEPT_30, f"{V2}_xxxx")
    assert target is not None
    assert target.exception_commentary == ""
    assert target.status == "New"


# ------------------------------------------------------- tombstones/clears


def test_explicitly_cleared_source_is_a_tombstone(
    db_path: Path, resolver: InMemoryLineageResolver
) -> None:
    """A cleared latest source stays cleared; older text is not resurrected."""

    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    # Explicit clear of the v1 occurrence on Oct 10 (nonblank -> blank).
    repo.record_exceptions(OCT_10, [_occurrence(V1, OCT_10, commentary="")])

    repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    target = repo.get_exception(OCT_30, f"{V2}_xxxx")
    assert target is not None
    assert target.exception_commentary == ""
    assert target.recertification_required is False
    # Round-2 directive: a recorded predecessor occurrence keeps the new row
    # from looking brand new (NotCommented), even though no text was
    # cleared-carried and no recertification is required.
    assert target.status == "NotCommented"
    assert target.rule_evolution_event_id == ""


def test_future_comment_is_never_carried(
    db_path: Path, resolver: InMemoryLineageResolver
) -> None:
    """Commentary dated after the target as-of date is not eligible."""

    repo = ExceptionTrackingRepository(db_path)
    repo.record_exceptions(
        NOV_30, [_occurrence(V1, NOV_30, commentary="later note")]
    )
    repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    target = repo.get_exception(OCT_30, f"{V2}_xxxx")
    assert target is not None
    assert target.exception_commentary == ""
    assert target.status == "New"


# ------------------------------------------------------------- target edits


def test_existing_target_comment_survives_recapture(
    db_path: Path, resolver: InMemoryLineageResolver
) -> None:
    """Repeat capture/restart never overwrites or re-marks the target."""

    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    repo.update_commentaries(OCT_30, {f"{V2}_xxxx": "reviewer edit"})
    # Recapture (restart/retry) with no explicit commentary preserves text.
    summary = repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    assert summary.carry_warnings == ()
    target = repo.get_exception(OCT_30, f"{V2}_xxxx")
    assert target is not None
    assert target.exception_commentary == "reviewer edit"
    # A direct edit is still unaccepted inherited-carry context until accepted.
    assert target.status == "RecertificationRequired"
    assert target.rule_evolution_event_id == "event-oct15-revision"


def test_cleared_pending_text_stays_pending_and_reviewable(
    db_path: Path, resolver: InMemoryLineageResolver
) -> None:
    """Clearing pending text keeps it cleared and reviewable, never Commented."""

    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    repo.update_commentaries(OCT_30, {f"{V2}_xxxx": ""})
    target = repo.get_exception(OCT_30, f"{V2}_xxxx")
    assert target is not None
    assert target.exception_commentary == ""
    assert target.status == "RecertificationRequired"
    assert "RecertificationRequired" in NEW_EXCEPTION_STATUSES


def test_accepted_target_is_never_reset_by_recapture(
    db_path: Path, resolver: InMemoryLineageResolver
) -> None:
    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    summary = repo.recertify_exceptions(
        OCT_30, {f"{V2}_xxxx": "event-oct15-revision"}
    )
    assert summary.accepted == (f"{V2}_xxxx",)
    before = repo.get_exception(OCT_30, f"{V2}_xxxx")
    assert before is not None and before.recertified_at is not None

    repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    after = repo.get_exception(OCT_30, f"{V2}_xxxx")
    assert after is not None
    assert after.status == "Commented"
    assert after.recertification_required is False
    assert after.recertified_at == before.recertified_at


# --------------------------------------------------------------- acceptance


def test_accept_unchanged_text_then_retry_is_stable(
    db_path: Path, resolver: InMemoryLineageResolver
) -> None:
    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    target_id = f"{V2}_xxxx"

    first = repo.recertify_exceptions(OCT_30, {target_id: "event-oct15-revision"})
    assert first.accepted == (target_id,)
    assert first.already_accepted == ()
    accepted = repo.get_exception(OCT_30, target_id)
    assert accepted is not None
    # Unchanged text accepted; the accepted revision and time are recorded.
    assert accepted.exception_commentary == "September review note"
    assert accepted.status == "Commented"
    assert accepted.recertification_required is False
    assert accepted.recertified_at is not None
    # Provenance is retained after acceptance for audit.
    assert accepted.carried_from_exception_id == f"{V1}_xxxx"

    retry = repo.recertify_exceptions(OCT_30, {target_id: "event-oct15-revision"})
    assert retry.accepted == ()
    assert retry.already_accepted == (target_id,)
    assert retry.total == 1


def test_recertify_rejects_unknown_stale_blank_atomically(
    db_path: Path, resolver: InMemoryLineageResolver
) -> None:
    from apps.exception_tracking.errors import (
        BlankCommentaryCertificationError,
        StaleRevisionTokenError,
        UnknownExceptionError,
    )

    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    target_id = f"{V2}_xxxx"

    with pytest.raises(UnknownExceptionError):
        repo.recertify_exceptions(
            OCT_30, {target_id: "event-oct15-revision", "missing-id": ""}
        )
    assert repo.get_exception(OCT_30, target_id).recertification_required is True

    with pytest.raises(StaleRevisionTokenError):
        repo.recertify_exceptions(OCT_30, {target_id: "event-from-another-revision"})
    assert repo.get_exception(OCT_30, target_id).recertification_required is True

    repo.update_commentaries(OCT_30, {target_id: ""})
    with pytest.raises(BlankCommentaryCertificationError):
        repo.recertify_exceptions(OCT_30, {target_id: "event-oct15-revision"})
    assert repo.get_exception(OCT_30, target_id).recertification_required is True


def test_pending_is_reviewable_under_new_exceptions_only() -> None:
    assert "RecertificationRequired" in NEW_EXCEPTION_STATUSES
    assert (
        status_for(
            "inherited text",
            as_of_date=OCT_30,
            first_seen_as_of_date=OCT_30,
            recertification_required=True,
        )
        == "RecertificationRequired"
    )

    result = {
        "new_exceptions_only": True,
        "validation": {
            "violations_by_rule": {
                "R001": [
                    {"row_index": 1, "exception_status": "RecertificationRequired"},
                    {"row_index": 2, "exception_status": "Commented"},
                    {"row_index": 3, "exception_status": "New"},
                    {"row_index": 4, "exception_status": "NotCommented"},
                ]
            },
            "violation_count_by_rule": {},
            "violating_rows_by_rule": {},
            "violating_attributes_by_rule": {},
            "total_violations": 4,
            "distinct_violating_rows": 4,
            "distinct_violating_attributes": 4,
        },
    }
    filtered = filter_result_for_new_exceptions(result, True)
    visible = filtered["validation"]["violations_by_rule"]["R001"]
    assert {item["row_index"] for item in visible} == {1, 3, 4}
    assert filtered["validation"]["total_violations"] == 3


# ------------------------------------------------- lineage edge semantics


def test_save_as_new_and_unrelated_edges_never_carry(db_path: Path) -> None:
    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    resolver = InMemoryLineageResolver(
        [
            # Same business lineage but recorded as a separate new rule.
            _edge(
                V1,
                V2,
                "event-save-as-new",
                change_type="save_as_new",
                save_decision="save_as_new",
                commentary_policy="no_inheritance",
                revision=2,
            ),
            # An edge for an unrelated target identifier.
            _edge(V1, OTHER, "event-other-lineage", revision=2),
        ]
    )
    repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    target = repo.get_exception(OCT_30, f"{V2}_xxxx")
    assert target is not None
    assert target.exception_commentary == ""
    assert target.status == "New"


def test_ambiguous_lineage_carries_nothing_and_warns(db_path: Path) -> None:
    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    resolver = InMemoryLineageResolver([_edge(V1, V2, "event-oct15-revision")])
    resolver.mark_ambiguous(V2)
    summary = repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    assert len(summary.carry_warnings) == 1
    target = repo.get_exception(OCT_30, f"{V2}_xxxx")
    assert target is not None
    assert target.exception_commentary == ""
    assert target.status == "New"


def test_equal_date_candidates_prefer_closest_revision(db_path: Path) -> None:
    """Same eligible date on two predecessors carries from the nearer edge."""

    repo = ExceptionTrackingRepository(db_path)
    repo.record_exceptions(
        SEPT_30, [_occurrence(V1, SEPT_30, commentary="v1 note")]
    )
    repo.record_exceptions(
        SEPT_30, [_occurrence(V2, SEPT_30, commentary="v2 note")],
        lineage_resolver=InMemoryLineageResolver(
            [_edge(V1, V2, "event-e1", revision=2)]
        ),
    )
    resolver = InMemoryLineageResolver(
        [
            _edge(V2, V3, "event-e2", revision=5),
            _edge(V1, V3, "event-e1", revision=4),
        ]
    )
    repo.record_exceptions(
        OCT_30, [_occurrence(V3, OCT_30)], lineage_resolver=resolver
    )
    carried = repo.get_exception(OCT_30, f"{V3}_xxxx")
    assert carried is not None
    assert carried.exception_commentary == "v2 note"
    assert carried.rule_evolution_event_id == "event-e2"
    assert carried.carried_from_rule_identifier == V2


def test_key_schema_mismatch_blocks_carry_without_mapping(db_path: Path) -> None:
    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    resolver = InMemoryLineageResolver([_edge(V1, V2, "event-oct15-revision")])
    # Changed key schema (extra region key): no implicit mapping, no carry.
    repo.record_exceptions(
        OCT_30,
        [_occurrence(V2, OCT_30, keys={"book": "xxxx", "region": "EMEA"})],
        lineage_resolver=resolver,
    )
    target = repo.list_exceptions(OCT_30)[0]
    assert target.exception_commentary == ""
    assert target.status == "New"


def test_key_order_change_still_carries(db_path: Path) -> None:
    """Same key names/values in a different order match losslessly."""

    repo = ExceptionTrackingRepository(db_path)
    repo.record_exceptions(
        SEPT_30,
        [
            _occurrence(
                V1,
                SEPT_30,
                keys={"book": "xxxx", "region": "EMEA"},
                commentary="ordered note",
            )
        ],
    )
    resolver = InMemoryLineageResolver([_edge(V1, V2, "event-oct15-revision")])
    repo.record_exceptions(
        OCT_30,
        [
            _occurrence(
                V2,
                OCT_30,
                keys={"region": "EMEA", "book": "xxxx"},
                order=["region", "book"],
            )
        ],
        lineage_resolver=resolver,
    )
    carried = repo.get_exception(OCT_30, f"{V2}_EMEA_xxxx")
    assert carried is not None
    assert carried.exception_commentary == "ordered note"
    assert carried.status == "RecertificationRequired"


def test_canonical_reuse_after_revert_still_requires_recertification(
    db_path: Path,
) -> None:
    """A reverted canonical identifier keeps its revision edges: still pending."""

    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    Oct15 = InMemoryLineageResolver([_edge(V1, V2, "event-oct15-revision", revision=2)])
    repo.record_exceptions(
        OCT_20, [_occurrence(V2, OCT_20)], lineage_resolver=Oct15
    )
    # Nov 30: the rule reverts to the v1 executable definition, but the
    # lineage records the round trip, so same-ID text must not copy silently.
    revert = InMemoryLineageResolver(
        [
            _edge(V2, V1, "event-nov01-revert", revision=3),
            _edge(V1, V2, "event-oct15-revision", revision=2),
        ]
    )
    repo.record_exceptions(
        NOV_30, [_occurrence(V1, NOV_30)], lineage_resolver=revert
    )
    target = repo.get_exception(NOV_30, f"{V1}_xxxx")
    assert target is not None
    assert target.exception_commentary == "September review note"
    assert target.status == "RecertificationRequired"
    assert target.rule_evolution_event_id == "event-nov01-revert"


# ----------------------------------------------------------------- upgrade


def test_legacy_tracking_database_upgrades_additively(db_path: Path) -> None:
    """Pre-recertification tables load unchanged and migrate without re-marking."""

    connection = sqlite3.connect(str(db_path))
    try:
        connection.execute(
            f"""CREATE TABLE {table_name_for_date(SEPT_30)} (
                exception_id TEXT PRIMARY KEY NOT NULL,
                exception_rule_identifier TEXT NOT NULL,
                key_columns TEXT NOT NULL,
                exception_timestamp DATETIME NOT NULL,
                exception_commentary TEXT NOT NULL DEFAULT '',
                exception_as_of_date DATE NOT NULL,
                exception_first_seen_as_of_date DATE NOT NULL,
                exception_last_seen_as_of_date DATE NOT NULL,
                exception_first_seen_timestamp DATETIME NOT NULL,
                exception_last_seen_timestamp DATETIME NOT NULL
            )"""
        )
        connection.execute(
            f"""INSERT INTO {table_name_for_date(SEPT_30)} VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                f"{V1}_xxxx",
                V1,
                '{"book": "xxxx"}',
                "2026-09-30T08:00:00+00:00",
                "legacy comment",
                SEPT_30.isoformat(),
                SEPT_30.isoformat(),
                SEPT_30.isoformat(),
                "2026-09-30T08:00:00+00:00",
                "2026-09-30T08:00:00+00:00",
            ),
        )
        connection.commit()
    finally:
        connection.close()

    repo = ExceptionTrackingRepository(db_path)
    # Reads work before any migration.
    legacy = repo.get_exception(SEPT_30, f"{V1}_xxxx")
    assert legacy is not None
    assert legacy.exception_commentary == "legacy comment"
    assert legacy.status == "Commented"
    assert legacy.recertification_required is False

    # Writes migrate lazily and preserve commentary/status.
    repo.record_exceptions(OCT_30, [_occurrence(V1, OCT_30)])
    migrated = repo.get_exception(SEPT_30, f"{V1}_xxxx")
    assert migrated is not None
    assert migrated.status == "Commented"
    assert migrated.recertification_required is False
    carried = repo.get_exception(OCT_30, f"{V1}_xxxx")
    assert carried is not None
    assert carried.exception_commentary == "legacy comment"
    # Unrevised rule: legacy same-ID carry stays accepted-style, never pending.
    assert carried.status == "Commented"
    assert carried.recertification_required is False
    assert carried.rule_evolution_event_id == ""


# ------------------------------------------------------------------ failure


def test_record_batch_collision_writes_nothing(
    db_path: Path, resolver: InMemoryLineageResolver
) -> None:
    from apps.exception_tracking.errors import ExceptionIdentityCollisionError

    repo = ExceptionTrackingRepository(db_path)
    with pytest.raises(ExceptionIdentityCollisionError):
        # Both occurrences serialize to the same literal ID with different
        # lossless key representations: nothing may be written.
        repo.record_exceptions(
            OCT_30,
            [
                _occurrence(V1, OCT_30, keys={"book": "a_b"}, order=["book"]),
                _occurrence(
                    V1, OCT_30, keys={"x": "a", "y": "b"}, order=["x", "y"]
                ),
            ],
            lineage_resolver=resolver,
        )
    assert repo.list_as_of_dates() == [] or repo.list_exceptions(OCT_30) == []


def test_recertify_unknown_ids_writes_nothing(
    db_path: Path, resolver: InMemoryLineageResolver
) -> None:
    from apps.exception_tracking.errors import UnknownExceptionError

    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    with pytest.raises(UnknownExceptionError):
        repo.recertify_exceptions(
            OCT_30, {f"{V2}_xxxx": "event-oct15-revision", "ghost": ""}
        )
    target = repo.get_exception(OCT_30, f"{V2}_xxxx")
    assert target is not None
    assert target.recertification_required is True
    assert target.recertified_at is None


# ------------------------------------------------------------- API + import


@pytest.fixture
def api_repo(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> ExceptionTrackingRepository:
    import apps.exception_tracking.api_services as api_services

    repo = ExceptionTrackingRepository(tmp_path / "api_tracking.db")
    monkeypatch.setattr(api_services, "get_repository", lambda: repo)
    return repo


def _seed_pending(
    repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> str:
    _sept_comment(repo)
    repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    return f"{V2}_xxxx"


def test_list_endpoint_exposes_pending_status_and_tokens(
    api_repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    from rest_framework.test import APIClient

    target_id = _seed_pending(api_repo, resolver)
    response = APIClient().get(f"/api/exception-tracking/?as_of_date={OCT_30.isoformat()}")
    assert response.status_code == 200
    rows = {row["exception_id"]: row for row in response.data["exceptions"]}
    row = rows[target_id]
    assert row["status"] == "RecertificationRequired"
    assert row["recertification_required"] is True
    assert row["recertification_reason"] == "Recertification due to rule change"
    assert row["carried_from_exception_id"] == f"{V1}_xxxx"
    assert row["carried_from_as_of_date"] == SEPT_30.isoformat()
    assert row["carried_from_rule_identifier"] == V1
    assert row["rule_evolution_event_id"] == "event-oct15-revision"
    assert row["revision_token"] == "event-oct15-revision"
    # Marker is separate from commentary: no marker text inside the text.
    assert row["exception_commentary"] == "September review note"
    assert "Recertification due to rule change" not in row["exception_commentary"]
    # Status filtering/sorting surfaces the new state.
    assert "RecertificationRequired" in response.data["available_filters"]["status"]


def test_recertify_endpoint_accepts_and_reports_errors(
    api_repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    from rest_framework.test import APIClient

    client = APIClient()
    target_id = _seed_pending(api_repo, resolver)
    url = "/api/exception-tracking/recertify/"

    unknown = client.post(
        url,
        {"as_of_date": OCT_30.isoformat(), "exception_ids": ["ghost"]},
        format="json",
    )
    assert unknown.status_code == 404
    assert unknown.data["code"] == "unknown_exception_ids"

    stale = client.post(
        url,
        {
            "as_of_date": OCT_30.isoformat(),
            "exception_ids": [target_id],
            "revision_tokens": {target_id: "event-from-elsewhere"},
        },
        format="json",
    )
    assert stale.status_code == 409
    assert stale.data["code"] == "stale_revision_token"

    accepted = client.post(
        url,
        {
            "as_of_date": OCT_30.isoformat(),
            "exception_ids": [target_id],
            "revision_tokens": {target_id: "event-oct15-revision"},
        },
        format="json",
    )
    assert accepted.status_code == 200
    assert accepted.data["accepted"] == [target_id]
    assert accepted.data["already_accepted"] == []
    statuses = {
        row["exception_id"]: row["status"] for row in accepted.data["exceptions"]
    }
    assert statuses[target_id] == "Commented"

    # Retry-safe: repeating the accepted batch succeeds as a no-op.
    retry = client.post(
        url,
        {
            "as_of_date": OCT_30.isoformat(),
            "exception_ids": [target_id],
            "revision_tokens": {target_id: "event-oct15-revision"},
        },
        format="json",
    )
    assert retry.status_code == 200
    assert retry.data["accepted"] == []
    assert retry.data["already_accepted"] == [target_id]


def test_recertify_endpoint_rejects_blank_commentary(
    api_repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    from rest_framework.test import APIClient

    target_id = _seed_pending(api_repo, resolver)
    api_repo.update_commentaries(OCT_30, {target_id: ""})
    response = APIClient().post(
        "/api/exception-tracking/recertify/",
        {
            "as_of_date": OCT_30.isoformat(),
            "exception_ids": [target_id],
            "revision_tokens": {target_id: "event-oct15-revision"},
        },
        format="json",
    )
    assert response.status_code == 400
    assert response.data["code"] == "blank_commentary_not_certified"


def test_workbook_round_trip_never_certifies_implicitly(
    api_repo: ExceptionTrackingRepository, resolver: InMemoryLineageResolver
) -> None:
    import apps.exception_tracking.api_services as api_services
    from apps.exception_tracking.workbook import (
        RECERTIFY_COLUMN,
        STANDARD_EXCEPTION_HEADERS,
        build_commentary_workbook,
        parse_commentary_workbook,
    )
    from openpyxl import load_workbook

    target_id = _seed_pending(api_repo, resolver)
    records = api_services.list_exceptions(OCT_30, api_repo)
    content = build_commentary_workbook(records, OCT_30)

    sheet = load_workbook(io.BytesIO(content))["Exceptions"]
    headers = [cell.value for cell in sheet[1]]
    assert headers == list(STANDARD_EXCEPTION_HEADERS)
    # Round-2: provenance columns are gone from the template; pending review
    # shows through Exception Status, and the review column defaults blank.
    assert "Recertification Reason" not in headers
    assert RECERTIFY_COLUMN in headers
    status_column = headers.index("Exception Status") + 1
    recertify_column = headers.index(RECERTIFY_COLUMN) + 1
    assert sheet.cell(2, status_column).value == "RecertificationRequired"
    assert sheet.cell(2, recertify_column).value in (None, "")
    # The commentary cell carries raw text only.
    assert sheet.cell(2, 3).value == "September review note"

    # Uploading the unchanged template edits nothing and certifies nothing:
    # a blank review choice preserves the row, including its pending mark.
    parsed = parse_commentary_workbook(content)
    assert parsed.commentaries[target_id] == "September review note"
    assert parsed.recertifications == {}
    result = api_services.import_commentary(content, repository=api_repo)
    assert result["updated"] == 0
    assert result["unchanged"] == 1
    pending = api_repo.get_exception(OCT_30, target_id)
    assert pending is not None
    assert pending.status == "RecertificationRequired"

    # Editing the text via upload with a blank review choice is ignored: the
    # stored text and the pending flag are both preserved.
    workbook = load_workbook(io.BytesIO(content))
    workbook["Exceptions"]["C2"] = "reviewer rewording"
    buffer = io.BytesIO()
    workbook.save(buffer)
    result = api_services.import_commentary(buffer.getvalue(), repository=api_repo)
    assert result["updated"] == 0
    assert result["unchanged"] == 1
    edited_row = api_repo.get_exception(OCT_30, target_id)
    assert edited_row is not None
    assert edited_row.exception_commentary == "September review note"
    assert edited_row.status == "RecertificationRequired"

    # An explicit Updated choice stores the new text and clears the flag.
    workbook = load_workbook(io.BytesIO(content))
    sheet = workbook["Exceptions"]
    sheet.cell(2, 3).value = "reviewer rewording"
    sheet.cell(2, recertify_column).value = "Updated"
    buffer = io.BytesIO()
    workbook.save(buffer)
    result = api_services.import_commentary(buffer.getvalue(), repository=api_repo)
    assert result["updated"] == 1
    accepted_row = api_repo.get_exception(OCT_30, target_id)
    assert accepted_row is not None
    assert accepted_row.exception_commentary == "reviewer rewording"
    assert accepted_row.status == "Commented"

    # Only explicit acceptance clears the flag; the recertify endpoint path
    # is covered by the endpoint tests above.
    summary = api_repo.recertify_exceptions(
        OCT_30, {target_id: "event-oct15-revision"}
    )
    assert summary.already_accepted == (target_id,)


# ------------------------------------------------------- capture threading


def test_capture_threads_lineage_context_end_to_end(tmp_path: Path) -> None:
    from apps.exception_tracking.store import capture_exceptions
    from apps.runs.services import (
        ComparisonResult,
        ExecutionResult,
        ValidationResult,
        ValidationViolation,
    )
    from apps.runs.tracking_capture import (
        build_occurrences,
        capture_run_exceptions,
        resolve_run_lineage_context,
    )

    db = tmp_path / "capture.db"
    _sept_comment(ExceptionTrackingRepository(db))
    resolver = InMemoryLineageResolver([_edge(V1, V2, "event-oct15-revision")])

    violation = ValidationViolation(
        row_index=0,
        rule_id="R001",
        rule_name="Rule 1",
        key_columns={"book": "xxxx"},
        details="violated",
        violating_column="status",
        violating_value="bad",
        rule_logic="status eq 'good'",
        rule_identifier=V2,
        exception_id=None,
        exception_status=None,
    )
    validation = ValidationResult(
        total_violations=1,
        distinct_violating_rows=1,
        distinct_violating_attributes=1,
        violations_by_rule={"R001": [violation]},
        violation_count_by_rule={"R001": 1},
        violating_rows_by_rule={"R001": 1},
        violating_attributes_by_rule={"R001": 1},
        rule_summaries={"R001": {"rule_identifier": V2, "name": "Rule 1"}},
    )
    comparison = ComparisonResult(
        total_rows_a=1,
        total_rows_b=1,
        matched_rows=1,
        rows_with_changes=0,
        total_attribute_changes=0,
        row_details=[],
    )
    result = ExecutionResult(
        comparison=comparison,
        validation=validation,
        common_columns=["book", "status"],
        target_columns=["status"],
        key_columns=["book"],
        filters_applied=[],
        rule_bindings={"R001": V2},
    )

    occurrences = build_occurrences(
        result, lineage_context={"R001": LINEAGE}
    )
    assert occurrences[0]["lineage_id"] == LINEAGE

    # Without Worker A's describe service the auto hook stays empty (documented).
    assert resolve_run_lineage_context(result) == {}

    summary = capture_run_exceptions(
        result,
        OCT_30,
        db_path=db,
        lineage_context={"R001": LINEAGE},
        lineage_resolver=resolver,
    )
    assert summary is not None
    carried = ExceptionTrackingRepository(db).get_exception(OCT_30, f"{V2}_xxxx")
    assert carried is not None
    assert carried.status == "RecertificationRequired"
    assert carried.exception_commentary == "September review note"

    direct = capture_exceptions(
        OCT_30,
        [
            {
                "exception_rule_identifier": V2,
                "key_columns": {"book": "direct"},
                "lineage_id": LINEAGE,
            }
        ],
        db_path=db,
        lineage_resolver=resolver,
    )
    assert f"{V2}_direct" in direct.exception_ids


# ------------------------------------------------------------- run persists


def test_run_snapshot_persists_lineage_context(tmp_path: Path) -> None:
    import apps.settings.services as settings_services
    from apps.runs.persistence import load_run, save_run
    from apps.runs.services import ComparisonResult, ExecutionResult, ValidationResult
    from django.test.utils import override_settings

    validation = ValidationResult(
        total_violations=0,
        distinct_violating_rows=0,
        distinct_violating_attributes=0,
        violations_by_rule={},
        violation_count_by_rule={},
        violating_rows_by_rule={},
        violating_attributes_by_rule={},
    )
    comparison = ComparisonResult(
        total_rows_a=0,
        total_rows_b=0,
        matched_rows=0,
        rows_with_changes=0,
        total_attribute_changes=0,
        row_details=[],
    )
    result = ExecutionResult(
        comparison=comparison,
        validation=validation,
        common_columns=[],
        target_columns=[],
        key_columns=["book"],
        filters_applied=[],
    )
    with override_settings(
        RESULTS_DIR=tmp_path / "results",
        UPLOADS_DIR=tmp_path / "uploads",
    ):
        meta = save_run(
            result,
            "a.csv",
            "b.csv",
            as_of_date=OCT_30,
            lineage_context={
                "R001": {
                    "lineage_id": LINEAGE,
                    "revision_number": 2,
                    "event_id": "event-oct15-revision",
                }
            },
        )
        loaded = load_run(meta.run_id)
    assert loaded is not None
    # Frozen per-rule snapshot shape: lineage_id + revision_number + event_id.
    assert loaded["result"]["lineage_context"] == {
        "R001": {
            "lineage_id": LINEAGE,
            "revision_number": 2,
            "event_id": "event-oct15-revision",
        }
    }


# ------------------------------------------------------------------- reports


def _report_violation(**overrides: Any) -> dict[str, Any]:
    violation: dict[str, Any] = {
        "row_index": 5,
        "rule_id": "R001",
        "rule_name": "Test Rule",
        "key_columns": {"id": "456"},
        "details": "Violated R001",
        "violating_column": "score",
        "violating_value": "10",
        "comparison_value": "15",
        "rule_logic": "score lt '20'",
        "rule_identifier": V2,
        "exception_id": f"{V2}_456",
        "exception_status": "RecertificationRequired",
        "recertification_required": True,
        "recertification_reason": "Recertification due to rule change",
        "carried_from_exception_id": f"{V1}_456",
        "carried_from_as_of_date": SEPT_30.isoformat(),
        "rule_evolution_event_id": "event-oct15-revision",
        "revision_token": "event-oct15-revision",
    }
    violation.update(overrides)
    return violation


def test_reports_keep_pending_visible_with_marker_and_counts() -> None:
    from apps.reports.services import export_excel, export_html
    from openpyxl import load_workbook

    validation = {
        "total_violations": 2,
        "distinct_violating_rows": 2,
        "distinct_violating_attributes": 2,
        "violations_by_rule": {
            "R001": [
                _report_violation(),
                _report_violation(
                    row_index=6,
                    exception_id=f"{V2}_789",
                    exception_status="Commented",
                    recertification_required=False,
                    recertification_reason="",
                ),
            ]
        },
        "violation_count_by_rule": {"R001": 2},
        "violating_rows_by_rule": {"R001": 2},
        "violating_attributes_by_rule": {"R001": 2},
        "rule_summaries": {
            "R001": {"rule_identifier": V2, "name": "Test Rule"},
        },
    }
    result = {
        "comparison": {
            "total_rows_a": 2,
            "total_rows_b": 2,
            "rows_with_changes": 0,
            "total_attribute_changes": 0,
            "row_details": [],
            "new_book_count": 0,
            "new_book_details": [],
        },
        "validation": validation,
        "target_columns": ["score"],
        "common_columns": ["id", "score"],
        "key_columns": ["id"],
        "filters_applied": [],
        "new_exceptions_only": True,
    }
    filtered = filter_result_for_new_exceptions(result, True)
    visible = filtered["validation"]["violations_by_rule"]["R001"]
    assert len(visible) == 1
    assert visible[0]["exception_status"] == "RecertificationRequired"
    assert filtered["validation"]["total_violations"] == 1

    rendered = export_html(filtered, "Pending Report")
    assert "Recertification due to rule change" in rendered

    workbook = load_workbook(io.BytesIO(export_excel(filtered, "Pending Report")))
    sheet = workbook["Exception Table"]
    headers = [sheet.cell(3, column).value for column in range(1, sheet.max_column + 1)]
    assert headers[-1] == "Recertification"
    assert sheet.cell(4, len(headers)).value == "Recertification due to rule change"

    # Accepted rows render blank in the marker column.
    accepted = dict(validation)
    accepted["violations_by_rule"] = {
        "R001": [
            _report_violation(
                exception_status="Commented",
                recertification_required=False,
                recertification_reason="",
            )
        ]
    }
    accepted_result = dict(result, validation=accepted)
    assert "Recertification due to rule change" not in export_html(
        accepted_result, "Accepted Report"
    )


def test_cyclic_lineage_carries_nothing_and_warns(
    db_path: Path, resolver: InMemoryLineageResolver
) -> None:
    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    resolver.mark_cyclic(V2)
    summary = repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=resolver
    )
    assert len(summary.carry_warnings) == 1
    assert "loop" in summary.carry_warnings[0]
    target = repo.get_exception(OCT_30, f"{V2}_xxxx")
    assert target is not None
    assert target.exception_commentary == ""
    assert target.status == "New"


def test_frozen_service_shape_adapter_without_a_checkout(db_path: Path) -> None:
    """B adapts to A's exact frozen function/exception names via duck typing."""

    from types import SimpleNamespace

    from apps.exception_tracking.lineage import fetch_predecessor_links

    class LineageAmbiguous(Exception):
        def __init__(self, message: str, lineage_ids: Any = ()) -> None:
            super().__init__(message)
            self.lineage_ids = list(lineage_ids)

    class LineageNotFound(Exception):
        pass

    frozen_link = SimpleNamespace(
        event_id="event-oct15-revision",
        lineage_id=LINEAGE,
        revision_number=2,
        source_identifier=V1,
        target_identifier=V2,
        relationship="revision",
        change_type="executable_revision",
        save_decision="modify_current",
        created_at=None,
    )
    service = SimpleNamespace(
        get_predecessor_chain=lambda target, **kwargs: (
            [frozen_link] if target == V2 else (_ for _ in ()).throw(
                LineageNotFound(target)
            )
        ),
    )
    links, warning = fetch_predecessor_links(service, V2)
    assert warning is None
    assert [link.event_id for link in links] == ["event-oct15-revision"]
    assert links[0].revision_number == 2

    repo = ExceptionTrackingRepository(db_path)
    _sept_comment(repo)
    repo.record_exceptions(
        OCT_30, [_occurrence(V2, OCT_30)], lineage_resolver=service
    )
    carried = repo.get_exception(OCT_30, f"{V2}_xxxx")
    assert carried is not None
    assert carried.exception_commentary == "September review note"
    assert carried.status == "RecertificationRequired"

    unknown_links, unknown_warning = fetch_predecessor_links(service, OTHER)
    assert unknown_links == [] and unknown_warning is None

    ambiguous = SimpleNamespace(
        get_predecessor_chain=lambda target, **kwargs: (_ for _ in ()).throw(
            LineageAmbiguous(target, ["lineage-a", "lineage-b"])
        ),
    )
    no_links, ambiguity_warning = fetch_predecessor_links(ambiguous, V2)
    assert no_links == []
    assert ambiguity_warning is not None
    assert "lineage-a" in ambiguity_warning and "lineage-b" in ambiguity_warning


def test_run_lineage_context_resolves_revision_shape(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Auto-resolution persists lineage_id/revision_number/event_id per rule."""

    import apps.exception_tracking.lineage as lineage_module
    from apps.runs.services import (
        ComparisonResult,
        ExecutionResult,
        ValidationResult,
        ValidationViolation,
    )
    from apps.runs.tracking_capture import resolve_run_lineage_context

    stub = InMemoryLineageResolver(
        [_edge(V1, V2, "event-oct15-revision", revision=2)]
    )
    monkeypatch.setattr(
        lineage_module, "get_lineage_service", lambda: stub
    )
    violation = ValidationViolation(
        row_index=0,
        rule_id="R001",
        rule_name="Rule 1",
        key_columns={"book": "xxxx"},
        details="violated",
        violating_column="status",
        violating_value="bad",
        rule_logic="status eq 'good'",
        rule_identifier=V2,
        exception_id=None,
        exception_status=None,
    )
    result = ExecutionResult(
        comparison=ComparisonResult(
            total_rows_a=1,
            total_rows_b=1,
            matched_rows=1,
            rows_with_changes=0,
            total_attribute_changes=0,
            row_details=[],
        ),
        validation=ValidationResult(
            total_violations=1,
            distinct_violating_rows=1,
            distinct_violating_attributes=1,
            violations_by_rule={"R001": [violation]},
            violation_count_by_rule={"R001": 1},
            violating_rows_by_rule={"R001": 1},
            violating_attributes_by_rule={"R001": 1},
            rule_summaries={"R001": {"rule_identifier": V2}},
        ),
        common_columns=["book", "status"],
        target_columns=["status"],
        key_columns=["book"],
        filters_applied=[],
        rule_bindings={"R001": V2},
    )
    assert resolve_run_lineage_context(result) == {
        "R001": {
            "lineage_id": LINEAGE,
            "revision_number": 2,
            "event_id": "event-oct15-revision",
        }
    }
