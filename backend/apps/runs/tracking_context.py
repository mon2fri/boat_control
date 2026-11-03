"""Tracking status reconciliation and New Exceptions Only filtering.

The tracking database is authoritative for exception status. Run capture stores
*all* exceptions; this module derives the display/report view only. A commentary
template is never filtered here — Worker B always reads all stored exceptions.

Unknown/missing statuses (for example a historical run with no As-of Date or an
unreadable tracking database) are retained rather than hidden. A run is never
silently stripped of exceptions whose authoritative status cannot be determined.
"""

from __future__ import annotations

import importlib
import json
import logging
from collections.abc import Mapping, Sequence
from copy import deepcopy
from dataclasses import replace
from datetime import date, datetime
from pathlib import Path
from typing import Any

from apps.runs.as_of_date import AsOfDateError, parse_as_of_date
from apps.runs.services import (
    AttributeChange,
    ExecutionResult,
    NewBookRow,
    RowComparison,
    ValidationViolation,
    compute_group_statistics,
)
from apps.runs.tracking_capture import (
    ExceptionCaptureError,
    ExceptionTrackingDependencyError,
    resolve_tracking_db_path,
    violation_identity,
)

logger = logging.getLogger(__name__)

CONTEXT_REPOSITORY_MODULE = "apps.exception_tracking.repository"
NEW_EXCEPTION_STATUSES = frozenset({"New", "NotCommented"})
ALL_STATUSES = frozenset({"New", "Commented", "NotCommented"})
STATUS_ORDER = {"New": 0, "NotCommented": 1, "Commented": 2}


def parse_new_exceptions_only(value: object | None, *, default: bool = True) -> bool:
    """Parse a request/query flag. Absence means the checked-by-default value."""

    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().casefold()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    raise ValueError("new_exceptions_only must be true or false.")


def _text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def _load_repository_module() -> object:
    try:
        return importlib.import_module(CONTEXT_REPOSITORY_MODULE)
    except ImportError as exc:
        raise ExceptionTrackingDependencyError(
            "Exception tracking context is unavailable: expected "
            f"'{CONTEXT_REPOSITORY_MODULE}' with ExceptionTrackingRepository. This is "
            "a Worker A integration dependency."
        ) from exc


def list_exception_records(
    as_of_date: date,
    *,
    db_path: Path | None = None,
    repository: object | None = None,
) -> list[object]:
    """Read Worker A's records for a date, for status/ID reconciliation."""

    if repository is not None:
        listed = repository.list_exceptions(as_of_date)  # type: ignore[attr-defined]
    else:
        module = _load_repository_module()
        factory = vars(module).get("ExceptionTrackingRepository")
        if not callable(factory):
            raise ExceptionTrackingDependencyError(
                f"'{CONTEXT_REPOSITORY_MODULE}' does not expose "
                "ExceptionTrackingRepository()."
            )
        resolved_path = db_path if db_path is not None else resolve_tracking_db_path()
        repo = factory(resolved_path)
        listed = repo.list_exceptions(as_of_date)
    return list(listed)


def _record_pairs(record: object) -> tuple[tuple[str, str], ...] | None:
    pairs = getattr(record, "key_column_pairs", None)
    if isinstance(pairs, tuple):
        return tuple((str(name), _text(value)) for name, value in pairs)
    raw = getattr(record, "key_columns", None)
    if isinstance(raw, str):
        try:
            loaded = json.loads(raw)
        except (TypeError, ValueError):
            return None
        if isinstance(loaded, Mapping):
            return tuple((str(name), _text(value)) for name, value in loaded.items())
    if isinstance(raw, Mapping):
        return tuple((str(name), _text(value)) for name, value in raw.items())
    return None


def _record_identity(record: object) -> tuple[str, tuple[tuple[str, str], ...]] | None:
    identifier = getattr(record, "exception_rule_identifier", None)
    if not isinstance(identifier, str) or not identifier:
        return None
    pairs = _record_pairs(record)
    if pairs is None:
        return None
    return identifier, pairs


