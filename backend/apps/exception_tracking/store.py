"""Worker C run-capture adapter for the exception-tracking repository.

Worker C produces ordered ``(column_name, exact_value)`` pairs and a canonical
rule identifier for every exception occurrence.  This module only translates
that payload into :class:`ExceptionOccurrence` values and delegates the single
transactional write to :class:`ExceptionTrackingRepository`; it contains no
second identity or storage implementation.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date, datetime
from pathlib import Path
from typing import Any

from apps.exception_tracking.domain import ExceptionOccurrence, RecordingSummary
from apps.exception_tracking.errors import ExceptionTrackingError
from apps.exception_tracking.repository import (
    ExceptionTrackingRepository,
    resolve_database_path,
)


def _pairs_from_payload(raw: object) -> tuple[tuple[str, object], ...]:
    if isinstance(raw, Mapping):
        order = list(raw)
        pairs: list[tuple[str, object]] = []
        for name in order:
            value = raw[name]
            if not isinstance(name, str) or not name:
                raise ExceptionTrackingError(
                    "Occurrence key_columns must use non-empty string column names."
                )
            pairs.append((name, value))
        return tuple(pairs)

    if isinstance(raw, (str, bytes)) or not isinstance(raw, Sequence):
        raise ExceptionTrackingError(
            "Occurrence key_columns must be a mapping or an ordered sequence of "
            "(column_name, value) pairs."
        )

    pairs = []
    for item in raw:
        if isinstance(item, (str, bytes)) or not isinstance(item, Sequence):
            raise ExceptionTrackingError(
                "Each occurrence key_columns entry must be a (column_name, value) pair."
            )
        if len(item) != 2:
            raise ExceptionTrackingError(
                "Each occurrence key_columns entry must contain exactly a column name "
                "and a value."
            )
        name, value = item
        if not isinstance(name, str) or not name:
            raise ExceptionTrackingError(
                "Occurrence key_columns must use non-empty string column names."
            )
        pairs.append((name, value))
    return tuple(pairs)


def _coerce_occurrence(payload: Mapping[str, object] | ExceptionOccurrence) -> ExceptionOccurrence:
    if isinstance(payload, ExceptionOccurrence):
        return payload
    if not isinstance(payload, Mapping):
        raise ExceptionTrackingError(
            "capture_exceptions accepts ExceptionOccurrence values or occurrence mappings."
        )

    rule_identifier = payload.get("exception_rule_identifier")
    if not isinstance(rule_identifier, str) or not rule_identifier:
        raise ExceptionTrackingError(
            "Occurrence payload is missing exception_rule_identifier. Exception "
            "tracking requires the canonical rule identifier; no ID was guessed."
        )

    raw_keys = payload.get("key_columns")
    if raw_keys is None:
        raise ExceptionTrackingError(
            "Occurrence payload is missing key_columns. Exception tracking requires "
            "every configured key value; no ID was guessed."
        )

    if isinstance(raw_keys, Mapping):
        explicit_order = payload.get("key_column_order")
        if explicit_order is None:
            order = tuple(str(name) for name in raw_keys)
        elif isinstance(explicit_order, (str, bytes)) or not isinstance(
            explicit_order, Sequence
        ):
            raise ExceptionTrackingError(
                "Occurrence key_column_order must be a sequence of column names."
            )
        else:
            order = tuple(str(name) for name in explicit_order)
        pairs = _pairs_from_payload(raw_keys)
    else:
        pairs = _pairs_from_payload(raw_keys)
        order = tuple(name for name, _ in pairs)

    if len(set(order)) != len(order):
        raise ExceptionTrackingError(
            "Occurrence key_columns contains duplicate column names; exception "
            "identity must be unambiguous."
        )

    key_values: dict[str, Any] = {}
    for name, value in pairs:
        key_values[name] = value

    timestamp = payload.get("exception_timestamp")
    if timestamp is not None and not isinstance(timestamp, datetime):
        raise ExceptionTrackingError(
            "Occurrence exception_timestamp must be a datetime, not a string."
        )

    commentary = payload.get("exception_commentary", payload.get("commentary"))
    if commentary is not None and not isinstance(commentary, str):
        raise ExceptionTrackingError(
            "Occurrence exception_commentary must be text when supplied."
        )

    rule_index = payload.get("exception_rule_index", payload.get("rule_index"))
    if rule_index is not None and not isinstance(rule_index, str):
        raise ExceptionTrackingError(
            "Occurrence exception_rule_index must be text when supplied."
        )

    lineage_id = payload.get("lineage_id")
    if lineage_id is not None and not isinstance(lineage_id, str):
        raise ExceptionTrackingError(
            "Occurrence lineage_id must be text when supplied."
        )

    extra_values = payload.get(
        "exception_extra_values", payload.get("extra_values")
    )
    if extra_values is not None and not isinstance(extra_values, Mapping):
        raise ExceptionTrackingError(
            "Occurrence exception_extra_values must be a mapping of column names "
            "to values."
        )

    return ExceptionOccurrence(
        exception_rule_identifier=rule_identifier,
        key_columns=key_values,
        key_column_order=order,
        exception_timestamp=timestamp,
        exception_commentary=commentary,
        exception_rule_index=rule_index,
        exception_extra_values=extra_values,
        lineage_id=lineage_id,
    )


def capture_exceptions(
    as_of_date: date | str,
    occurrences: Sequence[Mapping[str, object] | ExceptionOccurrence],
    *,
    db_path: str | Path | None = None,
    extra_columns: Sequence[str] | None = None,
    lineage_resolver: object | None = None,
) -> RecordingSummary:
    """Record one run's occurrences for an as-of date in a single transaction.

    Same-date captures upsert idempotently, preserve commentary/history, and
    never delete unrelated historical exceptions.  ``extra_columns`` is the
    ordered Extra Columns for Commentary Template selection; only its values may
    be supplied in each occurrence.  ``db_path`` is the resolved tracking
    database path supplied by Worker C/B; when omitted, the settings resolver (or
    the documented project-root default) is used.  ``lineage_resolver`` is
    Worker A's agreed lineage service (``None`` probes the agreed service and
    degrades to same-identity carry when unavailable); it enables
    cross-revision commentary inheritance with recertification.
    """

    repository = ExceptionTrackingRepository(resolve_database_path(db_path))
    coerced = [_coerce_occurrence(occurrence) for occurrence in occurrences]
    return repository.record_exceptions(
        as_of_date,
        coerced,
        extra_columns=extra_columns,
        lineage_resolver=lineage_resolver,
    )
