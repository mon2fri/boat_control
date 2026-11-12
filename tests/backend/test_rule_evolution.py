"""Rule-evolution behavior: lineage, revision history, and save decisions.

Worker A evidence for the rule-evolution feature. All checks run against an
isolated Django test database (the configuration store); no live user data,
CSVs, or saved configs are touched.
"""

from __future__ import annotations

import pytest
from apps.rules import evolution as rule_evolution
from apps.rules.models import (
    RuleEvolutionHistory,
    RuleLineage,
    RuleStoreState,
    StoredValidationRule,
)
from django.core.management import call_command
from django.db import connection
from django.test import override_settings
from rest_framework.test import APIClient


def make_draft(
    name: str = "Rule",
    *,
    conditions: list[dict] | None = None,
    target: str = "active",
    relation: str | None = None,
) -> dict:
    if conditions is None:
        conditions = [{"column_name": "kind", "operator": "eq", "filter_value": "0"}]
    draft: dict = {
        "name": name,
        "description": "evolution probe",
        "conditions": conditions,
        "logic": {
            "format": "value_vs_column",
            "column_name": "status",
            "operator": "eq",
            "target_value": target,
        },
    }
    if relation is not None or len(conditions) >= 2:
        draft["condition_relation"] = relation or "and"
    return draft


def event_count() -> int:
    return RuleEvolutionHistory.objects.count()


def history_for(identifier: str):
    return list(RuleEvolutionHistory.objects.filter(target_identifier=identifier))


