from __future__ import annotations

import pytest
import yaml
from apps.rules.models import RuleStoreState, StoredValidationRule
from apps.rules.repository import create_catalog_rule, list_catalog_rules
from django.core.management import call_command
from django.test import override_settings
from rest_framework.test import APIClient


def draft(target: str = "active", name: str = "Status") -> dict:
    return {
        "name": name,
        "description": "release review rule",
        "conditions": [],
        "logic": {
            "format": "value_vs_column",
            "column_name": "status",
            "operator": "eq",
            "target_value": target,
        },
    }


@pytest.mark.django_db
def test_external_import_versions_rule_and_invalid_import_is_atomic() -> None:
    client = APIClient()
    original = client.post("/api/rules/", draft(), format="json").json()

    changed = client.post(
        "/api/rules/configs/import/", {"rules": [draft(target="pending")]}, format="json"
    )
    assert changed.status_code == 200, changed.content
    assert changed.json()["imported"] == 1
    assert changed.json()["enabled"] == 1
    assert set(changed.json()["bindings"]) != {original["rule_id"]}
    assert original["rule_id"] not in changed.json()["bindings"]

    invalid = {**draft(target="closed"), "rule_identifier": "CBR1_00000000000000000000"}
    rejected = client.post(
        "/api/rules/configs/import/", {"rules": [invalid]}, format="json"
    )
    assert rejected.status_code == 400
    listing = client.get("/api/rules/").json()
    assert sum(rule["enabled"] for rule in listing["rules"]) == 1
    assert listing["total"] == 2


@pytest.mark.django_db
def test_empty_enabled_catalog_remains_empty_and_pinned_rule_pages_are_deduplicated() -> None:
    client = APIClient()
    created = client.post("/api/rules/", draft(), format="json").json()
    empty = client.post("/api/rules/configs/import/", {"rules": []}, format="json")
    assert empty.status_code == 200
    assert empty.json()["enabled"] == 0
    listing = client.get("/api/rules/").json()["rules"]
    assert [rule for rule in listing if rule["enabled"]] == []
    assert listing[0]["rule_id"] == created["rule_id"]

    for index in range(55):
        create_catalog_rule(draft(target=f"value-{index}", name=f"Rule {index}"), enabled=False)
    enabled = create_catalog_rule(draft(target="outside-page"), enabled=True)
    first = list_catalog_rules()
    ids = [item.rule.rule_id for item in first.rules]
    assert enabled.rule.rule_id in ids
    assert len(ids) == len(set(ids))
    assert created["rule_id"] in ids
    assert first.has_more is True
    page = list_catalog_rules(first.next_cursor)
    assert len(page.rules) <= 10
    assert not {item.rule.rule_id for item in page.rules}.intersection(ids)


@pytest.mark.django_db
def test_export_uses_enabled_catalog_not_rendered_page(tmp_path) -> None:
    client = APIClient()
    with override_settings(RULES_CONFIG_DIR=tmp_path):
        for index in range(52):
            response = client.post(
                "/api/rules/", draft(target=f"export-{index}", name=f"Rule {index}"), format="json"
            )
            assert response.status_code == 201
        exported = client.post("/api/rules/configs/", {"name": "all-enabled"}, format="json")

    assert exported.status_code == 201
    assert len(exported.json()["content"]) == 52
    assert {rule["name"] for rule in exported.json()["content"]} == {
        f"Rule {index}" for index in range(52)
    }


@pytest.mark.django_db
def test_migration_reconciles_later_file_edits(tmp_path) -> None:
    legacy = tmp_path / "rules.yaml"
    legacy.write_text(
        yaml.safe_dump({"version": 1, "next_index": 1, "rules": []}), encoding="utf-8"
    )
    with override_settings(RULES_FILE=legacy):
        call_command("migrate_rules_to_db")
        legacy.write_text(
            yaml.safe_dump({"version": 1, "next_index": 2, "rules": [draft()]}), encoding="utf-8"
        )
        call_command("migrate_rules_to_db")

    assert RuleStoreState.objects.get(singleton_key=1).initialized is True
    rows = list(StoredValidationRule.objects.filter(archived_at__isnull=True))
    assert len(rows) == 1
    assert rows[0].authored_payload["name"] == draft()["name"]
