from __future__ import annotations

import pytest
from apps.rules.models import RuleStoreState, StoredValidationRule
from django.test import override_settings
from rest_framework.test import APIClient


def draft(name: str = "Status", target: str = "active") -> dict:
    return {
        "name": name,
        "description": "status rule",
        "conditions": [],
        "logic": {
            "format": "value_vs_column",
            "column_name": "status",
            "operator": "eq",
            "target_value": target,
        },
    }


@pytest.mark.django_db
def test_create_update_archive_and_enablement_are_catalog_operations() -> None:
    client = APIClient()
    created = client.post("/api/rules/", draft(), format="json")
    assert created.status_code == 201, created.content
    rule = created.json()
    assert rule["rule_id"] == "R001"
    assert rule["rule_identifier"].startswith("CBR1_")
    assert rule["enabled"] is True

    metadata_edit = {**draft(), "name": "Renamed"}
    updated = client.put(f"/api/rules/{rule['rule_id']}/", metadata_edit, format="json")
    assert updated.status_code == 200
    assert updated.json()["rule_id"] == rule["rule_id"]
    assert updated.json()["rule_identifier"] == rule["rule_identifier"]

    disabled = client.post(
        "/api/rules/enablement/",
        {"rule_ids": [rule["rule_id"]], "enabled": False},
        format="json",
    )
    assert disabled.status_code == 200
    assert disabled.json()["rules"][0]["enabled"] is False

    archived = client.delete(f"/api/rules/{rule['rule_id']}/")
    assert archived.status_code == 200
    assert StoredValidationRule.objects.get(rule_id=rule["rule_id"]).archived_at is not None


@pytest.mark.django_db
def test_import_reuses_identity_and_empty_import_disables_without_deleting() -> None:
    client = APIClient()
    first = client.post("/api/rules/", draft("First"), format="json").json()
    imported = client.post(
        "/api/rules/configs/import/",
        {"rules": [draft("First")]},
        format="json",
    )
    assert imported.status_code == 200, imported.content
    assert imported.json()["reused"] == 1
    assert imported.json()["bindings"][first["rule_id"]] == first["rule_identifier"]

    empty = client.post("/api/rules/configs/import/", {"rules": []}, format="json")
    assert empty.status_code == 200
    assert empty.json()["enabled"] == 0
    assert StoredValidationRule.objects.filter(archived_at__isnull=True).count() == 1
    assert StoredValidationRule.objects.filter(enabled=True).count() == 0


