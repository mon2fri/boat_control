#!/usr/bin/env python3
"""Remove one As-of Date from a Boat Control exception tracking database."""

import argparse
import re
import sqlite3
import sys
import tempfile
from contextlib import closing
from datetime import UTC, date, datetime
from pathlib import Path

DATE_SELECTIONS = "exception_tracking_date_selections"
DATE_TABLE = re.compile(r"exceptions_([0-9]{8})")


def parse_date(value: str) -> date:
    if not re.fullmatch(r"[0-9]{8}", value):
        raise ValueError("Use YYYYMMDD for the As-of Date, for example 20261130.")
    return date.fromisoformat(f"{value[:4]}-{value[4:6]}-{value[6:]}")


def utc_sort_key(value: str) -> str:
    timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    return timestamp.astimezone(UTC).isoformat(timespec="microseconds")


def backup_database(db_path: Path) -> Path:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    # A separate reader sees the committed source while the write connection
    # holds its reserved lock. SQLite's backup also copies committed WAL data.
    with tempfile.NamedTemporaryFile(
        prefix=f"{db_path.name}.backup-{stamp}-",
        suffix=".db",
        dir=db_path.parent,
        delete=False,
    ) as file:
        backup_path = Path(file.name)

    try:
        with (
            closing(sqlite3.connect(f"{db_path.as_uri()}?mode=ro", uri=True)) as source,
            closing(sqlite3.connect(backup_path)) as destination,
        ):
            source.backup(destination)
    except BaseException:
        backup_path.unlink()
        raise
    return backup_path


def refresh_history(db: sqlite3.Connection, other_tables: list[str]) -> None:
    """Recompute first and last seen values for IDs from the removed date."""
    db.create_function("utc_sort_key", 1, utc_sort_key)
    db.execute(
        "CREATE TEMP TABLE remaining_occurrences "
        "(exception_id TEXT, as_of_date TEXT, timestamp TEXT)"
    )
    for table in other_tables:
        db.execute(f"""
            INSERT INTO remaining_occurrences
            SELECT exception_id, exception_as_of_date, utc_sort_key(exception_timestamp)
            FROM "{table}" JOIN affected_ids USING (exception_id)
        """)
    db.execute("""
        CREATE TEMP TABLE history (
            exception_id TEXT PRIMARY KEY,
            first_date TEXT, last_date TEXT, first_time TEXT, last_time TEXT
        )
    """)
    db.execute("""
        INSERT INTO history
        SELECT exception_id, MIN(as_of_date), MAX(as_of_date),
               MIN(timestamp), MAX(timestamp)
        FROM remaining_occurrences
        GROUP BY exception_id
    """)
    for table in other_tables:
        db.execute(f"""
            UPDATE "{table}"
            SET (exception_first_seen_as_of_date, exception_last_seen_as_of_date,
                 exception_first_seen_timestamp, exception_last_seen_timestamp) = (
                SELECT first_date, last_date, first_time, last_time
                FROM history WHERE history.exception_id = "{table}".exception_id
            )
            WHERE exception_id IN (SELECT exception_id FROM history)
        """)


def drop_date(db_path: Path, as_of_date: date, backup: bool) -> int | None:
    target = f"exceptions_{as_of_date.isoformat().replace('-', '')}"
    # mode=rw rejects missing files instead of creating a new database.
    uri = f"{db_path.as_uri()}?mode=rw"
    with closing(sqlite3.connect(uri, uri=True, timeout=30)) as db, db:
        db.execute("BEGIN IMMEDIATE")
        tables = {
            name for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        if target not in tables:
            return None

        # Check for Boat Control's columns before doing anything destructive.
        db.execute(f"""
            SELECT exception_id, exception_rule_identifier, key_columns,
                   exception_commentary, exception_as_of_date, exception_timestamp,
                   exception_first_seen_as_of_date, exception_last_seen_as_of_date,
                   exception_first_seen_timestamp, exception_last_seen_timestamp
            FROM "{target}" LIMIT 0
        """)
        if backup:
            backup_path = backup_database(db_path)
            print(f"Backup saved to {backup_path}", flush=True)

        db.execute("CREATE TEMP TABLE affected_ids (exception_id TEXT PRIMARY KEY)")
        count = db.execute(f'INSERT INTO affected_ids SELECT exception_id FROM "{target}"').rowcount
        db.execute(f'DROP TABLE "{target}"')
        if DATE_SELECTIONS in tables:
            db.execute(
                f"DELETE FROM {DATE_SELECTIONS} WHERE as_of_date = ?",
                (as_of_date.isoformat(),),
            )

        other_tables = sorted(
            name for name in tables if name != target and DATE_TABLE.fullmatch(name)
        )
        if count and other_tables:
            refresh_history(db, other_tables)
        return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("db_file", type=Path, help="Path to the exception tracking database.")
    parser.add_argument("as_of_date", metavar="YYYYMMDD", help="As-of Date to remove.")
    parser.add_argument(
        "backup",
        choices=("yes", "no"),
        type=str.lower,
        nargs="?",
        default="yes",
        help="Save a backup before removing the date (default: yes).",
    )
    args = parser.parse_args()
    try:
        as_of_date = parse_date(args.as_of_date)
    except ValueError as exc:
        parser.error(str(exc))

    try:
        db_path = args.db_file.expanduser().resolve(strict=True)
        if not db_path.is_file():
            raise ValueError(f"Expected a database file at {db_path}")
        count = drop_date(db_path, as_of_date, args.backup == "yes")
    except (OSError, RuntimeError, sqlite3.Error, ValueError) as exc:
        print(f"Could not remove {as_of_date}: {exc}", file=sys.stderr)
        return 1

    if count is None:
        print(f"No tracking table found for {as_of_date}. No changes made.")
    else:
        print(f"Removed {count} exception row(s) for {as_of_date}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
