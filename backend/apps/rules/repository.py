"""Transactional SQLite catalog primitives for canonical validation rules."""

from __future__ import annotations

import base64
import copy
import json
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.rules import evolution as rule_evolution
from apps.rules.identifiers import calculate_rule_identity_details, verify_identity
from apps.rules.models import (
    RuleLineage,
    RuleStoreState,
    StoredValidationRule,
    ValidationRuleIdentity,
)
from apps.rules.services import (
    Rule,
    normalize_rule_draft,
    rule_from_payload,
)


class CatalogError(RuntimeError):
    """Base error for catalog integrity and mutation failures."""


class IdentityCollisionError(CatalogError):
    """The shortened identifier is already bound to different content."""


class CatalogCorruptionError(CatalogError):
    """A persisted catalog row no longer matches its protected identity."""


class RuleConfigConflict(CatalogError):
    """A config refers to a deleted or superseded catalog rule."""

    def __init__(self, conflicts: list[dict[str, Any]]) -> None:
        self.conflicts = conflicts
        super().__init__("Configuration contains deleted or modified rules")


class StaleCursorError(CatalogError):
    """A pagination cursor was created against an older catalog revision."""


class SaveDecisionRequired(CatalogError):
    """An extensive edit needs an explicit modify-current/save-as-new choice."""

    def __init__(self, details: dict[str, Any]) -> None:
        self.details = details
        super().__init__("Rule save requires an explicit decision")


class StaleRevisionError(CatalogError):
    """The source revision changed after the confirmation was prepared."""

    def __init__(self, details: dict[str, Any]) -> None:
        self.details = details
        super().__init__("Rule source changed; confirmation is stale")


class IdentityReuseConflict(CatalogError):
    """The proposed identity already belongs to another business lineage."""

    def __init__(self, details: dict[str, Any]) -> None:
        self.details = details
        super().__init__("Rule identity already belongs to another lineage")


class InvalidCursorError(CatalogError):
    """A cursor is malformed or has invalid pagination parameters."""


@dataclass(frozen=True)
class RuleSnapshot:
    rule: Rule
    rule_identifier: str
    catalog_position: int
    enabled: bool
    enabled_position: int | None
    archived_at: datetime | None
    superseded_by_rule_id: str | None = None
    lineage_id: str | None = None
    evolution_revision: int | None = None


@dataclass(frozen=True)
class RulePage:
    rules: tuple[RuleSnapshot, ...]
    next_cursor: str | None
    has_more: bool
    total_count: int
    revision: int
    pinned_rule_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class RuleEditResult:
    previous_rule_id: str
    rule: RuleSnapshot
    save_decision: str = "modify_current"
    saved_as_new: bool = False
    equivalent_rule_id: str | None = None
    evolution_event_id: str | None = None
    lineage_id: str | None = None


@dataclass(frozen=True)
class RuleImportResult:
    enabled: int
    imported: int
    reused: int
    bindings: dict[str, str]


def list_enabled_catalog_rules() -> tuple[RuleSnapshot, ...]:
    rows = (
        StoredValidationRule.objects.select_related("identity")
        .filter(enabled=True, archived_at__isnull=True)
        .order_by("enabled_position")
    )
    return tuple(materialize_catalog_rule(row) for row in rows)


_RULE_ID = re.compile(r"^R(\d+)$")


def _format_rule_id(index: int) -> str:
    return f"R{index:03d}"


def _state() -> RuleStoreState:
    state, _ = RuleStoreState.objects.select_for_update().get_or_create(singleton_key=1)
    return state


def _bump(state: RuleStoreState) -> None:
    state.revision += 1
    state.save(update_fields=["revision"])


def _enabled_position() -> int:
    return (
        int(
            StoredValidationRule.objects.filter(enabled=True, archived_at__isnull=True).aggregate(
                maximum=Max("enabled_position")
            )["maximum"]
            or 0
        )
        + 1
    )


def register_rule_identity(rule_or_draft: Any) -> ValidationRuleIdentity:
    identifier, digest, payload = calculate_rule_identity_details(rule_or_draft)
    with transaction.atomic():
        identity, created = ValidationRuleIdentity.objects.select_for_update().get_or_create(
            identifier=identifier,
            defaults={"full_digest": digest, "canonical_payload": payload, "algorithm_version": 1},
        )
        if not created and (
            identity.full_digest != digest or identity.canonical_payload != payload
        ):
            raise IdentityCollisionError(f"Canonical identifier collision: {identifier}")
        verify_identity(identity.identifier, identity.full_digest, identity.canonical_payload)
        return identity


def register_rule_identities(rules: list[Any]) -> dict[str, ValidationRuleIdentity]:
    with transaction.atomic():
        result = {}
        for rule in rules:
            identity = _register_identity_in_transaction(rule)
            result[identity.identifier] = identity
        return result


def _register_identity_in_transaction(rule_or_draft: Any) -> ValidationRuleIdentity:
    identifier, digest, payload = calculate_rule_identity_details(rule_or_draft)
    identity, created = ValidationRuleIdentity.objects.select_for_update().get_or_create(
        identifier=identifier,
        defaults={"full_digest": digest, "canonical_payload": payload, "algorithm_version": 1},
    )
    if not created and (identity.full_digest != digest or identity.canonical_payload != payload):
        raise IdentityCollisionError(f"Canonical identifier collision: {identifier}")
    verify_identity(identity.identifier, identity.full_digest, identity.canonical_payload)
    return identity


