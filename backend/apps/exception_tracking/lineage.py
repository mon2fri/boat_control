"""Rule-evolution lineage interface consumed by Worker B.

Worker A owns the rule catalog, revision history, and the authoritative
predecessor edges in the configuration database. This module defines the
narrow read contract Worker B needs for cross-revision commentary
carry-forward. Worker B never queries A's tables directly and never guesses
predecessor links from rule names, local ``Rxxx`` indices, or canonical
identifier substrings.

Agreed lookup (final module path frozen by the integrator): Worker A provides
``apps.rules.rule_evolution.get_lineage_resolver()`` returning an object with
``resolve_predecessors(target_identifier, *, lineage_id=None)``. Until that
committed prerequisite lands, :func:`get_lineage_resolver` returns ``None``
and Worker B degrades to same-identity carry only.

Only edges with relationship ``"revision"`` (an executable revision saved via
*modify current*) authorize commentary inheritance. ``save as new`` and Copy
edges must use a different relationship value and are ignored here. When an
edge carries an explicit ``commentary_policy``, only
``"carry_with_recertification"`` authorizes inheritance.
"""

from __future__ import annotations

import importlib
import logging
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

from apps.exception_tracking.errors import ExceptionTrackingError

logger = logging.getLogger(__name__)

# Relationship value Worker A must use for executable revisions saved via
# "modify current". Any other value (save as new, copy, creation, metadata
# edit, duplicate reuse) does not authorize commentary inheritance.
RELATIONSHIP_REVISION = "revision"

# Edge relationships that authorize cross-revision commentary carry-forward.
INHERITANCE_RELATIONSHIPS = frozenset({RELATIONSHIP_REVISION})

# Explicit commentary policy value that authorizes carry with recertification.
COMMENTARY_POLICY_CARRY = "carry_with_recertification"

# Agreed Worker A module/factory path. The integrator freezes the final path;
# this is the provisional default Worker B probes.
_AGREED_MODULE = "apps.rules.rule_evolution"
_AGREED_FACTORY = "get_lineage_resolver"


class LineageError(ExceptionTrackingError):
    """Base class for rule-evolution lineage resolution failures."""


class LineageUnavailableError(LineageError):
    """A's lineage service is not installed or reachable in this checkout."""


class AmbiguousLineageError(LineageError):
    """The target identifier cannot be resolved to one unambiguous lineage."""

    def __init__(self, message: str, *, target_identifier: str = "") -> None:
        super().__init__(message)
        self.target_identifier = target_identifier


class LineageConflictError(LineageError):
    """The recorded predecessor edges are missing, conflicting, or cyclic."""

    def __init__(self, message: str, *, target_identifier: str = "") -> None:
        super().__init__(message)
        self.target_identifier = target_identifier


@dataclass(frozen=True)
class PredecessorEdge:
    """One recorded predecessor link into a revised rule.

    ``relationship`` must be ``"revision"`` for modify-current executable
    revisions. ``commentary_policy``, when set by Worker A, must be
    ``"carry_with_recertification"`` to authorize inheritance.
    """

    source_identifier: str
    target_identifier: str
    relationship: str
    event_id: str
    lineage_id: str = ""
    revision_number: int | None = None
    commentary_policy: str | None = None


@dataclass(frozen=True)
class LineageResolution:
    """The bounded ordered predecessor chain for one target identifier.

    ``chain`` is ordered nearest-predecessor-first. An empty chain means the
    target has no recorded executable revision history (new or unrevised
    rule), not an error.
    """

    target_identifier: str
    lineage_id: str = ""
    chain: tuple[PredecessorEdge, ...] = ()
    target_event_id: str = ""


@dataclass(frozen=True)
class RevisionDescriptor:
    """Target revision context Worker A reports for one canonical identifier."""

    identifier: str
    lineage_id: str = ""
    revision_number: int | None = None
    event_id: str = ""


@runtime_checkable
class LineageResolver(Protocol):
    """Narrow lineage service Worker A implements and Worker B consumes."""

    def resolve_predecessors(
        self,
        target_identifier: str,
        *,
        lineage_id: str | None = None,
    ) -> LineageResolution: ...

    def describe_revision(
        self,
        identifier: str,
        *,
        lineage_id: str | None = None,
    ) -> RevisionDescriptor | None: ...


def inheritable_edges(chain: tuple[PredecessorEdge, ...]) -> list[PredecessorEdge]:
    """Return the chain edges that authorize commentary inheritance, in order."""

    result: list[PredecessorEdge] = []
    for edge in chain:
        if edge.relationship not in INHERITANCE_RELATIONSHIPS:
            continue
        if (
            edge.commentary_policy is not None
            and edge.commentary_policy != COMMENTARY_POLICY_CARRY
        ):
            continue
        if not edge.source_identifier or edge.source_identifier == edge.target_identifier:
            continue
        result.append(edge)
    return result