def _record_status(record: object) -> str | None:
    status = getattr(record, "status", None)
    if isinstance(status, str) and status in ALL_STATUSES:
        return status
    commentary = getattr(record, "exception_commentary", "")
    if isinstance(commentary, str) and commentary.strip():
        return "Commented"
    first_seen = getattr(record, "exception_first_seen_as_of_date", None)
    as_of = getattr(record, "exception_as_of_date", None)
    if first_seen is not None and as_of is not None and str(first_seen) == str(as_of):
        return "New"
    if first_seen is not None and as_of is not None:
        return "NotCommented"
    return None


def _record_context(
    as_of_date: date,
    *,
    db_path: Path | None = None,
    repository: object | None = None,
) -> tuple[
    dict[tuple[str, tuple[tuple[str, str], ...]], tuple[str | None, str | None]],
    dict[str, tuple[str | None, str | None]],
]:
    records = list_exception_records(
        as_of_date, db_path=db_path, repository=repository
    )
    by_identity: dict[
        tuple[str, tuple[tuple[str, str], ...]], tuple[str | None, str | None]
    ] = {}
    by_id: dict[str, tuple[str | None, str | None]] = {}
    for record in records:
        context = (
            getattr(record, "exception_id", None),
            _record_status(record),
        )
        identity = _record_identity(record)
        if identity is not None:
            by_identity[identity] = context
        exception_id = getattr(record, "exception_id", None)
        if isinstance(exception_id, str) and exception_id:
            by_id[exception_id] = context
    return by_identity, by_id


def enrich_execution_result(
    result: ExecutionResult,
    as_of_date: date,
    *,
    strict: bool = True,
    db_path: Path | None = None,
    repository: object | None = None,
) -> ExecutionResult:
    """Attach authoritative exception IDs/statuses to a just-captured run."""

    by_identity, by_id = _record_context(
        as_of_date, db_path=db_path, repository=repository
    )
    enriched: dict[str, list[ValidationViolation]] = {}
    for rule_id, violations in result.validation.violations_by_rule.items():
        rows: list[ValidationViolation] = []
        for violation in violations:
            identity = violation_identity(result, rule_id, violation)
            context = by_identity.get(identity)
            if context is None and violation.exception_id:
                context = by_id.get(violation.exception_id)
            if context is None:
                if strict:
                    raise ExceptionCaptureError(
                        f"Exception tracking capture verification failed for rule "
                        f"{rule_id}: no stored record matches key columns "
                        f"{dict(identity[1])}. The run was not saved."
                    )
                rows.append(violation)
                continue
            exception_id, status = context
            rows.append(
                replace(
                    violation,
                    exception_id=exception_id,
                    exception_status=status,
                )
            )
        enriched[rule_id] = rows
    validation = replace(result.validation, violations_by_rule=enriched)
    return replace(result, validation=validation)


def _dict_rule_identifier(
    result: Mapping[str, Any], rule_id: str, violation: Mapping[str, Any]
) -> str | None:
    validation = result.get("validation") or {}
    summaries = (
        validation.get("rule_summaries") or {}
        if isinstance(validation, Mapping)
        else {}
    )
    summary = summaries.get(rule_id) if isinstance(summaries, Mapping) else None
    bindings = result.get("rule_bindings") or {}
    candidates = (
        violation.get("rule_identifier"),
        bindings.get(rule_id) if isinstance(bindings, Mapping) else None,
        summary.get("rule_identifier") if isinstance(summary, Mapping) else None,
    )
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate
    return None


def _dict_identity(
    result: Mapping[str, Any], rule_id: str, violation: Mapping[str, Any]
) -> tuple[str, tuple[tuple[str, str], ...]] | None:
    identifier = _dict_rule_identifier(result, rule_id, violation)
    if identifier is None:
        return None
    key_values = violation.get("key_columns") or {}
    if not isinstance(key_values, Mapping):
        return None
    order = result.get("key_columns")
    columns = (
        [str(column) for column in order]
        if isinstance(order, list) and order
        else [str(column) for column in key_values]
    )
    pairs: list[tuple[str, str]] = []
    for column in columns:
        if column not in key_values:
            return None
        value = _text(key_values.get(column))
        if value == "":
            return None
        pairs.append((column, value))
    return identifier, tuple(pairs)


