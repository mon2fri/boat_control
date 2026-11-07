"""Ordered commentary extra-column metadata and value serialization.

Only the ordered ``Extra Columns for Commentary Template`` selection may supply
appended data columns.  This module validates that selection, normalizes values
losslessly to text, and serializes them into the per-row JSON payload.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from datetime import date, datetime
from typing import Any

from apps.exception_tracking.errors import (
    ExceptionTrackingError,
    InvalidExtraColumnsError,
)


def normalize_column_key(value: str) -> str:
    """Normalize a header for duplicate/reserved comparisons."""

    return " ".join(value.split()).casefold()


RESERVED_EXTRA_COLUMN_NAMES: tuple[str, ...] = (
    "Exception ID",
    "Exception Status",
    "Commentary",
    "Exception Commentary",
    "Rule Index",
    "Exception Rule Identifier",
    "Key Columns",
    "Exception Timestamp",
    "Exception As-of Date",
    "Exception First Seen As-of Date",
    "Exception Last Seen As-of Date",
    "Exception First Seen Timestamp",
    "Exception Last Seen Timestamp",
)
_RESERVED_KEYS = frozenset(normalize_column_key(name) for name in RESERVED_EXTRA_COLUMN_NAMES)


def validate_extra_columns(columns: Sequence[str]) -> tuple[str, ...]:
    """Validate an ordered extra-column selection.

    Names are stripped, must be nonblank, must be unique case-insensitively
    after whitespace normalization, and must not collide with standard
    tracking/template headers.  Collisions are rejected rather than silently
    dropped so configuration cannot promise a column that the workbook would
    have to discard.
    """

    if isinstance(columns, (str, bytes)) or not isinstance(columns, Sequence):
        raise InvalidExtraColumnsError(
            "extra_columns must be a sequence of ordered column names."
        )
    names: list[str] = []
    seen: set[str] = set()
    for raw in columns:
        if not isinstance(raw, str):
            raise InvalidExtraColumnsError(
                "Every Extra Columns for Commentary Template selection must be text."
            )
        name = raw.strip()
        if not name:
            raise InvalidExtraColumnsError(
                "Extra Columns for Commentary Template cannot contain a blank column name."
            )
        if "\x00" in name:
            raise InvalidExtraColumnsError(
                f"Extra column '{name}' contains a NUL character, which cannot be "
                "stored safely."
            )
        key = normalize_column_key(name)
        if key in _RESERVED_KEYS:
            raise InvalidExtraColumnsError(
                f"Extra column '{name}' collides with a standard tracking/template "
                "header. Choose a source column that does not duplicate a reserved "
                "header; no columns were stored."
            )
        if key in seen:
            raise InvalidExtraColumnsError(
                f"Extra column '{name}' is selected more than once (names are "
                "case-insensitive after whitespace normalization). Remove the "
                "duplicate; no columns were stored."
            )
        seen.add(key)
        names.append(name)
    return tuple(names)


def normalize_extra_value(value: Any, *, column: str) -> str:
    """Convert one selected source value to exact text for storage.

    Empty values are allowed and stored as ``""``.  ``None`` means no value and
    also becomes empty text; callers should omit the key when the source row has
    no such column so historical "missing" remains distinguishable in JSON.
    """

    if value is None:
        text = ""
    elif isinstance(value, str):
        text = value
    elif isinstance(value, (datetime, date)):
        text = value.isoformat()
    elif isinstance(value, bool):
        text = "True" if value else "False"
    else:
        text = str(value)
    if "\x00" in text:
        raise InvalidExtraColumnsError(
            f"Extra column '{column}' contains a NUL character, which cannot be "
            "stored safely. Correct the source data and rerun."
        )
    return text


def normalize_extra_values(values: Mapping[str, Any]) -> dict[str, str]:
    """Normalize a mapping of selected column names to text values."""

    if not isinstance(values, Mapping):
        raise InvalidExtraColumnsError(
            "exception_extra_values must be a mapping of column names to values."
        )
    normalized: dict[str, str] = {}
    seen: set[str] = set()
    for raw_name, raw_value in values.items():
        if not isinstance(raw_name, str):
            raise InvalidExtraColumnsError(
                "exception_extra_values keys must be column names."
            )
        name = raw_name.strip()
        if not name:
            raise InvalidExtraColumnsError(
                "exception_extra_values cannot contain a blank column name."
            )
        if "\x00" in name:
            raise InvalidExtraColumnsError(
                f"exception_extra_values column '{name}' contains a NUL character, "
                "which cannot be stored safely."
            )
        key = normalize_column_key(name)
        if key in seen:
            raise InvalidExtraColumnsError(
                f"exception_extra_values contains column '{name}' more than once."
            )
        seen.add(key)
        normalized[name] = normalize_extra_value(raw_value, column=name)
    return normalized


def validate_selected_values(
    values: Mapping[str, Any], selected_columns: Sequence[str]
) -> dict[str, str]:
    """Normalize values and reject keys outside the explicit selection.

    Keys are matched to the selected names case-insensitively after whitespace
    normalization, then stored under the selected name.  This tolerates harmless
    casing differences while still rejecting unselected columns.
    """

    normalized = normalize_extra_values(values)
    selected_by_key = {
        normalize_column_key(name): name for name in selected_columns
    }
    result: dict[str, str] = {}
    unexpected: list[str] = []
    for name, value in normalized.items():
        canonical = selected_by_key.get(normalize_column_key(name))
        if canonical is None:
            unexpected.append(name)
            continue
        result[canonical] = value
    if unexpected:
        raise InvalidExtraColumnsError(
            "exception_extra_values contains columns outside the ordered Extra "
            f"Columns for Commentary Template selection: {', '.join(unexpected)}. "
            "Only the selected columns may supply appended data; nothing was stored."
        )
    return result


def serialize_extra_values(
    values: Mapping[str, str], order: Sequence[str] = ()
) -> str:
    """Serialize values as a compact JSON object in stable selected order.

    Selection names win over a stored value's historical casing; values for
    columns no longer selected are retained after the selected columns.
    """

    by_key = {normalize_column_key(name): name for name in values}
    ordered: dict[str, str] = {}
    used: set[str] = set()
    for selected in order:
        key = normalize_column_key(selected)
        source = by_key.get(key)
        if source is not None:
            ordered[selected] = values[source]
            used.add(key)
    for name, value in values.items():
        if normalize_column_key(name) not in used:
            ordered[name] = value
    return json.dumps(ordered, ensure_ascii=False, separators=(",", ":"))


def serialize_column_selection(columns: Sequence[str]) -> str:
    """Serialize an ordered selection as a compact JSON array."""

    return json.dumps(list(columns), ensure_ascii=False, separators=(",", ":"))


def deserialize_column_selection(text: str) -> tuple[str, ...]:
    """Parse a stored ordered selection JSON array."""

    try:
        payload: Any = json.loads(text)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ExceptionTrackingError(
            "Stored commentary extra-column selection is not valid JSON; the "
            "tracking database is corrupt."
        ) from exc
    if not isinstance(payload, list):
        raise ExceptionTrackingError(
            "Stored commentary extra-column selection must be a JSON array."
        )
    columns: list[str] = []
    for value in payload:
        if not isinstance(value, str):
            raise ExceptionTrackingError(
                "Stored commentary extra-column selection must contain only strings."
            )
        columns.append(value)
    return tuple(columns)


def deserialize_extra_values(text: str) -> dict[str, str]:
    """Parse the stored per-exception JSON object."""

    if not text:
        return {}
    try:
        payload: Any = json.loads(text)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ExceptionTrackingError(
            "Stored exception_extra_values is not valid JSON; the tracking "
            "database is corrupt."
        ) from exc
    if not isinstance(payload, dict):
        raise ExceptionTrackingError(
            "Stored exception_extra_values must be a JSON object."
        )
    values: dict[str, str] = {}
    for name, value in payload.items():
        if not isinstance(name, str) or not isinstance(value, str):
            raise ExceptionTrackingError(
                "Stored exception_extra_values must contain only string column "
                "names and values."
            )
        values[name] = value
    return values


def merge_extra_values(
    existing: Mapping[str, str], incoming: Mapping[str, str]
) -> dict[str, str]:
    """Merge a rerun's supplied values over existing values.

    Supplied keys update case-insensitively; absent keys preserve the previously
    stored value.
    """

    merged = dict(existing)
    by_key = {normalize_column_key(name): name for name in merged}
    for name, value in incoming.items():
        key = normalize_column_key(name)
        existing_name = by_key.get(key)
        if existing_name is None:
            merged[name] = value
            by_key[key] = name
        else:
            merged[existing_name] = value
    return merged
