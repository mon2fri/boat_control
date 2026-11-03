from datetime import UTC, date, datetime

import pytest
from apps.runs.as_of_date import (
    AsOfDateError,
    default_as_of_date,
    format_as_of_date,
    parse_as_of_date,
    resolve_as_of_date,
)


class TestParseAsOfDate:
    def test_accepts_strict_iso_calendar_date(self) -> None:
        assert parse_as_of_date("2026-10-30") == date(2026, 10, 30)

    def test_accepts_date_object_for_internal_callers(self) -> None:
        assert parse_as_of_date(date(2026, 1, 2)) == date(2026, 1, 2)

    @pytest.mark.parametrize(
        "value",
        [
            "2026-1-2",
            "2026/01/02",
            "02-01-2026",
            "2026-13-01",
            "2026-02-30",
            "2026-01-02T00:00:00",
            "2026-01-02 ",
            "not-a-date",
        ],
    )
    def test_rejects_non_canonical_or_impossible_dates(self, value: str) -> None:
        with pytest.raises(AsOfDateError):
            parse_as_of_date(value)

    def test_rejects_datetime_and_non_string_values(self) -> None:
        with pytest.raises(AsOfDateError):
            parse_as_of_date(datetime(2026, 1, 2, tzinfo=UTC))
        with pytest.raises(AsOfDateError):
            parse_as_of_date(20260102)
        with pytest.raises(AsOfDateError):
            parse_as_of_date(True)


class TestDefaultAsOfDate:
    @pytest.mark.parametrize(
        ("today", "expected"),
        [
            (date(2026, 11, 3), date(2026, 10, 30)),  # October ends Friday
            (date(2026, 1, 15), date(2025, 12, 31)),  # January/year rollover
            (date(2026, 3, 1), date(2026, 2, 27)),  # February ends Saturday
            (date(2026, 6, 30), date(2026, 5, 29)),  # May ends Sunday
            (date(2024, 3, 5), date(2024, 2, 29)),  # leap-day month
            (date(2026, 11, 1), date(2026, 10, 30)),  # first of month
        ],
    )
    def test_returns_last_monday_to_friday_of_previous_month(
        self, today: date, expected: date
    ) -> None:
        assert default_as_of_date(today) == expected

    def test_never_returns_a_weekend(self) -> None:
        current = date(2024, 1, 1)
        while current.year < 2027:
            result = default_as_of_date(current)
            assert result.weekday() < 5
            current = date.fromordinal(current.toordinal() + 1)


class TestResolveAsOfDate:
    def test_request_value_wins_over_session_fallback(self) -> None:
        assert resolve_as_of_date(
            "2026-09-30", fallback="2026-08-31", today=date(2026, 11, 3)
        ) == date(2026, 9, 30)

    def test_fallback_used_when_request_omits_date(self) -> None:
        assert resolve_as_of_date(
            None, fallback="2026-08-31", today=date(2026, 11, 3)
        ) == date(2026, 8, 31)

    def test_empty_strings_fall_through(self) -> None:
        assert resolve_as_of_date(
            "", fallback="", today=date(2026, 11, 3)
        ) == date(2026, 10, 30)

    def test_invalid_request_date_is_not_silently_defaulted(self) -> None:
        with pytest.raises(AsOfDateError):
            resolve_as_of_date("11/03/2026", today=date(2026, 11, 3))

    def test_invalid_session_fallback_is_not_silently_defaulted(self) -> None:
        with pytest.raises(AsOfDateError):
            resolve_as_of_date(None, fallback="2026-02-30", today=date(2026, 11, 3))


def test_format_as_of_date_uses_iso_or_null() -> None:
    assert format_as_of_date(date(2026, 10, 30)) == "2026-10-30"
    assert format_as_of_date(None) is None
