"""Transactional store, history, and commentary tests for exception tracking.

All databases are isolated under ``tmp_path``; the live
``data/exception_tracking.db`` is never opened.
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from apps.exception_tracking.domain import ExceptionOccurrence
from apps.exception_tracking.errors import (
    ExceptionIdentityCollisionError,
    ExceptionTrackingError,
    InvalidAsOfDateError,
    InvalidDatabasePathError,
    MissingKeyValueError,
    SchemaMismatchError,
    UnknownExceptionError,
)
from apps.exception_tracking.repository import (
    REQUIRED_COLUMNS,
    ExceptionTrackingRepository,
    default_database_path,
    list_as_of_dates,
    list_exception_history,
    record_exceptions,
)
from apps.exception_tracking.store import capture_exceptions

RULE = "CBR1_00000000000000000000"
RULE_2 = "CBR1_11111111111111111111"
DATE_1 = date(2026, 9, 30)
DATE_2 = date(2026, 10, 30)
DATE_3 = date(2026, 11, 30)


def _at(day: date, hour: int = 8) -> datetime:
    return datetime(day.year, day.month, day.day, hour, 0, tzinfo=UTC)


def _occurrence(
    *,
    rule: str = RULE,
    key_columns: dict[str, object] | None = None,
    order: list[str] | None = None,
    day: date = DATE_2,
    hour: int = 8,
    commentary: str | None = None,
) -> ExceptionOccurrence:
    return ExceptionOccurrence(
        exception_rule_identifier=rule,
        key_columns=key_columns or {"id": "ABC", "type": "123"},
        key_column_order=order or ["id", "type"],
        exception_timestamp=_at(day, hour),
        exception_commentary=commentary,
    )


def _repo(tmp_path: Path) -> ExceptionTrackingRepository:
    return ExceptionTrackingRepository(tmp_path / "exception_tracking.db")


def test_schema_has_all_ten_requested_columns(tmp_path: Path) -> None:
    db = tmp_path / "exception_tracking.db"
    record_exceptions(db, DATE_2, [_occurrence()])

    with sqlite3.connect(db) as connection:
        info = connection.execute(
            'PRAGMA table_info("exceptions_20261030")'
        ).fetchall()

    names = [row[1] for row in info]
    declared_types = {row[1]: row[2] for row in info}
    assert names == list(REQUIRED_COLUMNS)
    assert declared_types["exception_id"] == "TEXT"
    assert declared_types["exception_commentary"] == "TEXT"
    assert declared_types["exception_timestamp"] == "DATETIME"
    assert declared_types["exception_as_of_date"] == "DATE"
    assert declared_types["exception_first_seen_timestamp"] == "DATETIME"


def test_record_and_read_one_occurrence(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    summary = repo.record_exceptions(DATE_2, [_occurrence()])

    assert summary.inserted == 1
    assert summary.updated == 0
    assert summary.total == 1
    assert summary.exception_ids == (f"{RULE}_ABC_123",)

    records = repo.list_exceptions(DATE_2)
    assert len(records) == 1
    record = records[0]
    assert record.exception_id == f"{RULE}_ABC_123"
    assert record.exception_rule_identifier == RULE
    assert record.key_columns == '{"id":"ABC","type":"123"}'
    assert record.exception_timestamp == _at(DATE_2)
    assert record.exception_commentary == ""
    assert record.exception_as_of_date == DATE_2
    assert record.exception_first_seen_as_of_date == DATE_2
    assert record.exception_last_seen_as_of_date == DATE_2
    assert record.status == "New"
    assert record.key_column_pairs == (("id", "ABC"), ("type", "123"))


def test_list_dates_is_ascending_and_ignores_unrelated_tables(tmp_path: Path) -> None:
    db = tmp_path / "exception_tracking.db"
    repo = ExceptionTrackingRepository(db)
    repo.record_exceptions(DATE_2, [_occurrence(day=DATE_2)])
    repo.record_exceptions(DATE_1, [_occurrence(day=DATE_1)])

    with sqlite3.connect(db) as connection:
        connection.execute("CREATE TABLE unrelated (value TEXT)")
        connection.commit()

    assert repo.list_as_of_dates() == [DATE_1, DATE_2]
    assert list_as_of_dates(db) == [DATE_1, DATE_2]


def test_empty_date_table_is_created_and_remains_selectable(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    summary = repo.record_exceptions(DATE_2, [])

    assert summary.total == 0
    assert repo.list_as_of_dates() == [DATE_2]
    assert repo.list_exceptions(DATE_2) == []


def test_missing_database_reads_are_empty_and_do_not_create_a_file(tmp_path: Path) -> None:
    db = tmp_path / "missing" / "exception_tracking.db"
    repo = ExceptionTrackingRepository(db)

    assert repo.list_as_of_dates() == []
    assert repo.list_exceptions(DATE_2) == []
    assert repo.get_exception(DATE_2, f"{RULE}_ABC_123") is None
    assert repo.list_exception_history(f"{RULE}_ABC_123") == []
    assert not db.exists()


def test_duplicate_identity_in_one_capture_is_deduplicated(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    summary = repo.record_exceptions(
        DATE_2,
        [
            _occurrence(hour=8),
            _occurrence(hour=9),
        ],
    )

    assert summary.inserted == 1
    assert summary.updated == 0
    records = repo.list_exceptions(DATE_2)
    assert len(records) == 1
    assert records[0].exception_timestamp == _at(DATE_2, 9)


def test_duplicate_identity_with_conflicting_commentary_is_rejected(
    tmp_path: Path,
) -> None:
    repo = _repo(tmp_path)
    with pytest.raises(ExceptionTrackingError, match="Conflicting explicit commentary"):
        repo.record_exceptions(
            DATE_2,
            [
                _occurrence(commentary="first"),
                _occurrence(commentary="second"),
            ],
        )

    assert repo.list_as_of_dates() == []


def test_underscore_collision_within_one_capture_writes_nothing(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    with pytest.raises(ExceptionIdentityCollisionError) as excinfo:
        repo.record_exceptions(
            DATE_2,
            [
                _occurrence(key_columns={"a": "x_y", "b": "z"}, order=["a", "b"]),
                _occurrence(key_columns={"a": "x", "b": "y_z"}, order=["a", "b"]),
            ],
        )

    assert "Ambiguous exception identity" in str(excinfo.value)
    assert repo.list_as_of_dates() == []


def test_underscore_collision_across_dates_is_detected_and_rolled_back(
    tmp_path: Path,
) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(
        DATE_1,
        [_occurrence(day=DATE_1, key_columns={"a": "x_y", "b": "z"}, order=["a", "b"])],
    )

    with pytest.raises(ExceptionIdentityCollisionError):
        repo.record_exceptions(
            DATE_2,
            [_occurrence(day=DATE_2, key_columns={"a": "x", "b": "y_z"}, order=["a", "b"])],
        )

    assert repo.list_as_of_dates() == [DATE_1]
    assert repo.list_exceptions(DATE_2) == []


def test_null_missing_and_blank_keys_are_actionable_and_write_nothing(
    tmp_path: Path,
) -> None:
    repo = _repo(tmp_path)
    with pytest.raises(MissingKeyValueError, match="no value"):
        repo.record_exceptions(
            DATE_2,
            [_occurrence(key_columns={"id": None, "type": "123"})],
        )
    with pytest.raises(MissingKeyValueError, match="missing"):
        repo.record_exceptions(
            DATE_2,
            [_occurrence(key_columns={"id": "ABC"})],
        )
    with pytest.raises(MissingKeyValueError, match="blank"):
        repo.record_exceptions(
            DATE_2,
            [_occurrence(key_columns={"id": "", "type": "123"})],
        )

    assert repo.list_as_of_dates() == []


def test_unicode_and_composite_keys_are_stored_losslessly(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    summary = repo.record_exceptions(
        DATE_2,
        [
            _occurrence(
                key_columns={"编号": "café", "区域": "東"},
                order=["编号", "区域"],
            )
        ],
    )

    expected_id = f"{RULE}_café_東"
    assert summary.exception_ids == (expected_id,)
    record = repo.list_exceptions(DATE_2)[0]
    assert record.exception_id == expected_id
    assert record.key_columns == '{"编号":"café","区域":"東"}'
    assert record.key_column_pairs == (("编号", "café"), ("区域", "東"))


def test_configured_key_order_controls_id_and_representation(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(
        DATE_2,
        [
            _occurrence(
                key_columns={"id": "1", "type": "A"},
                order=["type", "id"],
            )
        ],
    )
    record = repo.list_exceptions(DATE_2)[0]
    assert record.exception_id == f"{RULE}_A_1"
    assert record.key_columns == '{"type":"A","id":"1"}'


def test_status_new_not_commented_commented_and_clear(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(DATE_1, [_occurrence(day=DATE_1)])
    repo.record_exceptions(DATE_2, [_occurrence(day=DATE_2)])

    first = repo.list_exceptions(DATE_1)[0]
    second = repo.list_exceptions(DATE_2)[0]
    assert first.status == "New"
    assert second.status == "NotCommented"

    repo.update_commentaries(DATE_1, {first.exception_id: "Known upstream defect"})
    assert repo.list_exceptions(DATE_1)[0].status == "Commented"

    repo.update_commentaries(DATE_1, {first.exception_id: ""})
    assert repo.list_exceptions(DATE_1)[0].status == "New"


def test_commentary_carries_forward_to_newer_dates(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(DATE_1, [_occurrence(day=DATE_1, commentary="known issue")])
    repo.record_exceptions(DATE_2, [_occurrence(day=DATE_2)])

    carried = repo.list_exceptions(DATE_2)[0]
    assert carried.exception_commentary == "known issue"
    assert carried.status == "Commented"


def test_explicit_clear_is_not_bypassed_by_older_commentary(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(DATE_1, [_occurrence(day=DATE_1, commentary="known issue")])
    repo.record_exceptions(DATE_2, [_occurrence(day=DATE_2, commentary="")])
    repo.record_exceptions(DATE_3, [_occurrence(day=DATE_3)])

    assert repo.list_exceptions(DATE_2)[0].exception_commentary == ""
    assert repo.list_exceptions(DATE_2)[0].status == "NotCommented"
    assert repo.list_exceptions(DATE_3)[0].exception_commentary == ""
    assert repo.list_exceptions(DATE_3)[0].status == "NotCommented"


def test_backdated_insert_does_not_copy_later_commentary(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(DATE_2, [_occurrence(day=DATE_2, commentary="later note")])
    repo.record_exceptions(DATE_1, [_occurrence(day=DATE_1)])

    first = repo.list_exceptions(DATE_1)[0]
    later = repo.list_exceptions(DATE_2)[0]
    assert first.exception_commentary == ""
    assert first.status == "New"
    assert later.exception_commentary == "later note"
    assert later.status == "Commented"


def test_explicit_commentary_edit_does_not_rewrite_later_existing_rows(
    tmp_path: Path,
) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(DATE_1, [_occurrence(day=DATE_1, commentary="old note")])
    repo.record_exceptions(DATE_2, [_occurrence(day=DATE_2, commentary="explicit later")])

    repo.update_commentaries(DATE_1, {f"{RULE}_ABC_123": "new earlier note"})

    assert repo.list_exceptions(DATE_1)[0].exception_commentary == "new earlier note"
    assert repo.list_exceptions(DATE_2)[0].exception_commentary == "explicit later"


def test_same_date_rerun_upserts_without_dropping_commentary_or_other_rows(
    tmp_path: Path,
) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(
        DATE_2,
        [
            _occurrence(),
            _occurrence(rule=RULE_2, key_columns={"id": "XYZ"}, order=["id"]),
        ],
    )
    repo.update_commentaries(DATE_2, {f"{RULE}_ABC_123": "keep me"})

    summary = repo.record_exceptions(DATE_2, [_occurrence(hour=11)])
    assert summary.inserted == 0
    assert summary.updated == 1

    records = repo.list_exceptions(DATE_2)
    assert len(records) == 2
    by_id = {record.exception_id: record for record in records}
    assert by_id[f"{RULE}_ABC_123"].exception_commentary == "keep me"
    assert by_id[f"{RULE}_ABC_123"].exception_timestamp == _at(DATE_2, 11)
    assert f"{RULE_2}_XYZ" in by_id


def test_rerun_timestamp_is_monotonic(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(DATE_2, [_occurrence(hour=10)])
    repo.record_exceptions(DATE_2, [_occurrence(hour=9)])

    record = repo.list_exceptions(DATE_2)[0]
    assert record.exception_timestamp == _at(DATE_2, 10)


def test_backdated_run_updates_history_metadata_in_every_table(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(DATE_2, [_occurrence(day=DATE_2, hour=10)])
    repo.record_exceptions(DATE_1, [_occurrence(day=DATE_1, hour=9)])

    for day in (DATE_1, DATE_2):
        record = repo.list_exceptions(day)[0]
        assert record.exception_first_seen_as_of_date == DATE_1
        assert record.exception_last_seen_as_of_date == DATE_2
        assert record.exception_first_seen_timestamp == _at(DATE_1, 9)
        assert record.exception_last_seen_timestamp == _at(DATE_2, 10)

    assert repo.list_exceptions(DATE_1)[0].status == "New"
    assert repo.list_exceptions(DATE_2)[0].status == "NotCommented"


def test_history_timestamps_use_min_and_max_capture_time_not_as_of_date(
    tmp_path: Path,
) -> None:
    repo = _repo(tmp_path)
    # The later as-of date is captured first; the backdated run is captured later.
    repo.record_exceptions(DATE_2, [_occurrence(day=DATE_2, hour=10)])
    repo.record_exceptions(
        DATE_1,
        [
            ExceptionOccurrence(
                exception_rule_identifier=RULE,
                key_columns={"id": "ABC", "type": "123"},
                key_column_order=["id", "type"],
                exception_timestamp=datetime(2026, 11, 1, 9, 0, tzinfo=UTC),
            )
        ],
    )

    record = repo.list_exceptions(DATE_2)[0]
    assert record.exception_first_seen_as_of_date == DATE_1
    assert record.exception_last_seen_as_of_date == DATE_2
    assert record.exception_first_seen_timestamp == _at(DATE_2, 10)
    assert record.exception_last_seen_timestamp == datetime(2026, 11, 1, 9, 0, tzinfo=UTC)


def test_reopen_persistence_and_history_lookup(tmp_path: Path) -> None:
    db = tmp_path / "exception_tracking.db"
    first = ExceptionTrackingRepository(db)
    first.record_exceptions(DATE_1, [_occurrence(day=DATE_1)])
    first.record_exceptions(DATE_2, [_occurrence(day=DATE_2)])
    first.update_commentaries(DATE_2, {f"{RULE}_ABC_123": "persisted"})

    reopened = ExceptionTrackingRepository(db)
    assert reopened.list_as_of_dates() == [DATE_1, DATE_2]
    history = reopened.list_exception_history(f"{RULE}_ABC_123")
    assert [record.exception_as_of_date for record in history] == [DATE_1, DATE_2]
    assert history[1].exception_commentary == "persisted"
    assert list_exception_history(db, f"{RULE}_ABC_123")[0].status == "New"


def test_unknown_commentary_ids_reject_the_whole_update(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(DATE_2, [_occurrence()])
    exception_id = f"{RULE}_ABC_123"
    repo.update_commentaries(DATE_2, {exception_id: "original"})

    with pytest.raises(UnknownExceptionError) as excinfo:
        repo.update_commentaries(
            DATE_2,
            {exception_id: "changed", f"{RULE}_UNKNOWN": "bad"},
        )

    assert excinfo.value.unknown_ids == (f"{RULE}_UNKNOWN",)
    assert repo.list_exceptions(DATE_2)[0].exception_commentary == "original"


def test_update_commentaries_on_missing_date_is_unknown(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(DATE_2, [_occurrence()])

    with pytest.raises(UnknownExceptionError):
        repo.update_commentaries(DATE_1, {f"{RULE}_ABC_123": "note"})


def test_record_rollback_on_metadata_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = _repo(tmp_path)

    def explode(
        connection: sqlite3.Connection, exception_ids: tuple[str, ...]
    ) -> None:
        raise RuntimeError("simulated metadata failure")

    monkeypatch.setattr(repo, "_recompute_history_metadata", explode)

    with pytest.raises(RuntimeError, match="simulated"):
        repo.record_exceptions(DATE_2, [_occurrence()])

    assert repo.list_as_of_dates() == []
    assert repo.list_exceptions(DATE_2) == []


def test_existing_table_with_missing_columns_is_rejected(tmp_path: Path) -> None:
    db = tmp_path / "exception_tracking.db"
    with sqlite3.connect(db) as connection:
        connection.execute(
            'CREATE TABLE "exceptions_20261030" (exception_id TEXT PRIMARY KEY)'
        )
        connection.commit()

    repo = ExceptionTrackingRepository(db)
    with pytest.raises(SchemaMismatchError, match="missing required columns"):
        repo.record_exceptions(DATE_2, [_occurrence()])


def test_existing_table_with_unexpected_columns_is_rejected(tmp_path: Path) -> None:
    db = tmp_path / "exception_tracking.db"
    columns = ",\n".join(f'"{column}" TEXT' for column in REQUIRED_COLUMNS)
    with sqlite3.connect(db) as connection:
        connection.execute(
            f'CREATE TABLE "exceptions_20261030" ({columns}, "unexpected" TEXT)'
        )
        connection.commit()

    repo = ExceptionTrackingRepository(db)
    with pytest.raises(SchemaMismatchError, match="unexpected columns"):
        repo.record_exceptions(DATE_2, [_occurrence()])


def test_read_rejects_a_date_table_with_the_wrong_schema(tmp_path: Path) -> None:
    db = tmp_path / "exception_tracking.db"
    with sqlite3.connect(db) as connection:
        connection.execute(
            'CREATE TABLE "exceptions_20261030" (exception_id TEXT PRIMARY KEY)'
        )
        connection.commit()

    repo = ExceptionTrackingRepository(db)
    with pytest.raises(SchemaMismatchError, match="missing required columns"):
        repo.list_exceptions(DATE_2)


def test_directory_path_is_rejected(tmp_path: Path) -> None:
    repo = ExceptionTrackingRepository(tmp_path)
    with pytest.raises(InvalidDatabasePathError, match="directory"):
        repo.record_exceptions(DATE_2, [_occurrence()])


def test_default_database_path_is_project_root_data(tmp_path: Path) -> None:
    assert default_database_path(tmp_path) == tmp_path / "data" / "exception_tracking.db"


def test_capture_exceptions_accepts_worker_c_payload(tmp_path: Path) -> None:
    db = tmp_path / "exception_tracking.db"
    summary = capture_exceptions(
        DATE_2,
        [
            {
                "exception_rule_identifier": RULE,
                "key_columns": (("id", "ABC"), ("type", "123")),
                "exception_timestamp": _at(DATE_2),
            }
        ],
        db_path=db,
    )

    assert summary.inserted == 1
    record = ExceptionTrackingRepository(db).list_exceptions(DATE_2)[0]
    assert record.exception_id == f"{RULE}_ABC_123"
    assert record.key_columns == '{"id":"ABC","type":"123"}'


def test_capture_exceptions_accepts_mapping_keys_and_explicit_order(
    tmp_path: Path,
) -> None:
    db = tmp_path / "exception_tracking.db"
    capture_exceptions(
        DATE_2,
        [
            {
                "exception_rule_identifier": RULE,
                "key_columns": {"type": "123", "id": "ABC"},
                "key_column_order": ["id", "type"],
                "exception_timestamp": _at(DATE_2),
            }
        ],
        db_path=db,
    )

    record = ExceptionTrackingRepository(db).list_exceptions(DATE_2)[0]
    assert record.exception_id == f"{RULE}_ABC_123"
    assert record.key_columns == '{"id":"ABC","type":"123"}'


def test_capture_exceptions_rejects_missing_rule_identifier(tmp_path: Path) -> None:
    with pytest.raises(Exception, match="exception_rule_identifier"):
        capture_exceptions(
            DATE_2,
            [{"key_columns": (("id", "ABC"),), "exception_timestamp": _at(DATE_2)}],
            db_path=tmp_path / "exception_tracking.db",
        )


def test_capture_exceptions_rejects_non_datetime_timestamp(tmp_path: Path) -> None:
    with pytest.raises(Exception, match="datetime"):
        capture_exceptions(
            DATE_2,
            [
                {
                    "exception_rule_identifier": RULE,
                    "key_columns": (("id", "ABC"),),
                    "exception_timestamp": "2026-10-30T08:00:00+00:00",
                }
            ],
            db_path=tmp_path / "exception_tracking.db",
        )


def test_capture_exceptions_preserves_null_key_for_actionable_error(
    tmp_path: Path,
) -> None:
    with pytest.raises(MissingKeyValueError, match="no value"):
        capture_exceptions(
            DATE_2,
            [
                {
                    "exception_rule_identifier": RULE,
                    "key_columns": (("id", None),),
                    "exception_timestamp": _at(DATE_2),
                }
            ],
            db_path=tmp_path / "exception_tracking.db",
        )


def test_corrupt_database_file_is_an_actionable_error(tmp_path: Path) -> None:
    db = tmp_path / "exception_tracking.db"
    db.write_text("this is not a sqlite database", encoding="utf-8")
    repo = ExceptionTrackingRepository(db)

    with pytest.raises(ExceptionTrackingError, match="unreadable"):
        repo.list_as_of_dates()


def test_unicode_database_path_round_trips(tmp_path: Path) -> None:
    db = tmp_path / "跟踪数据" / "exception_tracking.db"
    repo = ExceptionTrackingRepository(db)
    repo.record_exceptions(DATE_2, [_occurrence()])

    assert db.exists()
    assert repo.list_as_of_dates() == [DATE_2]
    assert repo.list_exceptions(DATE_2)[0].exception_id == f"{RULE}_ABC_123"


def test_invalid_date_never_becomes_a_table_name(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    with pytest.raises(InvalidAsOfDateError):
        repo.record_exceptions("2026-10-30; DROP TABLE exceptions_20261030", [])

    assert repo.list_as_of_dates() == []
