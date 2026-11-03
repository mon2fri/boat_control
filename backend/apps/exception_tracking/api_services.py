"""API-facing exception-tracking services and Worker A repository adapter."""

from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime
from typing import Any

from apps.exception_tracking.dates import default_as_of_date, parse_iso_date
from apps.exception_tracking.workbook import (
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


def record_to_dict(record: Any) -> dict[str, Any]:
    """Convert a Worker A record into the frozen wire shape."""
    result: dict[str, Any] = {
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
    rule_index = _record_rule_index(record)
    detail_values = _record_detail_values(record)
    result["rule_index"] = rule_index
    result["exception_rule_index"] = rule_index
    result["detail_values"] = detail_values
    result["exception_extra_values"] = detail_values
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


def list_exceptions(
    as_of_date: date, repository: Any | None = None
) -> list[dict[str, Any]]:
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


def _detail_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _record_rule_index(record: Any) -> str:
    for field_name in ("exception_rule_index", "rule_index"):
        value = _field(record, field_name)
        if value:
            return str(value)
    return ""


def _record_detail_values(record: Any) -> dict[str, str]:
    for field_name in (
        "exception_extra_values",
        "detail_values",
        "extra_values",
    ):
        values = _field(record, field_name)
        if isinstance(values, Mapping):
            return {str(name): _detail_text(value) for name, value in values.items()}
    return {}


def _unique_names(values: Iterable[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        name = str(raw).strip()
        key = name.casefold()
        if not name or key in seen:
            continue
        seen.add(key)
        result.append(name)
    return result


def _date_scoped_detail_columns(repository: Any, as_of_date: date) -> list[str] | None:
    """Read the exact ordered selection for a date when the repository supports it."""
    for method_name in (
        "get_extra_columns",
        "list_template_detail_columns",
        "list_detail_columns",
        "list_commentary_template_columns",
        "list_template_columns",
        "get_template_columns",
        "get_commentary_template_columns",
        "get_detail_columns",
    ):
        method = getattr(repository, method_name, None)
        if not callable(method):
            continue
        try:
            return _unique_names(method(as_of_date))
        except TypeError:
            # Older aliases may expose only a no-argument all-time method.
            continue
        except (OSError, ValueError) as exc:
            raise TrackingAPIError(
                str(exc),
                code="tracking_database_unavailable",
            ) from exc
    return None


def _append_unique_names(target: list[str], values: Iterable[str]) -> None:
    seen = {name.casefold() for name in target}
    for name in values:
        if name.casefold() in seen:
            continue
        target.append(name)
        seen.add(name.casefold())


def list_template_detail_columns(
    repository: Any, as_of_date: date | None = None
) -> list[str]:
    """Return the date-aware ordered selection and columns added afterward.

    A date's own selection is authoritative. Later selections are appended so
    that newer context remains visible (blank where it was not captured yet),
    while columns deselected by the requested date are not carried forward.
    """
    if as_of_date is not None:
        selected = _date_scoped_detail_columns(repository, as_of_date)
        if selected is not None:
            columns = list(selected)
            for later_date in list_as_of_dates(repository):
                if later_date <= as_of_date:
                    continue
                later_selection = _date_scoped_detail_columns(repository, later_date)
                if later_selection is not None:
                    _append_unique_names(columns, later_selection)
            return columns

    # Compatibility with repositories that predate date-scoped metadata.
    # Prefer the legacy all-time union only when the canonical/date-aware
    # surface is unavailable.
    for method_name in (
        "get_extra_column_union",
        "list_extra_column_union",
        "get_template_column_union",
    ):
        method = getattr(repository, method_name, None)
        if callable(method):
            try:
                return _unique_names(method())
            except (OSError, ValueError) as exc:
                raise TrackingAPIError(
                    str(exc),
                    code="tracking_database_unavailable",
                ) from exc

    for method_name in (
        "get_extra_columns",
        "list_template_detail_columns",
        "list_detail_columns",
        "list_commentary_template_columns",
        "list_template_columns",
        "get_template_columns",
        "get_commentary_template_columns",
        "get_detail_columns",
    ):
        method = getattr(repository, method_name, None)
        if not callable(method):
            continue
        try:
            return _unique_names(method())
        except TypeError:
            continue
        except (OSError, ValueError) as exc:
            raise TrackingAPIError(
                str(exc),
                code="tracking_database_unavailable",
            ) from exc

    # Compatibility fallback for an older repository that persists detail
    # values but does not expose ordered metadata. Limit the fallback to the
    # requested date and later dates when a date was supplied.
    columns: list[str] = []
    try:
        dates = list_as_of_dates(repository)
        for date_value in dates:
            if as_of_date is not None and date_value < as_of_date:
                continue
            for record in repository.list_exceptions(date_value):
                _append_unique_names(columns, _record_detail_values(record))
    except (OSError, ValueError) as exc:
        raise TrackingAPIError(
            str(exc),
            code="tracking_database_unavailable",
        ) from exc
    return columns


def export_commentary(
    as_of_date: date,
    repository: Any | None = None,
    *,
    generated_at: datetime | None = None,
) -> bytes:
    repo = repository or get_repository()
    records = list_exceptions(as_of_date, repo)
    detail_columns = list_template_detail_columns(repo, as_of_date)
    detail_values = {
        record["exception_id"]: record.get("detail_values") or {}
        for record in records
    }
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
    parsed: ParsedCommentaryTemplate, existing: list[dict[str, Any]]
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


def _commentary(record: Mapping[str, Any]) -> str:
    return str(record.get("exception_commentary") or "")


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
