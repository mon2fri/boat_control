"""Frozen domain records exchanged with the API and run-capture adapters."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Literal

from apps.exception_tracking.identity import deserialize_key_columns

ExceptionStatus = Literal["New", "Commented", "NotCommented", "RecertificationRequired"]

#: Exact user-facing marker for commentary carried across a rule revision.
RECERTIFICATION_REASON = "Recertification due to rule change"


@dataclass(frozen=True)
class ExceptionOccurrence:
    """One exception occurrence supplied to the repository.

    ``key_columns`` maps configured key-column names to their source values.
    ``key_column_order`` is the run's configured order and defines the literal
    exception ID.  ``commentary=None`` means "not supplied" (preserve/carry);
    ``""`` is an explicit clear.
    """

    exception_rule_identifier: str
    key_columns: Mapping[str, Any]
    key_column_order: Sequence[str]
    exception_timestamp: datetime | None = None
    exception_commentary: str | None = None
    exception_rule_index: str | None = None
    exception_extra_values: Mapping[str, Any] | None = None
    lineage_id: str | None = None
    """Optional business-rule lineage context for cross-revision carry.

    Threaded from run capture so the lineage resolver can disambiguate a
    target canonical identifier shared by more than one lineage. ``None``
    means the capture had no lineage context.
    """


@dataclass(frozen=True)
class ExceptionRecord:
    """A stored occurrence with its cross-date history and derived status."""

    exception_id: str
    exception_rule_identifier: str
    key_columns: str
    exception_timestamp: datetime
    exception_commentary: str
    exception_rule_index: str
    exception_extra_values: Mapping[str, str]
    exception_as_of_date: date
    exception_first_seen_as_of_date: date
    exception_last_seen_as_of_date: date
    exception_first_seen_timestamp: datetime
    exception_last_seen_timestamp: datetime
    status: ExceptionStatus
    recertification_required: bool = False
    recertification_reason: str = ""
    carried_from_exception_id: str = ""
    carried_from_as_of_date: date | None = None
    carried_from_rule_identifier: str = ""
    rule_evolution_event_id: str = ""
    recertified_at: datetime | None = None

    @property
    def revision_token(self) -> str:
        """Server-validated token binding this occurrence to its rule revision.

        The recertification endpoint requires the client to echo this token so
        a stale confirmation cannot certify a newer rule revision. Carried
        rows are bound to their evolution event; ordinary rows use ``""``.
        """

        return self.rule_evolution_event_id

    @property
    def key_column_pairs(self) -> tuple[tuple[str, str], ...]:
        """Return the stored key-column JSON as ordered name/value pairs."""

        return deserialize_key_columns(self.key_columns)


@dataclass(frozen=True)
class RecordingSummary:
    """Result of one transactional capture/record call."""

    as_of_date: date
    inserted: int
    updated: int
    exception_ids: tuple[str, ...]
    extra_columns: tuple[str, ...] = ()
    carry_warnings: tuple[str, ...] = ()
    """Non-fatal cross-revision carry notes (ambiguity, resolver failure).

    Warnings never fail the capture; the affected occurrences keep their
    normal (uncarried, unmarked) status instead of guessing a predecessor.
    """

    @property
    def total(self) -> int:
        return len(self.exception_ids)


@dataclass(frozen=True)
class RecertificationSummary:
    """Result of one explicit recertification (accept) call."""

    as_of_date: date
    accepted: tuple[str, ...] = ()
    already_accepted: tuple[str, ...] = ()

    @property
    def total(self) -> int:
        return len(self.accepted) + len(self.already_accepted)


def status_for(
    commentary: str,
    *,
    as_of_date: date,
    first_seen_as_of_date: date,
    recertification_required: bool = False,
) -> ExceptionStatus:
    """Derive the authoritative status for one stored occurrence.

    Pending recertification wins over commentary text: nonblank inherited
    text must not automatically become ``Commented``. Otherwise nonblank
    commentary wins; the earliest occurrence is ``New`` and every later
    occurrence is ``NotCommented``.
    """

    if recertification_required:
        return "RecertificationRequired"
    if commentary.strip():
        return "Commented"
    if as_of_date == first_seen_as_of_date:
        return "New"
    return "NotCommented"
