from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.rules.models import RuleStoreState, StoredValidationRule
from apps.rules.repository import register_rule_identity
from apps.rules.services import RulesFile, _serialize_grouping_tree, load_rules
from apps.settings.services import get_rules_file


def _payload(rule: Any) -> dict[str, Any]:
    result: dict[str, Any] = {
        "name": rule.name,
        "description": rule.description,
        "conditions": [
            {
                "column_name": condition.column_name,
                "operator": condition.operator,
                "filter_value": condition.filter_value,
                "filter_values": list(condition.filter_values),
            }
            for condition in rule.conditions
        ],
        "logic": {
            "format": rule.logic.format,
            "column_name": rule.logic.column_name,
            "operator": rule.logic.operator,
            "target_value": rule.logic.target_value,
            "target_values": list(rule.logic.target_values),
            "comparison_mode": rule.logic.comparison_mode,
        },
        "extra_columns": list(rule.extra_columns),
        "hide_comparison": rule.hide_comparison,
    }
    if rule.condition_relation is not None:
        result["condition_relation"] = rule.condition_relation
    if rule.grouping is not None:
        result["grouping"] = rule.grouping
    tree = _serialize_grouping_tree(rule.grouping_tree)
    if tree is not None:
        result["grouping_tree"] = tree
    return result


class Command(BaseCommand):
    help = "Import the legacy active rules file into the SQLite rule catalog once."

    def handle(self, *args: Any, **options: Any) -> None:
        state = RuleStoreState.objects.filter(singleton_key=1).first()
        if state is not None and state.initialized:
            self.stdout.write("Rule catalog already initialized; nothing to do.")
            return

        legacy_path = get_rules_file()
        try:
            rules_file: RulesFile = load_rules(legacy_path)
            drafts = [_payload(rule) for rule in rules_file.rules]
            if len({rule.rule_id for rule in rules_file.rules}) != len(rules_file.rules):
                raise ValueError("Legacy rules contain duplicate rule IDs.")
        except Exception as exc:
            raise CommandError(f"Could not validate legacy rules: {exc}") from exc

        try:
            with transaction.atomic():
                state, _ = RuleStoreState.objects.select_for_update().get_or_create(
                    singleton_key=1,
                    defaults={"next_index": rules_file.next_index},
                )
                if state.initialized:
                    self.stdout.write("Rule catalog already initialized; nothing to do.")
                    return
                if StoredValidationRule.objects.exists():
                    raise CommandError("Uninitialized rule catalog already contains rows.")
                for position, (legacy_rule, draft) in enumerate(
                    zip(rules_file.rules, drafts, strict=True), start=1
                ):
                    identity = register_rule_identity(draft)
                    StoredValidationRule.objects.create(
                        identity=identity,
                        rule_id=legacy_rule.rule_id,
                        catalog_position=position,
                        authored_payload=draft,
                        enabled=True,
                        enabled_position=position,
                    )
                state.next_index = rules_file.next_index
                state.initialized = True
                state.revision += 1
                state.save(update_fields=["next_index", "initialized", "revision"])
        except CommandError:
            raise
        except Exception as exc:
            raise CommandError(f"Could not migrate rules atomically: {exc}") from exc
        self.stdout.write(self.style.SUCCESS(f"Migrated {len(drafts)} rule(s) to SQLite."))
