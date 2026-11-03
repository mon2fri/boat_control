"""Transactional SQLite storage for exception tracking.

One database file holds one table per as-of date.  The repository is deliberately
independent of Django models and of the HTTP/workbook layers; Worker B injects a
resolved database path and Worker C injects occurrence payloads.

Identity and schema safety live in :mod:`apps.exception_tracking.identity`; this
module owns transactions, history maintenance, and commentary precedence.
"""

from __future__ import annotations

import importlib
import sqlite3
from collections.abc import Iterable, Iterator, Mapping, Sequence
from contextlib import contextmanager, suppress
from datetime import date, datetime
from pathlib import Path

from apps.exception_tracking.columns import (
    deserialize_column_selection,
    deserialize_extra_values,
    merge_extra_values,
    normalize_column_key,
    normalize_extra_values,
    serialize_column_selection,
    serialize_extra_values,
    validate_extra_columns,
    validate_selected_values,
)
from apps.exception_tracking.domain import (
    ExceptionOccurrence,
    ExceptionRecord,
    RecordingSummary,
    status_for,
)
from apps.exception_tracking.errors import (
    ExceptionTrackingError,
    InvalidDatabasePathError,
    SchemaMismatchError,
    UnknownExceptionError,
)
from apps.exception_tracking.identity import (
    ExceptionIdentity,
    build_exception_identity,
    collision_error,
    date_from_table_name,
    deserialize_key_columns,
    ensure_utc_timestamp,
    normalize_commentary,
    parse_as_of_date,
    parse_utc_timestamp,
    quote_identifier,
    table_name_for_date,
    utc_now,
)

DEFAULT_DATABASE_RELATIVE_PATH = Path("data") / "exception_tracking.db"

LEGACY_COLUMNS: tuple[str, ...] = (
    "exception_id",
    "exception_rule_identifier",
    "key_columns",
    "exception_timestamp",
    "exception_commentary",
    "exception_as_of_date",
    "exception_first_seen_as_of_date",
    "exception_last_seen_as_of_date",
    "exception_first_seen_timestamp",
    "exception_last_seen_timestamp",
)

CONTEXT_COLUMNS: tuple[str, ...] = (
    "exception_rule_index",
    "exception_extra_values",
)

REQUIRED_COLUMNS: tuple[str, ...] = (*LEGACY_COLUMNS, *CONTEXT_COLUMNS)

EXTRA_COLUMNS_TABLE = "exception_tracking_extra_columns"
DATE_COLUMNS_TABLE = "exception_tracking_date_selections"

_CREATE_TABLE_SQL = """
CREATE TABLE {table} (
    exception_id TEXT PRIMARY KEY NOT NULL,
    exception_rule_identifier TEXT NOT NULL,
    key_columns TEXT NOT NULL,
    exception_timestamp DATETIME NOT NULL,
    exception_commentary TEXT NOT NULL DEFAULT '',
    exception_as_of_date DATE NOT NULL,
    exception_first_seen_as_of_date DATE NOT NULL,
    exception_last_seen_as_of_date DATE NOT NULL,
    exception_first_seen_timestamp DATETIME NOT NULL,
    exception_last_seen_timestamp DATETIME NOT NULL,
    exception_rule_index TEXT NOT NULL DEFAULT '',
    exception_extra_values TEXT NOT NULL DEFAULT '{{}}'
)
"""

_CREATE_EXTRA_COLUMNS_SQL = """
CREATE TABLE IF NOT EXISTS exception_tracking_extra_columns (
    column_name TEXT PRIMARY KEY,
    column_order INTEGER NOT NULL UNIQUE,
    first_seen_at TEXT NOT NULL
)
"""

