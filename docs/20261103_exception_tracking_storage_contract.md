# Exception tracking storage contract

Status: **FROZEN BY COORDINATOR/REVIEWER; IMPLEMENTED AND INTEGRATED**

> **Template-optimization addendum:** this document describes the original
> storage foundation. The newer `### Exception Tracking Template optimization`
> requirement adds `exception_rule_index`, `exception_extra_values`, and ordered
> extra-column metadata. See
> `docs/20261103_exception_tracking_template_storage_contract.md` for the
> current schema and interfaces; where the two documents differ, the addendum
> wins.

Branch: `work/20261103-exception-tracking-worker-a`

This document freezes the Python storage/identity surface, the SQLite schema, and
the history/status/commentary semantics owned by Worker A. Worker B owns the HTTP
API, workbook, and settings persistence; Worker C owns run capture. Both consume
the interfaces below rather than re-implementing identity or storage.

## Module layout

| Module | Purpose |
| --- | --- |
| `apps.exception_tracking.identity` | Canonical rule-id validation, literal exception-id construction, lossless key-column serialization, collision errors, date/table-name safety helpers, UTC timestamp helpers. |
| `apps.exception_tracking.domain` | Frozen input/record/summary dataclasses and the `New` / `Commented` / `NotCommented` status literal. |
| `apps.exception_tracking.errors` | Actionable exception hierarchy. All errors subclass `ValueError` so existing API adapters can map them to HTTP 400. |
| `apps.exception_tracking.repository` | `ExceptionTrackingRepository` and module-level convenience functions. Worker B imports `ExceptionRecord` and `ExceptionTrackingRepository` from here. |
| `apps.exception_tracking.store` | Worker C adapter: `capture_exceptions(as_of_date, occurrences, *, db_path=None)`. Thin wrapper over the repository; no second storage implementation. |

`apps.exception_tracking.dates` is Worker B's calendar-default module and is not
owned or imported by Worker A.

## Public Python signatures

```python
# apps.exception_tracking.repository
from collections.abc import Iterable, Mapping
from datetime import date
from pathlib import Path

class ExceptionTrackingRepository:
    def __init__(self, database_path: str | Path) -> None: ...
    def list_as_of_dates(self) -> list[date]: ...              # ascending
    def list_exceptions(self, as_of_date: date | str) -> list[ExceptionRecord]: ...
    def get_exception(self, as_of_date: date | str, exception_id: str) -> ExceptionRecord | None: ...
    def list_exception_history(self, exception_id: str) -> list[ExceptionRecord]: ...
    def update_commentaries(
        self, as_of_date: date | str, updates: Mapping[str, str]
    ) -> int: ...                                              # changed row count
    def record_exceptions(
        self, as_of_date: date | str, occurrences: Iterable[ExceptionOccurrence]
    ) -> RecordingSummary: ...

# module-level equivalents, each opening one repository
def list_as_of_dates(database_path: str | Path) -> list[date]: ...
def list_exceptions(database_path: str | Path, as_of_date: date | str) -> list[ExceptionRecord]: ...
def update_commentaries(
    database_path: str | Path, as_of_date: date | str, updates: Mapping[str, str]
) -> int: ...
def record_exceptions(
    database_path: str | Path,
    as_of_date: date | str,
    occurrences: Iterable[ExceptionOccurrence],
) -> RecordingSummary: ...
def default_database_path(project_root: str | Path) -> Path: ...

# apps.exception_tracking.store (Worker C seam)
def capture_exceptions(
    as_of_date: date | str,
    occurrences: Sequence[Mapping[str, object] | ExceptionOccurrence],
    *,
    db_path: str | Path | None = None,
) -> RecordingSummary: ...
```

Worker C's occurrence mapping keys are:

```python
{
    "exception_rule_identifier": "CBR1_...",          # required
    "key_columns": (("id", "ABC"), ("type", "123")),  # required, ordered pairs
    "exception_timestamp": datetime(...),             # optional, aware UTC
    "exception_commentary": "known issue",            # optional
}
```

A `Mapping[str, object]` keyed by column name is also accepted when
`key_column_order` is supplied; ordered pairs are preferred because they carry
the configured order explicitly.

## Identity contract

