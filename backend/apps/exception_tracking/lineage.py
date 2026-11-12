"""Rule-evolution lineage adapter consumed by Worker B.

Worker A owns the rule catalog, revision history, and the authoritative
predecessor edges in the configuration database. This module adapts Worker's
B commentary carry-forward to Worker A's FROZEN service
(`backend/apps/rules/evolution.py`, frozen 2026-11-12):

- `get_predecessor_chain(target_identifier, *, lineage_id=None, max_depth=64)`
  returns newest-first `PredecessorLink` values (`event_id`, `lineage_id`,
  `revision_number`, `source_identifier`, `target_identifier`,
  `relationship="revision"`, `change_type`, `save_decision`, `created_at`)
  for inheritable `modify_current` executable-revision edges only
  (`save_as_new` roots yield `[]`). Raises `LineageNotFound` /
  `LineageAmbiguous(lineage_ids)` / `LineageCycle`; never guesses.
- `resolve_revision_context(target_identifier, *, lineage_id=None,
  revision_number=None, event_id=None)` returns a `RevisionContext` with
  status `ok | missing | ambiguous`.

Worker B never queries A's tables directly and never guesses predecessor links
from rule names, local `Rxxx` indices, or canonical identifier substrings.
A-service exceptions are matched by class name (not by import) so this adapter
stays importable in the B-only checkout; until the committed prerequisite
lands, :func:`get_lineage_service` returns ``None`` and Worker B degrades to
same-identity carry only.
"""

from __future__ import annotations

import importlib
import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

# Relationship value on every inheritable A link. Kept as a defensive check;
# A's frozen service only emits "revision" links to B.
RELATIONSHIP_REVISION = "revision"

# Frozen A commentary-policy value authorizing carry with recertification.
COMMENTARY_POLICY_CARRY = "carry_forward_recertification"

# Frozen A change types authorizing inheritance (informational; A filters).
INHERITABLE_CHANGE_TYPES = frozenset({"executable_revision", "legacy_backfill"})

# Frozen Worker A service module. Only this module is probed; no SQL, no guessing.
_AGREED_MODULE = "apps.rules.evolution"
_CHAIN_FUNCTION = "get_predecessor_chain"
_CONTEXT_FUNCTION = "resolve_revision_context"


@dataclass(frozen=True)
class PredecessorLinkView:
    """B-side view of one frozen A `PredecessorLink` (newest-first)."""

    event_id: str
    lineage_id: str
    revision_number: int
    source_identifier: str
    target_identifier: str
    relationship: str = RELATIONSHIP_REVISION


def get_lineage_service() -> Any | None:
    """Return Worker A's frozen evolution service module, or ``None``.

    ``None`` means the committed prerequisite is absent from this checkout;
    callers must degrade to same-identity carry, never to guessing.
    """

    try:
        return importlib.import_module(_AGREED_MODULE)
    except ImportError:
        return None


def _link_view(link: Any) -> PredecessorLinkView | None:
    try:
        return PredecessorLinkView(
            event_id=str(link.event_id),
            lineage_id=str(link.lineage_id or ""),
            revision_number=int(link.revision_number),
            source_identifier=str(link.source_identifier or ""),
            target_identifier=str(link.target_identifier or ""),
            relationship=str(link.relationship or ""),
        )
    except (AttributeError, TypeError, ValueError):
        return None


