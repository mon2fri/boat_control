"""Real-service rule-evolution integration (Worker B + Worker A, no stubs).

Sept 30 v1 commentary -> recorded executable revision (no intervening run) ->
Oct 30 v2 carry through the REAL
`apps.rules.evolution.get_predecessor_chain`. The configuration database runs
on Django's isolated test database; the tracking database is an isolated
`tmp_path` store. The live databases are never touched.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from apps.exception_tracking.domain import ExceptionOccurrence
from apps.exception_tracking.repository import ExceptionTrackingRepository

V1 = "CBR1_" + "A" * 20
V2 = "CBR1_" + "B" * 20
SEPT_30 = date(2026, 9, 30)
OCT_30 = date(2026, 10, 30)


def _at(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, 8, 0, tzinfo=UTC)


@pytest.mark.django_db
def test_real_chain_carry_without_edit_date_run(tmp_path: Path) -> None:
    from apps.rules.evolution import (
        CARRY_FORWARD_RECERTIFICATION,
        CREATION,
        EXECUTABLE_REVISION,
        MODIFY_CURRENT,
        NO_INHERITANCE,
        SYSTEM_DECISION,
        create_lineage,
        get_predecessor_chain,
        record_event,
    )

    lineage = create_lineage()
    creation = record_event(
        lineage=lineage,
        revision_number=1,
        previous_event=None,
        source_rule=None,
        target_rule=None,
        source_identifier=None,
        target_identifier=V1,
        change_type=CREATION,
        save_decision=SYSTEM_DECISION,
        before_payload=None,
        after_payload={"version": 1},
        change_summary=None,
        commentary_policy=NO_INHERITANCE,
        source="ui_create",
        changed_by=None,
    )
    revision = record_event(
        lineage=lineage,
        revision_number=2,
        previous_event=creation,
        source_rule=None,
        target_rule=None,
        source_identifier=V1,
        target_identifier=V2,
        change_type=EXECUTABLE_REVISION,
        save_decision=MODIFY_CURRENT,
        before_payload={"version": 1},
        after_payload={"version": 2},
        change_summary={"identifier_changed": True, "extreme_changes": []},
        commentary_policy=CARRY_FORWARD_RECERTIFICATION,
        source="ui_edit",
        changed_by=None,
    )

    chain = get_predecessor_chain(V2)
    assert [link.event_id for link in chain] == [revision.event_id]
    assert chain[0].source_identifier == V1
    assert chain[0].lineage_id == lineage.lineage_id
    assert chain[0].revision_number == 2
    assert chain[0].relationship == "revision"

    repo = ExceptionTrackingRepository(tmp_path / "tracking_real.db")
    repo.record_exceptions(
        SEPT_30,
        [
            ExceptionOccurrence(
                exception_rule_identifier=V1,
                key_columns={"book": "xxxx"},
                key_column_order=["book"],
                exception_timestamp=_at(SEPT_30),
                exception_commentary="September review note",
                exception_rule_index="R001",
            )
        ],
    )
    # No run on the revision date. Oct 30 capture resolves the REAL service
    # automatically (lineage_resolver=None probes apps.rules.evolution).
    summary = repo.record_exceptions(
        OCT_30,
        [
            ExceptionOccurrence(
                exception_rule_identifier=V2,
                key_columns={"book": "xxxx"},
                key_column_order=["book"],
                exception_timestamp=_at(OCT_30),
                exception_commentary=None,
                exception_rule_index="R001",
            )
        ],
    )
    assert summary.carry_warnings == ()

    source = repo.get_exception(SEPT_30, f"{V1}_xxxx")
    carried = repo.get_exception(OCT_30, f"{V2}_xxxx")
    assert source is not None and carried is not None
    assert source.status == "Commented"
    assert carried.exception_commentary == "September review note"
    assert "Recertification due to rule change" not in carried.exception_commentary
    assert carried.status == "RecertificationRequired"
    assert carried.recertification_reason == "Recertification due to rule change"
    assert carried.carried_from_exception_id == f"{V1}_xxxx"
    assert carried.carried_from_as_of_date == SEPT_30
    assert carried.carried_from_rule_identifier == V1
    assert carried.rule_evolution_event_id == revision.event_id
    assert carried.exception_as_of_date == OCT_30
