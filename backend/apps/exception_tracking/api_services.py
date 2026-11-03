"""API-facing exception-tracking services and Worker A repository adapter."""

from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from apps.exception_tracking.dates import default_as_of_date, parse_iso_date
from apps.exception_tracking.workbook import (
    EXCEPTION_HEADERS,
    ParsedCommentaryTemplate,
    WorkbookValidationError,
    build_commentary_workbook,
    parse_commentary_workbook,
)

logger = logging.getLogger(__name__)

STATUSES = frozenset({"New", "Commented", "NotCommented"})

_RECORD_FIELDS = (
    "exception_id",
    "exception_rule_identifier",
    "key_columns",
    "exception_timestamp",
    "exception_commentary",
    "exception_as_of_date",
    "exception_first_seen_as_of_date",
    "exception_last_seen_as_of_date",
    "exception_first_seen_timestamp",
    "exception_last_seen_timestamp",
)


class TrackingAPIError(Exception):
    """An actionable API error with a stable machine-readable code."""

    def __init__(
        self,
        message: str,
        *,
        code: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.details = details or {}


def _field(record: Any, name: str) -> Any:
    if isinstance(record, Mapping):
        return record.get(name)
    return getattr(record, name, None)


def _wire_temporal(value: Any, field_name: str) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return str(value.isoformat())
    if isinstance(value, date):
        return str(value.isoformat())
    if isinstance(value, str) and value.strip():
        return value
    raise TrackingAPIError(
        f"Stored exception data is missing {field_name}.",
        code="tracking_storage_contract_error",
        status_code=500,
    )


def record_to_dict(record: Any) -> dict[str, str]:
    """Convert a Worker A record into the frozen wire shape."""
    result = {
        field_name: str(_field(record, field_name) or "")
        for field_name in _RECORD_FIELDS
        if field_name not in {"exception_timestamp", "exception_first_seen_timestamp",
                              "exception_last_seen_timestamp"}
    }
    for field_name in (
        "exception_timestamp",
        "exception_first_seen_timestamp",
        "exception_last_seen_timestamp",
    ):
        result[field_name] = _wire_temporal(_field(record, field_name), field_name)

    status = _field(record, "status")
    if status is None:
        commentary = str(_field(record, "exception_commentary") or "")
        occurrence_date = _field(record, "exception_as_of_date")
        first_seen_date = _field(record, "exception_first_seen_as_of_date")
        if commentary.strip():
            status = "Commented"
        elif str(occurrence_date) == str(first_seen_date):
            status = "New"
        else:
            status = "NotCommented"
    if status not in STATUSES:
        raise TrackingAPIError(
            "Stored exception data has an invalid status.",
            code="tracking_storage_contract_error",
            status_code=500,
            details={"status": status},
        )
    result["status"] = str(status)
    return result


def get_repository() -> Any:
    """Open Worker A's repository at the configured path.

    SQLite/identity/history implementation is deliberately not duplicated
    here. The reviewer integrates the accepted Worker A commit before final
    verification.
    """
    from apps.settings.services import get_exception_tracking_path

    try:
        database_path = get_exception_tracking_path()
    except (OSError, ValueError) as exc:
        raise TrackingAPIError(
            str(exc),
            code="tracking_database_unavailable",
            status_code=400,
        ) from exc

    repository_module: Any = None
    last_error: ImportError | None = None
    for module_name in (
        "apps.exception_tracking.repository",
        "apps.exception_tracking.store",
    ):
        try:
            repository_module = __import__(module_name, fromlist=["*"])
            break
        except ImportError as exc:
            last_error = exc
    if repository_module is None:
        raise TrackingAPIError(
            "Exception tracking storage is not installed. Apply Worker A's repository commit.",
            code="tracking_database_unavailable",
            status_code=503,
        ) from last_error

    for factory_name in (
        "ExceptionTrackingRepository",
        "ExceptionTrackingStore",
        "open_repository",
        "open_store",
    ):
        factory = getattr(repository_module, factory_name, None)
        if callable(factory):
            try:
                return factory(database_path)
            except (OSError, ValueError) as exc:
                raise TrackingAPIError(
                    str(exc),
                    code="tracking_database_unavailable",
                    status_code=400,
                ) from exc

    raise TrackingAPIError(
        "Worker A's exception tracking repository interface was not found.",
        code="tracking_database_unavailable",
        status_code=503,
    )


def list_as_of_dates(repository: Any | None = None) -> list[date]:
    repo = repository or get_repository()
    try:
        values = list(repo.list_as_of_dates())
    except (OSError, ValueError) as exc:
        raise TrackingAPIError(
            str(exc),
            code="tracking_database_unavailable",
        ) from exc
    return sorted({value if isinstance(value, date) else parse_iso_date(value) for value in values})


def list_exceptions(as_of_date: date, repository: Any | None = None) -> list[dict[str, str]]:
    repo = repository or get_repository()
    try:
        records = repo.list_exceptions(as_of_date)
    except (OSError, ValueError) as exc:
        raise TrackingAPIError(
            str(exc),
            code="tracking_database_unavailable",
        ) from exc
    return [record_to_dict(record) for record in records]


def resolve_as_of_date(value: str | None, repository: Any | None = None) -> date:
    if value is None:
        return default_as_of_date()
    try:
        return parse_iso_date(value)
    except ValueError as exc:
        raise TrackingAPIError(str(exc), code="invalid_as_of_date") from exc


def resolve_export_as_of_date(
    *, as_of_date: str | None = None, run_id: str | None = None
) -> date:
    if as_of_date and run_id:
        raise TrackingAPIError(
            "Provide either as_of_date or run_id, not both.",
            code="invalid_as_of_date",
        )
    if as_of_date:
        return resolve_as_of_date(as_of_date)
    if run_id:
        from apps.runs.persistence import load_run

        run_data = load_run(run_id)
        if run_data is None:
            raise TrackingAPIError(
                f"Run {run_id} not found.",
                code="run_not_found",
                status_code=404,
            )
        persisted = run_data.get("as_of_date")
        if not persisted:
            raise TrackingAPIError(
                "This saved run has no As-of Date. Select a date on the Exception Tracking tab.",
                code="run_has_no_as_of_date",
            )
        return resolve_as_of_date(str(persisted))
    return default_as_of_date()


def _detail_header(value: object) -> str:
    return " ".join(str(value).split()).casefold()


def _detail_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


@dataclass(frozen=True)
class _DetailSpec:
    header: str
    source: str
    column: str = ""


def _exception_column_names(
    result: Mapping[str, Any], violations_by_rule: Mapping[str, Any]
) -> list[str]:
    display = result.get("extra_column_display")
    if isinstance(display, Mapping) and display.get("exception_tables") is False:
        return []
    configured = result.get("exception_columns")
    if isinstance(configured, list):
        return [str(column) for column in configured]
    seen: list[str] = []
    for violations in violations_by_rule.values():
        if not isinstance(violations, list):
            continue
        for violation in violations:
            if not isinstance(violation, Mapping):
                continue
            for column in (violation.get("extra_values") or {}):
                if str(column) not in seen:
                    seen.append(str(column))
    return seen


def _detail_specs(result: Mapping[str, Any]) -> list[_DetailSpec]:
    validation = result.get("validation") or {}
    violations_by_rule = (
        validation.get("violations_by_rule") or {}
        if isinstance(validation, Mapping)
        else {}
    )
    labels = result.get("aggregation_column_labels") or {}
    candidates: list[tuple[str, str, str]] = []
    for column in result.get("key_columns") or []:
        candidates.append((str(column), "key", str(column)))
    candidates.append(("Rule Index", "rule_index", ""))
    for column in result.get("aggregation_columns") or []:
        label = labels.get(column, column) if isinstance(labels, Mapping) else column
        candidates.append((str(label), "aggregation", str(column)))
    for column in _exception_column_names(result, violations_by_rule):
        candidates.append((str(column), "extra", str(column)))

    used = {_detail_header(header) for header in EXCEPTION_HEADERS}
    specs: list[_DetailSpec] = []
    for header, source, column in candidates:
        name = header.strip()
        if not name:
            continue
        key = _detail_header(name)
        if key in used:
            continue
        used.add(key)
        specs.append(_DetailSpec(name, source, column))
    return specs


def _violation_rule_identifier(
    result: Mapping[str, Any], rule_id: str, violation: Mapping[str, Any]
) -> str | None:
    validation = result.get("validation") or {}
    summaries = validation.get("rule_summaries") or {} if isinstance(validation, Mapping) else {}
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


def _violation_exception_id(
    result: Mapping[str, Any], rule_id: str, violation: Mapping[str, Any]
) -> str | None:
    explicit = violation.get("exception_id")
    if isinstance(explicit, str) and explicit.strip():
        return explicit
    identifier = _violation_rule_identifier(result, rule_id, violation)
    if not identifier:
        return None
    key_values = violation.get("key_columns") or {}
    if not isinstance(key_values, Mapping):
        return None
    key_order = result.get("key_columns")
    columns = (
        [str(column) for column in key_order]
        if isinstance(key_order, list) and key_order
        else [str(column) for column in key_values]
    )
    values: list[str] = []
    for column in columns:
        if column not in key_values:
            return None
        text = _detail_text(key_values.get(column))
        if text == "":
            return None
        values.append(text)
    if not values:
        return None
    return "_".join([identifier, *values])


def _value_for_spec(
    rule_id: str, violation: Mapping[str, Any], spec: _DetailSpec
) -> Any:
    if spec.source == "rule_index":
        return rule_id
    if spec.source == "key":
        return (violation.get("key_columns") or {}).get(spec.column)
    if spec.source == "aggregation":
        return (violation.get("grouping_values") or {}).get(spec.column)
    return (violation.get("extra_values") or {}).get(spec.column)


def _runs_for_date(as_of_date: date) -> list[dict[str, Any]]:
    """Load saved runs for a date, newest first, for optional detail context."""
    from apps.runs.persistence import list_runs, load_run

    try:
        metadata = list_runs()
    except Exception:  # pragma: no cover - detail context is optional
        logger.warning("Could not list saved runs for commentary template details")
        return []

    runs: list[dict[str, Any]] = []
    for meta in metadata:
        indexed_date = getattr(meta, "as_of_date", None)
        if indexed_date:
            try:
                if parse_iso_date(indexed_date) != as_of_date:
                    continue
            except (TypeError, ValueError):
                pass
        try:
            run_data = load_run(meta.run_id)
        except Exception:  # pragma: no cover - corrupt run must not block export
            logger.warning("Could not load saved run %s for template details", meta.run_id)
            continue
        if not run_data:
            continue
        raw_date = run_data.get("as_of_date")
        if not raw_date:
            continue
        try:
            run_date = parse_iso_date(raw_date)
        except (TypeError, ValueError):
            continue
        if run_date == as_of_date:
            runs.append(run_data)
    return runs


def resolve_exception_details(
    as_of_date: date,
    records: Iterable[Mapping[str, str]],
) -> tuple[tuple[str, ...], dict[str, dict[str, str]]]:
    """Resolve appended exception-table detail columns for a date's rows.

    Saved runs with the same top-level ``as_of_date`` are scanned newest first.
    Older saved runs remain usable when they lack an explicit ``exception_id``:
    the literal ID is recomputed from the persisted canonical rule identifier
    and configured key order.
    """
    exception_ids = {record["exception_id"] for record in records}
    if not exception_ids:
        return (), {}

    global_specs: list[_DetailSpec] = []
    global_keys: set[str] = set()
    details: dict[str, dict[str, str]] = {}

    for run_data in _runs_for_date(as_of_date):
        result = run_data.get("result") or {}
        if not isinstance(result, Mapping):
            continue
        validation = result.get("validation") or {}
        violations_by_rule = (
            validation.get("violations_by_rule") or {}
            if isinstance(validation, Mapping)
            else {}
        )
        if not isinstance(violations_by_rule, Mapping):
            continue

        run_specs = _detail_specs(result)
        matched: dict[str, list[tuple[str, Mapping[str, Any]]]] = {}
        for rule_id, violations in violations_by_rule.items():
            if not isinstance(violations, list):
                continue
            for violation in violations:
                if not isinstance(violation, Mapping):
                    continue
                exception_id = _violation_exception_id(
                    result, str(rule_id), violation
                )
                if exception_id in exception_ids:
                    matched.setdefault(exception_id, []).append(
                        (str(rule_id), violation)
                    )
        if not matched:
            continue

        for spec in run_specs:
            key = _detail_header(spec.header)
            if key not in global_keys:
                global_keys.add(key)
                global_specs.append(spec)

        for exception_id, violations in matched.items():
            target = details.setdefault(exception_id, {})
            for spec in global_specs:
                if target.get(spec.header):
                    continue
                for rule_id, violation in violations:
                    text = _detail_text(_value_for_spec(rule_id, violation, spec))
                    if text:
                        target[spec.header] = text
                        break

    return tuple(spec.header for spec in global_specs), details


def export_commentary(
    as_of_date: date,
    repository: Any | None = None,
    *,
    generated_at: datetime | None = None,
) -> bytes:
    records = list_exceptions(as_of_date, repository)
    detail_columns, detail_values = resolve_exception_details(as_of_date, records)
    return build_commentary_workbook(
        records,
        as_of_date,
        generated_at=generated_at,
        detail_columns=detail_columns,
        detail_values=detail_values,
    )


def _import_details(
    *,
    unknown: Iterable[str] = (),
    duplicates: Iterable[str] = (),
    missing: Iterable[str] = (),
) -> dict[str, list[str]]:
    return {
        "unknown_ids": sorted(dict.fromkeys(unknown)),
        "duplicate_ids": sorted(dict.fromkeys(duplicates)),
        "missing_ids": sorted(dict.fromkeys(missing)),
    }


def _validate_ids(
    parsed: ParsedCommentaryTemplate, existing: list[dict[str, str]]
) -> None:
    existing_ids = {record["exception_id"] for record in existing}
    provided_ids = set(parsed.commentaries)
    unknown = provided_ids - existing_ids
    missing = existing_ids - provided_ids
    duplicates = set(parsed.duplicate_ids)
    if not (unknown or missing or duplicates):
        return

    details = _import_details(unknown=unknown, duplicates=duplicates, missing=missing)
    if duplicates:
        code = "duplicate_exception_ids"
        message = "The workbook contains duplicate Exception IDs."
    elif unknown:
        code = "unknown_exception_ids"
        message = (
            f"The workbook contains exception IDs that are not present on "
            f"{parsed.as_of_date.isoformat()}."
        )
    else:
        code = "missing_exception_ids"
        message = (
            f"The workbook is missing exception IDs for "
            f"{parsed.as_of_date.isoformat()}."
        )
    raise TrackingAPIError(message, code=code, details=details)


def _commentary(record: Mapping[str, str]) -> str:
    return record.get("exception_commentary") or ""


def import_commentary(
    content: bytes,
    *,
    requested_as_of_date: str | None = None,
    repository: Any | None = None,
) -> dict[str, Any]:
    """Validate and atomically apply a commentary template.

    All identity validation happens before the single repository update call.
    Worker A owns transaction/rollback inside ``update_commentaries``.
    """
    try:
        parsed = parse_commentary_workbook(content)
    except WorkbookValidationError as exc:
        raise TrackingAPIError(
            str(exc), code=exc.code, details=exc.details
        ) from exc

    if requested_as_of_date:
        try:
            requested = parse_iso_date(requested_as_of_date)
        except ValueError as exc:
            raise TrackingAPIError(str(exc), code="invalid_as_of_date") from exc
        if requested != parsed.as_of_date:
            raise TrackingAPIError(
                "The workbook As-of Date does not match the selected date.",
                code="date_mismatch",
                details={
                    "workbook_as_of_date": parsed.as_of_date.isoformat(),
                    "selected_as_of_date": requested.isoformat(),
                },
            )

    repo = repository or get_repository()
    existing = list_exceptions(parsed.as_of_date, repo)
    _validate_ids(parsed, existing)

    updates: dict[str, str] = {}
    updated = 0
    cleared = 0
    unchanged = 0
    for record in existing:
        exception_id = record["exception_id"]
        before = _commentary(record)
        after = parsed.commentaries[exception_id]
        if after == before:
            unchanged += 1
            continue
        updates[exception_id] = after
        if after.strip():
            updated += 1
        else:
            cleared += 1

    if updates:
        try:
            repo.update_commentaries(parsed.as_of_date, updates)
        except (OSError, ValueError) as exc:
            raise TrackingAPIError(
                str(exc),
                code="tracking_update_failed",
                status_code=400,
            ) from exc

    records = list_exceptions(parsed.as_of_date, repo)
    return {
        "as_of_date": parsed.as_of_date.isoformat(),
        "updated": updated,
        "cleared": cleared,
        "unchanged": unchanged,
        "total": len(records),
        "exceptions": records,
    }
