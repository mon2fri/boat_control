"""Calendar helpers shared by the exception-tracking API and run capture."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

WEEKDAYS = frozenset(range(0, 5))


def default_as_of_date(today: date | None = None) -> date:
    """Return the last Monday-Friday of the month before ``today``.

    January rolls back to December of the previous year. The returned date is
    always a weekday, never the last calendar day when that day is a weekend.
    """
    current = today or date.today()
    previous_month_end = current.replace(day=1) - timedelta(days=1)
    while previous_month_end.weekday() not in WEEKDAYS:
        previous_month_end -= timedelta(days=1)
    return previous_month_end


def parse_iso_date(value: object, *, field: str = "as_of_date") -> date:
    """Strictly parse a calendar date without accepting timestamps or sloppiness."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        raise ValueError(f"{field} must be an ISO date (YYYY-MM-DD).")
    text = value.strip()
    if not _ISO_DATE.fullmatch(text):
        raise ValueError(f"{field} must be an ISO date (YYYY-MM-DD).")
    try:
        return date.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"{field} must be a valid calendar date.") from exc