def refresh_result_dict(
    result: Mapping[str, Any],
    as_of_date: object | None,
    *,
    db_path: Path | None = None,
    repository: object | None = None,
) -> dict[str, Any]:
    """Refresh persisted statuses from the authoritative tracking database."""

    refreshed = deepcopy(dict(result))
    if not as_of_date:
        return refreshed
    try:
        parsed_date = parse_as_of_date(as_of_date)
        by_identity, by_id = _record_context(
            parsed_date, db_path=db_path, repository=repository
        )
    except (AsOfDateError, ExceptionCaptureError, OSError, ValueError) as exc:
        logger.warning("Could not refresh exception tracking statuses: %s", exc)
        return refreshed

    validation = refreshed.get("validation")
    if not isinstance(validation, dict):
        return refreshed
    violations_by_rule = validation.get("violations_by_rule")
    if not isinstance(violations_by_rule, dict):
        return refreshed

    for rule_id, violations in violations_by_rule.items():
        if not isinstance(violations, list):
            continue
        for violation in violations:
            if not isinstance(violation, dict):
                continue
            identity = _dict_identity(refreshed, str(rule_id), violation)
            context = by_identity.get(identity) if identity is not None else None
            if context is None:
                existing_id = violation.get("exception_id")
                if isinstance(existing_id, str):
                    context = by_id.get(existing_id)
            if context is None:
                continue
            exception_id, status = context
            if exception_id is not None:
                violation["exception_id"] = exception_id
            if status is not None:
                violation["exception_status"] = status
    return refreshed


def _is_visible(exception: Mapping[str, Any]) -> bool:
    status = exception.get("exception_status")
    # New and NotCommented pass. Commented is hidden. Legacy/unknown status is
    # retained for visibility rather than silently hiding records.
    return status != "Commented"


def _attribute_change(data: Mapping[str, Any]) -> AttributeChange:
    return AttributeChange(
        column=str(data.get("column", "")),
        file_a_value=data.get("file_a_value"),
        file_b_value=data.get("file_b_value"),
    )


def _row_comparison(data: Mapping[str, Any]) -> RowComparison:
    changes = [
        _attribute_change(item)
        for item in data.get("attribute_changes") or []
        if isinstance(item, Mapping)
    ]
    return RowComparison(
        row_index=int(data.get("row_index", 0)),
        key_columns=dict(data.get("key_columns") or {}),
        attribute_changes=changes,
        change_count=int(data.get("change_count", len(changes))),
        grouping_values=dict(data.get("grouping_values") or {}),
        extra_values=dict(data.get("extra_values") or {}),
    )


def _new_book_row(data: Mapping[str, Any]) -> NewBookRow:
    return NewBookRow(
        row_index=int(data.get("row_index", -1)),
        key_columns=dict(data.get("key_columns") or {}),
        grouping_values=dict(data.get("grouping_values") or {}),
        extra_values=dict(data.get("extra_values") or {}),
    )


def _validation_violation(
    rule_id: str, data: Mapping[str, Any]
) -> ValidationViolation:
    return ValidationViolation(
        row_index=int(data.get("row_index", 0)),
        rule_id=str(data.get("rule_id") or rule_id),
        rule_name=str(data.get("rule_name", "")),
        key_columns=dict(data.get("key_columns") or {}),
        details=str(data.get("details", "")),
        violating_column=str(data.get("violating_column", "")),
        violating_value=data.get("violating_value"),
        rule_logic=str(data.get("rule_logic", "")),
        comparison_value=data.get("comparison_value"),
        extra_values=dict(data.get("extra_values") or {}),
        grouping_values=dict(data.get("grouping_values") or {}),
        rule_identifier=data.get("rule_identifier"),
        detail_values={
            str(key): _text(value)
            for key, value in (data.get("detail_values") or {}).items()
        },
        exception_id=data.get("exception_id"),
        exception_status=data.get("exception_status"),
    )


