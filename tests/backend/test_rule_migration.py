from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from apps.rules.models import RuleStoreState, StoredValidationRule
from django.core.management import call_command
from django.test import override_settings


@pytest.mark.django_db
def test_legacy_migration_preserves_ids_order_and_is_idempotent(tmp_path: Path) -> None:
    legacy = tmp_path / "rules.yaml"
    legacy.write_text(
        yaml.safe_dump(
            {
                "version": 1,
                "next_index": 8,
                "rules": [
                    {
                        "rule_id": "R004",
                        "name": "First",
                        "logic": {
                            "format": "value_vs_column",
                            "column_name": "status",
                            "operator": "eq",
                            "target_value": "active",
                        },
                    },
                    {
                        "rule_id": "R007",
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
        call_command("migrate_rules_to_db")

    rows = list(StoredValidationRule.objects.order_by("catalog_position"))
    assert [row.rule_id for row in rows] == ["R004", "R007"]
    assert [row.enabled for row in rows] == [True, True]
    state = RuleStoreState.objects.get(singleton_key=1)
    assert state.initialized is True
    assert state.next_index == 8
    assert StoredValidationRule.objects.count() == 2
