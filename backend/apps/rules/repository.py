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

from apps.rules.identifiers import calculate_rule_identity_details, verify_identity
from apps.rules.models import RuleStoreState, StoredValidationRule, ValidationRuleIdentity
from apps.rules.services import (
    Condition,
    LogicClause,
    Rule,
    _parse_grouping_tree,
)


class CatalogError(RuntimeError):
    """Base error for catalog integrity and mutation failures."""


class IdentityCollisionError(CatalogError):
    """The shortened identifier is already bound to different content."""


class CatalogCorruptionError(CatalogError):
    """A persisted catalog row no longer matches its protected identity."""


class StaleCursorError(CatalogError):
    """A pagination cursor was created against an older catalog revision."""


class InvalidCursorError(CatalogError):
    """A cursor is malformed or has invalid pagination parameters."""


@dataclass(frozen=True)
class RuleSnapshot:
    rule: Rule
    rule_identifier: str
    catalog_position: int
    enabled: bool
    archived_at: datetime | None


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


@dataclass(frozen=True)
class RuleImportResult:
    enabled: int
    imported: int
    reused: int
    bindings: dict[str, str]


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
    conditions = []
    for condition in payload.get("conditions", []):
        values = condition.get("filter_values") or (
            [condition.get("filter_value")] if condition.get("filter_value", "") != "" else []
        )
        conditions.append(
            Condition(
                condition["column_name"],
                condition["operator"],
                values[0] if values else "",
                tuple(values),
            )
        )
    logic_data = payload["logic"]
    logic_values = tuple(logic_data.get("target_values", []))
    logic = LogicClause(
        format=logic_data["format"],
        column_name=logic_data["column_name"],
        operator=logic_data["operator"],
        target_value=logic_data.get("target_value", ""),
        target_values=logic_values,
        comparison_mode=logic_data.get("comparison_mode", "comparison_vs_baseline"),
    )
    return Rule(
        rule_id=rule_id,
        rule_identifier=identifier,
        name=payload.get("name", ""),
        description=payload.get("description", ""),
        conditions=conditions,
        condition_relation=payload.get("condition_relation"),
        grouping=payload.get("grouping"),
        grouping_tree=_parse_grouping_tree(payload.get("grouping_tree")),
        logic=logic,
        extra_columns=tuple(payload.get("extra_columns", [])),
        hide_comparison=bool(payload.get("hide_comparison", False)),
    )


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
        archived_at=row.archived_at,
    )


def _get_row(rule_id: str, *, lock: bool = False) -> StoredValidationRule:
    query = StoredValidationRule.objects.select_related("identity")
    if lock:
        query = query.select_for_update()
    try:
        return query.get(rule_id=rule_id)
    except StoredValidationRule.DoesNotExist as exc:
        raise CatalogError(f"Rule {rule_id} not found") from exc


def create_catalog_rule(draft: dict[str, Any], enabled: bool = True) -> RuleSnapshot:
    with transaction.atomic():
        state = _state()
        identity = _register_identity_in_transaction(draft)
        existing = (
            StoredValidationRule.objects.select_for_update().filter(identity=identity).first()
        )
        if existing is not None:
            if existing.archived_at is not None:
                existing.archived_at = None
            existing.authored_payload = copy.deepcopy(draft)
            existing.enabled = enabled
            existing.enabled_position = _enabled_position() if enabled else None
            existing.save()
            _bump(state)
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
        return materialize_catalog_rule(row)


def get_catalog_rule(rule_id: str) -> RuleSnapshot:
    return materialize_catalog_rule(_get_row(rule_id))


def update_catalog_rule(rule_id: str, draft: dict[str, Any]) -> RuleEditResult:
    with transaction.atomic():
        state = _state()
        previous = _get_row(rule_id, lock=True)
        new_identity = _register_identity_in_transaction(draft)
        if previous.identity_id == new_identity.identifier:
            previous.authored_payload = copy.deepcopy(draft)
            previous.save()
            _bump(state)
            return RuleEditResult(rule_id, materialize_catalog_rule(previous))
        target = (
            StoredValidationRule.objects.select_for_update().filter(identity=new_identity).first()
        )
        position = previous.enabled_position
        was_enabled = previous.enabled and previous.archived_at is None
        previous.enabled = False
        previous.enabled_position = None
        previous.save()
        if target is None:
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
        else:
            target.authored_payload = copy.deepcopy(draft)
            target.archived_at = None
            target.enabled = was_enabled
            target.enabled_position = position if was_enabled else None
            target.save()
        _bump(state)
        return RuleEditResult(rule_id, materialize_catalog_rule(target))


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
        requested = set(rule_ids)
        for row in StoredValidationRule.objects.select_for_update().filter(
            archived_at__isnull=True
        ):
            row.enabled = row.rule_id in requested
            row.enabled_position = rule_ids.index(row.rule_id) + 1 if row.enabled else None
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


def archive_catalog_rule(rule_id: str) -> RuleSnapshot:
    with transaction.atomic():
        state = _state()
        row = _get_row(rule_id, lock=True)
        row.enabled = False
        row.enabled_position = None
        row.archived_at = timezone.now()
        row.save()
        _bump(state)
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


def list_catalog_rules(cursor: str | None = None, page_size: int = 10) -> RulePage:
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
            .order_by("catalog_position")[:50]
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


def apply_rule_configuration(drafts: list[dict[str, Any]]) -> RuleImportResult:
    with transaction.atomic():
        state = _state()
        identities = [_register_identity_in_transaction(draft) for draft in drafts]
        if len({identity.identifier for identity in identities}) != len(identities):
            raise CatalogError("Configuration contains duplicate canonical rules")
        bindings: dict[str, str] = {}
        imported = reused = 0
        for draft, identity in zip(drafts, identities, strict=True):
            row = StoredValidationRule.objects.select_for_update().filter(identity=identity).first()
            if row is None:
                index = state.next_index
                row = StoredValidationRule.objects.create(
                    identity=identity,
                    rule_id=_format_rule_id(index),
                    catalog_position=index,
                    authored_payload=copy.deepcopy(draft),
                )
                state.next_index = index + 1
                imported += 1
            else:
                reused += 1
                row.authored_payload = copy.deepcopy(draft)
                row.archived_at = None
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
        state.save(update_fields=["next_index"])
        _bump(state)
        return RuleImportResult(len(drafts), imported, reused, bindings)