_CREATE_DATE_COLUMNS_SQL = """
CREATE TABLE IF NOT EXISTS exception_tracking_date_selections (
    as_of_date TEXT PRIMARY KEY,
    columns_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""

_CONTEXT_COLUMN_SQL: dict[str, str] = {
    "exception_rule_index": "TEXT NOT NULL DEFAULT ''",
    "exception_extra_values": "TEXT NOT NULL DEFAULT '{}'",
}

_SQLITE_TIMEOUT_SECONDS = 30
_ID_CHUNK_SIZE = 400


def default_database_path(project_root: str | Path) -> Path:
    """Return the documented default tracking database path for a project root."""

    return Path(project_root).expanduser() / DEFAULT_DATABASE_RELATIVE_PATH


def _project_root() -> Path:
    # repository.py -> exception_tracking -> apps -> backend -> project root
    return Path(__file__).resolve().parents[3]


def _resolve_database_path(database_path: str | Path | None) -> Path:
    if database_path is not None:
        return Path(database_path).expanduser()
    # Worker B owns the setting.  Try its resolver lazily so this module remains
    # importable without Django and so tests can inject a path directly.
    try:
        settings_services = importlib.import_module("apps.settings.services")
    except Exception:
        return default_database_path(_project_root())
    resolver = getattr(settings_services, "get_exception_tracking_path", None)
    if not callable(resolver):
        return default_database_path(_project_root())
    try:
        resolved = resolver()
    except Exception:
        return default_database_path(_project_root())
    return Path(resolved).expanduser()


def resolve_database_path(database_path: str | Path | None = None) -> Path:
    """Resolve an injected path, Worker B's setting, or the project default.

    Production callers should pass the already-resolved path; this helper exists
    for Worker C's adapter and for direct service use.
    """

    return _resolve_database_path(database_path)


def _chunks(values: Sequence[str], size: int = _ID_CHUNK_SIZE) -> Iterator[Sequence[str]]:
    for start in range(0, len(values), size):
        yield values[start : start + size]


def _placeholders(count: int) -> str:
    return ",".join("?" for _ in range(count))


def _text(row: sqlite3.Row, column: str) -> str:
    value = row[column]
    if not isinstance(value, str):
        raise ExceptionTrackingError(
            f"Stored exception tracking column '{column}' is not text; the database "
            "is corrupt."
        )
    return value


def _optional_text(row: sqlite3.Row, column: str, default: str) -> str:
    keys = row.keys()
    if column not in keys:
        return default
    value = row[column]
    if value is None:
        return default
    if not isinstance(value, str):
        raise ExceptionTrackingError(
            f"Stored exception tracking column '{column}' is not text; the database "
            "is corrupt."
        )
    return value


def _rule_index_text(row: sqlite3.Row) -> str:
    return _optional_text(row, "exception_rule_index", "")


def _extra_values_text(row: sqlite3.Row) -> str:
    return _optional_text(row, "exception_extra_values", "{}")


def _commentary_text(row: sqlite3.Row) -> str:
    value = row["exception_commentary"]
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ExceptionTrackingError(
            "Stored exception_commentary is not text; the tracking database is corrupt."
        )
    return value


def _same_key_columns(left: str, right: str) -> bool:
    if left == right:
        return True
    try:
        return deserialize_key_columns(left) == deserialize_key_columns(right)
    except ExceptionTrackingError:
        return False


def _date_tables(connection: sqlite3.Connection) -> list[tuple[date, str]]:
    rows = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).fetchall()
    tables: list[tuple[date, str]] = []
    for row in rows:
        name = _text(row, "name")
        parsed = date_from_table_name(name)
        if parsed is not None:
            tables.append((parsed, name))
    tables.sort(key=lambda item: item[0])
    return tables


def _table_exists(connection: sqlite3.Connection, name: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)
    ).fetchone()
    return row is not None


def _table_columns(connection: sqlite3.Connection, name: str) -> set[str]:
    quoted = quote_identifier(name)
    rows = connection.execute(f"PRAGMA table_info({quoted})").fetchall()
    return {_text(row, "name") for row in rows}


def _schema_error(name: str, details: list[str]) -> SchemaMismatchError:
    return SchemaMismatchError(
        f"Exception tracking table '{name}' does not match the required schema "
        f"({'; '.join(details)}). Repair or recreate the tracking database; no "
        "rows were written."
    )


def _validate_date_table(
    connection: sqlite3.Connection,
    name: str,
    *,
    require_current: bool = False,
) -> None:
    """Validate a date table.

    Reads accept the original ten-column schema so existing databases remain
    readable.  Writes require the two context columns and migrate legacy tables
    first.
    """

    present = _table_columns(connection, name)
    missing_base = [column for column in LEGACY_COLUMNS if column not in present]
    unknown = sorted(present - set(REQUIRED_COLUMNS))
    missing_context = [column for column in CONTEXT_COLUMNS if column not in present]
    if missing_base or unknown or (require_current and missing_context):
        details: list[str] = []
        if missing_base:
            details.append(f"missing required columns: {', '.join(missing_base)}")
        if unknown:
            details.append(f"unexpected columns: {', '.join(unknown)}")
        if require_current and missing_context:
            details.append(f"missing context columns: {', '.join(missing_context)}")
        raise _schema_error(name, details)


def _migrate_date_table(connection: sqlite3.Connection, name: str) -> None:
    """Add template-optimization context columns to a legacy date table."""

    present = _table_columns(connection, name)
    missing_base = [column for column in LEGACY_COLUMNS if column not in present]
    unknown = sorted(present - set(REQUIRED_COLUMNS))
    if missing_base or unknown:
        details: list[str] = []
        if missing_base:
            details.append(f"missing required columns: {', '.join(missing_base)}")
        if unknown:
            details.append(f"unexpected columns: {', '.join(unknown)}")
        raise _schema_error(name, details)

    quoted = quote_identifier(name)
    for column in CONTEXT_COLUMNS:
        if column not in present:
            connection.execute(
                f"ALTER TABLE {quoted} ADD COLUMN "
                f"{quote_identifier(column)} {_CONTEXT_COLUMN_SQL[column]}"
            )
    _validate_date_table(connection, name, require_current=True)


def _ensure_date_table(connection: sqlite3.Connection, as_of_date: date) -> str:
    name = table_name_for_date(as_of_date)
    quoted = quote_identifier(name)
    if not _table_exists(connection, name):
        connection.execute(_CREATE_TABLE_SQL.format(table=quoted))
    else:
        _migrate_date_table(connection, name)
    _validate_date_table(connection, name, require_current=True)
    return name


def _ensure_metadata_tables(connection: sqlite3.Connection) -> None:
    connection.execute(_CREATE_EXTRA_COLUMNS_SQL)
    connection.execute(_CREATE_DATE_COLUMNS_SQL)


def _date_extra_columns(
    connection: sqlite3.Connection, as_of_date: date
) -> tuple[str, ...]:
    if not _table_exists(connection, DATE_COLUMNS_TABLE):
        return ()
    row = connection.execute(
        f"SELECT columns_json FROM {quote_identifier(DATE_COLUMNS_TABLE)} "
        "WHERE as_of_date = ?",
        (as_of_date.isoformat(),),
    ).fetchone()
    if row is None:
        return ()
    return deserialize_column_selection(_text(row, "columns_json"))


def _has_date_selection(connection: sqlite3.Connection, as_of_date: date) -> bool:
    if not _table_exists(connection, DATE_COLUMNS_TABLE):
        return False
    row = connection.execute(
        f"SELECT 1 FROM {quote_identifier(DATE_COLUMNS_TABLE)} WHERE as_of_date = ?",
        (as_of_date.isoformat(),),
    ).fetchone()
    return row is not None


def _record_extra_columns(
    connection: sqlite3.Connection,
    as_of_date: date,
    columns: Sequence[str],
    first_seen_at: datetime,
) -> None:
    """Replace one date's ordered selection and register new column names."""

    _ensure_metadata_tables(connection)
    registry = quote_identifier(EXTRA_COLUMNS_TABLE)
    selections = quote_identifier(DATE_COLUMNS_TABLE)
    for column in columns:
        row = connection.execute(
            f"SELECT column_order FROM {registry} WHERE column_name = ?",
            (column,),
        ).fetchone()
        if row is None:
            next_row = connection.execute(
                f"SELECT COALESCE(MAX(column_order), 0) + 1 FROM {registry}"
            ).fetchone()
            assert next_row is not None
            next_order = int(next_row[0])
            connection.execute(
                f"INSERT INTO {registry} (column_name, column_order, first_seen_at) "
                "VALUES (?, ?, ?)",
                (column, next_order, first_seen_at.isoformat()),
            )
    connection.execute(
        f"INSERT INTO {selections} (as_of_date, columns_json, updated_at) "
        "VALUES (?, ?, ?) ON CONFLICT(as_of_date) DO UPDATE SET "
        "columns_json = excluded.columns_json, updated_at = excluded.updated_at",
        (
            as_of_date.isoformat(),
            serialize_column_selection(columns),
            first_seen_at.isoformat(),
        ),
    )