- `exception_rule_identifier` must be a canonical catalog identifier:
  `CBR1_` followed by exactly 20 Crockford Base32 characters
  (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`). Legacy local rule ids such as `R001`
  are rejected with an actionable error; callers must not guess an identifier.
- `exception_id` is the literal underscore join of the canonical rule identifier
  and the ordered configured key-column **values**:

  ```text
  CBR1_00000000000000000000_ABC_123
  ```

  No prefix, hashing, escaping, or case folding is applied. Values are the exact
  source strings (non-string scalars are converted with `str()`; `date` and
  `datetime` use ISO-8601). Empty strings, `None`, and missing configured keys
  raise `MissingKeyValueError`; an ID is never guessed.
- `key_columns` stores a lossless compact JSON object in configured key order:

  ```json
  {"id":"ABC","type":"123"}
  ```

  JSON member order is the configured key order. Unicode is stored as UTF-8, not
  ASCII escapes. The column is text, not a re-derived display value.
- `key_column_order` must be non-empty, unique, and must contain exactly the keys
  supplied for the occurrence. Extra or missing keys are rejected.
- **Ambiguous collisions are detected, not hidden.** Two different key-value
  tuples can produce the same literal ID when values contain underscores (for
  example `("a_b", "c")` and `("a", "b_c")`). On every write the repository
  compares the stored `key_columns` JSON and rule identifier for the ID:
  - within the incoming batch,
  - in the target date table,
  - in every other existing date table.
  A mismatch raises `ExceptionIdentityCollisionError` with both representations
  and no rows are written. Callers must change the key-column configuration or
  data; the storage layer will not silently disambiguate.

## SQLite schema

- One database file, separate from Django's `data/db.sqlite3`. Default resolved
  path: `<project_root>/data/exception_tracking.db`.
- One table per as-of date, named `exceptions_YYYYMMDD` (for example
  `exceptions_20261030`). The name is generated only from a strictly validated
  ISO calendar date and quoted with `"`; user text never becomes an identifier.
- Every date table has exactly the ten requested columns (plus SQLite's internal
  rowid):

  ```sql
  CREATE TABLE "exceptions_20261030" (
      exception_id TEXT PRIMARY KEY NOT NULL,
      exception_rule_identifier TEXT NOT NULL,
      key_columns TEXT NOT NULL,
      exception_timestamp DATETIME NOT NULL,
      exception_commentary TEXT NOT NULL DEFAULT '',
      exception_as_of_date DATE NOT NULL,
      exception_first_seen_as_of_date DATE NOT NULL,
      exception_last_seen_as_of_date DATE NOT NULL,
      exception_first_seen_timestamp DATETIME NOT NULL,
      exception_last_seen_timestamp DATETIME NOT NULL
  );
  ```

- Date strings must be exactly `YYYY-MM-DD` with no surrounding whitespace.
  Timestamps are stored as timezone-aware
  ISO-8601 UTC text (`...+00:00`). Naive timestamps supplied by a caller are
  rejected; naive legacy values read from disk are interpreted as UTC.
- A date table is created for every recorded as-of date, including a run with
  zero exceptions, so an empty date remains selectable and exports as a
  header-only template.
- On open, an existing date table is checked for all ten columns. A missing
  column raises `SchemaMismatchError` rather than silently writing a partial
  table.
- Writes use one `BEGIN IMMEDIATE` transaction per call. Any error rolls the
  whole call back; a failed capture never leaves a partial date table update.
- Data values are always bound parameters. Only generated table names and the
  fixed column names are interpolated, through a strict identifier quoter.

## History, status, and commentary semantics

### Chronological history

For every exception ID, the four history columns are maintained across **all**
date tables, including backdated runs:

- `exception_first_seen_as_of_date` = minimum `exception_as_of_date`.
- `exception_last_seen_as_of_date` = maximum `exception_as_of_date`.
- `exception_first_seen_timestamp` = minimum occurrence timestamp.
- `exception_last_seen_timestamp` = maximum occurrence timestamp.

Each occurrence row stores its own `exception_as_of_date` and
`exception_timestamp`. `exception_timestamp` is the latest capture timestamp for
that as-of date; same-date reruns update it monotonically (never backwards) but
never create a second row. A backdated run therefore updates the first/last
history columns in every affected table without changing any other occurrence's
own date or timestamp.

### Status (derived, never stored)

- Nonblank `exception_commentary` (after trimming for the blank test) → `Commented`.
- Otherwise, if `exception_as_of_date == exception_first_seen_as_of_date` → `New`.
- Otherwise → `NotCommented`.

The backend is authoritative for status; the workbook/API cannot set it.

### Commentary precedence

- On insert of a new occurrence with no explicit commentary, the repository
  copies the commentary of the **most recent earlier as-of date** for the same
  ID (the latest date strictly before the new date). If that earlier occurrence
  is blank, the new occurrence stays blank: an explicit clear is not bypassed by
  looking further back.
- A backdated insert does not copy commentary backwards from later dates.
- On a same-date rerun, an omitted commentary (`None`) preserves the stored
  commentary. This is the idempotent rerun rule and never drops commentary or
  unrelated exceptions.
- An explicit `""` clears commentary for that occurrence; a nonblank string sets
  it. `update_commentaries` is the explicit-edit path and applies to the selected
  as-of date only. It does not retroactively rewrite already-stored later dates,
  so explicit edits are never overwritten. Occurrences recorded afterwards carry
  the most recent commentary forward.
- Reruns never delete historical exceptions. Recording a subset of a date's
  exceptions leaves all other rows untouched.

### Read behavior

- `list_exceptions(date)` returns that date's rows sorted by `exception_id`;
  a missing date table returns `[]` (not an error).
- `list_as_of_dates()` returns ascending dates parsed only from valid
  `exceptions_YYYYMMDD` tables; other tables are ignored.
- `list_exception_history(id)` returns every occurrence chronologically.
- `get_exception(date, id)` returns one row or `None`.
- `update_commentaries` rejects unknown IDs atomically with
  `UnknownExceptionError` carrying the unknown IDs; no partial update occurs.
- Historical runs without tracking dates are outside this database and remain
  readable; this layer never guesses a date for them.

## Error hierarchy

```text
ExceptionTrackingError(ValueError)
├── InvalidAsOfDateError
├── InvalidRuleIdentifierError
├── MissingKeyValueError
├── ExceptionIdentityCollisionError
├── UnknownExceptionError
├── SchemaMismatchError
└── InvalidDatabasePathError
```

Every message is actionable and names the offending date, rule, column, ID, or
path. The storage layer never returns a synthesized ID or silently skips a row.

## Database path handling

- `ExceptionTrackingRepository(path)` uses the injected, already-resolved path.
  Worker B resolves settings and validates host usability; Worker A creates the
  parent directory on the first write.
- Relative paths are interpreted by the process working directory. Callers that
  need project-root semantics must resolve first; this layer does not rewrite
  paths.
- A path that is an existing directory, or whose parent cannot be created,
  raises `InvalidDatabasePathError` with the path in the message.
- Reads against a missing database file return empty results and do not create
  the file. The default helper `default_database_path(project_root)` returns
  `<project_root>/data/exception_tracking.db`; Worker B owns the setting that
  overrides it.
- `capture_exceptions(..., db_path=None)` tries Worker B's
  `get_exception_tracking_path()` resolver when available, then falls back to
  `<project_root>/data/exception_tracking.db`. Production run capture always
  passes the resolved path explicitly.

## Frozen reviewer decisions

1. Literal ID has no `exception_` prefix; the requirement's word "exception" is
   read as the noun, and the canonical rule identifier already starts with
   `CBR1_`.
2. `key_columns` is a JSON object in configured key order, matching Worker B's
   published wire example, rather than a list of pairs.
3. `exception_timestamp` is the latest capture for the as-of date; history
   first/last timestamps are min/max across all captures.
4. Explicit commentary edits apply to the selected date only; later occurrences
   are not retroactively rewritten. New occurrences carry the most recent earlier
   commentary forward.
5. Empty key values are rejected as missing identity data.
6. Collision detection scans every existing date table, not just the target
   table.

## Verification

Dedicated tests live in `tests/backend/test_exception_tracking_identity.py` and
`tests/backend/test_exception_tracking_store.py`. They use isolated `tmp_path`
databases only and never touch `data/exception_tracking.db`.