def _rule_from_payload(rule_id: str, identifier: str, payload: dict[str, Any]) -> Rule:
    return rule_from_payload(rule_id, payload, rule_identifier=identifier)


def materialize_catalog_rule(row: StoredValidationRule) -> RuleSnapshot:
    identifier, digest, payload = calculate_rule_identity_details(row.authored_payload)
    if (
        identifier != row.identity_id
        or digest != row.identity.full_digest
        or payload != row.identity.canonical_payload
    ):
        raise CatalogCorruptionError(f"Catalog payload mismatch for {row.rule_id}")
    return RuleSnapshot(
        rule=_rule_from_payload(row.rule_id, identifier, row.authored_payload),
        rule_identifier=identifier,
        catalog_position=row.catalog_position,
        enabled=row.enabled,
        enabled_position=row.enabled_position,
        archived_at=row.archived_at,
        superseded_by_rule_id=(
            row.superseded_by.rule_id if row.superseded_by is not None else None
        ),
        lineage_id=row.lineage_id,
        evolution_revision=row.evolution_revision,
    )


def _get_row(rule_id: str, *, lock: bool = False) -> StoredValidationRule:
    query = StoredValidationRule.objects.select_related("identity")
    if lock:
        query = query.select_for_update()
    try:
        return query.get(rule_id=rule_id)
    except StoredValidationRule.DoesNotExist as exc:
        raise CatalogError(f"Rule {rule_id} not found") from exc


def create_catalog_rule(
    draft: dict[str, Any],
    enabled: bool = True,
    *,
    source: str = "ui_create",
    changed_by: str | None = None,
) -> RuleSnapshot:
    with transaction.atomic():
        state = _state()
        draft = normalize_rule_draft(draft)
        identity = _register_identity_in_transaction(draft)
        existing = (
            StoredValidationRule.objects.select_for_update().filter(identity=identity).first()
        )
        if existing is not None:
            was_archived = existing.archived_at is not None
            if was_archived:
                existing.archived_at = None
                existing.authored_payload = copy.deepcopy(draft)
            existing.enabled = enabled
            existing.enabled_position = _enabled_position() if enabled else None
            existing.save()
            _bump(state)
            if was_archived:
                lineage = rule_evolution.ensure_lineage_for_row(existing, source=source)
                event = rule_evolution.record_event(
                    lineage=lineage,
                    revision_number=rule_evolution.latest_revision_number(lineage),
                    previous_event=rule_evolution.latest_event(lineage),
                    source_rule=None,
                    target_rule=existing,
                    source_identifier=None,
                    target_identifier=existing.identity_id,
                    change_type=rule_evolution.REINSTATE,
                    save_decision=rule_evolution.ORDINARY_CREATE,
                    before_payload=None,
                    after_payload=copy.deepcopy(draft),
                    change_summary=rule_evolution.build_change_summary(
                        previous_draft=None,
                        new_draft=draft,
                        previous_identifier=None,
                        new_identifier=existing.identity_id,
                        extreme_changes=[],
                        extra={"reinstated_archived_identity": True},
                    ),
                    commentary_policy=rule_evolution.NO_INHERITANCE,
                    source=source,
                    changed_by=changed_by,
                )
                existing.evolution_revision = event.revision_number
                existing.save(update_fields=["evolution_revision", "updated_at"])
            return materialize_catalog_rule(existing)
        index = state.next_index
        row = StoredValidationRule.objects.create(
            identity=identity,
            rule_id=_format_rule_id(index),
            catalog_position=index,
            authored_payload=copy.deepcopy(draft),
            enabled=enabled,
            enabled_position=_enabled_position() if enabled else None,
        )
        state.next_index = index + 1
        _bump(state)
        state.save(update_fields=["next_index"])
        lineage = rule_evolution.create_lineage()
        row.lineage = lineage
        row.evolution_revision = 1
        row.save(update_fields=["lineage", "evolution_revision", "updated_at"])
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
            after_payload=copy.deepcopy(draft),
            change_summary=rule_evolution.build_change_summary(
                previous_draft=None,
                new_draft=draft,
                previous_identifier=None,
                new_identifier=row.identity_id,
                extreme_changes=[],
            ),
            commentary_policy=rule_evolution.NO_INHERITANCE,
            source=source,
            changed_by=changed_by,
        )
        return materialize_catalog_rule(row)


def get_catalog_rule(rule_id: str) -> RuleSnapshot:
    return materialize_catalog_rule(_get_row(rule_id))


def _resolve_row_lineage(row: StoredValidationRule, *, source: str) -> RuleLineage:
    if row.lineage_id is None:
        return rule_evolution.ensure_lineage_for_row(row, source=source)
    return RuleLineage.objects.get(lineage_id=row.lineage_id)