def _row_to_record(row: sqlite3.Row, table_date: date) -> ExceptionRecord:
    stored_date = parse_as_of_date(_text(row, "exception_as_of_date"))
    if stored_date != table_date:
        raise ExceptionTrackingError(
            f"Exception row in table '{table_name_for_date(table_date)}' has as-of "
            f"date {stored_date.isoformat()}; the tracking database is corrupt."
        )
    first_seen_date = parse_as_of_date(_text(row, "exception_first_seen_as_of_date"))
    last_seen_date = parse_as_of_date(_text(row, "exception_last_seen_as_of_date"))
    commentary = _commentary_text(row)
    return ExceptionRecord(
        exception_id=_text(row, "exception_id"),
        exception_rule_identifier=_text(row, "exception_rule_identifier"),
        key_columns=_text(row, "key_columns"),
        exception_timestamp=parse_utc_timestamp(_text(row, "exception_timestamp")),
        exception_commentary=commentary,
        exception_rule_index=_rule_index_text(row),
        exception_extra_values=deserialize_extra_values(_extra_values_text(row)),
        exception_as_of_date=stored_date,
        exception_first_seen_as_of_date=first_seen_date,
        exception_last_seen_as_of_date=last_seen_date,
        exception_first_seen_timestamp=parse_utc_timestamp(
            _text(row, "exception_first_seen_timestamp")
        ),
        exception_last_seen_timestamp=parse_utc_timestamp(
            _text(row, "exception_last_seen_timestamp")
        ),
        status=status_for(
            commentary,
            as_of_date=stored_date,
            first_seen_as_of_date=first_seen_date,
        ),
    )