# ---------------------------------------------------------------------------
# Ordinary revisions, metadata edits, and no-ops
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_ordinary_executable_edit_defaults_to_modify_current() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    # Keep the original condition, add a second one: executable change, but
    # not an extensive one, so no confirmation is required.
    edited = make_draft(
        "Revised",
        conditions=[
            {"column_name": "kind", "operator": "eq", "filter_value": "0"},
            {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
        ],
    )
    response = client.put(f"/api/rules/{original['rule_id']}/", edited, format="json")

    assert response.status_code == 200, response.content
    body = response.json()
    assert body["resulting_rule_id"] != original["rule_id"]
    assert body["save_decision"] == "modify_current"
    assert body["lineage_id"] == original["lineage_id"]
    assert body["evolution_event_id"]
    old_row = StoredValidationRule.objects.get(rule_id=original["rule_id"])
    assert old_row.archived_at is not None
    assert old_row.superseded_by is not None
    # The old definition is preserved verbatim in the configuration history.
    events = history_for(body["rule_identifier"])
    assert len(events) == 1
    event = events[0]
    assert event.change_type == "executable_revision"
    assert event.source_identifier == original["rule_identifier"]
    assert event.target_identifier == body["rule_identifier"]
    assert event.commentary_policy == "carry_forward_recertification"
    assert event.before_payload["name"] == "Rule"
    assert event.after_payload["name"] == "Revised"


@pytest.mark.django_db
def test_metadata_edit_records_history_without_new_revision() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    before_events = event_count()

    response = client.put(
        f"/api/rules/{original['rule_id']}/",
        {**make_draft(), "name": "Renamed", "description": "new blurb"},
        format="json",
    )

    assert response.status_code == 200, response.content
    body = response.json()
    assert body["rule_id"] == original["rule_id"]
    assert body["rule_identifier"] == original["rule_identifier"]
    assert body["revision_number"] == original["revision_number"]
    assert event_count() == before_events + 1
    event = history_for(original["rule_identifier"])[-1]
    assert event.change_type == "metadata_edit"
    assert event.commentary_policy == "no_inheritance"
    assert "name" in event.change_summary["metadata_changed"]
    # The executable revision is unchanged, so commentary recertification
    # must not be initiated: the predecessor chain skips metadata events.
    chain = rule_evolution.get_predecessor_chain(original["rule_identifier"])
    assert chain == []


@pytest.mark.django_db
def test_true_noop_save_records_nothing() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    before_events = event_count()

    response = client.put(
        f"/api/rules/{original['rule_id']}/", make_draft(), format="json"
    )

    assert response.status_code == 200, response.content
    assert event_count() == before_events


@pytest.mark.django_db
def test_reordering_equivalent_clauses_is_not_extensive() -> None:
    client = APIClient()
    draft = make_draft(
        conditions=[
            {"column_name": "kind", "operator": "eq", "filter_value": "0"},
            {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
        ]
    )
    original = client.post("/api/rules/", draft, format="json").json()
    reordered = make_draft(
        conditions=[
            {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
            {"column_name": "kind", "operator": "eq", "filter_value": "0"},
        ]
    )
    assert rule_evolution.detect_extensive_changes(draft, reordered) == []

    response = client.put(
        f"/api/rules/{original['rule_id']}/", reordered, format="json"
    )

    assert response.status_code == 200, response.content
    assert response.json()["rule_identifier"] == original["rule_identifier"]
    assert response.json()["rule_id"] == original["rule_id"]


@pytest.mark.django_db
def test_grouping_only_change_revises_without_confirmation() -> None:
    client = APIClient()
    draft = make_draft(
        conditions=[
            {"column_name": "kind", "operator": "eq", "filter_value": "0"},
            {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
        ]
    )
    original = client.post("/api/rules/", draft, format="json").json()
    regrouped = make_draft(
        conditions=[
            {"column_name": "kind", "operator": "eq", "filter_value": "0"},
            {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
        ]
    )
    regrouped["grouping_tree"] = {
        "kind": "or",
        "children": [
            {"kind": "leaf", "conditionId": "c0"},
            {"kind": "leaf", "conditionId": "c1"},
        ],
    }
    assert rule_evolution.detect_extensive_changes(draft, regrouped) == []

    response = client.put(
        f"/api/rules/{original['rule_id']}/", regrouped, format="json"
    )

    assert response.status_code == 200, response.content
    body = response.json()
    assert body["rule_identifier"] != original["rule_identifier"]
    assert body["resulting_rule_id"] != original["rule_id"]
    event = history_for(body["rule_identifier"])[0]
    assert event.change_type == "executable_revision"
    assert event.commentary_policy == "carry_forward_recertification"


# ---------------------------------------------------------------------------
# Extensive-edit confirmation contract (A -> C JSON)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_wholesale_condition_replacement_requires_choice_then_revises() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    edited = make_draft(
        "Rewritten",
        conditions=[{"column_name": "region", "operator": "eq", "filter_value": "EMEA"}],
    )
    rows_before = StoredValidationRule.objects.count()
    events_before = event_count()

    required = client.put(
        f"/api/rules/{original['rule_id']}/", edited, format="json"
    )

    assert required.status_code == 409
    assert required.json() == {
        "code": "rule_save_decision_required",
        "message": "Choose whether to modify the current rule or save as new.",
        "original_rule_id": original["rule_id"],
        "original_identifier": original["rule_identifier"],
        "proposed_identifier": required.json()["proposed_identifier"],
        "extreme_changes": ["conditions_replaced"],
    }
    # No write occurs before the user's choice.
    assert StoredValidationRule.objects.count() == rows_before
    assert event_count() == events_before

    response = client.put(
        f"/api/rules/{original['rule_id']}/",
        {
            **edited,
            "save_decision": "modify_current",
            "source_identifier": original["rule_identifier"],
        },
        format="json",
    )

    assert response.status_code == 200, response.content
    body = response.json()
    assert body["resulting_rule_id"] != original["rule_id"]
    assert body["lineage_id"] == original["lineage_id"]
    assert body["revision_number"] == original["revision_number"] + 1


@pytest.mark.django_db
def test_wholesale_expectation_replacement_requires_choice() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    edited = make_draft("Retargeted", target="pending")

    required = client.put(
        f"/api/rules/{original['rule_id']}/", edited, format="json"
    )

    assert required.status_code == 409
    assert required.json()["extreme_changes"] == ["expectations_replaced"]
    assert required.json()["original_identifier"] == original["rule_identifier"]

    response = client.put(
        f"/api/rules/{original['rule_id']}/",
        {**edited, "save_decision": "modify_current"},
        format="json",
    )
    assert response.status_code == 200, response.content


@pytest.mark.django_db
def test_empty_conditions_before_and_after_are_not_wholesale_removal() -> None:
    assert (
        rule_evolution.detect_extensive_changes(
            make_draft(conditions=[]), make_draft(conditions=[], target="x")
        )
        == ["expectations_replaced"]
    )
    assert (
        rule_evolution.detect_extensive_changes(
            make_draft(conditions=[]), make_draft(conditions=[])
        )
        == []
    )


@pytest.mark.django_db
def test_save_as_new_preserves_source_and_breaks_inheritance() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    edited = make_draft(
        "Forked",
        conditions=[{"column_name": "region", "operator": "eq", "filter_value": "EMEA"}],
    )

    response = client.put(
        f"/api/rules/{original['rule_id']}/",
        {
            **edited,
            "save_decision": "save_as_new",
            "source_identifier": original["rule_identifier"],
        },
        format="json",
    )

    assert response.status_code == 201, response.content
    body = response.json()
    assert body["saved_as_new"] is True
    assert body["previous_rule_id"] == original["rule_id"]
    assert body["resulting_rule_id"] != original["rule_id"]
    assert body["lineage_id"] != original["lineage_id"]
    # The source rule is preserved untouched.
    source = client.get(f"/api/rules/{original['rule_id']}/").json()
    assert source["rule_identifier"] == original["rule_identifier"]
    assert source["enabled"] is True
    assert StoredValidationRule.objects.get(rule_id=original["rule_id"]).archived_at is None
    # The new lineage carries no inheritable predecessor edge.
    chain = rule_evolution.get_predecessor_chain(
        body["rule_identifier"], lineage_id=body["lineage_id"]
    )
    assert chain == []
    event = RuleEvolutionHistory.objects.get(event_id=body["evolution_event_id"])
    assert event.change_type == "save_as_new"
    assert event.previous_event is None
    assert event.commentary_policy == "no_inheritance"
    assert event.source_identifier == original["rule_identifier"]


@pytest.mark.django_db
def test_save_as_new_with_equivalent_identity_reuses_without_merging() -> None:
    client = APIClient()
    first = client.post("/api/rules/", make_draft("First"), format="json").json()
    second = client.post(
        "/api/rules/", make_draft("Second", target="pending"), format="json"
    ).json()

    response = client.put(
        f"/api/rules/{second['rule_id']}/",
        {**make_draft("Fork"), "save_decision": "save_as_new"},
        format="json",
    )

    assert response.status_code == 201, response.content
    body = response.json()
    assert body["equivalent_rule"] is True
    assert body["equivalent_rule_id"] == first["rule_id"]
    assert body["resulting_rule_id"] == first["rule_id"]
    # No lineage was merged and the source is intact.
    assert client.get(f"/api/rules/{second['rule_id']}/").json()["rule_identifier"] == second[
        "rule_identifier"
    ]


@pytest.mark.django_db
def test_invalid_save_decision_is_rejected_before_any_write() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    events_before = event_count()

    response = client.put(
        f"/api/rules/{original['rule_id']}/",
        {**make_draft("Bad"), "save_decision": "overwrite"},
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["code"] == "rule_save_decision_invalid"
    assert event_count() == events_before


@pytest.mark.django_db
def test_invalid_draft_fails_validation_without_history_or_mutation() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    events_before = event_count()
    invalid = make_draft("Broken")
    del invalid["logic"]

    response = client.put(
        f"/api/rules/{original['rule_id']}/",
        {**invalid, "save_decision": "modify_current"},
        format="json",
    )

    assert response.status_code == 400
    assert StoredValidationRule.objects.get(rule_id=original["rule_id"]).superseded_by is None
    assert event_count() == events_before


# ---------------------------------------------------------------------------
# Concurrency, reuse conflicts, reversion
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_stale_confirmation_is_rejected_and_leaves_catalog_untouched() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    first_edit = make_draft(
        "V2",
        conditions=[
            {"column_name": "kind", "operator": "eq", "filter_value": "0"},
            {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
        ],
    )
    moved = client.put(
        f"/api/rules/{original['rule_id']}/",
        {**first_edit, "source_identifier": original["rule_identifier"]},
        format="json",
    ).json()
    events_before = event_count()

    stale = client.put(
        f"/api/rules/{moved['resulting_rule_id']}/",
        {
            **make_draft("Stale"),
            "save_decision": "modify_current",
            "source_identifier": original["rule_identifier"],
        },
        format="json",
    )

    assert stale.status_code == 409
    assert stale.json()["code"] == "rule_save_stale"
    assert stale.json()["current_identifier"] == moved["rule_identifier"]
    assert event_count() == events_before


@pytest.mark.django_db
def test_stale_check_runs_before_extensive_edit_detection() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    edited = make_draft("Extreme", target="pending")

    response = client.put(
        f"/api/rules/{original['rule_id']}/",
        {**edited, "source_identifier": "CBR1_00000000000000000000"},
        format="json",
    )

    assert response.status_code == 409
    assert response.json()["code"] == "rule_save_stale"


@pytest.mark.django_db
def test_modify_current_into_another_lineage_is_a_conflict() -> None:
    client = APIClient()
    first = client.post("/api/rules/", make_draft("First"), format="json").json()
    second = client.post(
        "/api/rules/", make_draft("Second", target="pending"), format="json"
    ).json()
    rows_before = StoredValidationRule.objects.count()
    events_before = event_count()

    response = client.put(
        f"/api/rules/{second['rule_id']}/",
        {**make_draft("Hijack"), "save_decision": "modify_current"},
        format="json",
    )

    assert response.status_code == 409
    assert response.json()["code"] == "rule_identity_reuse_conflict"
    assert response.json()["existing_rule_id"] == first["rule_id"]
    assert StoredValidationRule.objects.count() == rows_before
    assert event_count() == events_before


@pytest.mark.django_db
def test_reversion_to_own_lineage_identity_is_allowed() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    v2 = client.put(
        f"/api/rules/{original['rule_id']}/",
        {
            **make_draft(
                "V2",
                conditions=[
                    {"column_name": "kind", "operator": "eq", "filter_value": "0"},
                    {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
                ],
            ),
            "save_decision": "modify_current",
        },
        format="json",
    ).json()

    reverted = client.put(
        f"/api/rules/{v2['resulting_rule_id']}/",
        {**make_draft("Back to V1"), "save_decision": "modify_current"},
        format="json",
    )

    assert reverted.status_code == 200, reverted.content
    body = reverted.json()
    assert body["resulting_rule_id"] == original["rule_id"]
    assert body["rule_identifier"] == original["rule_identifier"]
    assert body["lineage_id"] == original["lineage_id"]
    event = RuleEvolutionHistory.objects.get(event_id=body["evolution_event_id"])
    assert event.change_summary["reversion"] is True
    assert event.commentary_policy == "carry_forward_recertification"


# ---------------------------------------------------------------------------
# Copy/create, enabled selections, archive/reinstate
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_copy_create_starts_a_new_lineage_and_duplicate_reuses() -> None:
    client = APIClient()
    first = client.post("/api/rules/", make_draft("First"), format="json").json()
    other = client.post(
        "/api/rules/", make_draft("Other", target="pending"), format="json"
    ).json()
    assert other["lineage_id"] != first["lineage_id"]
    assert other["revision_number"] == 1

    duplicate = client.post("/api/rules/", make_draft("Renamed copy"), format="json")

    assert duplicate.status_code == 201
    assert duplicate.json()["equivalent_rule"] is True
    assert duplicate.json()["equivalent_rule_id"] == first["rule_id"]
    # The original metadata is preserved and no lineage was merged.
    assert client.get(f"/api/rules/{first['rule_id']}/").json()["name"] == "First"
    assert RuleEvolutionHistory.objects.filter(change_type="creation").count() == 2


@pytest.mark.django_db
def test_enabled_selections_survive_both_save_decisions() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    revised = make_draft(
        "Revised",
        conditions=[
            {"column_name": "kind", "operator": "eq", "filter_value": "0"},
            {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
        ],
    )
    moved = client.put(
        f"/api/rules/{original['rule_id']}/",
        {**revised, "save_decision": "modify_current"},
        format="json",
    ).json()
    enabled = {
        rule["rule_id"] for rule in client.get("/api/rules/").json()["rules"] if rule["enabled"]
    }
    assert enabled == {moved["resulting_rule_id"]}

    forked = client.put(
        f"/api/rules/{moved['resulting_rule_id']}/",
        {
            **make_draft("Fork", target="pending"),
            "save_decision": "save_as_new",
        },
        format="json",
    ).json()
    selected = {
        rule["rule_id"] for rule in client.get("/api/rules/").json()["rules"] if rule["enabled"]
    }
    # The source stays selected and the new rule follows create behavior.
    assert selected == {moved["resulting_rule_id"], forked["resulting_rule_id"]}


@pytest.mark.django_db
def test_archive_and_reinstate_preserve_history() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    revised = client.put(
        f"/api/rules/{original['rule_id']}/",
        {
            **make_draft(
                "V2",
                conditions=[
                    {"column_name": "kind", "operator": "eq", "filter_value": "0"},
                    {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
                ],
            ),
            "save_decision": "modify_current",
        },
        format="json",
    ).json()
    events_before = event_count()

    archived = client.delete(f"/api/rules/{revised['resulting_rule_id']}/")
    assert archived.status_code == 200
    v2_draft = make_draft(
        "V2",
        conditions=[
            {"column_name": "kind", "operator": "eq", "filter_value": "0"},
            {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
        ],
    )
    conflicted = client.post(
        "/api/rules/configs/import/", {"rules": [v2_draft]}, format="json"
    )
    assert conflicted.status_code == 409
    conflict_identifier = conflicted.json()["conflicts"][0]["rule_identifier"]
    reinstated = client.post(
        "/api/rules/configs/import/",
        {"rules": [v2_draft], "decisions": {conflict_identifier: "reinstate"}},
        format="json",
    )
    assert reinstated.status_code == 200, reinstated.content
    assert event_count() > events_before
    # Both endpoints and their identifiers survive archive/reinstate.
    history = client.get(f"/api/rules/{revised['resulting_rule_id']}/history/").json()
    change_types = {item["change_type"] for item in history["events"]}
    assert {"creation", "executable_revision", "archive", "reinstate"} <= change_types
    identifiers = {item["target_identifier"] for item in history["events"]}
    assert original["rule_identifier"] in identifiers or revised["rule_identifier"] in identifiers


# ---------------------------------------------------------------------------
# A -> B service: predecessor chains and revision context
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_v1_to_v3_chain_resolves_without_intermediate_runs() -> None:
    client = APIClient()
    v1 = client.post("/api/rules/", make_draft("V1"), format="json").json()
    v2 = client.put(
        f"/api/rules/{v1['rule_id']}/",
        {
            **make_draft(
                "V2",
                conditions=[
                    {"column_name": "kind", "operator": "eq", "filter_value": "0"},
                    {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
                ],
            ),
            "save_decision": "modify_current",
        },
        format="json",
    ).json()
    v3 = client.put(
        f"/api/rules/{v2['resulting_rule_id']}/",
        {
            **make_draft("V3", target="pending"),
            "save_decision": "modify_current",
        },
        format="json",
    ).json()

    chain = rule_evolution.get_predecessor_chain(v3["rule_identifier"])

    assert [(link.source_identifier, link.target_identifier) for link in chain] == [
        (v2["rule_identifier"], v3["rule_identifier"]),
        (v1["rule_identifier"], v2["rule_identifier"]),
    ]
    assert all(link.relationship == "revision" for link in chain)
    assert [link.revision_number for link in chain] == [3, 2]
    context = rule_evolution.resolve_revision_context(v3["rule_identifier"])
    assert context.status == "ok"
    assert context.lineage_id == v1["lineage_id"]
    assert context.revision_number == 3


@pytest.mark.django_db
def test_lineage_service_reports_missing_ambiguous_and_scoped_queries() -> None:
    with pytest.raises(rule_evolution.LineageNotFound):
        rule_evolution.get_predecessor_chain("CBR1_AAAAAAAAAAAAAAAAAAAA")
    assert (
        rule_evolution.resolve_revision_context("CBR1_AAAAAAAAAAAAAAAAAAAA").status
        == "missing"
    )

    first = rule_evolution.create_lineage()
    second = rule_evolution.create_lineage()
    for lineage in (first, second):
        rule_evolution.record_event(
            lineage=lineage,
            revision_number=1,
            previous_event=None,
            source_rule=None,
            target_rule=None,
            source_identifier=None,
            target_identifier="CBR1_BBBBBBBBBBBBBBBBBBBB",
            change_type=rule_evolution.CREATION,
            save_decision=rule_evolution.ORDINARY_CREATE,
            before_payload=None,
            after_payload={"name": "x"},
            change_summary={},
            commentary_policy=rule_evolution.NO_INHERITANCE,
            source="ui_create",
        )
    with pytest.raises(rule_evolution.LineageAmbiguous) as excinfo:
        rule_evolution.get_predecessor_chain("CBR1_BBBBBBBBBBBBBBBBBBBB")
    assert set(excinfo.value.lineage_ids) == {first.lineage_id, second.lineage_id}
    ambiguous = rule_evolution.resolve_revision_context("CBR1_BBBBBBBBBBBBBBBBBBBB")
    assert ambiguous.status == "ambiguous"
    assert set(ambiguous.candidates) == {first.lineage_id, second.lineage_id}
    scoped = rule_evolution.resolve_revision_context(
        "CBR1_BBBBBBBBBBBBBBBBBBBB", lineage_id=first.lineage_id
    )
    assert scoped.status == "ok"
    assert scoped.lineage_id == first.lineage_id
    assert rule_evolution.resolve_revision_context(
        "CBR1_BBBBBBBBBBBBBBBBBBBB", lineage_id="deadbeef"
    ).status == "missing"


# ---------------------------------------------------------------------------
# Read-only history endpoint (A -> C)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_history_endpoint_exposes_before_after_and_decisions() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    revised = client.put(
        f"/api/rules/{original['rule_id']}/",
        {
            **make_draft(
                "V2",
                conditions=[
                    {"column_name": "kind", "operator": "eq", "filter_value": "0"},
                    {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
                ],
            ),
            "save_decision": "modify_current",
        },
        format="json",
    ).json()

    history = client.get(f"/api/rules/{revised['resulting_rule_id']}/history/")

    assert history.status_code == 200
    body = history.json()
    assert body["lineage_id"] == original["lineage_id"]
    assert body["revision_number"] == 2
    by_type = {item["change_type"]: item for item in body["events"]}
    assert set(by_type) == {"creation", "executable_revision"}
    revision = by_type["executable_revision"]
    assert revision["source_identifier"] == original["rule_identifier"]
    assert revision["target_identifier"] == revised["rule_identifier"]
    assert revision["before_payload"]["name"] == "Rule"
    assert revision["after_payload"]["name"] == "V2"
    assert revision["save_decision"] == "modify_current"
    assert revision["commentary_policy"] == "carry_forward_recertification"
    assert revision["previous_event_id"] == by_type["creation"]["event_id"]

    assert client.get("/api/rules/R999/history/").status_code == 404


# ---------------------------------------------------------------------------
# Configuration storage, imports, startup sync, legacy backfill
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_history_tables_live_in_configuration_storage() -> None:
    assert RuleEvolutionHistory._meta.db_table == "rules_rule_evolution_history"
    assert RuleLineage._meta.db_table == "rules_rule_lineage"
    tables = connection.introspection.table_names()
    assert "rules_rule_evolution_history" in tables
    assert "rules_rule_lineage" in tables
    # The exception-tracking database is a separate store; history never
    # lives there. (The tracking DB path is isolated per-test by conftest.)

    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    indexed = RuleEvolutionHistory.objects.filter(
        target_identifier=original["rule_identifier"]
    )
    assert indexed.count() == 1
    assert indexed[0].lineage.lineage_id == original["lineage_id"]


@pytest.mark.django_db
def test_repeated_import_and_startup_are_idempotent() -> None:
    client = APIClient()
    created = client.post("/api/rules/", make_draft("First"), format="json").json()
    revision_before = RuleStoreState.objects.get(singleton_key=1).revision
    events_before = event_count()

    for _ in range(2):
        imported = client.post(
            "/api/rules/configs/import/", {"rules": [make_draft("First")]}, format="json"
        )
        assert imported.status_code == 200, imported.content
        assert imported.json()["reused"] == 1

    assert event_count() == events_before
    assert RuleStoreState.objects.get(singleton_key=1).revision == revision_before
    assert created["lineage_id"] == client.get("/api/rules/R001/").json()["lineage_id"]


@pytest.mark.django_db
def test_named_import_with_lineage_hint_records_revision() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    hinted = make_draft(
        "Hinted V2",
        conditions=[
            {"column_name": "kind", "operator": "eq", "filter_value": "0"},
            {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
        ],
    )
    hinted["lineage_id"] = original["lineage_id"]

    imported = client.post(
        "/api/rules/configs/import/", {"rules": [hinted]}, format="json"
    )

    assert imported.status_code == 200, imported.content
    new_id = imported.json()["bindings"]
    assert len(new_id) == 1
    new_rule_id = next(iter(new_id))
    assert new_rule_id != original["rule_id"]
    history = client.get(f"/api/rules/{new_rule_id}/history/").json()
    assert history["lineage_id"] == original["lineage_id"]
    revision = next(
        item for item in history["events"] if item["change_type"] == "import_sync"
    )
    assert revision["commentary_policy"] == "carry_forward_recertification"
    assert revision["source_identifier"] == original["rule_identifier"]


@pytest.mark.django_db
def test_unannotated_changed_import_creates_independent_lineage() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()

    imported = client.post(
        "/api/rules/configs/import/",
        {"rules": [make_draft("Changed", target="pending")]},
        format="json",
    )

    assert imported.status_code == 200, imported.content
    new_rule_id = next(iter(imported.json()["bindings"]))
    new_snapshot = client.get(f"/api/rules/{new_rule_id}/").json()
    assert new_snapshot["lineage_id"] != original["lineage_id"]
    # No inheritable edge was invented: the unannotated import stands alone.
    assert (
        rule_evolution.get_predecessor_chain(
            new_snapshot["rule_identifier"], lineage_id=new_snapshot["lineage_id"]
        )
        == []
    )
    assert (
        rule_evolution.get_predecessor_chain(original["rule_identifier"]) == []
    )


@pytest.mark.django_db
def test_contradicting_lineage_hint_fails_atomically() -> None:
    client = APIClient()
    first = client.post("/api/rules/", make_draft("First"), format="json").json()
    second = client.post(
        "/api/rules/", make_draft("Second", target="pending"), format="json"
    ).json()
    events_before = event_count()
    forged = make_draft("First")
    forged["lineage_id"] = second["lineage_id"]

    response = client.post(
        "/api/rules/configs/import/", {"rules": [forged]}, format="json"
    )

    assert response.status_code == 409
    assert response.json()["code"] == "rule_identity_reuse_conflict"
    assert event_count() == events_before
    assert first["lineage_id"] != second["lineage_id"]


@pytest.mark.django_db
def test_legacy_backfill_converts_superseded_chains_without_invention(tmp_path) -> None:
    from apps.rules.identifiers import calculate_rule_identity_details
    from apps.rules.models import ValidationRuleIdentity as Identity
    from apps.rules.services import normalize_rule_draft

    def orphan_row(rule_id: str, position: int, draft: dict) -> StoredValidationRule:
        normalized = normalize_rule_draft(draft)
        identifier, digest, payload = calculate_rule_identity_details(normalized)
        identity, _ = Identity.objects.get_or_create(
            identifier=identifier,
            defaults={
                "full_digest": digest,
                "canonical_payload": payload,
                "algorithm_version": 1,
            },
        )
        return StoredValidationRule.objects.create(
            identity=identity,
            rule_id=rule_id,
            catalog_position=position,
            authored_payload=dict(normalized),
            enabled=False,
            lineage=None,
            evolution_revision=None,
        )

    v1 = orphan_row("R001", 1, make_draft("V1"))
    v2 = orphan_row("R002", 2, make_draft("V2", target="pending"))
    lone = orphan_row("R003", 3, make_draft("Lone", target="other"))
    v1.superseded_by = v2
    v1.save(update_fields=["superseded_by"])

    totals = rule_evolution.backfill_legacy_lineages()

    assert totals == {"lineages": 2, "events": 3}
    v1.refresh_from_db()
    v2.refresh_from_db()
    lone.refresh_from_db()
    assert v1.lineage_id == v2.lineage_id
    assert lone.lineage_id != v1.lineage_id
    chain = rule_evolution.get_predecessor_chain(v2.identity_id)
    assert [(link.source_identifier, link.target_identifier) for link in chain] == [
        (v1.identity_id, v2.identity_id)
    ]
    # Unknown legacy relationships stay unknown: the lone row has no edges.
    assert rule_evolution.get_predecessor_chain(lone.identity_id) == []
    # Re-running the backfill is a no-op.
    assert rule_evolution.backfill_legacy_lineages() == {"lineages": 0, "events": 0}


@pytest.mark.django_db
def test_startup_sync_records_history_and_repeated_runs_add_nothing(tmp_path) -> None:
    import yaml

    legacy = tmp_path / "rules.yaml"
    legacy.write_text(
        yaml.safe_dump(
            {
                "version": 1,
                "next_index": 3,
                "rules": [
                    {
                        "rule_id": "R001",
                        "name": "First",
                        "logic": {
                            "format": "value_vs_column",
                            "column_name": "status",
                            "operator": "eq",
                            "target_value": "active",
                        },
                    },
                    {
                        "rule_id": "R002",
                        "name": "Second",
                        "logic": {
                            "format": "value_vs_column",
                            "column_name": "status",
                            "operator": "eq",
                            "target_value": "pending",
                        },
                    },
                ],
            }
        ),
        encoding="utf-8",
    )
    with override_settings(RULES_FILE=legacy):
        call_command("migrate_rules_to_db")
        events_after_first = event_count()
        assert events_after_first == 2
        assert RuleEvolutionHistory.objects.filter(change_type="creation").count() == 2
        sources = set(
            RuleEvolutionHistory.objects.values_list("source", flat=True)
        )
        assert sources == {"startup_sync"}
        call_command("migrate_rules_to_db")

    assert event_count() == events_after_first
    rows = list(StoredValidationRule.objects.order_by("catalog_position"))
    assert [row.rule_id for row in rows] == ["R001", "R002"]
    assert all(row.lineage_id is not None for row in rows)


@pytest.mark.django_db
def test_export_preserves_lineage_metadata_for_annotated_round_trip(tmp_path) -> None:
    client = APIClient()
    with override_settings(RULES_CONFIG_DIR=tmp_path):
        created = client.post("/api/rules/", make_draft(), format="json").json()
        exported = client.post("/api/rules/configs/", {"name": "snapshot"}, format="json")
    assert exported.status_code == 201
    assert exported.json()["content"][0]["lineage_id"] == created["lineage_id"]


@pytest.mark.django_db
def test_save_controls_never_enter_canonical_identity() -> None:
    client = APIClient()
    original = client.post("/api/rules/", make_draft(), format="json").json()
    edited = make_draft("Edited", target="pending")

    required = client.put(
        f"/api/rules/{original['rule_id']}/",
        {**edited, "save_decision": "modify_current", "source_identifier": "junk"},
        format="json",
    )
    # Junk is only rejected as stale; the control keys themselves never
    # change the proposed executable identity.
    assert required.status_code == 409
    assert required.json()["code"] == "rule_save_stale"