def update_catalog_rule(
    rule_id: str,
    draft: dict[str, Any],
    *,
    save_decision: str | None = None,
    source_identifier: str | None = None,
    require_confirmation: bool = False,
    source: str = "ui_edit",
    changed_by: str | None = None,
) -> RuleEditResult:
    """Save an edited draft over an existing catalog rule.

    ``save_decision`` accepts ``modify_current`` (default) or ``save_as_new``.
    When ``require_confirmation`` is true (interactive saves), a canonically
    changed edit that retains zero original conditions or zero original
    expectations raises :class:`SaveDecisionRequired` before any write, and a
    ``source_identifier`` that no longer matches the stored rule raises
    :class:`StaleRevisionError`. Programmatic callers that omit both keep the
    historical default: ordinary executable edits revise the current lineage.
    """
    if save_decision not in (None, "modify_current", "save_as_new"):
        raise CatalogError(f"Invalid save_decision: {save_decision!r}")
    with transaction.atomic():
        state = _state()
        draft = normalize_rule_draft(draft)
        previous = _get_row(rule_id, lock=True)
        lineage = _resolve_row_lineage(previous, source=source)
        previous_identifier = previous.identity_id
        if source_identifier is not None and source_identifier != previous_identifier:
            current = materialize_catalog_rule(previous)
            raise StaleRevisionError(
                {
                    "code": "rule_save_stale",
                    "original_rule_id": rule_id,
                    "original_identifier": source_identifier,
                    "current_identifier": previous_identifier,
                    "lineage_id": lineage.lineage_id,
                    "revision_number": current.evolution_revision,
                }
            )
        new_identity = _register_identity_in_transaction(draft)
        new_identifier = new_identity.identifier
        if new_identifier == previous_identifier:
            # Canonical no-op or metadata-only edit: same executable identity,
            # so no new executable revision and no recertification.
            before = copy.deepcopy(previous.authored_payload)
            if before == draft:
                return RuleEditResult(
                    previous_rule_id=rule_id,
                    rule=materialize_catalog_rule(previous),
                    save_decision=save_decision or "modify_current",
                    lineage_id=lineage.lineage_id,
                )
            previous.authored_payload = copy.deepcopy(draft)
            previous.save()
            _bump(state)
            revision = previous.evolution_revision or rule_evolution.latest_revision_number(
                lineage
            )
            event = rule_evolution.record_event(
                lineage=lineage,
                revision_number=revision,
                previous_event=rule_evolution.latest_event(lineage),
                source_rule=previous,
                target_rule=previous,
                source_identifier=previous_identifier,
                target_identifier=previous_identifier,
                change_type=rule_evolution.METADATA_EDIT,
                save_decision=save_decision or rule_evolution.MODIFY_CURRENT,
                before_payload=before,
                after_payload=copy.deepcopy(draft),
                change_summary=rule_evolution.build_change_summary(
                    previous_draft=before,
                    new_draft=draft,
                    previous_identifier=previous_identifier,
                    new_identifier=new_identifier,
                    extreme_changes=[],
                ),
                commentary_policy=rule_evolution.NO_INHERITANCE,
                source=source,
                changed_by=changed_by,
            )
            previous.evolution_revision = revision
            previous.save(update_fields=["evolution_revision", "updated_at"])
            snapshot = materialize_catalog_rule(previous)
            return RuleEditResult(
                previous_rule_id=rule_id,
                rule=snapshot,
                save_decision=save_decision or "modify_current",
                evolution_event_id=event.event_id,
                lineage_id=lineage.lineage_id,
            )
        extreme_changes = rule_evolution.detect_extensive_changes(
            previous.authored_payload, draft
        )
        if extreme_changes and save_decision is None and require_confirmation:
            raise SaveDecisionRequired(
                {
                    "code": "rule_save_decision_required",
                    "message": "Choose whether to modify the current rule or save as new.",
                    "original_rule_id": rule_id,
                    "original_identifier": previous_identifier,
                    "proposed_identifier": new_identifier,
                    "extreme_changes": extreme_changes,
                }
            )
        decision = save_decision or "modify_current"
        before_payload = copy.deepcopy(previous.authored_payload)
        if decision == "save_as_new":
            return _save_draft_as_new(
                state,
                previous,
                draft,
                new_identity,
                before_payload,
                source=source,
                changed_by=changed_by,
            )
        return _revise_current_rule(
            state,
            previous,
            lineage,
            draft,
            new_identity,
            before_payload,
            extreme_changes,
            source=source,
            changed_by=changed_by,
        )


