"""Frozen domain records exchanged with the API and run-capture adapters."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Literal

from apps.exception_tracking.identity import deserialize_key_columns

ExceptionStatus = Literal["New", "Commented", "NotCommented"]


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


@dataclass(frozen=True)
class ExceptionRecord:
    """A stored occurrence with its cross-date history and derived status."""

    exception_id: str
    exception_rule_identifier: str
    key_columns: str
    exception_timestamp: datetime
    exception_commentary: str
    exception_as_of_date: date
    exception_first_seen_as_of_date: date
    exception_last_seen_as_of_date: date
    exception_first_seen_timestamp: datetime
    exception_last_seen_timestamp: datetime
    status: ExceptionStatus

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

    @property
    def total(self) -> int:
        return len(self.exception_ids)


def status_for(
    commentary: str,
    *,
    as_of_date: date,
    first_seen_as_of_date: date,
) -> ExceptionStatus:
    """Derive the authoritative status for one stored occurrence.

    Nonblank commentary wins; otherwise the earliest occurrence is ``New`` and
    every later occurrence is ``NotCommented``.
    """

    if commentary.strip():
        return "Commented"
    if as_of_date == first_seen_as_of_date:
        return "New"
    return "NotCommented"
