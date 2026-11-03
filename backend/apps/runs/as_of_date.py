"""As-of Date validation, defaulting, and propagation helpers.

The As-of Date is the calendar date a comparison run is reported against for
exception tracking. It is deliberately a *date* (not a timestamp): one tracking
table exists per ISO calendar date, and timestamps are recorded separately in
UTC.

The backend is authoritative for the default. When a client does not supply a
date, :func:`default_as_of_date` returns the last Monday-Friday of the previous
month, including January/year rollover.
"""

from __future__ import annotations

import importlib
import re
from datetime import date, datetime, timedelta

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SHARED_DATES_MODULE = "apps.exception_tracking.dates"


class AsOfDateError(ValueError):
    """Raised when an As-of Date is missing, malformed, or not a calendar date."""


def parse_as_of_date(value: object) -> date:
    """Return a strict ISO calendar date.

    Strings must use exactly ``YYYY-MM-DD``. Timestamps, datetimes, integers,
    booleans, and locale-specific formats are rejected rather than guessed.
    A :class:`datetime.date` is accepted for internal callers; a
    :class:`datetime.datetime` is rejected because it carries a time component.
    """

    if isinstance(value, datetime):
        raise AsOfDateError("As-of Date must be a calendar date, not a timestamp.")
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        raise AsOfDateError("As-of Date must be an ISO calendar date (YYYY-MM-DD).")

    text = value.strip()
    if not _ISO_DATE.fullmatch(text):
        raise AsOfDateError(
            f"As-of Date '{value}' must use the ISO calendar format YYYY-MM-DD."
        )
    try:
        parsed = date.fromisoformat(text)
    except ValueError as exc:
        raise AsOfDateError(f"As-of Date '{value}' is not a valid calendar date.") from exc
    if parsed.isoformat() != text:
        raise AsOfDateError(f"As-of Date '{value}' is not a canonical ISO date.")
    return parsed


def _shared_default_as_of_date() -> date | None:
    """Use Worker B's shared calendar helper once that module is integrated."""

    try:
        module = importlib.import_module(_SHARED_DATES_MODULE)
    except ImportError:
        return None
    shared = vars(module).get("default_as_of_date")
    if not callable(shared):
        return None
    value = shared()
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return None


def default_as_of_date(today: date | None = None) -> date:
    """Return the last Monday-Friday of the month before ``today``.

    Production uses Worker B's shared calendar helper when it is integrated so the
    upload/execute default and the tracking API's ``default_as_of_date`` cannot
    drift. The local fallback matches that helper for development before B is
    present: the current backend server calendar date is used, weekends are
    skipped, and a month whose final day is Saturday or Sunday resolves to the
    preceding Friday.
    """

    if today is None:
        shared = _shared_default_as_of_date()
        if shared is not None:
            return shared

    reference = today or date.today()
    previous_month_end = reference.replace(day=1) - timedelta(days=1)
    candidate = previous_month_end
    while candidate.weekday() >= 5:
        candidate -= timedelta(days=1)
    return candidate


def resolve_as_of_date(
    value: object | None,
    *,
    fallback: object | None = None,
    today: date | None = None,
) -> date:
    """Resolve an explicit request date, then a session fallback, then the default.

    Empty strings and ``None`` are treated as "not supplied". Invalid values
    raise :class:`AsOfDateError`; they are never silently replaced by a default.
    """

    if value is not None and value != "":
        return parse_as_of_date(value)
    if fallback is not None and fallback != "":
        return parse_as_of_date(fallback)
    return default_as_of_date(today)


def format_as_of_date(value: date | None) -> str | None:
    """Return the ISO wire representation used by saved-run metadata."""

    return value.isoformat() if value is not None else None