def _save_draft_as_new(
    state: RuleStoreState,
    previous: StoredValidationRule,
    draft: dict[str, Any],
    new_identity: ValidationRuleIdentity,
    before_payload: dict[str, Any],
    *,
    source: str,
    changed_by: str | None,
) -> RuleEditResult:
    """Fork a draft into a separate lineage; the source row is untouched."""
    target = (
        StoredValidationRule.objects.select_for_update()
        .filter(identity=new_identity)
        .first()
    )
    if target is not None:
        # Canonical deduplication wins: reuse the equivalent definition and
        # inform the caller instead of merging unrelated business lineages or
        # transferring their commentary.
        target_lineage = _resolve_row_lineage(target, source=source)
        return RuleEditResult(
            previous_rule_id=previous.rule_id,
            rule=materialize_catalog_rule(target),
            save_decision="save_as_new",
            saved_as_new=True,
            equivalent_rule_id=target.rule_id,
            lineage_id=target_lineage.lineage_id,
        )
    index = state.next_index
    row = StoredValidationRule.objects.create(
        identity=new_identity,
        rule_id=_format_rule_id(index),
        catalog_position=index,
        authored_payload=copy.deepcopy(draft),
        enabled=True,
        enabled_position=_enabled_position(),
    )
    state.next_index = index + 1
    state.save(update_fields=["next_index"])
    new_lineage = rule_evolution.create_lineage()
    row.lineage = new_lineage
    row.evolution_revision = 1
    row.save(update_fields=["lineage", "evolution_revision", "updated_at"])
    _bump(state)
    event = rule_evolution.record_event(
        lineage=new_lineage,
        revision_number=1,
        previous_event=None,
        source_rule=previous,
        target_rule=row,
        source_identifier=previous.identity_id,
        target_identifier=row.identity_id,
        change_type=rule_evolution.SAVE_AS_NEW,
        save_decision=rule_evolution.SAVE_AS_NEW_DECISION,
        before_payload=before_payload,
        after_payload=copy.deepcopy(draft),
        change_summary=rule_evolution.build_change_summary(
            previous_draft=before_payload,
            new_draft=draft,
            previous_identifier=previous.identity_id,
            new_identifier=row.identity_id,
            extreme_changes=rule_evolution.detect_extensive_changes(
                before_payload, draft
            ),
        ),
        commentary_policy=rule_evolution.NO_INHERITANCE,
        source=source,
        changed_by=changed_by,
    )
    return RuleEditResult(
        previous_rule_id=previous.rule_id,
        rule=materialize_catalog_rule(row),
        save_decision="save_as_new",
        saved_as_new=True,
        evolution_event_id=event.event_id,
        lineage_id=new_lineage.lineage_id,
    )


def _revise_current_rule(
    state: RuleStoreState,
    previous: StoredValidationRule,
    lineage: RuleLineage,
    draft: dict[str, Any],
    new_identity: ValidationRuleIdentity,
    before_payload: dict[str, Any],
    extreme_changes: list[str],
    *,
    source: str,
    changed_by: str | None,
) -> RuleEditResult:
    """Archive the old definition and link the new revision in one lineage."""
    target = (
        StoredValidationRule.objects.select_for_update()
        .filter(identity=new_identity)
        .first()
    )
    position = previous.enabled_position
    was_enabled = previous.enabled and previous.archived_at is None
    reversion = False
    # Release the enabled slot before creating or reactivating the revision
    # target: the partial unique constraint forbids two enabled rows sharing
    # one position even transiently.
    previous.enabled = False
    previous.enabled_position = None
    previous.archived_at = timezone.now()
    previous.save()
    if target is not None:
        target_lineage = _resolve_row_lineage(target, source=source)
        if target_lineage.lineage_id != lineage.lineage_id:
            raise IdentityReuseConflict(
                {
                    "code": "rule_identity_reuse_conflict",
                    "original_rule_id": previous.rule_id,
                    "original_identifier": previous.identity_id,
                    "proposed_identifier": new_identity.identifier,
                    "existing_rule_id": target.rule_id,
                    "existing_lineage_id": target_lineage.lineage_id,
                }
            )
        # Reversion to an earlier definition of the same lineage: reactivate
        # the row that already carries the proposed identity.
        reversion = True
        target.authored_payload = copy.deepcopy(draft)
        target.archived_at = None
        target.enabled = was_enabled
        target.enabled_position = position if was_enabled else None
        target.save()
    else:
        index = state.next_index
        target = StoredValidationRule.objects.create(
            identity=new_identity,
            rule_id=_format_rule_id(index),
            catalog_position=index,
            authored_payload=copy.deepcopy(draft),
            enabled=was_enabled,
            enabled_position=position if was_enabled else None,
        )
        state.next_index = index + 1
        state.save(update_fields=["next_index"])
    previous.superseded_by = target
    previous.save(update_fields=["superseded_by", "updated_at"])
    target.lineage = lineage
    revision = rule_evolution.latest_revision_number(lineage) + 1
    previous_event = rule_evolution.latest_event(lineage)
    event = rule_evolution.record_event(
        lineage=lineage,
        revision_number=revision,
        previous_event=previous_event,
        source_rule=previous,
        target_rule=target,
        source_identifier=previous.identity_id,
        target_identifier=target.identity_id,
        change_type=rule_evolution.EXECUTABLE_REVISION,
        save_decision=rule_evolution.MODIFY_CURRENT,
        before_payload=before_payload,
        after_payload=copy.deepcopy(draft),
        change_summary=rule_evolution.build_change_summary(
            previous_draft=before_payload,
            new_draft=draft,
            previous_identifier=previous.identity_id,
            new_identifier=target.identity_id,
            extreme_changes=extreme_changes,
            extra={"reversion": reversion},
        ),
        commentary_policy=rule_evolution.CARRY_FORWARD_RECERTIFICATION,
        source=source,
        changed_by=changed_by,
    )
    target.evolution_revision = revision
    target.save(update_fields=["lineage", "evolution_revision", "updated_at"])
    _bump(state)
    return RuleEditResult(
        previous_rule_id=previous.rule_id,
        rule=materialize_catalog_rule(target),
        save_decision="modify_current",
        evolution_event_id=event.event_id,
        lineage_id=lineage.lineage_id,
    )


def set_rule_enabled(rule_id: str, enabled: bool) -> RuleSnapshot:
    with transaction.atomic():
        state = _state()
        row = _get_row(rule_id, lock=True)
        if row.archived_at is not None and enabled:
            row.archived_at = None
        row.enabled = enabled
        row.enabled_position = _enabled_position() if enabled else None
        row.save()
        _bump(state)
        return materialize_catalog_rule(row)