@pytest.mark.django_db
def test_invalid_import_identifies_the_rule_by_name_catalog_id_and_identifier() -> None:
    client = APIClient()
    valid = {
        "name": "Two checks",
        "conditions": [
            {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
            {"column_name": "status", "operator": "eq", "filter_value": "active"},
        ],
        "condition_relation": "and",
        "logic": {"format": "value_vs_column", "column_name": "score", "operator": "gt", "target_value": "10"},
    }
    created = client.post("/api/rules/", valid, format="json")
    assert created.status_code == 201, created.content

    invalid = {key: value for key, value in valid.items() if key != "condition_relation"}
    response = client.post("/api/rules/configs/import/", {"rules": [invalid]}, format="json")

    assert response.status_code == 400
    assert response.json()["error"] == (
        f"Two checks({created.json()['rule_id']}, {created.json()['rule_identifier']}: "
        "condition_relation is required when there are 2+ conditions.)"
    )


@pytest.mark.django_db
def test_initial_listing_pins_enabled_and_continuation_is_keyset() -> None:
    for index in range(52):
        response = APIClient().post(
            "/api/rules/", draft(f"Rule {index}", target=str(index)), format="json"
        )
        assert response.status_code == 201
    client = APIClient()
    disabled = client.post(
        "/api/rules/enablement/",
        {"rule_ids": [f"R{index:03d}" for index in range(2, 53)], "enabled": False},
        format="json",
    )
    assert disabled.status_code == 200
    enabled = client.post(
        "/api/rules/enablement/",
        {"rule_ids": ["R001"], "enabled": True},
        format="json",
    )
    assert enabled.status_code == 200
    page = client.get("/api/rules/").json()
    assert len(page["rules"]) == 50
    assert page["total"] == 52
    assert page["has_more"] is True
    assert page["next_cursor"]

    next_page = client.get(f"/api/rules/?cursor={page['next_cursor']}")
    assert next_page.status_code == 200
    assert len(next_page.json()["rules"]) == 2
    assert next_page.json()["has_more"] is False


@pytest.mark.django_db
def test_export_reads_enabled_catalog_and_rejects_forged_identifier(tmp_path) -> None:
    client = APIClient()
    with override_settings(RULES_CONFIG_DIR=tmp_path):
        created = client.post("/api/rules/", draft(), format="json").json()
        export = client.post(
            "/api/rules/configs/",
            {"name": "snapshot"},
            format="json",
        )
    assert export.status_code == 201
    assert export.json()["content"][0]["rule_identifier"] == created["rule_identifier"]

    forged = {**draft(), "rule_identifier": "CBR1_00000000000000000000"}
    response = client.post("/api/rules/configs/import/", {"rules": [forged]}, format="json")
    assert response.status_code == 400
    assert RuleStoreState.objects.get(singleton_key=1).revision == 1


@pytest.mark.django_db
def test_export_and_import_preserve_grouping_tree_identity(tmp_path) -> None:
    client = APIClient()
    grouped = {
        "name": "BAU contributor grouping",
        "conditions": [
            {"column_name": "REGULATORY_TMT", "operator": "eq", "filter_value": "TRADING"},
            {"column_name": "VAR_FULL_REVAL_KEY_CONTRIBUTORY", "operator": "eq", "filter_value": "Yes"},
            {"column_name": "SPEAR_BOOK_KEY_CONTRIBUTORY", "operator": "eq", "filter_value": "Yes"},
        ],
        "grouping_tree": {
            "kind": "and",
            "children": [
                {"kind": "leaf", "conditionId": "c0"},
                {
                    "kind": "or",
                    "children": [
                        {"kind": "leaf", "conditionId": "c1"},
                        {"kind": "leaf", "conditionId": "c2"},
                    ],
                },
            ],
        },
        "logic": {"format": "value_vs_column", "column_name": "SA_CONTRIBUTORY", "operator": "eq", "target_value": "Yes"},
    }
    created = client.post("/api/rules/", grouped, format="json")
    assert created.status_code == 201, created.content

    with override_settings(RULES_CONFIG_DIR=tmp_path):
        exported = client.post("/api/rules/configs/", {"name": "grouped"}, format="json")
        assert exported.status_code == 201, exported.content
        content = exported.json()["content"]

    assert content[0]["grouping_tree"] == grouped["grouping_tree"]
    imported = client.post("/api/rules/configs/import/", {"rules": content}, format="json")
    assert imported.status_code == 200, imported.content
    assert imported.json()["reused"] == 1
    assert imported.json()["bindings"][created.json()["rule_id"]] == created.json()["rule_identifier"]


@pytest.mark.django_db
def test_business_edit_replaces_visible_rule_and_archives_previous_version() -> None:
    client = APIClient()
    original = client.post("/api/rules/", draft(), format="json").json()
    edited = {**draft(target="pending"), "name": "Edited"}

    response = client.put(f"/api/rules/{original['rule_id']}/", edited, format="json")

    assert response.status_code == 200
    assert response.json()["resulting_rule_id"] != original["rule_id"]
    assert client.get("/api/rules/").json()["total"] == 1
    previous = StoredValidationRule.objects.get(rule_id=original["rule_id"])
    assert previous.archived_at is not None


@pytest.mark.django_db
def test_duplicate_create_returns_equivalent_hint_without_overwriting_existing_metadata() -> None:
    client = APIClient()
    first = client.post("/api/rules/", draft(name="First"), format="json").json()

    duplicate = client.post("/api/rules/", draft(name="Second"), format="json")

    assert duplicate.status_code == 201
    assert duplicate.json()["equivalent_rule"] is True
    assert duplicate.json()["equivalent_rule_id"] == first["rule_id"]
    assert client.get(f"/api/rules/{first['rule_id']}/").json()["name"] == "First"


@pytest.mark.django_db
def test_existing_rules_config_save_exports_current_enabled_set(tmp_path) -> None:
    client = APIClient()
    with override_settings(RULES_CONFIG_DIR=tmp_path):
        rule = client.post("/api/rules/", draft(), format="json").json()
        created = client.post("/api/rules/configs/", {"name": "snapshot"}, format="json")
        assert created.status_code == 201
        disabled = client.post(
            "/api/rules/enablement/",
            {"rule_ids": [rule["rule_id"]], "enabled": False},
            format="json",
        )
        assert disabled.status_code == 200
        saved = client.put("/api/rules/configs/snapshot/", {"version": 1}, format="json")

    assert saved.status_code == 200
    assert saved.json()["content"] == []


@pytest.mark.django_db
def test_blank_name_is_unnamed_on_create_but_rejected_on_update() -> None:
    client = APIClient()
    created = client.post("/api/rules/", {**draft(), "name": ""}, format="json")
    assert created.status_code == 201, created.content
    assert created.json()["name"] == "Unnamed"

    rejected = client.put(
        f"/api/rules/{created.json()['rule_id']}/",
        {**draft(), "name": ""},
        format="json",
    )
    assert rejected.status_code == 400
    assert "required when editing" in rejected.json()["error"]


@pytest.mark.django_db
def test_enabling_multiple_rules_preserves_the_other_selected_rules() -> None:
    client = APIClient()
    first = client.post("/api/rules/", draft(name="First"), format="json").json()
    second = client.post(
        "/api/rules/", draft(name="Second", target="pending"), format="json"
    ).json()

    disabled = client.post(
        "/api/rules/enablement/", {"rule_ids": [first["rule_id"]], "enabled": False}, format="json"
    )
    assert disabled.status_code == 200
    enabled = client.post(
        "/api/rules/enablement/", {"rule_ids": [first["rule_id"]], "enabled": True}, format="json"
    )
    assert enabled.status_code == 200
    listing = client.get("/api/rules/").json()["rules"]
    assert {rule["rule_id"] for rule in listing if rule["enabled"]} == {
        first["rule_id"], second["rule_id"]
    }
