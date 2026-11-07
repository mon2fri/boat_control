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
import inspect
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
        **kwargs: object,
    ) -> object: ...


@dataclass(frozen=True)
class Exposure:
    """One deduplicated exception occurrence, before A assigns its literal ID."""

    exception_rule_identifier: str
    key_columns: tuple[tuple[str, str], ...]
    rule_index: str
    detail_values: dict[str, str]


def _utc_timestamp(value: datetime | None) -> datetime:
    timestamp = value or datetime.now(UTC)
    if timestamp.tzinfo is None or timestamp.utcoffset() is None:
        raise ExceptionCaptureError(
            "Exception capture timestamp must be timezone-aware; supply UTC or another "
            "explicit timezone. Naive timestamps are ambiguous and are not guessed."
        )
    return timestamp.astimezone(UTC)


def _key_value_text(value: object) -> str:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


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
        text_value = _key_value_text(raw_value)
        if text_value == "":
            raise ExceptionCaptureError(
                f"Exception for rule {rule_id} has an empty value for key column "
                f"'{column}'. Exception IDs require a non-empty value for every "
                "configured key column; no ID was guessed."
            )
        pairs.append((column, text_value))
    return tuple(pairs)


def violation_identity(
    result: ExecutionResult,
    rule_id: str,
    violation: object,
) -> tuple[str, tuple[tuple[str, str], ...]]:
    """Return the canonical identity key for a validation violation.

    This is shared with read-time status reconciliation so run filtering matches
    the same occurrence identity Worker A persisted.
    """

    identifier = _rule_identifier(result, rule_id, getattr(violation, "rule_identifier", None))
    pairs = _ordered_key_pairs(result, rule_id, getattr(violation, "key_columns", {}))
    return identifier, pairs


def _supports_template_columns(function: object) -> str | None:
    try:
        signature = inspect.signature(function)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    for name in (
        "extra_columns",
        "template_columns",
        "commentary_template_columns",
        "kwargs",
    ):
        if name in signature.parameters:
            parameter = signature.parameters[name]
            if name == "kwargs" and parameter.kind is inspect.Parameter.VAR_KEYWORD:
                return "extra_columns"
            if name != "kwargs":
                return name
    return None


def build_occurrences(
    result: ExecutionResult,
    *,
    captured_at: datetime | None = None,
    template_columns: Sequence[str] | None = None,
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

    ``rule_index`` is the historical run-local rule id (``Rxxx``), never the
    exception identity. ``detail_values`` carries only the ordered Extra Columns
    for Commentary Template selection; it is independent of rule/exception extra
    columns and attribute-comparison sections. Worker A's canonical payload names
    are ``exception_rule_index`` and ``exception_extra_values``.
    """

    timestamp = _utc_timestamp(captured_at)
    selected_columns = list(
        template_columns
        if template_columns is not None
        else result.commentary_template_columns
    )
    unique: dict[IdentityKey, Exposure] = {}

    for rule_id, violations in result.validation.violations_by_rule.items():
        for violation in violations:
            identifier = _rule_identifier(result, rule_id, violation.rule_identifier)
            pairs = _ordered_key_pairs(result, rule_id, violation.key_columns)
            detail_values = {
                column: _key_value_text(violation.detail_values.get(column, ""))
                for column in selected_columns
            }
            key: IdentityKey = (identifier, pairs)
            if key not in unique:
                unique[key] = Exposure(
                    exception_rule_identifier=identifier,
                    key_columns=pairs,
                    rule_index=rule_id,
                    detail_values=detail_values,
                )

    return [
        {
            "exception_rule_identifier": exposure.exception_rule_identifier,
            "key_columns": exposure.key_columns,
            "exception_timestamp": timestamp,
            "exception_rule_index": exposure.rule_index,
            "exception_extra_values": exposure.detail_values,
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
    template_columns: Sequence[str] | None = None,
) -> object:
    """Capture a completed run's exceptions before the run is persisted.

    Idempotency and retry are owned by Worker A: repeating a capture for the same
    ``as_of_date`` upserts occurrences, preserves commentary, and does not delete
    unrelated historical exceptions. This function itself performs no retries so a
    failure is reported synchronously to the caller.

    ``template_columns`` is the ordered Extra Columns for Commentary Template
    selection, sent to Worker A as ``extra_columns``. Worker A persists the
    ordered union and each occurrence's ``exception_extra_values``; a non-empty
    selection fails closed when the integrated A store does not expose that
    capture contract.
    """

    if isinstance(as_of_date, datetime) or not isinstance(as_of_date, date):
        raise ExceptionCaptureError("Exception capture requires an ISO calendar As-of Date.")

    timestamp = _utc_timestamp(captured_at)
    selected_columns = list(
        template_columns
        if template_columns is not None
        else result.commentary_template_columns
    )
    occurrences = build_occurrences(
        result,
        captured_at=timestamp,
        template_columns=selected_columns,
    )
    resolved_path = db_path if db_path is not None else resolve_tracking_db_path()
    resolved_store = store or _load_store()

    template_parameter = _supports_template_columns(
        resolved_store.capture_exceptions
    )
    if template_parameter is None:
        if selected_columns:
            raise ExceptionTrackingDependencyError(
                "Worker A's capture_exceptions() does not accept the ordered "
                "extra_columns contract required by Extra Columns for Commentary "
                "Template. The run was not saved; integrate Worker A's template "
                "context commit first."
            )
        extra_kwargs: dict[str, object] = {}
    else:
        extra_kwargs = {template_parameter: selected_columns}

    try:
        return resolved_store.capture_exceptions(
            as_of_date,
            occurrences,
            db_path=resolved_path,
            **extra_kwargs,
        )
    except ExceptionCaptureError:
        raise
    except TypeError as exc:
        raise ExceptionTrackingDependencyError(
            "Worker A's capture_exceptions() rejected the extra_columns contract: "
            f"{exc}. The run was not saved."
        ) from exc
    except Exception as exc:
        raise ExceptionCaptureError(
            f"Exception tracking capture failed for {as_of_date.isoformat()}: {exc}. "
            "The run was not saved. Verify the tracking database path/permissions and "
            "retry the same As-of Date; same-date captures are idempotent."
        ) from exc