def set_rules_enabled(rule_ids: list[str]) -> tuple[RuleSnapshot, ...]:
    with transaction.atomic():
        state = _state()
        rows = list(StoredValidationRule.objects.select_for_update().filter(rule_id__in=rule_ids))
        if len(rows) != len(set(rule_ids)) or len(rule_ids) != len(set(rule_ids)):
            raise CatalogError("One or more rule IDs do not exist")
        if any(row.archived_at is not None for row in rows):
            raise CatalogError("Archived rules must be unarchived before enabling")
        next_position = _enabled_position()
        for row in rows:
            if not row.enabled:
                row.enabled = True
                row.enabled_position = next_position
                next_position += 1
                row.save(update_fields=["enabled", "enabled_position", "updated_at"])
        _bump(state)
        return tuple(materialize_catalog_rule(_get_row(rule_id)) for rule_id in rule_ids)


def set_rules_disabled(rule_ids: list[str]) -> tuple[RuleSnapshot, ...]:
    with transaction.atomic():
        state = _state()
        rows = list(StoredValidationRule.objects.select_for_update().filter(rule_id__in=rule_ids))
        if len(rows) != len(set(rule_ids)) or len(rule_ids) != len(set(rule_ids)):
            raise CatalogError("One or more rule IDs do not exist")
        for row in rows:
            row.enabled = False
            row.enabled_position = None
            row.save(update_fields=["enabled", "enabled_position", "updated_at"])
        _bump(state)
        return tuple(materialize_catalog_rule(_get_row(rule_id)) for rule_id in rule_ids)


def reorder_enabled_rules(rule_ids: list[str]) -> tuple[RuleSnapshot, ...]:
    """Change enabled order without changing catalog positions or identities."""
    with transaction.atomic():
        state = _state()
        rows = list(
            StoredValidationRule.objects.select_for_update().filter(
                rule_id__in=rule_ids, enabled=True, archived_at__isnull=True
            )
        )
        if len(rows) != len(rule_ids) or len(rule_ids) != len(set(rule_ids)):
            raise CatalogError("Reorder must contain every selected enabled rule exactly once")
        for row in rows:
            row.enabled_position = None
            row.save(update_fields=["enabled_position", "updated_at"])
        for position, rule_id in enumerate(rule_ids, start=1):
            row = next(item for item in rows if item.rule_id == rule_id)
            row.enabled_position = position
            row.save(update_fields=["enabled_position", "updated_at"])
        _bump(state)
        return tuple(materialize_catalog_rule(_get_row(rule_id)) for rule_id in rule_ids)


def archive_catalog_rule(
    rule_id: str, *, source: str = "archive", changed_by: str | None = None
) -> RuleSnapshot:
    with transaction.atomic():
        state = _state()
        row = _get_row(rule_id, lock=True)
        row.enabled = False
        row.enabled_position = None
        row.archived_at = timezone.now()
        row.save()
        _bump(state)
        lineage = _resolve_row_lineage(row, source=source)
        revision = row.evolution_revision or rule_evolution.latest_revision_number(lineage)
        rule_evolution.record_event(
            lineage=lineage,
            revision_number=revision,
            previous_event=rule_evolution.latest_event(lineage),
            source_rule=row,
            target_rule=row,
            source_identifier=row.identity_id,
            target_identifier=row.identity_id,
            change_type=rule_evolution.ARCHIVE,
            save_decision=rule_evolution.SYSTEM_DECISION,
            before_payload=copy.deepcopy(row.authored_payload),
            after_payload=copy.deepcopy(row.authored_payload),
            change_summary=rule_evolution.build_change_summary(
                previous_draft=row.authored_payload,
                new_draft=row.authored_payload,
                previous_identifier=row.identity_id,
                new_identifier=row.identity_id,
                extreme_changes=[],
            ),
            commentary_policy=rule_evolution.NO_INHERITANCE,
            source=source,
            changed_by=changed_by,
        )
        row.evolution_revision = revision
        row.save(update_fields=["evolution_revision", "updated_at"])
        return materialize_catalog_rule(row)