def _recompute_group_statistics(result: dict[str, Any]) -> None:
    aggregation_columns = list(result.get("aggregation_columns") or [])
    if not aggregation_columns or result.get("group_statistics") is None:
        return
    comparison = result.get("comparison") or {}
    row_details = [
        _row_comparison(item)
        for item in comparison.get("row_details") or []
        if isinstance(item, Mapping)
    ]
    new_book_rows = [
        _new_book_row(item)
        for item in comparison.get("new_book_details") or []
        if isinstance(item, Mapping)
    ]
    validation = result.get("validation") or {}
    violations = {
        str(rule_id): [
            _validation_violation(str(rule_id), item)
            for item in items
            if isinstance(item, Mapping)
        ]
        for rule_id, items in (validation.get("violations_by_rule") or {}).items()
        if isinstance(items, list)
    }
    result["group_statistics"] = compute_group_statistics(
        row_details,
        violations,
        aggregation_columns,
        new_book_rows=new_book_rows,
    )


def filter_result_for_new_exceptions(
    result: Mapping[str, Any],
    enabled: bool,
) -> dict[str, Any]:
    """Return a display/report copy containing New + NotCommented exceptions.

    The persisted run is not modified. Attribute changes, new books and all
    non-exception counts keep their existing values; exception counts and group
    statistics are recomputed from the visible records.
    """

    filtered = deepcopy(dict(result))
    filtered["new_exceptions_only"] = enabled
    if not enabled:
        return filtered

    validation = filtered.get("validation")
    if not isinstance(validation, dict):
        return filtered
    raw_violations = validation.get("violations_by_rule")
    if not isinstance(raw_violations, dict):
        return filtered

    visible_by_rule: dict[str, list[dict[str, Any]]] = {}
    violation_counts: dict[str, int] = {}
    row_counts: dict[str, int] = {}
    attribute_counts: dict[str, int] = {}
    all_rows: set[Any] = set()
    all_attributes: set[tuple[Any, str]] = set()

    for rule_id, violations in raw_violations.items():
        visible = [
            dict(item)
            for item in violations
            if isinstance(item, Mapping) and _is_visible(item)
        ]
        visible_by_rule[str(rule_id)] = visible
        violation_counts[str(rule_id)] = len(visible)
        rows = {item.get("row_index") for item in visible}
        attributes = {
            (item.get("row_index"), str(item.get("violating_column", "")))
            for item in visible
        }
        row_counts[str(rule_id)] = len(rows)
        attribute_counts[str(rule_id)] = len(attributes)
        all_rows.update(rows)
        all_attributes.update(attributes)

    validation["violations_by_rule"] = visible_by_rule
    validation["violation_count_by_rule"] = violation_counts
    validation["violating_rows_by_rule"] = row_counts
    validation["violating_attributes_by_rule"] = attribute_counts
    validation["total_violations"] = sum(violation_counts.values())
    validation["distinct_violating_rows"] = len(all_rows)
    validation["distinct_violating_attributes"] = len(all_attributes)
    _recompute_group_statistics(filtered)
    return filtered


def resolve_run_document(
    run_data: Mapping[str, Any],
    *,
    new_exceptions_only: bool | None = None,
    refresh: bool = True,
) -> dict[str, Any]:
    """Return a run document view with the requested exception display scope."""

    document = deepcopy(dict(run_data))
    result = document.get("result")
    if not isinstance(result, dict):
        result = {}
    enabled = new_exceptions_only
    if enabled is None:
        enabled = bool(result.get("new_exceptions_only", True))
    if refresh:
        result = refresh_result_dict(result, document.get("as_of_date"))
    result = filter_result_for_new_exceptions(result, enabled)
    document["result"] = result
    document["new_exceptions_only"] = enabled
    return document


def sorted_exception_statuses(statuses: Sequence[str | None]) -> list[str | None]:
    """Testing/debug helper exposing the frozen visibility order."""

    return sorted(statuses, key=lambda status: STATUS_ORDER.get(status or "", 99))


__all__ = [
    "ALL_STATUSES",
    "NEW_EXCEPTION_STATUSES",
    "STATUS_ORDER",
    "enrich_execution_result",
    "filter_result_for_new_exceptions",
    "list_exception_records",
    "parse_new_exceptions_only",
    "refresh_result_dict",
    "resolve_run_document",
    "sorted_exception_statuses",
]
