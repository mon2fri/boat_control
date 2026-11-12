"""Round 1 regression evidence: unchanged-rule same-identity carry.

Reported bug: for the same unchanged rule and matching book keys, eligible
October 31 commentary did not carry into November 1, so the commented
exceptions stayed visible under New Exceptions Only.

Root cause: ``_cross_revision_attempt`` returned ``(None, True)`` whenever
revision edges existed but no predecessor candidate carried commentary,
unconditionally blocking the legacy same-identity fallback. For an unchanged
rule the eligible commentary lives under the target's OWN identifier in
earlier date tables (the identifier is the chain head and was never revised
away from). The fix allows the same-ID fallback exactly in that shape, while
a revert/round-trip shape (target identifier appears as a source in its own
chain) keeps blocking silent copies.

Also documented here: commentary uploaded AFTER both dates were captured is
not picked up by reads or reloads; a recapture is required. Reads never
synthesize commentary.

All stores are isolated under ``tmp_path``; live databases are never touched.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from apps.exception_tracking.domain import ExceptionOccurrence
from apps.exception_tracking.identity import table_name_for_date
from apps.exception_tracking.lineage import InMemoryLineageResolver
from apps.exception_tracking.repository import (
    ExceptionTrackingRepository,
    list_exceptions,
    update_commentaries,
)
from apps.runs.tracking_context import (
    filter_result_for_new_exceptions,
    refresh_result_dict,
)

OCT_31 = date(2026, 10, 31)
NOV_1 = date(2026, 11, 1)

RA = "CBR1_" + "E" * 20
RB = "CBR1_" + "F" * 20
RC = "CBR1_" + "G" * 20
RD = "CBR1_" + "H" * 20
RE = "CBR1_" + "K" * 20
OTHER = "CBR1_" + "M" * 20

LINEAGE = "lineage-round1"


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


def _occurrence(
    rule: str,
    day: date,
    *,
    book: str = "xxxx",
    commentary: str | None = None,
) -> ExceptionOccurrence:
    keys = {"book": book}
    return ExceptionOccurrence(
        exception_rule_identifier=rule,
        key_columns=keys,
        key_column_order=["book"],
        exception_timestamp=datetime(day.year, day.month, day.day, 8, 0, tzinfo=UTC),
        exception_commentary=commentary,
        exception_rule_index="R007",
    )


def _chain_resolver() -> InMemoryLineageResolver:
    """rev1 -> ... -> rev5 chain mirroring the reported preview lineage."""
    return InMemoryLineageResolver(
        [
            _edge(RA, RB, "event-rev2", 2),
            _edge(RB, RC, "event-rev3", 3),
            _edge(RC, RD, "event-rev4", 4),
            _edge(RD, RE, "event-rev5", 5),
        ]
    )


def test_unchanged_rule_head_carries_same_id_commentary(tmp_path: Path) -> None:
    """Oct-31 commentary uploaded before the Nov-1 capture carries forward."""

    db_path = tmp_path / "tracking.db"
    repo = ExceptionTrackingRepository(db_path)
    resolver = _chain_resolver()
    repo.record_exceptions(
        OCT_31, [_occurrence(RE, OCT_31)], lineage_resolver=resolver
    )
    # XLSX upload between the two runs.
    assert update_commentaries(db_path, OCT_31, {f"{RE}_xxxx": "KZ updated"}) == 1

    summary = repo.record_exceptions(
        NOV_1, [_occurrence(RE, NOV_1)], lineage_resolver=resolver
    )
    assert summary.carry_warnings == ()

    carried = repo.get_exception(NOV_1, f"{RE}_xxxx")
    assert carried is not None
    assert carried.exception_commentary == "KZ updated"
    assert carried.status == "Commented"
    assert carried.recertification_required is False
    assert carried.recertification_reason == ""
    assert carried.rule_evolution_event_id == ""
    assert carried.carried_from_exception_id == ""
    # Both occurrences keep their own IDs and dates.
    assert carried.exception_as_of_date == NOV_1
    assert carried.exception_first_seen_as_of_date == OCT_31

    source = repo.get_exception(OCT_31, f"{RE}_xxxx")
    assert source is not None
    assert source.exception_commentary == "KZ updated"
    assert source.status == "Commented"


def test_revert_round_trip_still_blocks_silent_same_id_copy(tmp_path: Path) -> None:
    """A target that was revised away from before must not copy silently."""

    db_path = tmp_path / "tracking.db"
    repo = ExceptionTrackingRepository(db_path)
    # No edge source carries text: the October row under the old identifier
    # is uncommented, so the revert edge yields no candidate.
    repo.record_exceptions(
        OCT_31, [_occurrence(RB, OCT_31)]
    )
    revert = InMemoryLineageResolver(
        [
            _edge(RB, RA, "event-revert", 3),
            _edge(RA, RB, "event-rev2", 2),
        ]
    )
    repo.record_exceptions(
        NOV_1, [_occurrence(RA, NOV_1)], lineage_resolver=revert
    )

    target = repo.get_exception(NOV_1, f"{RA}_xxxx")
    assert target is not None
    assert target.exception_commentary == ""
    assert target.status != "Commented"


def test_upload_after_both_captures_leaves_later_row_until_recapture(
    tmp_path: Path,
) -> None:
    """Late uploads are visible on their own date only; reads never backfill."""

    db_path = tmp_path / "tracking.db"
    repo = ExceptionTrackingRepository(db_path)
    resolver = _chain_resolver()
    repo.record_exceptions(
        OCT_31, [_occurrence(RE, OCT_31)], lineage_resolver=resolver
    )
    repo.record_exceptions(
        NOV_1, [_occurrence(RE, NOV_1)], lineage_resolver=resolver
    )
    # Upload lands after both captures.
    assert update_commentaries(db_path, OCT_31, {f"{RE}_xxxx": "late note"}) == 1

    assert repo.get_exception(OCT_31, f"{RE}_xxxx").exception_commentary == "late note"
    later = repo.get_exception(NOV_1, f"{RE}_xxxx")
    assert later is not None
    assert later.exception_commentary == ""
    assert later.status == "NotCommented"

    refreshed = refresh_result_dict(
        {
            "validation": {
                "violations_by_rule": {
                    "R007": [
                        {
                            "exception_id": f"{RE}_xxxx",
                            "exception_status": "NotCommented",
                            "key_columns": {"book": "xxxx"},
                            "rule_identifier": RE,
                        }
                    ]
                }
            }
        },
        NOV_1,
        repository=repo,
    )
    violation = refreshed["validation"]["violations_by_rule"]["R007"][0]
    assert violation["exception_status"] == "NotCommented"

    # A same-date recapture intentionally does NOT backfill: the update path
    # preserves stored state because an empty row is indistinguishable from
    # an intentionally cleared one. Uploads flow forward to dates captured
    # afterwards; already-captured dates keep their stored commentary until
    # edited directly.
    summary = repo.record_exceptions(
        NOV_1, [_occurrence(RE, NOV_1)], lineage_resolver=resolver
    )
    assert summary.carry_warnings == ()
    recaptured = repo.get_exception(NOV_1, f"{RE}_xxxx")
    assert recaptured is not None
    assert recaptured.exception_commentary == ""
    assert recaptured.status == "NotCommented"


def test_same_id_carry_preserves_target_edits_and_clears(tmp_path: Path) -> None:
    """Existing target commentary wins; clears never resurrect older text."""

    db_path = tmp_path / "tracking.db"
    repo = ExceptionTrackingRepository(db_path)
    resolver = _chain_resolver()
    repo.record_exceptions(
        OCT_31, [_occurrence(RE, OCT_31)], lineage_resolver=resolver
    )
    assert update_commentaries(db_path, OCT_31, {f"{RE}_xxxx": "October note"}) == 1
    repo.record_exceptions(
        NOV_1, [_occurrence(RE, NOV_1)], lineage_resolver=resolver
    )
    assert update_commentaries(db_path, NOV_1, {f"{RE}_xxxx": "November edit"}) == 1
    # Repeat capture must not overwrite the direct target edit.
    repo.record_exceptions(
        NOV_1, [_occurrence(RE, NOV_1)], lineage_resolver=resolver
    )
    assert repo.get_exception(NOV_1, f"{RE}_xxxx").exception_commentary == "November edit"

    assert update_commentaries(db_path, OCT_31, {f"{RE}_xxxx": ""}) == 1
    assert update_commentaries(db_path, NOV_1, {f"{RE}_xxxx": ""}) == 1
    repo2 = ExceptionTrackingRepository(tmp_path / "tracking2.db")
    repo2.record_exceptions(
        OCT_31, [_occurrence(RE, OCT_31, commentary="October note")],
        lineage_resolver=resolver,
    )
    assert update_commentaries(repo2.database_path, OCT_31, {f"{RE}_xxxx": ""}) == 1
    repo2.record_exceptions(
        NOV_1, [_occurrence(RE, NOV_1)], lineage_resolver=resolver
    )
    cleared = repo2.get_exception(NOV_1, f"{RE}_xxxx")
    assert cleared is not None
    assert cleared.exception_commentary == ""
    assert cleared.status != "Commented"


def test_commented_pair_scope_filtering_and_unrelated_books(tmp_path: Path) -> None:
    """Commented pair hidden when checked, visible when unchecked; others new."""

    db_path = tmp_path / "tracking.db"
    repo = ExceptionTrackingRepository(db_path)
    resolver = _chain_resolver()
    repo.record_exceptions(
        OCT_31,
        [_occurrence(RE, OCT_31), _occurrence(OTHER, OCT_31, book="yyyy")],
        lineage_resolver=resolver,
    )
    assert update_commentaries(db_path, OCT_31, {f"{RE}_xxxx": "KZ updated"}) == 1
    repo.record_exceptions(
        NOV_1,
        [_occurrence(RE, NOV_1), _occurrence(OTHER, NOV_1, book="yyyy")],
        lineage_resolver=resolver,
    )

    rows = {row.exception_id: row for row in list_exceptions(db_path, NOV_1)}
    assert rows[f"{RE}_xxxx"].status == "Commented"
    assert rows[f"{OTHER}_yyyy"].status != "Commented"
    assert rows[f"{OTHER}_yyyy"].exception_commentary == ""

    result = {
        "validation": {
            "violations_by_rule": {
                "R007": [
                    {"exception_status": "Commented", "row_index": 0},
                    {"exception_status": "NotCommented", "row_index": 1},
                ]
            },
            "violation_count_by_rule": {"R007": 2},
            "violating_rows_by_rule": {"R007": 2},
            "violating_attributes_by_rule": {"R007": 2},
            "total_violations": 2,
            "distinct_violating_rows": 2,
            "distinct_violating_attributes": 2,
        }
    }
    checked = filter_result_for_new_exceptions(result, True)
    visible = checked["validation"]["violations_by_rule"]["R007"]
    assert [item["exception_status"] for item in visible] == ["NotCommented"]
    assert checked["validation"]["total_violations"] == 1
    unchecked = filter_result_for_new_exceptions(result, False)
    assert len(unchecked["validation"]["violations_by_rule"]["R007"]) == 2

    assert table_name_for_date(NOV_1) == "exceptions_20261101"
