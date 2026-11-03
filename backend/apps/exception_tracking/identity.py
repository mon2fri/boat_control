"""Canonical exception identity and safe SQLite naming primitives.

The identity is deliberately literal, not hashed or escaped: requirement 1 asks
for ``<exception_rule_identifier>_<key_value>_<key_value>...``.  Ambiguity caused
by underscores inside values is detected by comparing the lossless
``key_columns`` representation, never hidden behind a synthetic ID.

This module has no Django, filesystem, or database dependency.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from apps.exception_tracking.errors import (
    ExceptionIdentityCollisionError,
    ExceptionTrackingError,
    InvalidAsOfDateError,
    InvalidKeyColumnsError,
    InvalidRuleIdentifierError,
    MissingKeyValueError,
)

IDENTIFIER_PREFIX = "CBR1_"
CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
RULE_IDENTIFIER_PATTERN = re.compile(r"^CBR1_[0-9A-HJKMNP-TV-Z]{20}$")
ISO_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")

TABLE_PREFIX = "exceptions_"
TABLE_NAME_PATTERN = re.compile(r"^exceptions_(\d{4})(\d{2})(\d{2})$")


@dataclass(frozen=True)
class ExceptionIdentity:
    """A literal exception identity plus its lossless key representation."""

    exception_id: str
    exception_rule_identifier: str
    key_columns: tuple[tuple[str, str], ...]
    key_columns_json: str
    key_values: tuple[str, ...]

    @property
    def key_columns_text(self) -> str:
        """Alias matching the stored database column name."""

        return self.key_columns_json


def is_canonical_rule_identifier(value: object) -> bool:
    """Return whether ``value`` is a canonical catalog rule identifier."""

    return isinstance(value, str) and RULE_IDENTIFIER_PATTERN.fullmatch(value) is not None


def validate_rule_identifier(value: object) -> str:
    """Validate and return a canonical ``CBR1_...`` rule identifier."""

    if not isinstance(value, str) or not value.strip():
        raise InvalidRuleIdentifierError(
            "Exception identity requires a canonical rule identifier "
            "(CBR1_ followed by 20 Crockford Base32 characters); none was supplied. "
            "Initialize the rule catalog, reselect the rule, and rerun. No ID was guessed."
        )
    if not is_canonical_rule_identifier(value):
        raise InvalidRuleIdentifierError(
            f"'{value}' is not a canonical rule identifier. Exception tracking requires "
            "the immutable catalog identifier (CBR1_ followed by 20 Crockford Base32 "
            "characters), not a local rule id such as R001. No ID was guessed."
        )
    return value


def parse_as_of_date(value: object) -> date:
    """Strictly parse an ISO calendar date.

    Strings must use exactly ``YYYY-MM-DD``.  Datetimes, integers, booleans and
    locale-specific strings are rejected rather than guessed.
    """

    if isinstance(value, datetime):
        raise InvalidAsOfDateError(
            "As-of date must be a calendar date, not a timestamp with a time component."
        )
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        raise InvalidAsOfDateError(
            "As-of date must be an ISO calendar date (YYYY-MM-DD)."
        )

    text = value.strip()
    if ISO_DATE_PATTERN.fullmatch(text) is None:
        raise InvalidAsOfDateError(
            f"As-of date '{value}' must use the ISO calendar format YYYY-MM-DD."
        )
    try:
        parsed = date.fromisoformat(text)
    except ValueError as exc:
        raise InvalidAsOfDateError(
            f"As-of date '{value}' is not a valid calendar date."
        ) from exc
    if parsed.isoformat() != text:
        raise InvalidAsOfDateError(
            f"As-of date '{value}' is not a canonical ISO date."
        )
    return parsed


def table_name_for_date(value: object) -> str:
    """Return the generated, strictly validated table name for a date."""

    parsed = parse_as_of_date(value)
    return f"{TABLE_PREFIX}{parsed:%Y%m%d}"


def date_from_table_name(name: str) -> date | None:
    """Parse a generated date table name, or return ``None`` for other tables."""

    match = TABLE_NAME_PATTERN.fullmatch(name)
    if match is None:
        return None
    year, month, day = (int(part) for part in match.groups())
    try:
        return date(year, month, day)
    except ValueError:
        return None


def quote_identifier(identifier: str) -> str:
    """Quote a generated SQLite identifier defensively.

    Only internally generated table/column names reach this function.  The
    function still rejects NUL and quotes embedded double quotes so a future
    caller cannot accidentally create an injection path.
    """

    if not identifier or "\x00" in identifier:
        raise ExceptionTrackingError("Invalid SQL identifier for exception tracking.")
    return '"' + identifier.replace('"', '""') + '"'


def validate_key_column_order(order: Sequence[str]) -> tuple[str, ...]:
    """Validate the configured, ordered key-column names."""

    if isinstance(order, (str, bytes)) or not isinstance(order, Sequence):
        raise InvalidKeyColumnsError(
            "key_column_order must be a non-empty sequence of configured key-column names."
        )
    names: list[str] = []
    seen: set[str] = set()
    for raw in order:
        if not isinstance(raw, str) or not raw.strip():
            raise InvalidKeyColumnsError(
                "Every configured key-column name must be a non-blank string."
            )
        if raw in seen:
            raise InvalidKeyColumnsError(
                f"Configured key column '{raw}' appears more than once; exception IDs "
                "require an unambiguous ordered key list."
            )
        seen.add(raw)
        names.append(raw)
    if not names:
        raise InvalidKeyColumnsError(
            "At least one configured key column is required to identify exceptions."
        )
    return tuple(names)


def normalize_key_value(value: Any, *, column: str) -> str:
    """Convert one configured key value to its exact text representation.

    Missing, null and empty values are rejected because an exception ID must
    never be guessed.  Non-string scalars are converted with ``str``; dates and
    datetimes use ISO-8601.  Callers handling CSV data should pass the source
    strings unchanged.
    """

    if value is None:
        raise MissingKeyValueError(
            f"Configured key column '{column}' has no value. Exception IDs require "
            "every configured key value; no ID was guessed."
        )
    if isinstance(value, str):
        text = value
    elif isinstance(value, (datetime, date)):
        text = value.isoformat()
    elif isinstance(value, bool):
        text = "True" if value else "False"
    elif isinstance(value, (int, float)):
        text = str(value)
    else:
        text = str(value)

    if text == "":
        raise MissingKeyValueError(
            f"Configured key column '{column}' is blank. Exception IDs require a "
            "non-empty value for every configured key; no ID was guessed."
        )
    if "\x00" in text:
        raise MissingKeyValueError(
            f"Configured key column '{column}' contains a NUL character, which cannot "
            "be stored safely. Correct the source data and rerun."
        )
    return text


def serialize_key_columns(pairs: Sequence[tuple[str, str]]) -> str:
    """Serialize ordered key pairs as a compact lossless JSON object.

    JSON member order is the configured key order.  This is the exact text stored
    in the ``key_columns`` database column and returned by Worker B's API.
    """

    ordered: dict[str, str] = {}
    for name, value in pairs:
        if name in ordered:
            raise InvalidKeyColumnsError(
                f"Key column '{name}' appears more than once in the identity."
            )
        ordered[name] = value
    return json.dumps(ordered, ensure_ascii=False, separators=(",", ":"))


def deserialize_key_columns(text: str) -> tuple[tuple[str, str], ...]:
    """Parse the stored ``key_columns`` JSON back into ordered pairs."""

    try:
        payload: Any = json.loads(text)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ExceptionTrackingError(
            "Stored key_columns is not valid JSON; the tracking database is corrupt."
        ) from exc
    if not isinstance(payload, dict):
        raise ExceptionTrackingError(
            "Stored key_columns must be a JSON object of column names to values."
        )
    pairs: list[tuple[str, str]] = []
    for name, value in payload.items():
        if not isinstance(name, str) or not isinstance(value, str):
            raise ExceptionTrackingError(
                "Stored key_columns must contain only string column names and values."
            )
        pairs.append((name, value))
    return tuple(pairs)


def build_exception_id(rule_identifier: str, ordered_values: Sequence[str]) -> str:
    """Return the literal underscore-joined exception ID."""

    identifier = validate_rule_identifier(rule_identifier)
    if not ordered_values:
        raise MissingKeyValueError(
            "At least one configured key value is required to build an exception ID."
        )
    for value in ordered_values:
        if not isinstance(value, str) or value == "":
            raise MissingKeyValueError(
                "Every configured key value must be a non-empty string; no ID was guessed."
            )
    return "_".join((identifier, *ordered_values))


def build_exception_identity(
    rule_identifier: str,
    key_columns: Mapping[str, Any],
    key_column_order: Sequence[str],
) -> ExceptionIdentity:
    """Build a literal ID and lossless key representation for one occurrence.

    ``key_column_order`` is the configured key order.  ``key_columns`` must
    contain exactly those names; extra keys are rejected so no part of the
    identity is silently dropped.
    """

    identifier = validate_rule_identifier(rule_identifier)
    order = validate_key_column_order(key_column_order)
    if not isinstance(key_columns, Mapping):
        raise InvalidKeyColumnsError(
            "key_columns must be a mapping of configured column names to values."
        )

    supplied = set(key_columns)
    expected = set(order)
    extra = supplied - expected
    if extra:
        raise InvalidKeyColumnsError(
            "key_columns contains columns outside the configured key order: "
            f"{', '.join(sorted(str(name) for name in extra))}. Configure the key "
            "columns explicitly so the exception identity is unambiguous."
        )

    pairs: list[tuple[str, str]] = []
    values: list[str] = []
    for name in order:
        if name not in key_columns:
            raise MissingKeyValueError(
                f"Configured key column '{name}' is missing from the exception row. "
                "Exception IDs require every configured key value; no ID was guessed."
            )
        value = normalize_key_value(key_columns[name], column=name)
        pairs.append((name, value))
        values.append(value)

    exception_id = build_exception_id(identifier, values)
    key_columns_json = serialize_key_columns(pairs)
    return ExceptionIdentity(
        exception_id=exception_id,
        exception_rule_identifier=identifier,
        key_columns=tuple(pairs),
        key_columns_json=key_columns_json,
        key_values=tuple(values),
    )


def collision_error(
    incoming: ExceptionIdentity,
    *,
    existing_rule_identifier: str,
    existing_key_columns: str,
) -> ExceptionIdentityCollisionError:
    """Build a detailed ambiguity error for two identities sharing one ID."""

    return ExceptionIdentityCollisionError(
        "Ambiguous exception identity: two different key-value tuples produce the "
        f"same literal exception_id '{incoming.exception_id}'. Existing key_columns="
        f"{existing_key_columns}; incoming key_columns={incoming.key_columns_json}. "
        "IDs are intentionally not escaped or hashed. Change the key-column "
        "configuration or correct the data so the values are unambiguous; nothing "
        "was written.",
        exception_id=incoming.exception_id,
        existing_rule_identifier=existing_rule_identifier,
        existing_key_columns=existing_key_columns,
        incoming_rule_identifier=incoming.exception_rule_identifier,
        incoming_key_columns=incoming.key_columns_json,
    )


def utc_now() -> datetime:
    """Return the current timezone-aware UTC timestamp."""

    return datetime.now(UTC)


def ensure_utc_timestamp(value: datetime | None) -> datetime:
    """Return an aware UTC timestamp, rejecting naive caller input."""

    if value is None:
        return utc_now()
    if not isinstance(value, datetime):
        raise ExceptionTrackingError(
            "exception_timestamp must be a datetime value."
        )
    if value.tzinfo is None or value.utcoffset() is None:
        raise ExceptionTrackingError(
            "exception_timestamp must be timezone-aware. Supply an aware UTC "
            "datetime; naive timestamps are ambiguous and are not guessed."
        )
    return value.astimezone(UTC)


def parse_utc_timestamp(value: str) -> datetime:
    """Parse a stored timestamp, treating legacy naive values as UTC."""

    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ExceptionTrackingError(
            f"Stored timestamp '{value}' is not valid ISO-8601; the tracking "
            "database is corrupt."
        ) from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def normalize_commentary(value: str | None) -> str | None:
    """Normalize commentary input.

    ``None`` means "not supplied" and is handled by the caller's precedence
    rules.  A blank/whitespace-only string is an explicit clear and becomes
    ``""``.  Nonblank text is preserved exactly.
    """

    if value is None:
        return None
    if not isinstance(value, str):
        raise ExceptionTrackingError("exception_commentary must be text.")
    return "" if value.strip() == "" else value
