"""Rule-evolution service: lineage, revision history, and save decisions.

This module is owned by Worker A. It is the narrow application service consumed
by Worker B (commentary carry-forward) and by the rule-save API consumed by
Worker C:

- ``detect_extensive_changes`` implements the extensive-edit trigger from the
  requirements (zero retained original conditions, or zero retained original
  expectations, compared as normalized executable clauses).
- ``record_event`` appends to the ``rules_rule_evolution_history`` table inside
  the caller's configuration-database transaction. History rows are never
  updated or deleted.
- ``get_predecessor_chain`` / ``resolve_revision_context`` expose the
  queryable old-to-new canonical identifier transitions. They raise explicit
  ``LineageNotFound`` / ``LineageAmbiguous`` / ``LineageCycle`` errors instead
  of guessing when execution context is insufficient.
- ``backfill_legacy_lineages`` converts trustworthy ``superseded_by`` chains
  into migrated history; undocumented relationships stay unknown.

Only ``modify_current`` executable-revision edges authorize commentary
inheritance. ``save_as_new`` and Copy start a new lineage with no inheritable
predecessor edge.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from apps.rules.identifiers import (
    normalized_condition_clauses,
    normalized_expectation_clauses,
)
from apps.rules.models import RuleEvolutionHistory, RuleLineage, StoredValidationRule

# Change types recorded in ``RuleEvolutionHistory.change_type``.
CREATION = "creation"
METADATA_EDIT = "metadata_edit"
EXECUTABLE_REVISION = "executable_revision"
SAVE_AS_NEW = "save_as_new"
ARCHIVE = "archive"
REINSTATE = "reinstate"
IMPORT_SYNC = "import_sync"
LEGACY_BACKFILL = "legacy_backfill"

# Save decisions recorded in ``RuleEvolutionHistory.save_decision``.
MODIFY_CURRENT = "modify_current"
SAVE_AS_NEW_DECISION = "save_as_new"
ORDINARY_CREATE = "ordinary_create"
SYSTEM_DECISION = "system"

# Commentary policies recorded in ``RuleEvolutionHistory.commentary_policy``.
CARRY_FORWARD_RECERTIFICATION = "carry_forward_recertification"
NO_INHERITANCE = "no_inheritance"

#: Change types whose identifier transitions authorize commentary inheritance.
INHERITABLE_CHANGE_TYPES = frozenset({EXECUTABLE_REVISION, LEGACY_BACKFILL})

#: Maximum predecessor links returned for one target identifier.
DEFAULT_MAX_DEPTH = 64


class EvolutionError(Exception):
    """Base error for rule-evolution service failures."""


class LineageNotFound(EvolutionError):
    """No recorded lineage contains the requested identifier."""


class LineageAmbiguous(EvolutionError):
    """The identifier belongs to several lineages; explicit context required."""

    def __init__(self, message: str, lineage_ids: list[str] | tuple[str, ...]) -> None:
        super().__init__(message)
        self.lineage_ids = list(lineage_ids)


class LineageCycle(EvolutionError):
    """Recorded predecessor links contain a cycle; refusing to traverse."""


def new_lineage_id() -> str:
    return uuid.uuid4().hex


def new_event_id() -> str:
    return uuid.uuid4().hex


def detect_extensive_changes(
    previous_draft: dict[str, Any], new_draft: dict[str, Any]
) -> list[str]:
    """Return the extensive-edit trigger reasons for an executable change.

    Reasons are drawn from ``{"conditions_replaced", "expectations_replaced"}``.
    Comparison uses normalized executable clauses, so reordering equivalent
    clauses, renaming the rule, or regrouping conditions never triggers. Empty
    conditions before and after editing are not wholesale removal.
    """
    try:
        previous_conditions = set(normalized_condition_clauses(previous_draft))
        new_conditions = set(normalized_condition_clauses(new_draft))
        previous_expectations = set(normalized_expectation_clauses(previous_draft))
        new_expectations = set(normalized_expectation_clauses(new_draft))
    except Exception:
        # Clause normalization must never mask a validation error: callers
        # validate drafts separately and treat unparsable drafts as invalid,
        # not as extensive.
        return []
    changes: list[str] = []
    if previous_conditions and not (previous_conditions & new_conditions):
        changes.append("conditions_replaced")
    if previous_expectations and not (previous_expectations & new_expectations):
        changes.append("expectations_replaced")
    return changes


def metadata_field_changes(
    previous_draft: dict[str, Any], new_draft: dict[str, Any]
) -> list[str]:
    """Authored non-executable field names whose values differ."""
    changed: list[str] = []
    for key in ("name", "description"):
        if previous_draft.get(key) != new_draft.get(key):
            changed.append(key)
    return changed


def build_change_summary(
    *,
    previous_draft: dict[str, Any] | None,
    new_draft: dict[str, Any],
    previous_identifier: str | None,
    new_identifier: str,
    extreme_changes: list[str],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "identifier_changed": previous_identifier != new_identifier,
        "extreme_changes": list(extreme_changes),
        "metadata_changed": (
            metadata_field_changes(previous_draft, new_draft)
            if previous_draft is not None
            else []
        ),
    }
    if extra:
        summary.update(extra)
    return summary


def create_lineage() -> RuleLineage:
    """Create and persist a new business-rule lineage."""
    return RuleLineage.objects.create(lineage_id=new_lineage_id())


def get_or_create_lineage(lineage_id: str) -> tuple[RuleLineage, bool]:
    """Fetch a lineage by id, creating it when an import names a new one."""
    return RuleLineage.objects.get_or_create(lineage_id=lineage_id)


def latest_event(lineage: Any) -> Any | None:
    return (
        RuleEvolutionHistory.objects.filter(lineage=lineage)
        .order_by("-created_at", "-event_id")
        .first()
    )


def latest_revision_number(lineage: Any) -> int:
    from django.db.models import Max

    value = RuleEvolutionHistory.objects.filter(lineage=lineage).aggregate(
        maximum=Max("revision_number")
    )["maximum"]
    return int(value or 0)


def record_event(
    *,
    lineage: Any,
    revision_number: int,
    previous_event: Any | None,
    source_rule: Any | None,
    target_rule: Any | None,
    source_identifier: str | None,
    target_identifier: str,
    change_type: str,
    save_decision: str,
    before_payload: dict[str, Any] | None,
    after_payload: dict[str, Any],
    change_summary: dict[str, Any] | None = None,
    commentary_policy: str,
    source: str,
    changed_by: str | None = None,
) -> Any:
    """Append one evolution event. The caller owns the transaction."""
    import copy

    return RuleEvolutionHistory.objects.create(
        event_id=new_event_id(),
        lineage=lineage,
        revision_number=revision_number,
        previous_event=previous_event,
        source_catalog_rule=source_rule,
        target_catalog_rule=target_rule,
        source_identifier=source_identifier,
        target_identifier=target_identifier,
        change_type=change_type,
        save_decision=save_decision,
        before_payload=copy.deepcopy(before_payload) if before_payload is not None else None,
        after_payload=copy.deepcopy(after_payload),
        change_summary=dict(change_summary or {}),
        commentary_policy=commentary_policy,
        source=source,
        changed_by=changed_by,
    )


def ensure_lineage_for_row(
    row: StoredValidationRule, *, source: str = LEGACY_BACKFILL
) -> RuleLineage:
    """Adopt an orphan catalog row into a fresh lineage (defensive backfill).

    Post-migration every catalog row has a lineage; this covers rows created
    by older code paths. Records a creation event so the row's payload and
    identifier stay queryable.
    """
    import copy

    if row.lineage_id is not None:
        from apps.rules.models import RuleLineage

        return RuleLineage.objects.get(lineage_id=row.lineage_id)
    lineage = create_lineage()
    row.lineage = lineage
    row.evolution_revision = 1
    row.save(update_fields=["lineage", "evolution_revision", "updated_at"])
    record_event(
        lineage=lineage,
        revision_number=1,
        previous_event=None,
        source_rule=None,
        target_rule=row,
        source_identifier=None,
        target_identifier=row.identity_id,
        change_type=CREATION,
        save_decision=SYSTEM_DECISION,
        before_payload=None,
        after_payload=copy.deepcopy(row.authored_payload),
        change_summary={"identifier_changed": False, "extreme_changes": [],
                        "metadata_changed": [], "orphan_adoption": True},
        commentary_policy=NO_INHERITANCE,
        source=source,
    )
    return lineage


@dataclass(frozen=True)
class PredecessorLink:
    """One inheritable executable transition, newest chain position first."""

    event_id: str
    lineage_id: str
    revision_number: int
    source_identifier: str
    target_identifier: str
    relationship: str = "revision"
    change_type: str = EXECUTABLE_REVISION
    save_decision: str = MODIFY_CURRENT
    created_at: Any = None


@dataclass(frozen=True)
class RevisionContext:
    """Explicit resolution of a target identifier within recorded history."""

    status: str  # "ok" | "missing" | "ambiguous"
    lineage_id: str | None = None
    revision_number: int | None = None
    event_id: str | None = None
    rule_id: str | None = None
    candidates: tuple[str, ...] = ()


@dataclass(frozen=True)
class ChainQuery:
    target_identifier: str
    lineage_id: str | None = None
    max_depth: int = DEFAULT_MAX_DEPTH


def _lineage_ids_for_identifier(target_identifier: str) -> list[str]:
    return sorted(
        RuleEvolutionHistory.objects.filter(target_identifier=target_identifier)
        .values_list("lineage_id", flat=True)
        .distinct()
    )


def _event_to_link(event: Any) -> PredecessorLink:
    return PredecessorLink(
        event_id=event.event_id,
        lineage_id=event.lineage_id,
        revision_number=event.revision_number,
        source_identifier=event.source_identifier or "",
        target_identifier=event.target_identifier,
        relationship="revision",
        change_type=event.change_type,
        save_decision=event.save_decision,
        created_at=event.created_at,
    )


def get_predecessor_chain(
    target_identifier: str,
    *,
    lineage_id: str | None = None,
    max_depth: int = DEFAULT_MAX_DEPTH,
) -> list[PredecessorLink]:
    """Return inheritable predecessor links for a target identifier.

    Links are ordered newest-first (the target's immediate predecessor first)
    so callers can prefer the closest predecessor revision. Only
    ``modify_current`` executable-revision edges (including trustworthy legacy
    backfill edges) authorize inheritance; ``save_as_new``/Copy roots have no
    predecessor edge and terminate traversal, as do ``no_inheritance`` edges.

    Raises :class:`LineageNotFound` when the identifier is unknown,
    :class:`LineageAmbiguous` when it belongs to several lineages and no
    explicit ``lineage_id`` was supplied, and :class:`LineageCycle` when
    recorded links loop.
    """
    if lineage_id is not None:
        lineage_ids = (
            [lineage_id]
            if RuleEvolutionHistory.objects.filter(
                lineage_id=lineage_id, target_identifier=target_identifier
            ).exists()
            else []
        )
        if not lineage_ids:
            raise LineageNotFound(
                f"No recorded revision of {target_identifier} in lineage {lineage_id}"
            )
    else:
        lineage_ids = _lineage_ids_for_identifier(target_identifier)
        if not lineage_ids:
            raise LineageNotFound(
                f"No recorded lineage contains identifier {target_identifier}"
            )
        if len(lineage_ids) > 1:
            raise LineageAmbiguous(
                f"Identifier {target_identifier} belongs to {len(lineage_ids)} "
                "lineages; supply an explicit lineage_id",
                lineage_ids,
            )
    (resolved_lineage_id,) = lineage_ids
    starts = list(
        RuleEvolutionHistory.objects.filter(
            lineage_id=resolved_lineage_id, target_identifier=target_identifier
        ).order_by("-created_at", "-event_id")
    )
    links: list[PredecessorLink] = []
    visited: set[str] = set()
    stack: list[Any] = list(starts)
    while stack and len(links) < max_depth:
        event = stack.pop(0)
        if event.event_id in visited:
            continue
        visited.add(event.event_id)
        previous = None
        if event.previous_event_id:
            try:
                previous = RuleEvolutionHistory.objects.get(
                    event_id=event.previous_event_id
                )
            except RuleEvolutionHistory.DoesNotExist:
                previous = None
            if previous is not None and previous.event_id in visited:
                raise LineageCycle(
                    f"Predecessor links loop at event {previous.event_id}"
                )
        if (
            event.change_type in INHERITABLE_CHANGE_TYPES
            and event.commentary_policy == CARRY_FORWARD_RECERTIFICATION
            and event.source_identifier
            and event.source_identifier != event.target_identifier
        ):
            links.append(_event_to_link(event))
            if len(links) >= max_depth:
                break
        if previous is not None:
            if previous.lineage_id != resolved_lineage_id:
                continue
            stack.append(previous)
        # Branching: collect every recorded transition that produced the
        # current event's source identifier (diamond merges from legacy
        # catalogs), so no documented edge is silently dropped.
        if event.source_identifier and event.source_identifier != event.target_identifier:
            for sibling in (
                RuleEvolutionHistory.objects.filter(
                    lineage_id=resolved_lineage_id,
                    target_identifier=event.source_identifier,
                )
                .exclude(event_id__in=visited)
                .order_by("-created_at", "-event_id")
            ):
                stack.append(sibling)
    # Newest-first by revision, then recency.
    links.sort(key=lambda link: (link.revision_number, str(link.created_at)), reverse=True)
    return links[:max_depth]


def resolve_revision_context(
    target_identifier: str,
    *,
    lineage_id: str | None = None,
    revision_number: int | None = None,
    event_id: str | None = None,
) -> RevisionContext:
    """Resolve target identifier (+ optional lineage/revision context).

    Never guesses: unknown identifiers report ``missing`` and identifiers
    recorded in several lineages report ``ambiguous`` with the candidate
    lineage ids unless an explicit ``lineage_id`` disambiguates.
    """
    if event_id is not None:
        event = RuleEvolutionHistory.objects.filter(
            event_id=event_id, target_identifier=target_identifier
        ).first()
        if event is None:
            return RevisionContext(status="missing")
        target_row = event.target_catalog_rule
        return RevisionContext(
            status="ok",
            lineage_id=event.lineage_id,
            revision_number=event.revision_number,
            event_id=event.event_id,
            rule_id=target_row.rule_id if target_row is not None else None,
        )
    query = RuleEvolutionHistory.objects.filter(target_identifier=target_identifier)
    if lineage_id is not None:
        query = query.filter(lineage_id=lineage_id)
    if revision_number is not None:
        query = query.filter(revision_number=revision_number)
    events = list(query.order_by("-created_at", "-event_id"))
    if not events:
        return RevisionContext(status="missing")
    if lineage_id is None:
        candidates = sorted({event.lineage_id for event in events})
        if len(candidates) > 1:
            return RevisionContext(status="ambiguous", candidates=tuple(candidates))
    event = events[0]
    target_row = event.target_catalog_rule
    return RevisionContext(
        status="ok",
        lineage_id=event.lineage_id,
        revision_number=event.revision_number,
        event_id=event.event_id,
        rule_id=target_row.rule_id if target_row is not None else None,
    )


def event_to_dict(event: Any) -> dict[str, Any]:
    """Serialize one history event for the read-only history API."""
    source_row = event.source_catalog_rule
    target_row = event.target_catalog_rule
    return {
        "event_id": event.event_id,
        "lineage_id": event.lineage_id,
        "revision_number": event.revision_number,
        "previous_event_id": event.previous_event_id,
        "source_rule_id": source_row.rule_id if source_row is not None else None,
        "target_rule_id": target_row.rule_id if target_row is not None else None,
        "source_identifier": event.source_identifier,
        "target_identifier": event.target_identifier,
        "change_type": event.change_type,
        "save_decision": event.save_decision,
        "before_payload": event.before_payload,
        "after_payload": event.after_payload,
        "change_summary": event.change_summary,
        "commentary_policy": event.commentary_policy,
        "source": event.source,
        "changed_by": event.changed_by,
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


def lineage_events(lineage_id: str) -> list[Any]:
    """All recorded events for one lineage, oldest first (audit order)."""
    return list(
        RuleEvolutionHistory.objects.filter(lineage_id=lineage_id).order_by(
            "created_at", "event_id"
        )
    )


def backfill_legacy_lineages() -> dict[str, int]:
    """Convert trustworthy ``superseded_by`` chains into migrated history.

    Creates one lineage per connected component, a creation event for each
    branch root, and an executable-revision event per documented
    predecessor edge. Rows already carrying a lineage are untouched, and
    undocumented relationships are never invented. Cycle-guarded: an edge
    that would revisit a row is recorded without a predecessor link and
    flagged in its change summary.
    """
    from apps.rules.models import StoredValidationRule

    rows = list(
        StoredValidationRule.objects.select_related("lineage", "superseded_by").order_by(
            "catalog_position"
        )
    )
    if not rows:
        return {"lineages": 0, "events": 0}
    by_pk: dict[int, Any] = {row.pk: row for row in rows}
    # Union-find over predecessor edges to form connected components.
    parent: dict[int, int] = {row.pk: row.pk for row in rows}

    def find(key: int) -> int:
        while parent[key] != key:
            parent[key] = parent[parent[key]]
            key = parent[key]
        return key

    def union(left: int, right: int) -> None:
        parent[find(left)] = find(right)

    for row in rows:
        if row.superseded_by_id is not None and row.superseded_by_id in by_pk:
            union(row.pk, row.superseded_by_id)
    components: dict[int, list[Any]] = {}
    for row in rows:
        components.setdefault(find(row.pk), []).append(row)
    totals = {"lineages": 0, "events": 0}
    for members in components.values():
        if all(row.lineage_id is not None for row in members):
            continue
        lineage, _ = RuleLineage.objects.get_or_create(
            lineage_id=(
                next((row.lineage_id for row in members if row.lineage_id), None)
                or new_lineage_id()
            )
        )
        totals["lineages"] += 1
        counter = latest_revision_number(lineage)
        latest_by_identifier: dict[str, Any] = {}
        for event in RuleEvolutionHistory.objects.filter(lineage=lineage).order_by(
            "created_at", "event_id"
        ):
            latest_by_identifier[event.target_identifier] = event

        def bump() -> int:
            nonlocal counter
            counter += 1
            return counter

        # Branch roots: rows no other member was superseded into... each row
        # that is not any member's superseded_by target starts a branch.
        targets = {row.superseded_by_id for row in members if row.superseded_by_id}
        for row in sorted(members, key=lambda item: item.catalog_position):
            if row.pk in targets or row.lineage_id is not None:
                continue
            row.lineage = lineage
            row.evolution_revision = bump()
            row.save(update_fields=["lineage", "evolution_revision", "updated_at"])
            created = record_event(
                lineage=lineage,
                revision_number=row.evolution_revision,
                previous_event=None,
                source_rule=None,
                target_rule=row,
                source_identifier=None,
                target_identifier=row.identity_id,
                change_type=LEGACY_BACKFILL,
                save_decision=SYSTEM_DECISION,
                before_payload=None,
                after_payload=row.authored_payload,
                change_summary={
                    "identifier_changed": False,
                    "extreme_changes": [],
                    "metadata_changed": [],
                    "legacy_root": True,
                },
                commentary_policy=NO_INHERITANCE,
                source=LEGACY_BACKFILL,
            )
            latest_by_identifier[row.identity_id] = created
            totals["events"] += 1
        # Documented predecessor edges, oldest source first.
        for row in sorted(members, key=lambda item: item.catalog_position):
            target = row.superseded_by
            if target is None or target.pk not in by_pk:
                continue
            if row.lineage_id is None:
                row.lineage = lineage
                row.save(update_fields=["lineage", "updated_at"])
            if target.lineage_id is None:
                target.lineage = lineage
                target.save(update_fields=["lineage", "updated_at"])
            previous = latest_by_identifier.get(row.identity_id)
            cycle = previous is not None and previous.event_id in _chain_ids(previous)
            revision = bump()
            if row.evolution_revision is None:
                row.evolution_revision = revision
                row.save(update_fields=["evolution_revision", "updated_at"])
            created = record_event(
                lineage=lineage,
                revision_number=revision,
                previous_event=None if cycle else previous,
                source_rule=row,
                target_rule=target,
                source_identifier=row.identity_id,
                target_identifier=target.identity_id,
                change_type=LEGACY_BACKFILL,
                save_decision=MODIFY_CURRENT,
                before_payload=row.authored_payload,
                after_payload=target.authored_payload,
                change_summary={
                    "identifier_changed": row.identity_id != target.identity_id,
                    "extreme_changes": [],
                    "metadata_changed": [],
                    "legacy_edge": True,
                    "cycle_skipped": cycle,
                },
                commentary_policy=CARRY_FORWARD_RECERTIFICATION,
                source=LEGACY_BACKFILL,
            )
            if target.evolution_revision is None:
                target.evolution_revision = revision
                target.save(update_fields=["evolution_revision", "updated_at"])
            latest_by_identifier[target.identity_id] = created
            totals["events"] += 1
    return totals


def _chain_ids(event: Any) -> set[str]:
    """Collect predecessor event ids above ``event`` (cycle guard)."""
    seen: set[str] = set()
    current = event
    for _ in range(DEFAULT_MAX_DEPTH + 1):
        if current.previous_event_id is None or current.previous_event_id in seen:
            break
        seen.add(current.previous_event_id)
        try:
            current = RuleEvolutionHistory.objects.get(event_id=current.previous_event_id)
        except RuleEvolutionHistory.DoesNotExist:
            break
    return seen


__all__ = [
    "ARCHIVE",
    "CARRY_FORWARD_RECERTIFICATION",
    "CREATION",
    "DEFAULT_MAX_DEPTH",
    "EXECUTABLE_REVISION",
    "IMPORT_SYNC",
    "INHERITABLE_CHANGE_TYPES",
    "LEGACY_BACKFILL",
    "METADATA_EDIT",
    "MODIFY_CURRENT",
    "NO_INHERITANCE",
    "ORDINARY_CREATE",
    "REINSTATE",
    "SAVE_AS_NEW",
    "SAVE_AS_NEW_DECISION",
    "SYSTEM_DECISION",
    "ChainQuery",
    "EvolutionError",
    "LineageAmbiguous",
    "LineageCycle",
    "LineageNotFound",
    "PredecessorLink",
    "RevisionContext",
    "backfill_legacy_lineages",
    "build_change_summary",
    "create_lineage",
    "detect_extensive_changes",
    "ensure_lineage_for_row",
    "event_to_dict",
    "get_or_create_lineage",
    "get_predecessor_chain",
    "latest_event",
    "latest_revision_number",
    "lineage_events",
    "metadata_field_changes",
    "new_event_id",
    "new_lineage_id",
    "record_event",
    "resolve_revision_context",
]