def configuration_conflicts(drafts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    conflicts: list[dict[str, Any]] = []
    for position, draft in enumerate(drafts, start=1):
        identity = _register_identity_in_transaction(draft)
        row = (
            StoredValidationRule.objects.select_related("identity", "superseded_by")
            .filter(identity=identity)
            .first()
        )
        if row is None or row.archived_at is None:
            continue
        replacement = row.superseded_by
        conflicts.append(
            {
                "kind": "modified" if replacement is not None else "deleted",
                "position": position,
                "rule_id": row.rule_id,
                "rule_identifier": identity.identifier,
                "name": str(draft.get("name", "(unnamed)")),
                "description": str(draft.get("description", "")),
                **(
                    {
                        "replacement_rule_id": replacement.rule_id,
                        "replacement_rule_identifier": replacement.identity_id,
                        "replacement_name": str(replacement.authored_payload.get("name", "")),
                        "replacement_payload": copy.deepcopy(replacement.authored_payload),
                    }
                    if replacement is not None
                    else {}
                ),
            }
        )
    return conflicts


def reinstate_catalog_rule(
    rule_id: str, *, source: str = "reinstate", changed_by: str | None = None
) -> RuleSnapshot:
    with transaction.atomic():
        state = _state()
        row = _get_row(rule_id, lock=True)
        row.archived_at = None
        row.superseded_by = None
        row.enabled = True
        row.enabled_position = _enabled_position()
        row.save()
        _bump(state)
        lineage = _resolve_row_lineage(row, source=source)
        revision = row.evolution_revision or rule_evolution.latest_revision_number(lineage)
        rule_evolution.record_event(
            lineage=lineage,
            revision_number=revision,
            previous_event=rule_evolution.latest_event(lineage),
            source_rule=None,
            target_rule=row,
            source_identifier=None,
            target_identifier=row.identity_id,
            change_type=rule_evolution.REINSTATE,
            save_decision=rule_evolution.SYSTEM_DECISION,
            before_payload=None,
            after_payload=copy.deepcopy(row.authored_payload),
            change_summary=rule_evolution.build_change_summary(
                previous_draft=None,
                new_draft=row.authored_payload,
                previous_identifier=None,
                new_identifier=row.identity_id,
                extreme_changes=[],
                extra={"cleared_predecessor_link": True},
            ),
            commentary_policy=rule_evolution.NO_INHERITANCE,
            source=source,
            changed_by=changed_by,
        )
        row.evolution_revision = revision
        row.save(update_fields=["evolution_revision", "updated_at"])
        return materialize_catalog_rule(row)


def _cursor(revision: int, position: int, pinned: list[str]) -> str:
    raw = json.dumps(
        {"revision": revision, "position": position, "pinned": pinned}, separators=(",", ":")
    ).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode_cursor(value: str) -> dict[str, Any]:
    try:
        padded = value + "=" * (-len(value) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded).decode())
        if (
            not isinstance(data, dict)
            or not isinstance(data["revision"], int)
            or not isinstance(data["position"], int)
        ):
            raise ValueError
        return data
    except (KeyError, TypeError, ValueError, json.JSONDecodeError, UnicodeError) as exc:
        raise InvalidCursorError("Invalid catalog cursor") from exc


def list_catalog_rules(cursor: str | None = None, page_size: int = 50) -> RulePage:
    if page_size <= 0 or page_size > 50:
        raise InvalidCursorError("page_size must be between 1 and 50")
    state = RuleStoreState.objects.filter(singleton_key=1).first()
    revision = state.revision if state else 0
    if cursor is None:
        pinned_rows = (
            StoredValidationRule.objects.select_related("identity")
            .filter(enabled=True, archived_at__isnull=True)
            .order_by("enabled_position")
        )
        pinned = list(pinned_rows)
        first = list(
            StoredValidationRule.objects.select_related("identity")
            .filter(archived_at__isnull=True)
            .order_by("catalog_position")[:page_size]
        )
        rows = {row.rule_id: row for row in first}
        rows.update({row.rule_id: row for row in pinned})
        ordered = sorted(rows.values(), key=lambda row: row.catalog_position)
        last = max((row.catalog_position for row in first), default=0)
        has_more = StoredValidationRule.objects.filter(
            archived_at__isnull=True, catalog_position__gt=last
        ).exists()
        pinned_ids = [row.rule_id for row in pinned]
    else:
        data = _decode_cursor(cursor)
        if data.get("revision") != revision:
            raise StaleCursorError("Catalog changed; refresh the first page")
        pinned_ids = [str(item) for item in data.get("pinned", [])]
        ordered = list(
            StoredValidationRule.objects.select_related("identity")
            .filter(archived_at__isnull=True, catalog_position__gt=data["position"])
            .exclude(rule_id__in=pinned_ids)
            .order_by("catalog_position")[:page_size]
        )
        last = max((row.catalog_position for row in ordered), default=data["position"])
        has_more = (
            StoredValidationRule.objects.filter(archived_at__isnull=True, catalog_position__gt=last)
            .exclude(rule_id__in=pinned_ids)
            .exists()
        )
    next_cursor = _cursor(revision, last, pinned_ids) if has_more else None
    total = StoredValidationRule.objects.filter(archived_at__isnull=True).count()
    return RulePage(
        tuple(materialize_catalog_rule(row) for row in ordered),
        next_cursor,
        has_more,
        total,
        revision,
        tuple(pinned_ids),
    )