class ExceptionTrackingRepository:
    """Open, read, and transactionally update one exception-tracking database."""

    def __init__(self, database_path: str | Path) -> None:
        if not isinstance(database_path, (str, Path)):
            raise InvalidDatabasePathError(
                "Exception tracking database path must be a string or pathlib.Path."
            )
        text = str(database_path).strip()
        if not text:
            raise InvalidDatabasePathError(
                "Exception tracking database path must not be empty. Configure a "
                "usable file path in Settings."
            )
        self._path = Path(database_path).expanduser()

    @property
    def database_path(self) -> Path:
        return self._path

    def _prepare_write_path(self) -> None:
        if self._path.exists() and self._path.is_dir():
            raise InvalidDatabasePathError(
                f"Exception tracking database path '{self._path}' is a directory. "
                "Choose a file path such as data/exception_tracking.db."
            )
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise InvalidDatabasePathError(
                f"Cannot create the parent directory for exception tracking database "
                f"'{self._path}': {exc}. Choose a writable path in Settings."
            ) from exc

    def _open(self) -> sqlite3.Connection:
        try:
            connection = sqlite3.connect(
                str(self._path),
                timeout=_SQLITE_TIMEOUT_SECONDS,
                isolation_level=None,
            )
        except sqlite3.Error as exc:
            raise InvalidDatabasePathError(
                f"Cannot open exception tracking database '{self._path}': {exc}. "
                "Choose a writable file path in Settings."
            ) from exc
        connection.row_factory = sqlite3.Row
        try:
            connection.execute("PRAGMA busy_timeout = 30000")
        except sqlite3.DatabaseError as exc:
            connection.close()
            raise ExceptionTrackingError(
                f"Exception tracking database '{self._path}' is unreadable: {exc}. "
                "Repair the file or choose a different path in Settings."
            ) from exc
        return connection

    @contextmanager
    def _read_connection(self) -> Iterator[sqlite3.Connection]:
        connection = self._open()
        try:
            yield connection
        except sqlite3.DatabaseError as exc:
            raise ExceptionTrackingError(
                f"Exception tracking database '{self._path}' is unreadable: {exc}. "
                "Repair the file or choose a different path in Settings."
            ) from exc
        finally:
            connection.close()

    @contextmanager
    def _write_connection(self) -> Iterator[sqlite3.Connection]:
        self._prepare_write_path()
        connection = self._open()
        try:
            connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.execute("COMMIT")
        except BaseException as exc:
            with suppress(sqlite3.Error):
                connection.execute("ROLLBACK")
            if isinstance(exc, sqlite3.DatabaseError):
                raise ExceptionTrackingError(
                    f"Exception tracking database '{self._path}' could not be "
                    f"updated: {exc}. No partial write was committed."
                ) from exc
            raise
        finally:
            connection.close()

    # ------------------------------------------------------------------ reads

    def list_as_of_dates(self) -> list[date]:
        """Return ascending as-of dates that have a valid date table."""

        if not self._path.exists():
            return []
        with self._read_connection() as connection:
            return sorted(parsed for parsed, _ in _date_tables(connection))

    def get_extra_columns(
        self, as_of_date: date | str | None = None
    ) -> tuple[str, ...]:
        """Return an ordered extra-column selection.

        With a date, return that date's recorded selection.  Without a date,
        return the stable all-time schema union ordered by first capture
        appearance.  A legacy database without metadata returns ``()``.
        """

        if as_of_date is not None:
            parsed_date: date | None = parse_as_of_date(as_of_date)
        else:
            parsed_date = None
        if not self._path.exists():
            return ()
        with self._read_connection() as connection:
            if not _table_exists(connection, EXTRA_COLUMNS_TABLE):
                return ()
            if parsed_date is None:
                rows = connection.execute(
                    f"SELECT column_name FROM {quote_identifier(EXTRA_COLUMNS_TABLE)} "
                    "ORDER BY column_order"
                ).fetchall()
                return tuple(_text(row, "column_name") for row in rows)
            return _date_extra_columns(connection, parsed_date)

    def get_extra_column_union(self) -> tuple[str, ...]:
        """Return all columns ever selected, in stable first-seen order."""

        return self.get_extra_columns(None)

    def get_extra_values(
        self,
        as_of_date: date | str,
        columns: Sequence[str] | None = None,
    ) -> dict[str, dict[str, str]]:
        """Return selected values per exception, filling missing columns with ``""``.

        With ``columns=None`` the date's recorded ordered selection is used.  B
        may pass the current configuration selection or
        ``get_extra_column_union()`` to render columns introduced on later dates
        as empty on older records.
        """

        parsed_date = parse_as_of_date(as_of_date)
        selected = (
            tuple(columns)
            if columns is not None
            else self.get_extra_columns(parsed_date)
        )
        result: dict[str, dict[str, str]] = {}
        for record in self.list_exceptions(parsed_date):
            by_key = {
                normalize_column_key(name): value
                for name, value in record.exception_extra_values.items()
            }
            result[record.exception_id] = {
                column: by_key.get(normalize_column_key(column), "")
                for column in selected
            }
        return result

    def migrate_schema(self) -> None:
        """Explicitly upgrade every existing date table and metadata schema.

        Reads remain compatible with legacy tables; this method is for callers
        that want a one-time upgrade instead of the lazy write-time migration.
        """

        if not self._path.exists():
            return
        with self._write_connection() as connection:
            _ensure_metadata_tables(connection)
            for _, table in _date_tables(connection):
                _migrate_date_table(connection, table)

    def list_exceptions(self, as_of_date: date | str) -> list[ExceptionRecord]:
        """Return one date's occurrences sorted by literal exception ID."""

        parsed_date = parse_as_of_date(as_of_date)
        if not self._path.exists():
            return []
        with self._read_connection() as connection:
            table = table_name_for_date(parsed_date)
            if not _table_exists(connection, table):
                return []
            _validate_date_table(connection, table)
            rows = connection.execute(
                f"SELECT * FROM {quote_identifier(table)} ORDER BY exception_id"
            ).fetchall()
            return [_row_to_record(row, parsed_date) for row in rows]

    def get_exception(
        self, as_of_date: date | str, exception_id: str
    ) -> ExceptionRecord | None:
        """Return one occurrence for a date, or ``None`` when absent."""

        parsed_date = parse_as_of_date(as_of_date)
        if not self._path.exists():
            return None
        with self._read_connection() as connection:
            table = table_name_for_date(parsed_date)
            if not _table_exists(connection, table):
                return None
            _validate_date_table(connection, table)
            row = connection.execute(
                f"SELECT * FROM {quote_identifier(table)} WHERE exception_id = ?",
                (exception_id,),
            ).fetchone()
            return None if row is None else _row_to_record(row, parsed_date)

    def list_exception_history(self, exception_id: str) -> list[ExceptionRecord]:
        """Return every stored occurrence of one ID in chronological order."""

        if not self._path.exists():
            return []
        records: list[ExceptionRecord] = []
        with self._read_connection() as connection:
            for table_date, table in _date_tables(connection):
                _validate_date_table(connection, table)
                row = connection.execute(
                    f"SELECT * FROM {quote_identifier(table)} WHERE exception_id = ?",
                    (exception_id,),
                ).fetchone()
                if row is not None:
                    records.append(_row_to_record(row, table_date))
        return records

    # ----------------------------------------------------------------- writes

    def update_commentaries(
        self, as_of_date: date | str, updates: Mapping[str, str]
    ) -> int:
        """Atomically set/clear commentary for IDs on one as-of date.

        ``""`` clears commentary; a nonblank string sets it.  Unknown IDs reject
        the whole call with :class:`UnknownExceptionError`; no partial update is
        committed.  Returns the number of rows whose stored commentary changed.
        """

        parsed_date = parse_as_of_date(as_of_date)
        if not isinstance(updates, Mapping):
            raise ExceptionTrackingError(
                "Commentary updates must be a mapping of exception IDs to text."
            )
        if not updates:
            return 0

        normalized: dict[str, str] = {}
        for exception_id, commentary in updates.items():
            if not isinstance(exception_id, str) or not exception_id:
                raise ExceptionTrackingError(
                    "Commentary update keys must be non-empty exception IDs."
                )
            if not isinstance(commentary, str):
                raise ExceptionTrackingError(
                    f"Commentary for exception '{exception_id}' must be text; use an "
                    "empty string to clear it."
                )
            value = normalize_commentary(commentary)
            assert value is not None
            normalized[exception_id] = value

        if not self._path.exists():
            raise UnknownExceptionError(
                f"No exception tracking data exists for {parsed_date.isoformat()}; "
                f"unknown exception IDs: {', '.join(sorted(normalized))}.",
                unknown_ids=list(normalized),
            )

        with self._write_connection() as connection:
            table = table_name_for_date(parsed_date)
            if not _table_exists(connection, table):
                raise UnknownExceptionError(
                    f"No exception tracking table exists for "
                    f"{parsed_date.isoformat()}; unknown exception IDs: "
                    f"{', '.join(sorted(normalized))}.",
                    unknown_ids=list(normalized),
                )
            _validate_date_table(connection, table)

            existing: dict[str, str] = {}
            ids = list(normalized)
            quoted = quote_identifier(table)
            for chunk in _chunks(ids):
                rows = connection.execute(
                    f"SELECT exception_id, exception_commentary FROM {quoted} "
                    f"WHERE exception_id IN ({_placeholders(len(chunk))})",
                    tuple(chunk),
                ).fetchall()
                for row in rows:
                    existing[_text(row, "exception_id")] = _commentary_text(row)

            unknown = [exception_id for exception_id in normalized if exception_id not in existing]
            if unknown:
                raise UnknownExceptionError(
                    f"The commentary update contains exception IDs that are not "
                    f"present on {parsed_date.isoformat()}: {', '.join(sorted(unknown))}. "
                    "No commentary was changed.",
                    unknown_ids=unknown,
                )

            changed = 0
            for exception_id, commentary in normalized.items():
                if commentary == existing[exception_id]:
                    continue
                connection.execute(
                    f"UPDATE {quoted} SET exception_commentary = ? "
                    "WHERE exception_id = ?",
                    (commentary, exception_id),
                )
                changed += 1
            return changed

    def record_exceptions(
        self,
        as_of_date: date | str,
        occurrences: Iterable[ExceptionOccurrence],
        *,
        extra_columns: Sequence[str] | None = None,
    ) -> RecordingSummary:
        """Upsert one run's occurrences for an as-of date in one transaction.

        The date table is created even when ``occurrences`` is empty so an empty
        date remains selectable.  Existing rows are updated monotonically; no
        historical row is deleted and omitted exceptions remain untouched.
        ``extra_columns`` is the ordered Extra Columns for Commentary Template
        selection; ``None`` preserves an existing date selection or infers one
        from supplied values for legacy callers.
        """

        parsed_date = parse_as_of_date(as_of_date)
        captured_at = utc_now()
        explicit_columns = (
            None if extra_columns is None else validate_extra_columns(extra_columns)
        )
        prepared: dict[str, _PreparedOccurrence] = {}
        for occurrence in occurrences:
            if not isinstance(occurrence, ExceptionOccurrence):
                raise ExceptionTrackingError(
                    "record_exceptions accepts ExceptionOccurrence values only."
                )
            identity = build_exception_identity(
                occurrence.exception_rule_identifier,
                occurrence.key_columns,
                occurrence.key_column_order,
            )
            timestamp = (
                captured_at
                if occurrence.exception_timestamp is None
                else ensure_utc_timestamp(occurrence.exception_timestamp)
            )
            commentary = normalize_commentary(occurrence.exception_commentary)
            rule_index = _normalize_rule_index(occurrence.exception_rule_index)
            raw_values = occurrence.exception_extra_values or {}
            values = (
                validate_selected_values(raw_values, explicit_columns)
                if explicit_columns is not None
                else normalize_extra_values(raw_values)
            )

            previous = prepared.get(identity.exception_id)
            if previous is None:
                prepared[identity.exception_id] = _PreparedOccurrence(
                    identity=identity,
                    timestamp=timestamp,
                    commentary=commentary,
                    rule_index=rule_index,
                    extra_values=values,
                )
                continue

            if (
                previous.identity.exception_rule_identifier
                != identity.exception_rule_identifier
                or previous.identity.key_columns_json != identity.key_columns_json
            ):
                raise collision_error(
                    identity,
                    existing_rule_identifier=previous.identity.exception_rule_identifier,
                    existing_key_columns=previous.identity.key_columns_json,
                )

            prepared[identity.exception_id] = _PreparedOccurrence(
                identity=identity,
                timestamp=max(previous.timestamp, timestamp),
                commentary=_merge_commentary(
                    previous.commentary,
                    commentary,
                    exception_id=identity.exception_id,
                ),
                rule_index=_merge_batch_rule_index(
                    previous.rule_index,
                    rule_index,
                    exception_id=identity.exception_id,
                ),
                extra_values=_merge_batch_extra_values(
                    previous.extra_values,
                    values,
                    exception_id=identity.exception_id,
                ),
            )

        inferred_columns = (
            ()
            if explicit_columns is not None
            else validate_extra_columns(_infer_extra_columns(prepared))
        )

        with self._write_connection() as connection:
            table = _ensure_date_table(connection, parsed_date)
            _ensure_metadata_tables(connection)
            self._assert_no_identity_conflicts(connection, prepared)

            existing_columns = _date_extra_columns(connection, parsed_date)
            has_selection = _has_date_selection(connection, parsed_date)
            if explicit_columns is not None:
                effective_columns = explicit_columns
                _record_extra_columns(
                    connection, parsed_date, effective_columns, captured_at
                )
            elif has_selection:
                effective_columns = existing_columns
            else:
                if inferred_columns:
                    effective_columns = inferred_columns
                    _record_extra_columns(
                        connection, parsed_date, effective_columns, captured_at
                    )
                else:
                    effective_columns = ()

            quoted = quote_identifier(table)
            inserted = 0
            updated = 0

            for exception_id, item in prepared.items():
                row = connection.execute(
                    f"SELECT * FROM {quoted} WHERE exception_id = ?",
                    (exception_id,),
                ).fetchone()
                if row is not None:
                    existing_timestamp = parse_utc_timestamp(
                        _text(row, "exception_timestamp")
                    )
                    new_timestamp = max(existing_timestamp, item.timestamp)
                    new_commentary = (
                        _commentary_text(row)
                        if item.commentary is None
                        else item.commentary
                    )
                    new_rule_index = _rule_index_text(row) or (item.rule_index or "")
                    new_extra_values = merge_extra_values(
                        deserialize_extra_values(_extra_values_text(row)),
                        item.extra_values,
                    )
                    connection.execute(
                        f"UPDATE {quoted} SET exception_timestamp = ?, "
                        "exception_commentary = ?, exception_rule_index = ?, "
                        "exception_extra_values = ? WHERE exception_id = ?",
                        (
                            new_timestamp.isoformat(),
                            new_commentary,
                            new_rule_index,
                            serialize_extra_values(new_extra_values, effective_columns),
                            exception_id,
                        ),
                    )
                    updated += 1
                    continue

                commentary = item.commentary
                if commentary is None:
                    commentary = self._carry_commentary(
                        connection, exception_id, parsed_date
                    )
                connection.execute(
                    f"INSERT INTO {quoted} ("
                    "exception_id, exception_rule_identifier, key_columns, "
                    "exception_timestamp, exception_commentary, exception_as_of_date, "
                    "exception_first_seen_as_of_date, exception_last_seen_as_of_date, "
                    "exception_first_seen_timestamp, exception_last_seen_timestamp, "
                    "exception_rule_index, exception_extra_values"
                    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        exception_id,
                        item.identity.exception_rule_identifier,
                        item.identity.key_columns_json,
                        item.timestamp.isoformat(),
                        commentary,
                        parsed_date.isoformat(),
                        parsed_date.isoformat(),
                        parsed_date.isoformat(),
                        item.timestamp.isoformat(),
                        item.timestamp.isoformat(),
                        item.rule_index or "",
                        serialize_extra_values(item.extra_values, effective_columns),
                    ),
                )
                inserted += 1

            if prepared:
                self._recompute_history_metadata(connection, tuple(prepared))

            return RecordingSummary(
                as_of_date=parsed_date,
                inserted=inserted,
                updated=updated,
                exception_ids=tuple(sorted(prepared)),
                extra_columns=effective_columns,
            )

    def _assert_no_identity_conflicts(
        self,
        connection: sqlite3.Connection,
        prepared: Mapping[str, _PreparedOccurrence],
    ) -> None:
        if not prepared:
            return
        ids = list(prepared)
        for _, table in _date_tables(connection):
            quoted = quote_identifier(table)
            for chunk in _chunks(ids):
                rows = connection.execute(
                    f"SELECT exception_id, exception_rule_identifier, key_columns "
                    f"FROM {quoted} WHERE exception_id IN "
                    f"({_placeholders(len(chunk))})",
                    tuple(chunk),
                ).fetchall()
                for row in rows:
                    exception_id = _text(row, "exception_id")
                    incoming = prepared[exception_id]
                    existing_rule = _text(row, "exception_rule_identifier")
                    existing_keys = _text(row, "key_columns")
                    if existing_rule != incoming.identity.exception_rule_identifier or not (
                        _same_key_columns(existing_keys, incoming.identity.key_columns_json)
                    ):
                        raise collision_error(
                            incoming.identity,
                            existing_rule_identifier=existing_rule,
                            existing_key_columns=existing_keys,
                        )

    def _carry_commentary(
        self,
        connection: sqlite3.Connection,
        exception_id: str,
        as_of_date: date,
    ) -> str:
        earlier = [
            (table_date, table)
            for table_date, table in _date_tables(connection)
            if table_date < as_of_date
        ]
        earlier.sort(reverse=True)
        for _, table in earlier:
            row = connection.execute(
                f"SELECT exception_commentary FROM {quote_identifier(table)} "
                "WHERE exception_id = ?",
                (exception_id,),
            ).fetchone()
            if row is not None:
                return _commentary_text(row)
        return ""

    def _recompute_history_metadata(
        self,
        connection: sqlite3.Connection,
        exception_ids: Sequence[str],
    ) -> None:
        tables = _date_tables(connection)
        if not tables:
            return

        occurrences: dict[str, list[tuple[date, datetime]]] = {}
        locations: dict[str, list[str]] = {}
        for _, table in tables:
            quoted = quote_identifier(table)
            for chunk in _chunks(exception_ids):
                rows = connection.execute(
                    f"SELECT exception_id, exception_as_of_date, exception_timestamp "
                    f"FROM {quoted} WHERE exception_id IN "
                    f"({_placeholders(len(chunk))})",
                    tuple(chunk),
                ).fetchall()
                for row in rows:
                    exception_id = _text(row, "exception_id")
                    row_date = parse_as_of_date(_text(row, "exception_as_of_date"))
                    timestamp = parse_utc_timestamp(_text(row, "exception_timestamp"))
                    occurrences.setdefault(exception_id, []).append((row_date, timestamp))
                    locations.setdefault(exception_id, []).append(table)

        for exception_id, items in occurrences.items():
            first_date = min(item[0] for item in items)
            last_date = max(item[0] for item in items)
            first_timestamp = min(item[1] for item in items)
            last_timestamp = max(item[1] for item in items)
            for table in locations[exception_id]:
                connection.execute(
                    f"UPDATE {quote_identifier(table)} SET "
                    "exception_first_seen_as_of_date = ?, "
                    "exception_last_seen_as_of_date = ?, "
                    "exception_first_seen_timestamp = ?, "
                    "exception_last_seen_timestamp = ? WHERE exception_id = ?",
                    (
                        first_date.isoformat(),
                        last_date.isoformat(),
                        first_timestamp.isoformat(),
                        last_timestamp.isoformat(),
                        exception_id,
                    ),
                )