def fetch_predecessor_links(
    service: Any,
    target_identifier: str,
    *,
    lineage_id: str | None = None,
    max_depth: int = 64,
) -> tuple[list[PredecessorLinkView], str | None]:
    """Return ``(newest-first inheritable links, warning)`` for one target.

    Unknown identifiers (`LineageNotFound`) yield ``([], None)`` so the caller
    keeps legacy same-identity behavior for new rules. Ambiguity and cycles
    yield ``([], warning)`` and the caller must not guess. Any other failure
    propagates: masking a programming error would be worse than failing loudly.
    """

    if service is None:
        return [], None
    function = getattr(service, _CHAIN_FUNCTION, None)
    if not callable(function):
        logger.debug(
            "Lineage service has no %s(); cross-revision carry disabled.",
            _CHAIN_FUNCTION,
        )
        return [], None
    try:
        if lineage_id:
            raw_links = function(
                target_identifier, lineage_id=lineage_id, max_depth=max_depth
            )
        else:
            raw_links = function(target_identifier, max_depth=max_depth)
    except Exception as exc:
        name = type(exc).__name__
        if name == "LineageNotFound":
            return [], None
        if name == "LineageAmbiguous":
            candidates = getattr(exc, "lineage_ids", None) or ()
            return [], (
                f"No cross-revision commentary was carried for "
                f"'{target_identifier}': the identifier belongs to several "
                f"lineages ({', '.join(str(item) for item in candidates)}); "
                f"explicit lineage context is required."
            )
        if name == "LineageCycle":
            return [], (
                f"No cross-revision commentary was carried for "
                f"'{target_identifier}': recorded predecessor links loop; "
                f"review required."
            )
        raise
    links: list[PredecessorLinkView] = []
    for raw in raw_links or ():
        view = _link_view(raw)
        if view is None:
            continue
        # Defensive: A only emits inheritable "revision" links, but never
        # trust a non-revision or self-referential edge for inheritance.
        if view.relationship != RELATIONSHIP_REVISION:
            continue
        if not view.source_identifier or view.source_identifier == view.target_identifier:
            continue
        links.append(view)
    return links, None


def fetch_revision_context(
    service: Any,
    identifier: str,
    *,
    lineage_id: str | None = None,
) -> dict[str, Any]:
    """Return snapshot lineage context for one identifier, or ``{}``.

    Uses the frozen `resolve_revision_context`; `missing`/`ambiguous`/absent
    service all yield ``{}`` so capture proceeds without disambiguation.
    """

    if service is None:
        return {}
    function = getattr(service, _CONTEXT_FUNCTION, None)
    if not callable(function):
        return {}
    try:
        if lineage_id:
            context = function(identifier, lineage_id=lineage_id)
        else:
            context = function(identifier)
    except Exception:  # a context lookup must never fail the capture
        logger.warning(
            "Revision-context lookup failed for %s; continuing without lineage.",
            identifier,
            exc_info=True,
        )
        return {}
    if getattr(context, "status", None) != "ok":
        return {}
    resolved_lineage = getattr(context, "lineage_id", None)
    if not resolved_lineage:
        return {}
    entry: dict[str, Any] = {"lineage_id": str(resolved_lineage)}
    revision_number = getattr(context, "revision_number", None)
    if revision_number is not None:
        entry["revision_number"] = int(revision_number)
    event_id = getattr(context, "event_id", None)
    if event_id:
        entry["event_id"] = str(event_id)
    rule_id = getattr(context, "rule_id", None)
    if rule_id:
        entry["rule_id"] = str(rule_id)
    return entry


class LineageNotFound(Exception):
    """Stub mirror of A's `LineageNotFound` for focused tests only."""


class LineageAmbiguous(Exception):
    """Stub mirror of A's `LineageAmbiguous` for focused tests only."""

    def __init__(self, message: str, lineage_ids: Any = ()) -> None:
        super().__init__(message)
        self.lineage_ids = list(lineage_ids or ())


class LineageCycle(Exception):
    """Stub mirror of A's `LineageCycle` for focused tests only."""


@dataclass
class _StubLink:
    event_id: str
    lineage_id: str
    revision_number: int
    source_identifier: str
    target_identifier: str
    relationship: str = RELATIONSHIP_REVISION
    change_type: str = "executable_revision"
    save_decision: str = "modify_current"
    commentary_policy: str = COMMENTARY_POLICY_CARRY
    created_at: Any = None


@dataclass
class _StubRevisionContext:
    status: str
    lineage_id: str | None = None
    revision_number: int | None = None
    event_id: str | None = None
    rule_id: str | None = None
    candidates: tuple[str, ...] = ()