def apply_rule_configuration(
    drafts: list[dict[str, Any]],
    *,
    config_name: str | None = None,
    source: str = "named_config_import",
    lineage_hints: dict[int, str] | None = None,
    changed_by: str | None = None,
) -> RuleImportResult:
    """Apply a validated configuration with one consistent lineage policy.

    - Unchanged canonical definitions reuse their lineage: no duplicate
      events, and a repeated identical application changes nothing at all
      (no catalog bump, no history rows).
    - New unmatched identities become independent lineages with no
      commentary inheritance.
    - An explicit ``lineage_hints`` entry (1-based draft position to
      lineage id, sourced from annotated YAML/config lineage metadata)
      imports the draft as a revision of that lineage. Hints naming an
      unknown lineage preserve the supplied id on a fresh lineage; hints
      that contradict the located row's lineage, or name a lineage with no
      catalog rows to revise, fail atomically with no partial mutation.
    """
    valid_sources = {
        "yaml_import",
        "named_config_import",
        "startup_sync",
        "ui_edit",
        "copy",
    }
    if source not in valid_sources:
        raise CatalogError(f"Invalid import source: {source!r}")
    hints = dict(lineage_hints or {})
    with transaction.atomic():
        state = _state()
        drafts = [normalize_rule_draft(draft) for draft in drafts]
        identities = [_register_identity_in_transaction(draft) for draft in drafts]
        first_positions: dict[str, int] = {}
        for position, identity in enumerate(identities, start=1):
            previous = first_positions.get(identity.identifier)
            if previous is not None:
                previous_name = str(drafts[previous - 1].get("name", "(unnamed)"))
                current_name = str(drafts[position - 1].get("name", "(unnamed)"))
                label = f"'{config_name}'" if config_name else "the selected configuration"
                raise CatalogError(
                    f"Configuration {label} contains duplicate canonical rule "
                    f"{identity.identifier}: '{previous_name}' and '{current_name}' "
                    f"at entries {previous} and {position}"
                )
            first_positions[identity.identifier] = position
        for hint_position, hinted_id in hints.items():
            if not isinstance(hinted_id, str) or not hinted_id:
                raise CatalogError(
                    f"Invalid lineage hint for configuration entry {hint_position}."
                )
        enabled_before = list(
            StoredValidationRule.objects.filter(
                enabled=True, archived_at__isnull=True
            ).order_by("enabled_position", "catalog_position").values_list("rule_id", flat=True)
        )
        bindings: dict[str, str] = {}
        imported = reused = 0
        changed = False
        # Clear the old order before applying the imported enabled set. The
        # partial unique constraint otherwise rejects a position reused by a
        # newly imported or reordered rule.
        existing_rows = StoredValidationRule.objects.select_for_update().filter(
            archived_at__isnull=True
        )
        for row in existing_rows:
            if row.enabled_position is not None:
                row.enabled_position = None
                row.save(update_fields=["enabled_position", "updated_at"])
        for position, (draft, identity) in enumerate(zip(drafts, identities, strict=True), start=1):
            hinted_lineage_id = hints.get(position)
            existing_row = (
                StoredValidationRule.objects.select_for_update().filter(identity=identity).first()
            )
            if existing_row is not None:
                row = existing_row
                reused += 1
                row_lineage = _resolve_row_lineage(row, source=source)
                if hinted_lineage_id is not None and hinted_lineage_id != row_lineage.lineage_id:
                    raise IdentityReuseConflict(
                        {
                            "code": "rule_identity_reuse_conflict",
                            "original_rule_id": row.rule_id,
                            "original_identifier": identity.identifier,
                            "proposed_identifier": identity.identifier,
                            "existing_rule_id": row.rule_id,
                            "existing_lineage_id": row_lineage.lineage_id,
                        }
                    )
                before = copy.deepcopy(row.authored_payload)
                if row.archived_at is not None or before != draft:
                    was_archived = row.archived_at is not None
                    row.authored_payload = copy.deepcopy(draft)
                    row.archived_at = None
                    revision = row.evolution_revision or rule_evolution.latest_revision_number(
                        row_lineage
                    )
                    rule_evolution.record_event(
                        lineage=row_lineage,
                        revision_number=revision,
                        previous_event=rule_evolution.latest_event(row_lineage),
                        source_rule=None if was_archived else row,
                        target_rule=row,
                        source_identifier=None if was_archived else identity.identifier,
                        target_identifier=identity.identifier,
                        change_type=(
                            rule_evolution.REINSTATE
                            if was_archived
                            else rule_evolution.METADATA_EDIT
                        ),
                        save_decision=rule_evolution.SYSTEM_DECISION,
                        before_payload=None if was_archived else before,
                        after_payload=copy.deepcopy(draft),
                        change_summary=rule_evolution.build_change_summary(
                            previous_draft=None if was_archived else before,
                            new_draft=draft,
                            previous_identifier=None if was_archived else identity.identifier,
                            new_identifier=identity.identifier,
                            extreme_changes=[],
                        ),
                        commentary_policy=rule_evolution.NO_INHERITANCE,
                        source=source,
                        changed_by=changed_by,
                    )
                    row.evolution_revision = revision
                    changed = True
            elif hinted_lineage_id is not None:
                row = _import_hinted_revision(
                    state,
                    draft,
                    identity,
                    hinted_lineage_id,
                    position,
                    source=source,
                    changed_by=changed_by,
                )
                imported += 1
                changed = True
            else:
                index = state.next_index
                row = StoredValidationRule.objects.create(
                    identity=identity,
                    rule_id=_format_rule_id(index),
                    catalog_position=index,
                    authored_payload=copy.deepcopy(draft),
                )
                state.next_index = index + 1
                lineage = rule_evolution.create_lineage()
                row.lineage = lineage
                row.evolution_revision = 1
                row.save(update_fields=["lineage", "evolution_revision", "updated_at"])
                rule_evolution.record_event(
                    lineage=lineage,
                    revision_number=1,
                    previous_event=None,
                    source_rule=None,
                    target_rule=row,
                    source_identifier=None,
                    target_identifier=identity.identifier,
                    change_type=rule_evolution.CREATION,
                    save_decision=rule_evolution.ORDINARY_CREATE,
                    before_payload=None,
                    after_payload=copy.deepcopy(draft),
                    change_summary=rule_evolution.build_change_summary(
                        previous_draft=None,
                        new_draft=draft,
                        previous_identifier=None,
                        new_identifier=identity.identifier,
                        extreme_changes=[],
                    ),
                    commentary_policy=rule_evolution.NO_INHERITANCE,
                    source=source,
                    changed_by=changed_by,
                )
                imported += 1
                changed = True
            row.enabled = True
            row.enabled_position = drafts.index(draft) + 1
            row.save()
            bindings[row.rule_id] = identity.identifier
        included = set(bindings)
        for row in (
            StoredValidationRule.objects.select_for_update()
            .filter(archived_at__isnull=True)
            .exclude(rule_id__in=included)
        ):
            row.enabled = False
            row.enabled_position = None
            row.save(update_fields=["enabled", "enabled_position", "updated_at"])
        # Bindings are inserted in file order, so their key order is the
        # resulting enabled order. A repeated identical application leaves the
        # enabled set untouched and records nothing.
        if list(enabled_before) != list(bindings):
            changed = True
        state.save(update_fields=["next_index"])
        if changed:
            _bump(state)
        return RuleImportResult(len(drafts), imported, reused, bindings)