class _PreparedOccurrence:
    __slots__ = ("identity", "timestamp", "commentary", "rule_index", "extra_values")

    def __init__(
        self,
        *,
        identity: ExceptionIdentity,
        timestamp: datetime,
        commentary: str | None,
        rule_index: str | None,
        extra_values: dict[str, str],
    ) -> None:
        self.identity = identity
        self.timestamp = timestamp
        self.commentary = commentary
        self.rule_index = rule_index
        self.extra_values = extra_values


def _normalize_rule_index(value: str | None) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ExceptionTrackingError(
            "exception_rule_index must be text when supplied."
        )
    if "\x00" in value:
        raise ExceptionTrackingError(
            "exception_rule_index contains a NUL character, which cannot be stored "
            "safely."
        )
    text = value.strip()
    return text or None


def _merge_batch_rule_index(
    previous: str | None,
    incoming: str | None,
    *,
    exception_id: str,
) -> str | None:
    if previous is None:
        return incoming
    if incoming is None:
        return previous
    if previous == incoming:
        return previous
    raise ExceptionTrackingError(
        f"Conflicting historical Rule Index values ('{previous}' and '{incoming}') "
        f"were supplied for exception '{exception_id}' in one capture. Supply one "
        "Rule Index per exception; nothing was stored."
    )


