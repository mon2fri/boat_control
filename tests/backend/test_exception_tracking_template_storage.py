"""Storage tests for persisted template-optimization context.

Covers ordered extra-column metadata, per-exception values, historical Rule
Index, legacy migration, later-added columns, reruns, backdated captures,
rollback, and restart retrieval.  All databases are isolated under ``tmp_path``.
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from apps.exception_tracking import repository as repository_module
from apps.exception_tracking.domain import ExceptionOccurrence
from apps.exception_tracking.errors import (
    ExceptionTrackingError,
    InvalidExtraColumnsError,
)
from apps.exception_tracking.repository import (
    DATE_COLUMNS_TABLE,
    EXTRA_COLUMNS_TABLE,
    LEGACY_COLUMNS,
    REQUIRED_COLUMNS,
    ExceptionTrackingRepository,
    get_extra_column_union,
    get_extra_columns,
    migrate_schema,
    record_exceptions,
)
from apps.exception_tracking.store import capture_exceptions

RULE = "CBR1_00000000000000000000"
RULE_2 = "CBR1_11111111111111111111"
DATE_1 = date(2026, 9, 30)
DATE_2 = date(2026, 10, 30)


def _at(day: date, hour: int = 8) -> datetime:
    return datetime(day.year, day.month, day.day, hour, 0, tzinfo=UTC)


def _occurrence(
    *,
    rule: str = RULE,
    key: str = "A",
    day: date = DATE_1,
    hour: int = 8,
    rule_index: str | None = None,
    extra_values: dict[str, object] | None = None,
    commentary: str | None = None,
) -> ExceptionOccurrence:
    return ExceptionOccurrence(
        exception_rule_identifier=rule,
        key_columns={"id": key},
        key_column_order=["id"],
        exception_timestamp=_at(day, hour),
        exception_commentary=commentary,
        exception_rule_index=rule_index,
        exception_extra_values=extra_values,
    )


def _repo(tmp_path: Path) -> ExceptionTrackingRepository:
    return ExceptionTrackingRepository(tmp_path / "exception_tracking.db")


def _create_legacy_table(db: Path, day: date, *, comment: str = "legacy note") -> str:
    table = f"exceptions_{day:%Y%m%d}"
    exception_id = f"{RULE}_LEGACY"
    columns = ", ".join(f'"{column}" TEXT' for column in LEGACY_COLUMNS)
    with sqlite3.connect(db) as connection:
        connection.execute(f'CREATE TABLE "{table}" ({columns})')
        connection.execute(
            f'INSERT INTO "{table}" VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (
                exception_id,
                RULE,
                '{"id":"LEGACY"}',
                _at(day).isoformat(),
                comment,
                day.isoformat(),
                day.isoformat(),
                day.isoformat(),
                _at(day).isoformat(),
                _at(day).isoformat(),
            ),
        )
        connection.commit()
    return exception_id


def test_rule_index_and_extra_values_round_trip(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    summary = repo.record_exceptions(
        DATE_1,
        [
            _occurrence(
                rule_index="R001",
                extra_values={"SEGMENT": "Retail", "SCORE": 42},
            )
        ],
        extra_columns=["SEGMENT", "SCORE"],
    )

    assert summary.extra_columns == ("SEGMENT", "SCORE")
    assert repo.get_extra_columns(DATE_1) == ("SEGMENT", "SCORE")
    assert repo.get_extra_column_union() == ("SEGMENT", "SCORE")
    record = repo.list_exceptions(DATE_1)[0]
    assert record.exception_rule_index == "R001"
    assert record.exception_extra_values == {"SEGMENT": "Retail", "SCORE": "42"}


def test_later_added_columns_are_empty_on_older_records(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(
        DATE_1,
        [_occurrence(day=DATE_1, extra_values={"SEGMENT": "Retail"})],
        extra_columns=["SEGMENT"],
    )
    repo.record_exceptions(
        DATE_2,
        [
            _occurrence(
                day=DATE_2,
                extra_values={"SEGMENT": "Wholesale", "REGION": "EMEA"},
            )
        ],
        extra_columns=["SEGMENT", "REGION"],
    )

    assert repo.get_extra_columns(DATE_1) == ("SEGMENT",)
    assert repo.get_extra_columns(DATE_2) == ("SEGMENT", "REGION")
    assert repo.get_extra_column_union() == ("SEGMENT", "REGION")
    older = repo.list_exceptions(DATE_1)[0]
    newer = repo.list_exceptions(DATE_2)[0]
    assert older.exception_extra_values == {"SEGMENT": "Retail"}
    assert "REGION" not in older.exception_extra_values
    assert newer.exception_extra_values == {
        "SEGMENT": "Wholesale",
        "REGION": "EMEA",
    }


def test_missing_values_are_not_fabricated(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(
        DATE_1,
        [_occurrence(extra_values={"SEGMENT": "Retail"})],
        extra_columns=["SEGMENT", "REGION"],
    )

    record = repo.list_exceptions(DATE_1)[0]
    assert record.exception_extra_values == {"SEGMENT": "Retail"}
    assert "REGION" not in record.exception_extra_values


def test_get_extra_values_fills_later_columns_with_empty_values(
    tmp_path: Path,
) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(
        DATE_1,
        [_occurrence(day=DATE_1, extra_values={"SEGMENT": "Retail"})],
        extra_columns=["SEGMENT"],
    )
    repo.record_exceptions(
        DATE_2,
        [
            _occurrence(
                day=DATE_2,
                extra_values={"SEGMENT": "Wholesale", "REGION": "EMEA"},
            )
        ],
        extra_columns=["SEGMENT", "REGION"],
    )

    older = repo.get_extra_values(
        DATE_1, columns=repo.get_extra_column_union()
    )
    assert older[f"{RULE}_A"] == {"SEGMENT": "Retail", "REGION": ""}
    # Without an explicit column list, the date's own recorded selection is used.
    assert repo.get_extra_values(DATE_1)[f"{RULE}_A"] == {"SEGMENT": "Retail"}


def test_empty_selection_adds_no_columns_and_preserves_stored_values(
    tmp_path: Path,
) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(
        DATE_1,
        [_occurrence(extra_values={"SEGMENT": "Retail", "SCORE": "1"})],
        extra_columns=["SEGMENT", "SCORE"],
    )
    repo.record_exceptions(DATE_1, [], extra_columns=[])

    assert repo.get_extra_columns(DATE_1) == ()
    assert repo.get_extra_column_union() == ("SEGMENT", "SCORE")
    record = repo.list_exceptions(DATE_1)[0]
    assert record.exception_extra_values == {"SEGMENT": "Retail", "SCORE": "1"}

    # A legacy-compatible None capture must preserve the explicit empty selection.
    repo.record_exceptions(
        DATE_1,
        [_occurrence(extra_values={"SEGMENT": "Updated"})],
        extra_columns=None,
    )
    assert repo.get_extra_columns(DATE_1) == ()
    assert repo.list_exceptions(DATE_1)[0].exception_extra_values == {
        "SEGMENT": "Updated",
        "SCORE": "1",
    }


@pytest.mark.parametrize(
    "columns",
    [
        ["Exception ID"],
        ["Exception Status"],
        ["Status"],
        ["Commentary"],
        ["Rule Index"],
        ["Exception Rule Identifier"],
        ["A", "a"],
        ["A", "A"],
        [" "],
        ["A", 1],
    ],
)
def test_invalid_extra_column_selections_are_rejected_atomically(
    tmp_path: Path, columns: list[object]
) -> None:
    repo = _repo(tmp_path)
    with pytest.raises(InvalidExtraColumnsError):
        repo.record_exceptions(DATE_1, [], extra_columns=columns)  # type: ignore[arg-type]

    assert repo.list_as_of_dates() == []
    assert repo.get_extra_column_union() == ()


def test_values_outside_explicit_selection_are_rejected_atomically(
    tmp_path: Path,
) -> None:
    repo = _repo(tmp_path)
    with pytest.raises(InvalidExtraColumnsError, match="outside"):
        repo.record_exceptions(
            DATE_1,
            [_occurrence(extra_values={"REGION": "EMEA"})],
            extra_columns=["SEGMENT"],
        )

    assert repo.list_as_of_dates() == []
    assert repo.get_extra_column_union() == ()


def test_value_keys_match_selected_names_case_insensitively(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(
        DATE_1,
        [_occurrence(extra_values={"segment": "Retail"})],
        extra_columns=["SEGMENT"],
    )

    record = repo.list_exceptions(DATE_1)[0]
    assert record.exception_extra_values == {"SEGMENT": "Retail"}


def test_newest_capture_rule_index_wins_on_same_date_rerun(
    tmp_path: Path,
) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(DATE_1, [_occurrence(rule_index=None)])
    assert repo.list_exceptions(DATE_1)[0].exception_rule_index == ""

    repo.record_exceptions(DATE_1, [_occurrence(rule_index="R001")])
    assert repo.list_exceptions(DATE_1)[0].exception_rule_index == "R001"

    repo.record_exceptions(DATE_1, [_occurrence(rule_index="R999")])
    assert repo.list_exceptions(DATE_1)[0].exception_rule_index == "R999"


def test_rule_index_precedence_uses_capture_time_not_occurrence_timestamp(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    capture_times = iter(
        [
            datetime(2026, 11, 1, 10, tzinfo=UTC),
            datetime(2026, 11, 1, 11, tzinfo=UTC),
            datetime(2026, 11, 1, 11, tzinfo=UTC),
            datetime(2026, 11, 1, 9, tzinfo=UTC),
        ]
    )
    monkeypatch.setattr(repository_module, "utc_now", lambda: next(capture_times))
    repo = _repo(tmp_path)

    repo.record_exceptions(
        DATE_1,
        [
            ExceptionOccurrence(
                exception_rule_identifier=RULE,
                key_columns={"id": "A"},
                key_column_order=["id"],
                exception_timestamp=datetime(2026, 11, 1, 8, tzinfo=UTC),
                exception_rule_index="R001",
            )
        ],
    )
    # The newer capture's occurrence timestamp is older, but its Rule Index wins.
    repo.record_exceptions(
        DATE_1,
        [
            ExceptionOccurrence(
                exception_rule_identifier=RULE,
                key_columns={"id": "A"},
                key_column_order=["id"],
                exception_timestamp=datetime(2026, 10, 30, 8, tzinfo=UTC),
                exception_rule_index="R002",
            )
        ],
    )
    assert repo.list_exceptions(DATE_1)[0].exception_rule_index == "R002"

    # If timestamps tie exactly, the later serialized write wins consistently.
    repo.record_exceptions(
        DATE_1,
        [
            ExceptionOccurrence(
                exception_rule_identifier=RULE,
                key_columns={"id": "A"},
                key_column_order=["id"],
                exception_timestamp=datetime(2026, 10, 29, 8, tzinfo=UTC),
                exception_rule_index="R003",
            )
        ],
    )
    assert repo.list_exceptions(DATE_1)[0].exception_rule_index == "R003"

    # An out-of-order older capture cannot replace the newer captured context,
    # even if its occurrence timestamp is later.
    repo.record_exceptions(
        DATE_1,
        [
            ExceptionOccurrence(
                exception_rule_identifier=RULE,
                key_columns={"id": "A"},
                key_column_order=["id"],
                exception_timestamp=datetime(2026, 11, 2, 8, tzinfo=UTC),
                exception_rule_index="R004",
            )
        ],
    )
    assert repo.list_exceptions(DATE_1)[0].exception_rule_index == "R003"


def test_rule_index_is_never_derived_from_catalog_order(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(
        DATE_1,
        [
            _occurrence(key="A", rule_index="R042"),
            _occurrence(rule=RULE_2, key="B", rule_index="R900"),
        ],
    )

    records = {record.exception_id: record for record in repo.list_exceptions(DATE_1)}
    assert records[f"{RULE}_A"].exception_rule_index == "R042"
    assert records[f"{RULE_2}_B"].exception_rule_index == "R900"


def test_same_date_rerun_merges_values_and_updates_selection(
    tmp_path: Path,
) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(
        DATE_1,
        [
            _occurrence(
                rule_index="R001",
                extra_values={"SEGMENT": "Retail"},
                commentary="known issue",
            )
        ],
        extra_columns=["SEGMENT"],
    )
    repo.record_exceptions(
        DATE_1,
        [
            _occurrence(
                rule_index="R999",
                extra_values={"SEGMENT": "Wholesale", "REGION": "EMEA"},
            )
        ],
        extra_columns=["SEGMENT", "REGION"],
    )

    record = repo.list_exceptions(DATE_1)[0]
    assert record.exception_rule_index == "R999"
    assert record.exception_commentary == "known issue"
    assert record.exception_extra_values == {
        "SEGMENT": "Wholesale",
        "REGION": "EMEA",
    }
    assert repo.get_extra_columns(DATE_1) == ("SEGMENT", "REGION")

    # Deselect REGION and omit SEGMENT: selection narrows but values persist.
    repo.record_exceptions(
        DATE_1,
        [_occurrence(rule_index="R999", extra_values={})],
        extra_columns=["SEGMENT"],
    )
    record = repo.list_exceptions(DATE_1)[0]
    assert record.exception_extra_values == {
        "SEGMENT": "Wholesale",
        "REGION": "EMEA",
    }
    assert repo.get_extra_columns(DATE_1) == ("SEGMENT",)


def test_backdated_capture_appends_new_columns_to_the_union(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(
        DATE_2,
        [_occurrence(day=DATE_2, extra_values={"LATE": "1"})],
        extra_columns=["LATE"],
    )
    # Captured later in wall-clock time but for an earlier as-of date.
    repo.record_exceptions(
        DATE_1,
        [_occurrence(day=DATE_1, extra_values={"EARLY": "2"})],
        extra_columns=["EARLY"],
    )

    assert repo.get_extra_column_union() == ("LATE", "EARLY")
    assert repo.get_extra_columns(DATE_1) == ("EARLY",)
    assert repo.get_extra_columns(DATE_2) == ("LATE",)


def test_legacy_table_reads_empty_context_and_first_write_migrates(
    tmp_path: Path,
) -> None:
    db = tmp_path / "exception_tracking.db"
    exception_id = _create_legacy_table(db, DATE_1, comment="legacy note")
    repo = ExceptionTrackingRepository(db)

    # Legacy rows are readable without rewriting the table.
    record = repo.list_exceptions(DATE_1)[0]
    assert record.exception_id == exception_id
    assert record.exception_commentary == "legacy note"
    assert record.exception_rule_index == ""
    assert record.exception_extra_values == {}
    assert repo.get_extra_columns(DATE_1) == ()
    with sqlite3.connect(db) as connection:
        before = [
            row[1]
            for row in connection.execute('PRAGMA table_info("exceptions_20260930")')
        ]
    assert before == list(LEGACY_COLUMNS)

    # A new capture migrates the legacy table and preserves old business values.
    repo.record_exceptions(
        DATE_1,
        [
            _occurrence(
                key="NEW",
                rule_index="R007",
                extra_values={"SEGMENT": "Retail"},
            )
        ],
        extra_columns=["SEGMENT"],
    )
    with sqlite3.connect(db) as connection:
        after = [
            row[1]
            for row in connection.execute('PRAGMA table_info("exceptions_20260930")')
        ]
    assert after == list(REQUIRED_COLUMNS)
    records = {record.exception_id: record for record in repo.list_exceptions(DATE_1)}
    assert records[exception_id].exception_commentary == "legacy note"
    assert records[exception_id].exception_rule_index == ""
    assert records[exception_id].exception_extra_values == {}
    assert records[f"{RULE}_NEW"].exception_rule_index == "R007"
    assert records[f"{RULE}_NEW"].exception_extra_values == {"SEGMENT": "Retail"}


def test_migrate_schema_upgrades_all_existing_tables(tmp_path: Path) -> None:
    db = tmp_path / "exception_tracking.db"
    _create_legacy_table(db, DATE_1)
    _create_legacy_table(db, DATE_2)
    repo = ExceptionTrackingRepository(db)

    repo.migrate_schema()

    with sqlite3.connect(db) as connection:
        for table in ("exceptions_20260930", "exceptions_20261030"):
            columns = [
                row[1]
                for row in connection.execute(f'PRAGMA table_info("{table}")')
            ]
            assert columns == list(REQUIRED_COLUMNS)
        metadata_tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    assert EXTRA_COLUMNS_TABLE in metadata_tables
    assert DATE_COLUMNS_TABLE in metadata_tables
    assert repo.get_extra_column_union() == ()
    assert repo.list_exceptions(DATE_1)[0].exception_commentary == "legacy note"


def test_partially_migrated_table_gains_only_the_missing_context_column(
    tmp_path: Path,
) -> None:
    db = tmp_path / "exception_tracking.db"
    _create_legacy_table(db, DATE_1)
    with sqlite3.connect(db) as connection:
        connection.execute(
            'ALTER TABLE "exceptions_20260930" ADD COLUMN '
            '"exception_rule_index" TEXT NOT NULL DEFAULT \'\''
        )
        connection.execute(
            'UPDATE "exceptions_20260930" SET "exception_rule_index" = \'R005\''
        )
        connection.commit()

    repo = ExceptionTrackingRepository(db)
    repo.migrate_schema()

    with sqlite3.connect(db) as connection:
        columns = [
            row[1]
            for row in connection.execute('PRAGMA table_info("exceptions_20260930")')
        ]
    assert columns == list(REQUIRED_COLUMNS)
    record = repo.list_exceptions(DATE_1)[0]
    assert record.exception_rule_index == "R005"
    assert record.exception_extra_values == {}

    # A migrated row has no capture-time marker, so the first new captured
    # value becomes authoritative without deriving anything from the catalog.
    repo.record_exceptions(DATE_1, [_occurrence(key="LEGACY", rule_index="R006")])
    assert repo.list_exceptions(DATE_1)[0].exception_rule_index == "R006"


def test_metadata_tables_are_not_available_as_of_dates(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(
        DATE_1,
        [_occurrence(extra_values={"SEGMENT": "Retail"})],
        extra_columns=["SEGMENT"],
    )

    assert repo.list_as_of_dates() == [DATE_1]


def test_restart_retrieval_keeps_selection_and_values(tmp_path: Path) -> None:
    db = tmp_path / "exception_tracking.db"
    first = ExceptionTrackingRepository(db)
    first.record_exceptions(
        DATE_1,
        [
            _occurrence(
                rule_index="R001",
                extra_values={"SEGMENT": "Retail", "SCORE": "9"},
            )
        ],
        extra_columns=["SEGMENT", "SCORE"],
    )

    reopened = ExceptionTrackingRepository(db)
    assert reopened.get_extra_columns(DATE_1) == ("SEGMENT", "SCORE")
    assert reopened.get_extra_column_union() == ("SEGMENT", "SCORE")
    record = reopened.list_exceptions(DATE_1)[0]
    assert record.exception_rule_index == "R001"
    assert record.exception_extra_values == {"SEGMENT": "Retail", "SCORE": "9"}


def test_capture_exceptions_payload_carries_context(tmp_path: Path) -> None:
    db = tmp_path / "exception_tracking.db"
    summary = capture_exceptions(
        DATE_1,
        [
            {
                "exception_rule_identifier": RULE,
                "key_columns": (("id", "A"),),
                "exception_timestamp": _at(DATE_1),
                "exception_rule_index": "R001",
                "exception_extra_values": {"SEGMENT": "Retail"},
            }
        ],
        db_path=db,
        extra_columns=["SEGMENT"],
    )

    assert summary.extra_columns == ("SEGMENT",)
    record = ExceptionTrackingRepository(db).list_exceptions(DATE_1)[0]
    assert record.exception_rule_index == "R001"
    assert record.exception_extra_values == {"SEGMENT": "Retail"}


def test_legacy_none_selection_infers_columns_from_values(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(
        DATE_1,
        [_occurrence(extra_values={"SEGMENT": "Retail", "REGION": "EMEA"})],
        extra_columns=None,
    )

    assert repo.get_extra_columns(DATE_1) == ("SEGMENT", "REGION")
    assert repo.get_extra_column_union() == ("SEGMENT", "REGION")


def test_inferred_selection_cannot_use_reserved_headers(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    with pytest.raises(InvalidExtraColumnsError, match="collides"):
        repo.record_exceptions(
            DATE_1,
            [_occurrence(extra_values={"Exception ID": "x"})],
            extra_columns=None,
        )

    assert repo.list_as_of_dates() == []
    assert repo.get_extra_column_union() == ()


def test_conflicting_rule_index_in_one_batch_is_rejected(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    with pytest.raises(ExceptionTrackingError, match="Conflicting historical Rule Index"):
        repo.record_exceptions(
            DATE_1,
            [
                _occurrence(rule_index="R001"),
                _occurrence(rule_index="R002"),
            ],
        )

    assert repo.list_as_of_dates() == []


def test_conflicting_extra_value_in_one_batch_is_rejected(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    with pytest.raises(ExceptionTrackingError, match="Conflicting values"):
        repo.record_exceptions(
            DATE_1,
            [
                _occurrence(extra_values={"SEGMENT": "Retail"}),
                _occurrence(extra_values={"SEGMENT": "Wholesale"}),
            ],
            extra_columns=["SEGMENT"],
        )

    assert repo.list_as_of_dates() == []


def test_unicode_values_and_dates_are_stored_losslessly(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    repo.record_exceptions(
        DATE_1,
        [
            _occurrence(
                extra_values={
                    "标签": "café",
                    "日期": date(2026, 9, 30),
                    "空值": None,
                }
            )
        ],
        extra_columns=["标签", "日期", "空值"],
    )

    record = repo.list_exceptions(DATE_1)[0]
    assert record.exception_extra_values == {
        "标签": "café",
        "日期": "2026-09-30",
        "空值": "",
    }
    with sqlite3.connect(tmp_path / "exception_tracking.db") as connection:
        stored = connection.execute(
            'SELECT exception_extra_values FROM "exceptions_20260930"'
        ).fetchone()[0]
    assert "café" in stored


def test_rollback_on_metadata_failure_removes_context(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = _repo(tmp_path)

    def explode(
        connection: sqlite3.Connection, exception_ids: tuple[str, ...]
    ) -> None:
        raise RuntimeError("simulated metadata failure")

    monkeypatch.setattr(repo, "_recompute_history_metadata", explode)

    with pytest.raises(RuntimeError, match="simulated"):
        repo.record_exceptions(
            DATE_1,
            [
                _occurrence(
                    rule_index="R001",
                    extra_values={"SEGMENT": "Retail"},
                )
            ],
            extra_columns=["SEGMENT"],
        )

    assert repo.list_as_of_dates() == []
    assert repo.get_extra_column_union() == ()
    assert repo.get_extra_columns(DATE_1) == ()


def test_missing_database_extra_context_reads_are_empty(tmp_path: Path) -> None:
    db = tmp_path / "missing" / "exception_tracking.db"
    repo = ExceptionTrackingRepository(db)

    assert repo.get_extra_columns(DATE_1) == ()
    assert repo.get_extra_column_union() == ()
    assert get_extra_columns(db) == ()
    assert get_extra_column_union(db) == ()
    assert not db.exists()


def test_migrate_schema_on_missing_database_is_a_noop(tmp_path: Path) -> None:
    db = tmp_path / "missing" / "exception_tracking.db"
    migrate_schema(db)
    assert not db.exists()


def test_module_level_record_accepts_extra_columns(tmp_path: Path) -> None:
    db = tmp_path / "exception_tracking.db"
    summary = record_exceptions(
        db,
        DATE_1,
        [_occurrence(extra_values={"SEGMENT": "Retail"})],
        extra_columns=["SEGMENT"],
    )

    assert summary.extra_columns == ("SEGMENT",)
    assert get_extra_columns(db, DATE_1) == ("SEGMENT",)
    assert get_extra_column_union(db) == ("SEGMENT",)