def _import_hinted_revision(
    state: RuleStoreState,
    draft: dict[str, Any],
    identity: ValidationRuleIdentity,
    hinted_lineage_id: str,
    position: int,
    *,
    source: str,
    changed_by: str | None,
) -> StoredValidationRule:
    """Import one draft as an explicit revision of a hinted lineage."""
    lineage = RuleLineage.objects.filter(lineage_id=hinted_lineage_id).first()
    if lineage is None:
        # Annotated lineage metadata on a fresh database: preserve the
        # supplied lineage id on a new lineage instead of inventing a
        # relationship to unrelated rows.
        lineage, _ = rule_evolution.get_or_create_lineage(hinted_lineage_id)
        index = state.next_index
        row = StoredValidationRule.objects.create(
            identity=identity,
            rule_id=_format_rule_id(index),
            catalog_position=index,
            authored_payload=copy.deepcopy(draft),
        )
        state.next_index = index + 1
        row.lineage = lineage
        row.evolution_revision = 1
        row.save(update_fields=["lineage", "evolution_revision", "updated_at"])
        rule_evolution.record_event(
            lineage=lineage,
            revision_number=1,
            previous_event=None,
            source_rule=None,
            target_rule=row,
            source_identifier=None,
            target_identifier=identity.identifier,
            change_type=rule_evolution.CREATION,
            save_decision=rule_evolution.ORDINARY_CREATE,
            before_payload=None,
            after_payload=copy.deepcopy(draft),
            change_summary=rule_evolution.build_change_summary(
                previous_draft=None,
                new_draft=draft,
                previous_identifier=None,
                new_identifier=identity.identifier,
                extreme_changes=[],
                extra={"imported_lineage_id": hinted_lineage_id},
            ),
            commentary_policy=rule_evolution.NO_INHERITANCE,
            source=source,
            changed_by=changed_by,
        )
        return row
    tip = (
        StoredValidationRule.objects.select_for_update()
        .filter(lineage=lineage)
        .order_by("-evolution_revision", "-catalog_position")
        .first()
    )
    if tip is None:
        raise CatalogError(
            f"Configuration entry {position} names lineage {hinted_lineage_id} "
            "which has no catalog rows to revise."
        )
    tip_lineage = _resolve_row_lineage(tip, source=source)
    before = copy.deepcopy(tip.authored_payload)
    extreme_changes = rule_evolution.detect_extensive_changes(before, draft)
    position_value = tip.enabled_position
    was_enabled = tip.enabled and tip.archived_at is None
    index = state.next_index
    row = StoredValidationRule.objects.create(
        identity=identity,
        rule_id=_format_rule_id(index),
        catalog_position=index,
        authored_payload=copy.deepcopy(draft),
        enabled=was_enabled,
        enabled_position=position_value if was_enabled else None,
    )
    state.next_index = index + 1
    tip.enabled = False
    tip.enabled_position = None
    tip.archived_at = timezone.now()
    tip.save()
    tip.superseded_by = row
    tip.save(update_fields=["superseded_by", "updated_at"])
    revision = rule_evolution.latest_revision_number(tip_lineage) + 1
    rule_evolution.record_event(
        lineage=tip_lineage,
        revision_number=revision,
        previous_event=rule_evolution.latest_event(tip_lineage),
        source_rule=tip,
        target_rule=row,
        source_identifier=tip.identity_id,
        target_identifier=identity.identifier,
        change_type=rule_evolution.IMPORT_SYNC,
        save_decision=rule_evolution.MODIFY_CURRENT,
        before_payload=before,
        after_payload=copy.deepcopy(draft),
        change_summary=rule_evolution.build_change_summary(
            previous_draft=before,
            new_draft=draft,
            previous_identifier=tip.identity_id,
            new_identifier=identity.identifier,
            extreme_changes=extreme_changes,
            extra={"import_hinted_revision": True},
        ),
        commentary_policy=rule_evolution.CARRY_FORWARD_RECERTIFICATION,
        source=source,
        changed_by=changed_by,
    )
    row.lineage = tip_lineage
    row.evolution_revision = revision
    row.save(update_fields=["lineage", "evolution_revision", "updated_at"])
    return row
