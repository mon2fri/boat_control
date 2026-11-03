"""Identity, date-safety, and serialization tests for exception tracking."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta, timezone

import pytest
from apps.exception_tracking.errors import (
    ExceptionIdentityCollisionError,
    ExceptionTrackingError,
    InvalidAsOfDateError,
    InvalidKeyColumnsError,
    InvalidRuleIdentifierError,
    MissingKeyValueError,
)
from apps.exception_tracking.identity import (
    ExceptionIdentity,
    build_exception_id,
    build_exception_identity,
    collision_error,
    date_from_table_name,
    deserialize_key_columns,
    ensure_utc_timestamp,
    is_canonical_rule_identifier,
    normalize_commentary,
    normalize_key_value,
    parse_as_of_date,
    parse_utc_timestamp,
    serialize_key_columns,
    table_name_for_date,
    validate_key_column_order,
    validate_rule_identifier,
)

RULE = "CBR1_00000000000000000000"


def test_canonical_rule_identifier_accepts_catalog_format() -> None:
    assert is_canonical_rule_identifier(RULE)
    assert validate_rule_identifier(RULE) == RULE


@pytest.mark.parametrize(
    "value",
    ["", "R001", "CBR1_", "CBR1_0000000000000000000", "cbr1_00000000000000000000", None, 42],
)
def test_canonical_rule_identifier_rejects_guessed_or_local_ids(value: object) -> None:
    assert not is_canonical_rule_identifier(value)
    with pytest.raises(InvalidRuleIdentifierError):
        validate_rule_identifier(value)


def test_parse_as_of_date_accepts_date_and_strict_iso_text() -> None:
    assert parse_as_of_date(date(2026, 10, 30)) == date(2026, 10, 30)
    assert parse_as_of_date("2026-10-30") == date(2026, 10, 30)
    assert parse_as_of_date(" 2026-10-30 ") == date(2026, 10, 30)


@pytest.mark.parametrize(
    "value",
    [
        "20261030",
        "2026-1-1",
        "2026-02-30",
        "2026-10-30T00:00:00",
        "2026-10-30; DROP TABLE exceptions_20261030",
        "",
        None,
        20261030,
    ],
)
def test_parse_as_of_date_rejects_ambiguous_or_injected_values(value: object) -> None:
    with pytest.raises(InvalidAsOfDateError):
        parse_as_of_date(value)


def test_parse_as_of_date_rejects_datetime_even_though_it_subclasses_date() -> None:
    with pytest.raises(InvalidAsOfDateError):
        parse_as_of_date(datetime(2026, 10, 30, tzinfo=UTC))


def test_table_names_are_generated_and_round_trip() -> None:
    assert table_name_for_date(date(2026, 10, 30)) == "exceptions_20261030"
    assert table_name_for_date("2026-01-01") == "exceptions_20260101"
    assert date_from_table_name("exceptions_20261030") == date(2026, 10, 30)
    assert date_from_table_name("exceptions_20260230") is None
    assert date_from_table_name("exceptions_20261030; DROP TABLE x") is None
    assert date_from_table_name("other_table") is None


def test_key_column_order_must_be_non_empty_unique_and_text() -> None:
    assert validate_key_column_order(["id", "type"]) == ("id", "type")
    with pytest.raises(InvalidKeyColumnsError):
        validate_key_column_order([])
    with pytest.raises(InvalidKeyColumnsError):
        validate_key_column_order(["id", "id"])
    with pytest.raises(InvalidKeyColumnsError):
        validate_key_column_order(["id", ""])
    with pytest.raises(InvalidKeyColumnsError):
        validate_key_column_order("id")


def test_key_values_are_exact_and_missing_values_are_rejected() -> None:
    assert normalize_key_value("001", column="id") == "001"
    assert normalize_key_value("café", column="name") == "café"
    assert normalize_key_value(42, column="id") == "42"
    assert normalize_key_value(date(2026, 10, 30), column="day") == "2026-10-30"
    with pytest.raises(MissingKeyValueError):
        normalize_key_value(None, column="id")
    with pytest.raises(MissingKeyValueError):
        normalize_key_value("", column="id")
    with pytest.raises(MissingKeyValueError):
        normalize_key_value("a\x00b", column="id")


def test_key_columns_json_is_compact_ordered_and_lossless() -> None:
    text = serialize_key_columns((("id", "ABC"), ("type", "123")))
    assert text == '{"id":"ABC","type":"123"}'
    assert deserialize_key_columns(text) == (("id", "ABC"), ("type", "123"))

    unicode_text = serialize_key_columns((("编号", "café"),))
    assert "编号" in unicode_text
    assert "café" in unicode_text
    assert json.loads(unicode_text) == {"编号": "café"}


def test_exception_id_is_literal_and_has_no_extra_prefix() -> None:
    assert build_exception_id(RULE, ("ABC", "123")) == f"{RULE}_ABC_123"


def test_build_identity_uses_configured_order_and_rejects_extra_keys() -> None:
    identity = build_exception_identity(
        RULE, {"type": "123", "id": "ABC"}, ["id", "type"]
    )
    assert identity.exception_id == f"{RULE}_ABC_123"
    assert identity.key_columns_json == '{"id":"ABC","type":"123"}'
    assert identity.key_columns == (("id", "ABC"), ("type", "123"))

    with pytest.raises(InvalidKeyColumnsError):
        build_exception_identity(RULE, {"id": "ABC", "extra": "x"}, ["id"])
    with pytest.raises(MissingKeyValueError):
        build_exception_identity(RULE, {"id": "ABC"}, ["id", "type"])
    with pytest.raises(MissingKeyValueError):
        build_exception_identity(RULE, {"id": None}, ["id"])


def test_underscore_values_can_collide_and_the_collision_is_reported() -> None:
    left = build_exception_identity(
        RULE, {"a": "x_y", "b": "z"}, ["a", "b"]
    )
    right = build_exception_identity(
        RULE, {"a": "x", "b": "y_z"}, ["a", "b"]
    )
    assert left.exception_id == right.exception_id
    assert left.key_columns_json != right.key_columns_json

    with pytest.raises(ExceptionIdentityCollisionError) as excinfo:
        raise collision_error(
            right,
            existing_rule_identifier=left.exception_rule_identifier,
            existing_key_columns=left.key_columns_json,
        )
    assert excinfo.value.exception_id == left.exception_id
    assert excinfo.value.existing_key_columns == left.key_columns_json
    assert excinfo.value.incoming_key_columns == right.key_columns_json


def test_composite_key_order_changes_the_literal_id() -> None:
    first = build_exception_identity(RULE, {"id": "1", "type": "A"}, ["id", "type"])
    second = build_exception_identity(RULE, {"id": "1", "type": "A"}, ["type", "id"])
    assert first.exception_id == f"{RULE}_1_A"
    assert second.exception_id == f"{RULE}_A_1"


def test_timestamps_must_be_aware_and_are_normalized_to_utc() -> None:
    local = datetime(2026, 10, 30, 10, 0, tzinfo=timezone(timedelta(hours=2)))
    normalized = ensure_utc_timestamp(local)
    assert normalized == datetime(2026, 10, 30, 8, 0, tzinfo=UTC)
    assert normalized.tzinfo is UTC

    with pytest.raises(ExceptionTrackingError):
        ensure_utc_timestamp(datetime(2026, 10, 30, 10, 0))

    # Legacy naive values read from disk are interpreted as UTC, never guessed.
    assert parse_utc_timestamp("2026-10-30T10:00:00") == datetime(
        2026, 10, 30, 10, 0, tzinfo=UTC
    )


def test_commentary_blank_normalization() -> None:
    assert normalize_commentary(None) is None
    assert normalize_commentary("") == ""
    assert normalize_commentary("   ") == ""
    assert normalize_commentary("  known issue  ") == "  known issue  "


def test_identity_dataclass_alias_exposes_stored_column_text() -> None:
    identity = build_exception_identity(RULE, {"id": "1"}, ["id"])
    assert isinstance(identity, ExceptionIdentity)
    assert identity.key_columns_text == identity.key_columns_json
