from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.rules import evolution as rule_evolution
from apps.rules.models import RuleStoreState, StoredValidationRule
from apps.rules.repository import apply_rule_configuration, register_rule_identity
from apps.rules.services import RulesFile, load_rules, rule_definition_payload
from apps.settings.services import get_rules_file


def _payload(rule: Any) -> dict[str, Any]:
    return rule_definition_payload(rule, include_empty_target_values=True)


class Command(BaseCommand):
    help = "Synchronize the active rules file into the SQLite rule catalog."

    def handle(self, *args: Any, **options: Any) -> None:
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
                state = RuleStoreState.objects.select_for_update().filter(singleton_key=1).first()
                if state is None or not state.initialized:
                    state, _ = RuleStoreState.objects.select_for_update().get_or_create(
                        singleton_key=1,
                        defaults={"next_index": rules_file.next_index},
                    )
                    if StoredValidationRule.objects.exists():
                        raise CommandError("Uninitialized rule catalog already contains rows.")
                    for position, (legacy_rule, draft) in enumerate(
                        zip(rules_file.rules, drafts, strict=True), start=1
                    ):
                        identity = register_rule_identity(draft)
                        row = StoredValidationRule.objects.create(
                            identity=identity,
                            rule_id=legacy_rule.rule_id,
                            catalog_position=position,
                            authored_payload=draft,
                            enabled=True,
                            enabled_position=position,
                        )
                        lineage = rule_evolution.create_lineage()
                        row.lineage = lineage
                        row.evolution_revision = 1
                        row.save(update_fields=["lineage", "evolution_revision"])
                        rule_evolution.record_event(
                            lineage=lineage,
                            revision_number=1,
                            previous_event=None,
                            source_rule=None,
                            target_rule=row,
                            source_identifier=None,
                            target_identifier=row.identity_id,
                            change_type=rule_evolution.CREATION,
                            save_decision=rule_evolution.ORDINARY_CREATE,
                            before_payload=None,
                            after_payload=dict(draft),
                            change_summary={
                                "identifier_changed": False,
                                "extreme_changes": [],
                                "metadata_changed": [],
                                "startup_sync_initial": True,
                            },
                            commentary_policy=rule_evolution.NO_INHERITANCE,
                            source="startup_sync",
                        )
                    state.next_index = rules_file.next_index
                    state.initialized = True
                    state.revision += 1
                    state.save(update_fields=["next_index", "initialized", "revision"])
                    imported = len(drafts)
                    reused = 0
                    enabled = len(drafts)
                else:
                    result = apply_rule_configuration(drafts, source="startup_sync")
                    state = RuleStoreState.objects.select_for_update().get(singleton_key=1)
                    state.next_index = max(state.next_index, rules_file.next_index)
                    state.save(update_fields=["next_index"])
                    imported = result.imported
                    reused = result.reused
                    enabled = result.enabled
        except CommandError:
            raise
        except Exception as exc:
            raise CommandError(f"Could not migrate rules atomically: {exc}") from exc
        self.stdout.write(
            self.style.SUCCESS(
                f"Synchronized {enabled} rule(s) from {legacy_path} to SQLite "
                f"({imported} imported, {reused} reused)."
            )
        )
