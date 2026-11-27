from __future__ import annotations

from django.db import models
from django.db.models import Q


class ValidationRuleIdentity(models.Model):
    identifier = models.CharField(max_length=25, primary_key=True)
    algorithm_version = models.PositiveSmallIntegerField(default=1)
    full_digest = models.CharField(max_length=64, unique=True)
    canonical_payload = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "rules_validation_rule_identity"


class StoredValidationRule(models.Model):
    identity = models.OneToOneField(
        ValidationRuleIdentity, on_delete=models.PROTECT, related_name="catalog_rule"
    )
    rule_id = models.CharField(max_length=32, unique=True)
    catalog_position = models.PositiveBigIntegerField(unique=True)
    authored_payload = models.JSONField()
    enabled = models.BooleanField(default=False, db_index=True)
    enabled_position = models.PositiveBigIntegerField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    superseded_by = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="supersedes",
    )
    lineage = models.ForeignKey(
        "RuleLineage",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="catalog_rules",
    )
    evolution_revision = models.PositiveBigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "rules_stored_validation_rule"
        constraints = [
            models.UniqueConstraint(
                fields=["enabled_position"],
                condition=Q(enabled=True, archived_at__isnull=True),
                name="rules_enabled_position_unique",
            ),
        ]
        indexes = [
            models.Index(
                fields=["archived_at", "catalog_position"],
                name="rules_store_archived_pos_idx",
            )
        ]


class RuleLineage(models.Model):
    """Stable business-rule identity connecting executable revisions.

    A lineage groups every saved definition of the same business check. The
    executable ``ValidationRuleIdentity`` rows change across revisions; the
    lineage does not. ``Save as new`` and Copy start a new lineage and never
    create an inheritable predecessor edge into another lineage.
    """

    lineage_id = models.CharField(max_length=36, primary_key=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "rules_rule_lineage"


class RuleEvolutionHistory(models.Model):
    """Append-only authored rule-change history in the configuration database.

    One row per committed catalog mutation (creation, metadata edit,
    executable revision, save-as-new, archive, reinstate, import/startup sync,
    legacy backfill). Never updated or deleted by application code. The
    old-to-new canonical identifier transition is queryable through the
    ``source_identifier``/``target_identifier`` indexes so commentary
    carry-forward can resolve predecessor exception identities.
    """

    CHANGE_TYPES = (
        ("creation", "creation"),
        ("metadata_edit", "metadata_edit"),
        ("executable_revision", "executable_revision"),
        ("save_as_new", "save_as_new"),
        ("archive", "archive"),
        ("reinstate", "reinstate"),
        ("import_sync", "import_sync"),
        ("legacy_backfill", "legacy_backfill"),
    )
    SAVE_DECISIONS = (
        ("modify_current", "modify_current"),
        ("save_as_new", "save_as_new"),
        ("ordinary_create", "ordinary_create"),
        ("system", "system"),
    )
    COMMENTARY_POLICIES = (
        ("carry_forward_recertification", "carry_forward_recertification"),
        ("no_inheritance", "no_inheritance"),
    )
    SOURCES = (
        ("ui_edit", "ui_edit"),
        ("ui_create", "ui_create"),
        ("copy", "copy"),
        ("yaml_import", "yaml_import"),
        ("named_config_import", "named_config_import"),
        ("startup_sync", "startup_sync"),
        ("archive", "archive"),
        ("reinstate", "reinstate"),
        ("legacy_backfill", "legacy_backfill"),
    )

    event_id = models.CharField(max_length=36, primary_key=True)
    lineage = models.ForeignKey(
        RuleLineage, on_delete=models.PROTECT, related_name="events"
    )
    revision_number = models.PositiveBigIntegerField()
    previous_event = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="next_events",
    )
    source_catalog_rule = models.ForeignKey(
        StoredValidationRule,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="evolution_events_as_source",
    )
    target_catalog_rule = models.ForeignKey(
        StoredValidationRule,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="evolution_events_as_target",
    )
    source_identifier = models.CharField(max_length=25, null=True, blank=True)
    target_identifier = models.CharField(max_length=25)
    change_type = models.CharField(max_length=32, choices=CHANGE_TYPES)
    save_decision = models.CharField(max_length=32, choices=SAVE_DECISIONS)
    before_payload = models.JSONField(null=True, blank=True)
    after_payload = models.JSONField()
    change_summary = models.JSONField(default=dict)
    commentary_policy = models.CharField(max_length=32, choices=COMMENTARY_POLICIES)
    source = models.CharField(max_length=32, choices=SOURCES)
    changed_by = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "rules_rule_evolution_history"
        indexes = [
            models.Index(
                fields=["target_identifier"], name="rule_evol_target_idx"
            ),
            models.Index(
                fields=["source_identifier"], name="rule_evol_source_idx"
            ),
            models.Index(
                fields=["lineage", "revision_number"], name="rule_evol_lineage_rev_idx"
            ),
        ]


class RuleStoreState(models.Model):
    singleton_key = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    initialized = models.BooleanField(default=False)
    next_index = models.PositiveBigIntegerField(default=1)
    revision = models.PositiveBigIntegerField(default=0)

    class Meta:
        db_table = "rules_rule_store_state"
