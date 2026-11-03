"""Capture a completed run's exceptions into the tracking store.

This module is the run-side adapter between the comparison engine and Worker A's
SQLite tracking store. It owns exactly three things:

* converting ``ValidationViolation`` records into the ordered rule-identifier /
  key-value occurrences required by the tracking contract;
* rejecting incomplete identity data with an actionable error instead of guessing
  an exception ID; and
* making the run failure behaviour explicit: capture happens *before* the run is
  published, so a successful run is never presented with silently missing
  tracking writes.

Worker A owns ID serialization, collision detection, and persistence. Worker B
owns the configurable database path. The proposed A/B Python contracts are
documented in ``docs/20261103_exception_tracking_run_capture.md``.
"""

from __future__ import annotations

import importlib
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Protocol, cast

from apps.runs.services import ExecutionResult

CAPTURE_STORE_MODULE = "apps.exception_tracking.store"
SETTINGS_SERVICE_MODULE = "apps.settings.services"
PATH_RESOLVER_NAME = "get_exception_tracking_path"

OccurrencePayload = dict[str, object]
IdentityKey = tuple[str, tuple[tuple[str, str], ...]]


class ExceptionCaptureError(RuntimeError):
    """The run completed but its exception tracking writes could not be made."""


class ExceptionTrackingDependencyError(ExceptionCaptureError):
    """A required Worker A/B integration point is unavailable in this checkout."""


class CaptureStore(Protocol):
    """The subset of Worker A's store module used by run capture."""

    def capture_exceptions(
        self,
        as_of_date: date,
        occurrences: Sequence[Mapping[str, object]],
        *,
        db_path: Path | None = None,
    ) -> object: ...


@dataclass(frozen=True)
class Exposure:
    """One deduplicated exception occurrence, before A assigns its literal ID."""

    exception_rule_identifier: str
    key_columns: tuple[tuple[str, str], ...]


def _utc_timestamp(value: datetime | None) -> datetime:
    timestamp = value or datetime.now(UTC)
    if timestamp.tzinfo is None or timestamp.utcoffset() is None:
        return timestamp.replace(tzinfo=UTC)
    return timestamp.astimezone(UTC)


def _rule_identifier(
    result: ExecutionResult,
    rule_id: str,
    violation_identifier: str | None,
) -> str:
    summary = result.validation.rule_summaries.get(rule_id) or {}
    candidates = (
        violation_identifier,
        result.rule_bindings.get(rule_id),
        summary.get("rule_identifier"),
    )
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate
    raise ExceptionCaptureError(
        f"Rule {rule_id} has no canonical rule identifier, so its exceptions cannot "
        "be tracked. Exception tracking requires rules from the initialized rule "
        "catalog. Migrate/initialize the rule catalog, reselect the rule, and rerun. "
        "No exception ID was guessed."
    )


def _ordered_key_pairs(
    result: ExecutionResult,
    rule_id: str,
    violation_key_columns: Mapping[str, object],
) -> tuple[tuple[str, str], ...]:
    if not result.key_columns:
        raise ExceptionCaptureError(
            f"Run has no configured key columns; cannot identify exceptions for rule "
            f"{rule_id}. Select at least one key column and rerun."
        )

    pairs: list[tuple[str, str]] = []
    for column in result.key_columns:
        if column not in violation_key_columns:
            raise ExceptionCaptureError(
                f"Exception for rule {rule_id} is missing configured key column "
                f"'{column}'. Select a key column present in both files and rerun."
            )
        raw_value = violation_key_columns[column]
        if raw_value is None:
            raise ExceptionCaptureError(
                f"Exception for rule {rule_id} has a null value for key column "
                f"'{column}'. Exception IDs require every configured key value; no "
                "ID was guessed."
            )
        text_value = str(raw_value)
        if text_value == "":
            raise ExceptionCaptureError(
                f"Exception for rule {rule_id} has an empty value for key column "
                f"'{column}'. Exception IDs require a non-empty value for every "
                "configured key column; no ID was guessed."
            )
        pairs.append((column, text_value))
    return tuple(pairs)


