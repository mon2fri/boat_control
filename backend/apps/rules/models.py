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


class RuleStoreState(models.Model):
    singleton_key = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    initialized = models.BooleanField(default=False)
    next_index = models.PositiveBigIntegerField(default=1)
    revision = models.PositiveBigIntegerField(default=0)

    class Meta:
        db_table = "rules_rule_store_state"