def _merge_batch_extra_values(
    previous: Mapping[str, str],
    incoming: Mapping[str, str],
    *,
    exception_id: str,
) -> dict[str, str]:
    merged = dict(previous)
    for name, value in incoming.items():
        if name in merged and merged[name] != value:
            raise ExceptionTrackingError(
                f"Conflicting values for extra column '{name}' were supplied for "
                f"exception '{exception_id}' in one capture. Supply one value per "
                "column; nothing was stored."
            )
        merged[name] = value
    return merged


def _infer_extra_columns(
    prepared: Mapping[str, _PreparedOccurrence],
) -> tuple[str, ...]:
    seen: list[str] = []
    for item in prepared.values():
        for name in item.extra_values:
            if name not in seen:
                seen.append(name)
    return tuple(seen)


def _merge_commentary(
    previous: str | None,
    incoming: str | None,
    *,
    exception_id: str,
) -> str | None:
    if previous is None:
        return incoming
    if incoming is None:
        return previous
    if previous == incoming:
        return previous
    raise ExceptionTrackingError(
        f"Conflicting explicit commentary values were supplied for exception "
        f"'{exception_id}' in one capture. Supply at most one commentary per "
        "exception and rerun."
    )


# --------------------------------------------------------------- convenience


def list_as_of_dates(database_path: str | Path) -> list[date]:
    return ExceptionTrackingRepository(database_path).list_as_of_dates()