class InMemoryLineageResolver:
    """Explicit stub of the frozen A interface for focused tests only.

    Mirrors the frozen semantics: stored edges filtered to inheritable
    `modify_current` executable revisions (newest-first), `save_as_new` roots
    yielding `[]`, unknown identifiers raising `LineageNotFound`, explicit
    ambiguity/cycle hooks. Not for production and never a substitute for the
    committed Worker A prerequisite.
    """

    def __init__(self, links: Any = ()) -> None:
        self._by_target: dict[str, list[_StubLink]] = {}
        self._ambiguous: set[str] = set()
        self._ambiguous_ids: dict[str, list[str]] = {}
        self._cyclic: set[str] = set()
        for link in links or ():
            self.add_link(link)

    def add_link(self, link: _StubLink | dict[str, Any]) -> None:
        if isinstance(link, dict):
            link = _StubLink(**link)
        self._by_target.setdefault(link.target_identifier, []).append(link)

    def mark_ambiguous(
        self, target_identifier: str, lineage_ids: Any = ("lineage-a", "lineage-b")
    ) -> None:
        self._ambiguous.add(target_identifier)
        self._ambiguous_ids[target_identifier] = list(lineage_ids)

    def mark_cyclic(self, target_identifier: str) -> None:
        self._cyclic.add(target_identifier)

    def _inheritable(self, link: _StubLink) -> bool:
        return (
            link.change_type in INHERITABLE_CHANGE_TYPES
            and link.commentary_policy == COMMENTARY_POLICY_CARRY
            and link.relationship == RELATIONSHIP_REVISION
            and bool(link.source_identifier)
            and link.source_identifier != link.target_identifier
        )

    def get_predecessor_chain(
        self,
        target_identifier: str,
        *,
        lineage_id: str | None = None,
        max_depth: int = 64,
    ) -> list[_StubLink]:
        if target_identifier in self._ambiguous:
            raise LineageAmbiguous(
                f"Identifier {target_identifier} belongs to several lineages",
                self._ambiguous_ids.get(target_identifier, ()),
            )
        if target_identifier in self._cyclic:
            raise LineageCycle(f"Predecessor links loop at {target_identifier}")
        chain: list[_StubLink] = []
        emitted: set[str] = set()
        enqueued: set[str] = {target_identifier}
        queue: list[str] = [target_identifier]
        known = any(
            link.target_identifier == target_identifier
            for links in self._by_target.values()
            for link in links
        )
        if not known:
            raise LineageNotFound(
                f"No recorded lineage contains identifier {target_identifier}"
            )
        while queue and len(chain) < max_depth:
            current = queue.pop(0)
            for link in self._by_target.get(current, ()):
                if lineage_id and link.lineage_id not in ("", lineage_id):
                    continue
                if link.event_id in emitted:
                    continue
                emitted.add(link.event_id)
                if self._inheritable(link):
                    chain.append(link)
                if link.source_identifier not in enqueued:
                    enqueued.add(link.source_identifier)
                    queue.append(link.source_identifier)
        chain.sort(key=lambda link: link.revision_number, reverse=True)
        return chain[:max_depth]

    def resolve_revision_context(
        self,
        identifier: str,
        *,
        lineage_id: str | None = None,
        revision_number: int | None = None,
        event_id: str | None = None,
    ) -> _StubRevisionContext:
        candidates = [
            link
            for links in self._by_target.values()
            for link in links
            if link.target_identifier == identifier
            and (lineage_id is None or link.lineage_id in ("", lineage_id))
            and (revision_number is None or link.revision_number == revision_number)
            and (event_id is None or link.event_id == event_id)
        ]
        if not candidates:
            return _StubRevisionContext(status="missing")
        lineages = sorted({link.lineage_id for link in candidates if link.lineage_id})
        if lineage_id is None and len(lineages) > 1:
            return _StubRevisionContext(status="ambiguous", candidates=tuple(lineages))
        best = max(candidates, key=lambda link: link.revision_number)
        return _StubRevisionContext(
            status="ok",
            lineage_id=best.lineage_id or None,
            revision_number=best.revision_number,
            event_id=best.event_id,
            rule_id=None,
            candidates=(),
        )


__all__ = [
    "COMMENTARY_POLICY_CARRY",
    "INHERITABLE_CHANGE_TYPES",
    "RELATIONSHIP_REVISION",
    "InMemoryLineageResolver",
    "LineageAmbiguous",
    "LineageCycle",
    "LineageNotFound",
    "PredecessorLinkView",
    "fetch_predecessor_links",
    "fetch_revision_context",
    "get_lineage_service",
]
