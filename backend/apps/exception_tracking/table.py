"""Authoritative tracking-table column, sort, filter and pagination helpers."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

DEFAULT_PAGE_SIZE = 50
ALLOWED_PAGE_SIZES = (50, 100, 200, 500)
STATUS_RANK = {"New": 0, "NotCommented": 1, "Commented": 2}
DETAIL_PREFIX = "detail:"


class TableQueryError(ValueError):
    def __init__(self, message: str, *, code: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class TableColumn:
    key: str
    label: str
    visible: bool
    sortable: bool
    filterable: bool
    source: str


_STANDARD_COLUMNS: tuple[TableColumn, ...] = (
    TableColumn("exception_id", "Exception ID", True, True, True, "standard"),
    TableColumn("status", "Exception Status", True, True, True, "standard"),
    TableColumn("commentary", "Commentary", True, True, True, "standard"),
    TableColumn("rule_index", "Rule Index", True, True, True, "standard"),
    TableColumn(
        "exception_rule_identifier",
        "Exception Rule Identifier",
        False,
        True,
        True,
        "standard",
    ),
    TableColumn("key_columns", "Key Columns", False, True, True, "standard"),
    TableColumn(
        "exception_timestamp", "Exception Timestamp", False, True, True, "standard"
    ),
    TableColumn(
        "exception_as_of_date", "Exception As-of Date", False, True, True, "standard"
    ),
    TableColumn(
        "exception_first_seen_as_of_date",
        "Exception First Seen As-of Date",
        False,
        True,
        True,
        "standard",
    ),
    TableColumn(
        "exception_last_seen_as_of_date",
        "Exception Last Seen As-of Date",
        False,
        True,
        True,
        "standard",
    ),
)


def columns_for(detail_columns: Sequence[str]) -> tuple[TableColumn, ...]:
    columns = list(_STANDARD_COLUMNS)
    for name in detail_columns:
        columns.append(
            TableColumn(
                f"{DETAIL_PREFIX}{name}",
                name,
                False,
                True,
                True,
                "detail",
            )
        )
    return tuple(columns)


def column_metadata(detail_columns: Sequence[str]) -> list[dict[str, Any]]:
    return [
        {
            "key": column.key,
            "label": column.label,
            "visible": column.visible,
            "sortable": column.sortable,
            "filterable": column.filterable,
            "source": column.source,
        }
        for column in columns_for(detail_columns)
    ]


def _detail_value(record: Mapping[str, Any], name: str) -> str:
    values = record.get("detail_values") or {}
    if not isinstance(values, Mapping):
        return ""
    value = values.get(name)
    return "" if value is None else str(value)


def _value(record: Mapping[str, Any], key: str) -> str:
    if key.startswith(DETAIL_PREFIX):
        return _detail_value(record, key[len(DETAIL_PREFIX) :])
    value = record.get("exception_commentary") if key == "commentary" else record.get(key)
    return "" if value is None else str(value)


def _sort_value(record: Mapping[str, Any], key: str) -> Any:
    if key == "status":
        return STATUS_RANK.get(str(record.get("status")), len(STATUS_RANK))
    return _value(record, key).casefold()


def _valid_keys(detail_columns: Sequence[str]) -> set[str]:
    return {column.key for column in columns_for(detail_columns)}


def normalize_query(
    *,
    offset: str | None,
    limit: str | None,
    sort: str | None,
    order: str | None,
    detail_columns: Sequence[str],
) -> tuple[int, int, str | None, str]:
    try:
        parsed_offset = int(offset or 0)
    except ValueError as exc:
        raise TableQueryError(
            "offset must be a non-negative integer.", code="invalid_offset"
        ) from exc
    if parsed_offset < 0:
        raise TableQueryError("offset must be a non-negative integer.", code="invalid_offset")

    try:
        parsed_limit = int(limit or DEFAULT_PAGE_SIZE)
    except ValueError as exc:
        raise TableQueryError(
            "limit must be one of 50, 100, 200, 500.", code="invalid_page_size"
        ) from exc
    if parsed_limit not in ALLOWED_PAGE_SIZES:
        raise TableQueryError(
            "limit must be one of 50, 100, 200, 500.", code="invalid_page_size"
        )

    parsed_order = (order or "asc").lower()
    if parsed_order not in {"asc", "desc"}:
        raise TableQueryError("order must be 'asc' or 'desc'.", code="invalid_order")

    parsed_sort = sort.strip() if sort and sort.strip() else None
    if parsed_sort is not None and parsed_sort not in _valid_keys(detail_columns):
        raise TableQueryError(
            f"Unknown sort column: {parsed_sort}", code="invalid_sort"
        )
    return parsed_offset, parsed_limit, parsed_sort, parsed_order


def parse_filters(
    params: Mapping[str, str], detail_columns: Sequence[str]
) -> dict[str, list[str]]:
    valid = _valid_keys(detail_columns)
    filters: dict[str, list[str]] = {}
    for name, raw in params.items():
        if not name.startswith("filter_"):
            continue
        key = name[len("filter_") :]
        if key not in valid:
            raise TableQueryError(f"Unknown filter column: {key}", code="invalid_filter")
        values = [value.strip() for value in raw.split(",") if value.strip()]
        if values:
            filters[key] = values
    return filters


def default_sort(records: Iterable[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    return sorted(
        records,
        key=lambda record: (
            STATUS_RANK.get(str(record.get("status")), len(STATUS_RANK)),
            str(record.get("exception_id") or ""),
        ),
    )


def sort_records(
    records: Iterable[Mapping[str, Any]],
    *,
    sort_key: str | None,
    order: str,
) -> list[Mapping[str, Any]]:
    ordered = sorted(records, key=lambda record: str(record.get("exception_id") or ""))
    if sort_key is None:
        return default_sort(ordered)
    ordered = sorted(
        ordered,
        key=lambda record: _sort_value(record, sort_key),
        reverse=order == "desc",
    )
    return ordered


def filter_records(
    records: Iterable[Mapping[str, Any]], filters: Mapping[str, list[str]]
) -> list[Mapping[str, Any]]:
    result = list(records)
    for key, values in filters.items():
        accepted = set(values)
        result = [record for record in result if _value(record, key) in accepted]
    return result


def available_filters(
    records: Iterable[Mapping[str, Any]], detail_columns: Sequence[str]
) -> dict[str, list[str]]:
    rows = list(records)
    result: dict[str, list[str]] = {}
    for column in columns_for(detail_columns):
        if not column.filterable:
            continue
        result[column.key] = sorted(
            {
                value
                for record in rows
                if (value := _value(record, column.key)) != ""
            }
        )
    return result


def trim_detail_values(
    records: Iterable[Mapping[str, Any]], detail_columns: Sequence[str]
) -> list[dict[str, Any]]:
    selected = list(detail_columns)
    result: list[dict[str, Any]] = []
    for record in records:
        item = dict(record)
        values = record.get("detail_values") or {}
        item["detail_values"] = (
            {
                name: "" if values.get(name) is None else str(values.get(name))
                for name in selected
            }
            if isinstance(values, Mapping)
            else {name: "" for name in selected}
        )
        result.append(item)
    return result