def get_extra_columns(
    database_path: str | Path, as_of_date: date | str | None = None
) -> tuple[str, ...]:
    return ExceptionTrackingRepository(database_path).get_extra_columns(as_of_date)


def get_extra_column_union(database_path: str | Path) -> tuple[str, ...]:
    return ExceptionTrackingRepository(database_path).get_extra_column_union()


def get_extra_values(
    database_path: str | Path,
    as_of_date: date | str,
    columns: Sequence[str] | None = None,
) -> dict[str, dict[str, str]]:
    return ExceptionTrackingRepository(database_path).get_extra_values(
        as_of_date, columns
    )


def migrate_schema(database_path: str | Path) -> None:
    ExceptionTrackingRepository(database_path).migrate_schema()


def list_exceptions(
    database_path: str | Path, as_of_date: date | str
) -> list[ExceptionRecord]:
    return ExceptionTrackingRepository(database_path).list_exceptions(as_of_date)


def get_exception(
    database_path: str | Path, as_of_date: date | str, exception_id: str
) -> ExceptionRecord | None:
    return ExceptionTrackingRepository(database_path).get_exception(
        as_of_date, exception_id
    )


def list_exception_history(
    database_path: str | Path, exception_id: str
) -> list[ExceptionRecord]:
    return ExceptionTrackingRepository(database_path).list_exception_history(
        exception_id
    )


def update_commentaries(
    database_path: str | Path,
    as_of_date: date | str,
    updates: Mapping[str, str],
) -> int:
    return ExceptionTrackingRepository(database_path).update_commentaries(
        as_of_date, updates
    )


def record_exceptions(
    database_path: str | Path,
    as_of_date: date | str,
    occurrences: Iterable[ExceptionOccurrence],
    *,
    extra_columns: Sequence[str] | None = None,
) -> RecordingSummary:
    return ExceptionTrackingRepository(database_path).record_exceptions(
        as_of_date, occurrences, extra_columns=extra_columns
    )
