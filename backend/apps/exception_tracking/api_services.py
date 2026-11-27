"""API-facing exception-tracking services and Worker A repository adapter."""

from __future__ import annotations

import inspect
import logging
from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime
from typing import Any

from apps.exception_tracking.dates import default_as_of_date, parse_iso_date
from apps.exception_tracking.domain import CommentaryUploadDecision
from apps.exception_tracking.errors import UnknownExceptionError
from apps.exception_tracking.workbook import (
    ParsedCommentaryTemplate,
    WorkbookValidationError,
    build_commentary_workbook,
    parse_commentary_workbook,
)

logger = logging.getLogger(__name__)

STATUSES = frozenset({"New", "Commented", "NotCommented", "RecertificationRequired"})

RECERTIFICATION_REASON_LABEL = "Recertification due to rule change"

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


def _wire_date(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return str(value.isoformat())
    if isinstance(value, date):
        return str(value.isoformat())
    if isinstance(value, str):
        return value
    return str(value)


def _wire_flag(value: Any) -> bool:
    if value is True:
        return True
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    return isinstance(value, str) and value.strip().lower() in {"1", "true"}


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

    pending = _wire_flag(_field(record, "recertification_required"))
    status = _field(record, "status")
    if pending:
        # Pending recertification wins over commentary text: inherited text
        # must not collapse into Commented and hide the item from review.
        status = "RecertificationRequired"
    if status is None:
        commentary = str(_field(record, "exception_commentary") or "")
        occurrence_date = _field(record, "exception_as_of_date")
        first_seen_date = _field(record, "exception_first_seen_as_of_date")
        if pending:
            status = "RecertificationRequired"
        elif commentary.strip():
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
    result["recertification_required"] = pending
    result["recertification_reason"] = str(_field(record, "recertification_reason") or "")
    result["carried_from_exception_id"] = str(_field(record, "carried_from_exception_id") or "")
    result["carried_from_as_of_date"] = _wire_date(
        _field(record, "carried_from_as_of_date")
    )
    result["carried_from_rule_identifier"] = str(
        _field(record, "carried_from_rule_identifier") or ""
    )
    result["rule_evolution_event_id"] = str(_field(record, "rule_evolution_event_id") or "")
    result["recertified_at"] = _wire_date(_field(record, "recertified_at"))
    result["revision_token"] = str(
        _field(record, "revision_token")
        or _field(record, "rule_evolution_event_id")
        or ""
    )
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


def list_current_exceptions(
    as_of_date: date, repository: Any | None = None
) -> list[dict[str, Any]]:
    """Return the current-view wire records for one as-of date.

    Same-date predecessors superseded by a recorded ``modify_current``
    successor for the same book are hidden so a revised rule does not
    present the same book twice. Run-scoped exports, commentary import,
    recertification, saved-run refresh, and per-ID history keep the full
    store. Repositories that predate the current-view method fall back to
    the full listing.
    """

    repo = repository or get_repository()
    method = getattr(repo, "list_current_exceptions", None)
    try:
        records = (
            method(as_of_date) if callable(method) else repo.list_exceptions(as_of_date)
        )
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
    fallback_columns: list[str] = []
    try:
        dates = list_as_of_dates(repository)
        for date_value in dates:
            if as_of_date is not None and date_value < as_of_date:
                continue
            for record in repository.list_exceptions(date_value):
                _append_unique_names(fallback_columns, _record_detail_values(record))
    except (OSError, ValueError) as exc:
        raise TrackingAPIError(
            str(exc),
            code="tracking_database_unavailable",
        ) from exc
    return fallback_columns


# ---------------------------------------------------------------------------
# Report-run vs tracking-date template scope (Round 4, integrated A+B).
#
# Report-page download = exactly the persisted exceptions captured by one run's
# enabled rules (membership from the run snapshot's exception IDs, commentary
# and status from the live date records). Tracking-tab download = all known
# exceptions for the selected as-of date. Neither scope consults the mutable
# current rule catalog or display state (New Exceptions Only, screen filters,
# pagination, current catalog selection).
#
# Workbook contract (keyword-only, optional): Worker B owns rendering.
#
#   build_commentary_workbook(records, as_of_date, *, generated_at=None,
#       detail_columns=(), detail_values=None, rule_summaries=None,
#       rule_snapshot_notes=())
#
# ``rule_summaries`` is ``Mapping[str, Mapping[str, Any]] | None`` keyed by
# run-local rule index (``"R001"``). Each value is a persisted validation
# summary exactly as stored under ``result["validation"]["rule_summaries"]``.
# Missing/``None`` entries render as explicit "Unavailable" metadata, never by
# inventing current-catalog logic. Date-wide union policy (integrator
# resolution of A/B divergence): merge that date's runs in ascending run_id
# order via ``merge_rule_snapshots`` — first snapshot wins per Rxxx, every
# distinct index kept, differing snapshots of the same rule returned as
# human-readable notes rendered above the table, snapshot-less known rule IDs
# rendered as "Unavailable" rows. No new historical storage; no live-catalog
# reads for historical logic.
# ---------------------------------------------------------------------------

_BUILD_SUPPORTED_PARAMS: set[str] | None = None


def _workbook_param_supported(name: str) -> bool:
    global _BUILD_SUPPORTED_PARAMS
    if _BUILD_SUPPORTED_PARAMS is None:
        try:
            parameters = inspect.signature(build_commentary_workbook).parameters
        except (TypeError, ValueError):
            parameters = {}
        _BUILD_SUPPORTED_PARAMS = set(parameters)
    return name in _BUILD_SUPPORTED_PARAMS


def _workbook_supports_rule_summaries() -> bool:
    return _workbook_param_supported("rule_summaries")


def _build_workbook(
    records: list[dict[str, Any]],
    as_of_date: date,
    *,
    generated_at: datetime | None = None,
    detail_columns: list[str] | None = None,
    detail_values: dict[str, dict[str, str]] | None = None,
    rule_summaries: Mapping[str, Mapping[str, Any]] | None = None,
    rule_snapshot_notes: Iterable[str] = (),
    report_name: str = "",
) -> bytes:
    """Build the workbook, forwarding rule summaries/notes when supported.

    Worker B owns the ``rule_summaries`` rendering. Exception rows are always
    scope-correct regardless of workbook support.
    """
    kwargs: dict[str, Any] = {
        "generated_at": generated_at,
        "detail_columns": detail_columns or (),
        "detail_values": detail_values or {},
    }
    if rule_summaries is not None and _workbook_param_supported("rule_summaries"):
        kwargs["rule_summaries"] = rule_summaries
    notes = [str(note) for note in (rule_snapshot_notes or []) if str(note).strip()]
    if notes and _workbook_param_supported("rule_snapshot_notes"):
        kwargs["rule_snapshot_notes"] = notes
    if report_name and _workbook_param_supported("report_name"):
        kwargs["report_name"] = report_name
    return build_commentary_workbook(records, as_of_date, **kwargs)


def _run_membership_ids(run_data: Mapping[str, Any], run_id: str) -> set[str]:
    """Return the persisted exception IDs captured by one run's enabled rules.

    Membership comes from the run snapshot's stored violations (all statuses;
    never the New Exceptions Only display projection) keyed by literal
    exception ID, which already encodes the canonical rule identifier plus
    configured key values. Display rule indices are never used. Legacy
    snapshots without stored violations raise explicitly instead of falling
    back to date-wide records.
    """
    result = run_data.get("result")
    if not isinstance(result, Mapping):
        raise TrackingAPIError(
            f"Run {run_id} predates exception tracking snapshots and has no "
            "stored exception membership. Re-run the comparison to capture "
            "tracking data; no date-wide records were substituted.",
            code="run_has_no_tracking_snapshot",
        )
    validation = result.get("validation")
    if not isinstance(validation, Mapping) or not isinstance(
        validation.get("violations_by_rule"), Mapping
    ):
        raise TrackingAPIError(
            f"Run {run_id} has no stored exception membership. Re-run the "
            "comparison to capture tracking data; no date-wide records were "
            "substituted.",
            code="run_has_no_tracking_snapshot",
        )
    membership: set[str] = set()
    without_identity: list[str] = []
    violations_by_rule = validation.get("violations_by_rule")
    assert isinstance(violations_by_rule, Mapping)
    for rule_id, violations in violations_by_rule.items():
        if not isinstance(violations, list):
            continue
        for violation in violations:
            if not isinstance(violation, Mapping):
                continue
            exception_id = violation.get("exception_id")
            if isinstance(exception_id, str) and exception_id.strip():
                membership.add(exception_id)
            else:
                without_identity.append(str(rule_id))
    if without_identity:
        raise TrackingAPIError(
            f"Run {run_id} has stored exceptions without exception IDs "
            f"(rules: {', '.join(sorted(set(without_identity)))}). No IDs were "
            "guessed and no date-wide records were substituted.",
            code="run_has_no_tracking_snapshot",
        )
    return membership


def _run_rule_summaries(
    run_data: Mapping[str, Any],
) -> dict[str, dict[str, Any]] | None:
    """Return one run's persisted enabled-rule snapshots, or None when absent.

    The snapshot (not the live catalog) is the source: reopening an older run
    keeps that run's rule text even after later runs update the same date.
    Enabled rules with zero exceptions are included via ``rule_summaries``
    although they contribute no exception rows.
    """
    result = run_data.get("result")
    validation = result.get("validation") if isinstance(result, Mapping) else None
    summaries = validation.get("rule_summaries") if isinstance(validation, Mapping) else None
    if not isinstance(summaries, Mapping):
        return None
    return {
        str(rule_id): dict(summary) if isinstance(summary, Mapping) else {}
        for rule_id, summary in summaries.items()
    }


def _load_run_or_raise(run_id: str) -> dict[str, Any]:
    from apps.runs.persistence import load_run

    if not run_id or not run_id.strip():
        raise TrackingAPIError(
            "A run ID is required for run-scoped export.",
            code="run_not_found",
            status_code=404,
        )
    run_data = load_run(run_id)
    if run_data is None:
        raise TrackingAPIError(
            f"Run {run_id} not found.",
            code="run_not_found",
            status_code=404,
        )
    return run_data


def _run_as_of_date(run_data: Mapping[str, Any], run_id: str) -> date:
    persisted = run_data.get("as_of_date")
    if not persisted:
        raise TrackingAPIError(
            "This saved run has no As-of Date. Select a date on the Exception Tracking tab.",
            code="run_has_no_as_of_date",
        )
    return resolve_as_of_date(str(persisted))


def collect_date_rule_summaries(
    as_of_date: date,
    known_rule_ids: Iterable[str] = (),
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Union persisted enabled-rule snapshots for one as-of date.

    Integrator-resolved A/B policy: iterate that date's runs in ascending
    run_id order via ``merge_rule_snapshots`` — first snapshot wins per
    ``Rxxx``, every distinct index kept, differing snapshots of the same rule
    returned as notes (not silently collapsed to latest). ``known_rule_ids``
    (for example rule indexes seen on the date's exceptions) with no surviving
    snapshot become ``{}`` entries so the workbook renders explicit
    "Unavailable" rows instead of inventing current-catalog logic. Failures
    while listing runs never fail the export: the date-wide exception rows are
    still returned with whatever snapshots survived.
    """
    from apps.exception_tracking.rule_summary import merge_rule_snapshots

    try:
        from apps.runs.persistence import list_runs, load_run
    except ImportError:
        logger.warning("Run history is unavailable; exporting without rule summaries.")
        return {}, []
    try:
        metas = list_runs()
    except Exception as exc:
        logger.warning("Could not list runs for rule summaries: %s", exc)
        return {}, []
    target = as_of_date.isoformat()
    run_ids: list[str] = []
    for meta in metas:
        if getattr(meta, "as_of_date", None) != target:
            continue
        run_ids.append(str(getattr(meta, "run_id", "")))
    labeled: list[tuple[str, dict[str, dict[str, Any]]]] = []
    for run_id in sorted(run_ids):
        try:
            data = load_run(run_id)
        except Exception as exc:  # a corrupt run must not fail the export
            logger.warning("Could not load run %s for rule summaries: %s", run_id, exc)
            continue
        if data is None:
            continue
        summaries = _run_rule_summaries(data)
        if summaries is None:
            summaries = {}
        labeled.append((run_id, summaries))
    merged, notes = merge_rule_snapshots(labeled, known_rule_ids=known_rule_ids)
    return merged, notes


def export_run_commentary(
    run_id: str,
    repository: Any | None = None,
    *,
    generated_at: datetime | None = None,
) -> tuple[bytes, date]:
    """Export exactly one run's persisted exceptions (report-page scope).

    Membership is the run snapshot's exception IDs; commentary, status and
    detail values come from the live date records for those IDs so post-run
    commentary edits are reflected. A zero-exception run yields an empty
    valid template, never a date-wide fallback. Every run membership ID must
    resolve in the date store; otherwise an explicit ``tracking_context_missing``
    error is raised instead of silently dropping rows.
    """
    run_data = _load_run_or_raise(run_id)
    as_of_date = _run_as_of_date(run_data, run_id)
    membership = _run_membership_ids(run_data, run_id)
    rule_summaries = _run_rule_summaries(run_data)

    repo = repository or get_repository()
    records = list_exceptions(as_of_date, repo)
    by_id = {record["exception_id"]: record for record in records}
    missing = sorted(membership - set(by_id))
    if missing:
        raise TrackingAPIError(
            f"Run {run_id} captured {len(membership)} exception(s) but "
            f"{len(missing)} are absent from the tracking data for "
            f"{as_of_date.isoformat()}. The tracking database may have been "
            "replaced since the run; no partial template was generated.",
            code="tracking_context_missing",
            status_code=500,
            details={"missing_ids": missing},
        )
    scoped = [by_id[exception_id] for exception_id in sorted(membership)]
    detail_columns = list_template_detail_columns(repo, as_of_date)
    detail_values = {
        record["exception_id"]: record.get("detail_values") or {}
        for record in scoped
    }
    content = _build_workbook(
        scoped,
        as_of_date,
        generated_at=generated_at,
        detail_columns=detail_columns,
        detail_values=detail_values,
        rule_summaries=rule_summaries,
        rule_snapshot_notes=(),
        report_name=str(run_data.get("report_name") or ""),
    )
    return content, as_of_date


def export_commentary(
    as_of_date: date,
    repository: Any | None = None,
    *,
    generated_at: datetime | None = None,
    rule_summaries: Mapping[str, Mapping[str, Any]] | None = None,
    rule_snapshot_notes: Iterable[str] = (),
) -> bytes:
    repo = repository or get_repository()
    records = list_current_exceptions(as_of_date, repo)
    effective_summaries = rule_summaries
    effective_notes = list(rule_snapshot_notes)
    if effective_summaries is None and not effective_notes:
        # Best-effort date union for the tracking-date scope; an empty union
        # still exports all rows with explicitly unavailable rule metadata.
        known_ids = {
            str(record.get("rule_index") or record.get("exception_rule_index") or "")
            for record in records
        }
        known_ids.discard("")
        merged, notes = collect_date_rule_summaries(as_of_date, known_rule_ids=known_ids)
        effective_summaries = merged or None
        effective_notes = notes
    detail_columns = list_template_detail_columns(repo, as_of_date)
    detail_values = {
        record["exception_id"]: record.get("detail_values") or {}
        for record in records
    }
    return _build_workbook(
        records,
        as_of_date,
        generated_at=generated_at,
        detail_columns=detail_columns,
        detail_values=detail_values,
        rule_summaries=effective_summaries,
        rule_snapshot_notes=effective_notes,
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
    parsed: ParsedCommentaryTemplate,
    existing: list[dict[str, Any]],
    *,
    expected_ids: set[str] | None = None,
    run_id: str | None = None,
) -> None:
    """Validate workbook IDs. Unknown and duplicate IDs always fail atomically.

    Date scope (``expected_ids=None``) accepts safe partial templates: a run
    subset containing only some of the date's IDs uploads without clearing
    the omitted date records, which are left untouched. Run scope
    (``expected_ids`` given) additionally requires every run membership ID to
    be present and rejects date IDs outside the run, so an accidentally
    trimmed run template is reported instead of silently applied.
    """
    existing_ids = {record["exception_id"] for record in existing}
    provided_ids = set(parsed.commentaries)
    unknown = provided_ids - existing_ids
    duplicates = set(parsed.duplicate_ids)
    details = _import_details(unknown=unknown, duplicates=duplicates)
    if duplicates:
        raise TrackingAPIError(
            "The workbook contains duplicate Exception IDs.",
            code="duplicate_exception_ids",
            details=details,
        )
    if unknown:
        raise TrackingAPIError(
            f"The workbook contains exception IDs that are not present on "
            f"{parsed.as_of_date.isoformat()}.",
            code="unknown_exception_ids",
            details=details,
        )
    if expected_ids is None:
        # Safe partial: omitted date IDs are preserved, never cleared.
        return

    missing = sorted(expected_ids - provided_ids)
    outside_scope = sorted(provided_ids - expected_ids)
    if missing or outside_scope:
        scope_details = dict(details)
        scope_details["missing_ids"] = missing
        if outside_scope:
            scope_details["outside_run_scope_ids"] = outside_scope
        if run_id is not None:
            scope_details["run_id"] = run_id
        if missing:
            raise TrackingAPIError(
                f"The workbook is missing {len(missing)} exception ID(s) "
                f"captured by run {run_id or 'the selected run'}.",
                code="missing_exception_ids",
                details=scope_details,
            )
        raise TrackingAPIError(
            "The workbook contains exception IDs outside the selected run's "
            "scope. Upload run subsets without adding other date records.",
            code="unexpected_exception_ids",
            details=scope_details,
        )


def _commentary(record: Mapping[str, Any]) -> str:
    return str(record.get("exception_commentary") or "")


def _is_pending(record: Mapping[str, Any]) -> bool:
    """Whether a wire record is awaiting recertification.

    Pending wins over commentary text everywhere: inherited text must not
    collapse into ``Commented``. The flag check covers real wire rows; the
    status check covers contract fakes that only carry the frozen status.
    """

    if record.get("recertification_required") is True:
        return True
    return str(record.get("status")) == "RecertificationRequired"


def _decide_upload(
    record: Mapping[str, Any],
    supplied: str,
    action: str,
) -> CommentaryUploadDecision | None:
    """Decide one row's upload outcome from CURRENT database state.

    ``supplied`` is the trimmed spreadsheet text; ``action`` is the validated
    ``Commentary Recertify`` choice (``""`` when the column is blank or the
    template predates it). ``None`` means "preserve the row untouched".
    """

    before = _commentary(record)
    pending = _is_pending(record)
    if pending:
        if action == "Keep Current":
            # Ignore the spreadsheet text; keep the stored value and accept
            # it for the current revision (nonempty DB text reads Commented
            # afterwards, empty DB text reads Not Commented).
            return CommentaryUploadDecision(
                commentary=None, clear_recertification=True
            )
        if action == "Updated":
            # Deliberate replacement: empty input clears the stored
            # commentary, nonempty input stores the supplied text. Either
            # way the pending mark is cleared; unchanged text still counts
            # as explicit acceptance.
            return CommentaryUploadDecision(
                commentary=supplied, clear_recertification=True
            )
        # Blank: ignore spreadsheet commentary changes and preserve the
        # current text, status, and pending mark.
        return None
    # Ordinary (nonpending) rows: the recertification choice, when present,
    # never overrides these rules. Nonempty input is accepted as the new
    # value (even on stale templates); empty input preserves the stored
    # accepted text and status rather than clearing it.
    if supplied == "":
        return None
    if supplied == before:
        return None
    return CommentaryUploadDecision(
        commentary=supplied, clear_recertification=False
    )


def import_commentary(
    content: bytes,
    *,
    requested_as_of_date: str | None = None,
    repository: Any | None = None,
    run_id: str | None = None,
) -> dict[str, Any]:
    """Validate and atomically apply a commentary template.

    Round-2 upload semantics (decided from CURRENT database state per row):

    - Pending rows need an explicit ``Commentary Recertify`` choice.
      ``Keep Current`` keeps the stored text and accepts it; ``Updated``
      stores the supplied text (empty input deliberately clears it) and
      accepts it. A blank choice preserves the row, including its pending
      mark.
    - Ordinary rows ignore the recertification column. Nonempty input is
      accepted as the new value; empty (or whitespace-only) input preserves
      the stored text and status and never clears an accepted comment.
    - The ``Commentary Recertify`` column is validated for every row before
      any database write; only blank, ``Keep Current`` and ``Updated`` are
      accepted. All identity validation happens before the single repository
      update call. Worker A owns transaction/rollback inside
      ``apply_commentary_upload``.

    Date scope (no ``run_id``) accepts safe partial templates: only the IDs
    present in the workbook are updated and omitted date records keep their
    commentary. Run scope (``run_id`` given) requires the workbook to contain
    exactly that run's membership IDs.
    """
    try:
        parsed = parse_commentary_workbook(content)
    except WorkbookValidationError as exc:
        raise TrackingAPIError(
            str(exc), code=exc.code, details=exc.details
        ) from exc

    expected_ids: set[str] | None = None
    if run_id is not None:
        run_data = _load_run_or_raise(run_id)
        run_date = _run_as_of_date(run_data, run_id)
        if run_date != parsed.as_of_date:
            raise TrackingAPIError(
                "The workbook As-of Date does not match the selected run's As-of Date.",
                code="date_mismatch",
                details={
                    "workbook_as_of_date": parsed.as_of_date.isoformat(),
                    "run_as_of_date": run_date.isoformat(),
                    "run_id": run_id,
                },
            )
        expected_ids = _run_membership_ids(run_data, run_id)

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
    _validate_ids(parsed, existing, expected_ids=expected_ids, run_id=run_id)

    decisions: dict[str, CommentaryUploadDecision] = {}
    updated = 0
    cleared = 0
    unchanged = 0
    for record in existing:
        exception_id = record["exception_id"]
        if exception_id not in parsed.commentaries:
            # Safe partial: omitted date records are preserved, never cleared.
            unchanged += 1
            continue
        # Trim the spreadsheet input before processing: whitespace-only is
        # empty, while internal whitespace and line breaks are preserved.
        # Exception IDs and book keys are never normalized.
        supplied = parsed.commentaries[exception_id].strip()
        action = parsed.recertifications.get(exception_id, "")
        decision = _decide_upload(record, supplied, action)
        if decision is None:
            unchanged += 1
            continue
        new_text = (
            _commentary(record)
            if decision.commentary is None
            else decision.commentary
        )
        before = _commentary(record)
        if new_text == before and not (
            decision.clear_recertification and _is_pending(record)
        ):
            unchanged += 1
            continue
        decisions[exception_id] = decision
        if new_text == before:
            # Text kept (Keep Current, or Updated with identical text) while
            # the pending mark is cleared: explicit acceptance without a
            # text change.
            unchanged += 1
        elif new_text.strip():
            updated += 1
        else:
            cleared += 1

    if decisions:
        try:
            repo.apply_commentary_upload(parsed.as_of_date, decisions)
        except UnknownExceptionError as exc:
            raise TrackingAPIError(
                str(exc),
                code="unknown_exception_ids",
                details={"unknown_ids": list(exc.unknown_ids)},
            ) from exc
        except (OSError, ValueError) as exc:
            raise TrackingAPIError(
                str(exc),
                code="tracking_update_failed",
                status_code=400,
            ) from exc

    records = list_exceptions(parsed.as_of_date, repo)
    result = {
        "as_of_date": parsed.as_of_date.isoformat(),
        "updated": updated,
        "cleared": cleared,
        "unchanged": unchanged,
        "total": len(records),
        "exceptions": records,
    }
    if run_id is not None:
        result["scope"] = "run"
        result["run_id"] = run_id
    else:
        result["scope"] = "date"
    return result


def recertify_commentaries(
    *,
    as_of_date: str | None = None,
    exception_ids: Iterable[str] | None = None,
    revision_tokens: Mapping[str, str] | None = None,
    repository: Any | None = None,
) -> dict[str, Any]:
    """Explicitly accept carried commentary for one as-of date.

    Acceptance — including acceptance of unchanged carried text — happens only
    here. Uploading an unchanged template, downloading, rerunning, exporting,
    or importing never certifies inherited text implicitly, and blank text is
    never certified. Unknown IDs, out-of-date revision tokens, and blank
    commentary reject the whole call atomically; repeating an accepted batch
    is a retry-safe no-op.
    """

    from apps.exception_tracking.errors import (
        BlankCommentaryCertificationError,
        StaleRevisionTokenError,
        UnknownExceptionError,
    )

    if not as_of_date:
        raise TrackingAPIError(
            "An as-of date is required for recertification.",
            code="invalid_as_of_date",
        )
    try:
        parsed_date = parse_iso_date(as_of_date)
    except ValueError as exc:
        raise TrackingAPIError(str(exc), code="invalid_as_of_date") from exc
    selected = [
        str(exception_id) for exception_id in (exception_ids or []) if str(exception_id).strip()
    ]
    if not selected:
        raise TrackingAPIError(
            "No exception IDs were provided for recertification.",
            code="invalid_recertification_request",
        )
    tokens = dict(revision_tokens or {})
    approvals = {exception_id: str(tokens.get(exception_id, "")) for exception_id in selected}

    repo = repository or get_repository()
    try:
        summary = repo.recertify_exceptions(parsed_date, approvals)
    except UnknownExceptionError as exc:
        raise TrackingAPIError(
            str(exc),
            code="unknown_exception_ids",
            status_code=404,
            details={"unknown_ids": list(exc.unknown_ids)},
        ) from exc
    except StaleRevisionTokenError as exc:
        raise TrackingAPIError(
            str(exc),
            code="stale_revision_token",
            status_code=409,
            details={"stale_ids": list(exc.exception_ids)},
        ) from exc
    except BlankCommentaryCertificationError as exc:
        raise TrackingAPIError(
            str(exc),
            code="blank_commentary_not_certified",
            details={"blank_ids": list(exc.exception_ids)},
        ) from exc
    except (OSError, ValueError) as exc:
        raise TrackingAPIError(
            str(exc),
            code="tracking_update_failed",
            status_code=400,
        ) from exc

    records = list_exceptions(parsed_date, repo)
    return {
        "as_of_date": summary.as_of_date.isoformat(),
        "accepted": list(summary.accepted),
        "already_accepted": list(summary.already_accepted),
        "total": summary.total,
        "exceptions": records,
    }