def build_occurrences(
    result: ExecutionResult,
    *,
    captured_at: datetime | None = None,
) -> list[OccurrencePayload]:
    """Convert every violation into one deduplicated occurrence payload.

    The exception ID intentionally excludes the violating column: requirement 1
    identifies an exception by canonical rule identifier plus configured key
    values. Multiple violating columns for the same rule and row therefore
    collapse to one occurrence. Occurrences are sorted for deterministic storage
    output and tests.

    ``key_columns`` is an ordered tuple of ``(column_name, exact_text_value)``
    pairs in the run's configured key-column order. Worker A forms the literal
    underscore-separated ID from those values and records a documented lossless
    textual representation in the ``key_columns`` column.
    """

    timestamp = _utc_timestamp(captured_at)
    unique: dict[IdentityKey, Exposure] = {}

    for rule_id, violations in result.validation.violations_by_rule.items():
        for violation in violations:
            identifier = _rule_identifier(result, rule_id, violation.rule_identifier)
            pairs = _ordered_key_pairs(result, rule_id, violation.key_columns)
            key: IdentityKey = (identifier, pairs)
            if key not in unique:
                unique[key] = Exposure(identifier, pairs)

    return [
        {
            "exception_rule_identifier": exposure.exception_rule_identifier,
            "key_columns": exposure.key_columns,
            "exception_timestamp": timestamp,
        }
        for _, exposure in sorted(unique.items())
    ]


def _load_store() -> CaptureStore:
    try:
        module = importlib.import_module(CAPTURE_STORE_MODULE)
    except ImportError as exc:
        raise ExceptionTrackingDependencyError(
            "Exception tracking storage is unavailable: expected "
            f"'{CAPTURE_STORE_MODULE}' with capture_exceptions(). This is a Worker A "
            "integration dependency; the run was not saved."
        ) from exc

    capture = vars(module).get("capture_exceptions")
    if not callable(capture):
        raise ExceptionTrackingDependencyError(
            f"Exception tracking storage in '{CAPTURE_STORE_MODULE}' does not expose "
            "capture_exceptions(). The run was not saved."
        )
    return cast(CaptureStore, module)


def resolve_tracking_db_path() -> Path:
    """Resolve the configured tracking database path via Worker B's settings service."""

    try:
        module = importlib.import_module(SETTINGS_SERVICE_MODULE)
    except ImportError as exc:  # pragma: no cover - settings app always exists
        raise ExceptionTrackingDependencyError(
            "Exception tracking settings are unavailable: expected "
            f"'{SETTINGS_SERVICE_MODULE}'. The run was not saved."
        ) from exc

    resolver = vars(module).get(PATH_RESOLVER_NAME)
    if not callable(resolver):
        raise ExceptionTrackingDependencyError(
            f"Exception tracking settings in '{SETTINGS_SERVICE_MODULE}' do not expose "
            f"{PATH_RESOLVER_NAME}(). This is a Worker B integration dependency; the "
            "run was not saved."
        )

    try:
        resolved = resolver()
    except Exception as exc:
        raise ExceptionCaptureError(
            f"Could not resolve the exception tracking database path: {exc}. "
            "The run was not saved."
        ) from exc

    if isinstance(resolved, Path):
        return resolved
    if isinstance(resolved, str) and resolved.strip():
        return Path(resolved).expanduser()
    raise ExceptionCaptureError(
        "The configured exception tracking database path is empty or invalid. "
        "Set a usable path in Settings and retry; the run was not saved."
    )


def capture_run_exceptions(
    result: ExecutionResult,
    as_of_date: date,
    *,
    captured_at: datetime | None = None,
    db_path: Path | None = None,
    store: CaptureStore | None = None,
) -> object:
    """Capture a completed run's exceptions before the run is persisted.

    Idempotency and retry are owned by Worker A: repeating a capture for the same
    ``as_of_date`` upserts occurrences, preserves commentary, and does not delete
    unrelated historical exceptions. This function itself performs no retries so a
    failure is reported synchronously to the caller.
    """

    if isinstance(as_of_date, datetime) or not isinstance(as_of_date, date):
        raise ExceptionCaptureError("Exception capture requires an ISO calendar As-of Date.")

    timestamp = _utc_timestamp(captured_at)
    occurrences = build_occurrences(result, captured_at=timestamp)
    resolved_path = db_path if db_path is not None else resolve_tracking_db_path()
    resolved_store = store or _load_store()

    try:
        return resolved_store.capture_exceptions(
            as_of_date,
            occurrences,
            db_path=resolved_path,
        )
    except ExceptionCaptureError:
        raise
    except Exception as exc:
        raise ExceptionCaptureError(
            f"Exception tracking capture failed for {as_of_date.isoformat()}: {exc}. "
            "The run was not saved. Verify the tracking database path/permissions and "
            "retry the same As-of Date; same-date captures are idempotent."
        ) from exc