def _probe_agreed_resolver() -> LineageResolver | None:
    try:
        module = importlib.import_module(_AGREED_MODULE)
    except ImportError:
        return None
    factory = vars(module).get(_AGREED_FACTORY)
    if not callable(factory):
        logger.debug(
            "Worker A lineage module %s has no %s(); cross-revision carry disabled.",
            _AGREED_MODULE,
            _AGREED_FACTORY,
        )
        return None
    try:
        resolver = factory()
    except Exception as exc:  # pragma: no cover - defensive boundary
        logger.warning("Worker A lineage resolver factory failed: %s", exc)
        return None
    if not isinstance(resolver, LineageResolver):
        logger.warning(
            "Worker A lineage resolver does not implement the agreed protocol; "
            "cross-revision carry disabled."
        )
        return None
    return resolver


def get_lineage_resolver() -> LineageResolver | None:
    """Return Worker A's agreed lineage resolver, or ``None`` when unavailable.

    ``None`` means Worker B keeps legacy same-identity carry only. Callers
    must not treat the absence as an empty lineage.
    """

    return _probe_agreed_resolver()


class InMemoryLineageResolver:
    """Explicit stub of the agreed Worker A interface for focused tests only.

    Not for production use and never a substitute for the committed Worker A
    prerequisite. The delivery must pass an actual integration check after
    Worker A lands.
    """

    def __init__(self, edges: tuple[PredecessorEdge, ...] | list[PredecessorEdge] = ()) -> None:
        self._edges: dict[str, list[PredecessorEdge]] = {}
        for edge in edges:
            self._edges.setdefault(edge.target_identifier, []).append(edge)
        self._ambiguous: set[str] = set()
        self._conflicts: dict[str, str] = {}
        self._descriptors: dict[str, RevisionDescriptor] = {}

    def add_edge(self, edge: PredecessorEdge) -> None:
        self._edges.setdefault(edge.target_identifier, []).append(edge)

    def add_descriptor(self, descriptor: RevisionDescriptor) -> None:
        self._descriptors[descriptor.identifier] = descriptor

    def mark_ambiguous(self, target_identifier: str) -> None:
        self._ambiguous.add(target_identifier)

    def mark_conflict(self, target_identifier: str, message: str) -> None:
        self._conflicts[target_identifier] = message

    def resolve_predecessors(
        self,
        target_identifier: str,
        *,
        lineage_id: str | None = None,
    ) -> LineageResolution:
        if target_identifier in self._ambiguous:
            raise AmbiguousLineageError(
                f"Rule identifier {target_identifier} resolves to more than one "
                "business lineage; refusing to guess a predecessor.",
                target_identifier=target_identifier,
            )
        if target_identifier in self._conflicts:
            raise LineageConflictError(
                self._conflicts[target_identifier],
                target_identifier=target_identifier,
            )
        chain = tuple(self._edges.get(target_identifier, ()))
        if lineage_id:
            filtered = tuple(edge for edge in chain if edge.lineage_id in ("", lineage_id))
            if len(filtered) != len(chain):
                chain = filtered
        lineage = chain[0].lineage_id if chain else ""
        return LineageResolution(
            target_identifier=target_identifier,
            lineage_id=lineage,
            chain=chain,
        )

    def describe_revision(
        self,
        identifier: str,
        *,
        lineage_id: str | None = None,
    ) -> RevisionDescriptor | None:
        descriptor = self._descriptors.get(identifier)
        if descriptor is None:
            return None
        if lineage_id and descriptor.lineage_id not in ("", lineage_id):
            return None
        return descriptor


def revision_descriptor_to_context(descriptor: RevisionDescriptor | None) -> dict[str, Any]:
    """Render a descriptor as the additive run-snapshot lineage context entry."""

    if descriptor is None:
        return {}
    return {
        "lineage_id": descriptor.lineage_id,
        "revision_number": descriptor.revision_number,
        "event_id": descriptor.event_id,
    }


__all__ = [
    "COMMENTARY_POLICY_CARRY",
    "INHERITANCE_RELATIONSHIPS",
    "RELATIONSHIP_REVISION",
    "AmbiguousLineageError",
    "InMemoryLineageResolver",
    "LineageConflictError",
    "LineageError",
    "LineageResolution",
    "LineageResolver",
    "LineageUnavailableError",
    "PredecessorEdge",
    "RevisionDescriptor",
    "get_lineage_resolver",
    "inheritable_edges",
    "revision_descriptor_to_context",
]
