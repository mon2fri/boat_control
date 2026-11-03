# Template optimization — Worker A persisted-context contract

Status: **PUBLISHED FOR WORKERS B/C/D AND REVIEWER FREEZE**

Branch: `work/20261103-exception-tracking-worker-a`

This addendum extends the accepted storage contract
(`docs/20261103_exception_tracking_storage_contract.md`) for the newer
`### Exception Tracking Template optimization` requirement. It owns persisted
historical context only: ordered template-column metadata, per-exception values,
and historical Rule Index. Workbook/API/report/frontend layout remains with
B/C/D.

## Public Python surface

```python
# apps.exception_tracking.domain
@dataclass(frozen=True)
class ExceptionOccurrence:
    exception_rule_identifier: str
    key_columns: Mapping[str, Any]
    key_column_order: Sequence[str]
    exception_timestamp: datetime | None = None
    exception_commentary: str | None = None
    exception_rule_index: str | None = None
    exception_extra_values: Mapping[str, Any] | None = None

@dataclass(frozen=True)
class ExceptionRecord:
    exception_id: str
    exception_rule_identifier: str
    key_columns: str
    exception_timestamp: datetime
    exception_commentary: str
    exception_rule_index: str
    exception_extra_values: Mapping[str, str]
    exception_as_of_date: date
    exception_first_seen_as_of_date: date
    exception_last_seen_as_of_date: date
    exception_first_seen_timestamp: datetime
    exception_last_seen_timestamp: datetime
    status: ExceptionStatus

@dataclass(frozen=True)
class RecordingSummary:
    as_of_date: date
    inserted: int
    updated: int
    exception_ids: tuple[str, ...]
    extra_columns: tuple[str, ...] = ()

# apps.exception_tracking.repository
class ExceptionTrackingRepository:
    def record_exceptions(
        self,
        as_of_date: date | str,
        occurrences: Iterable[ExceptionOccurrence],
        *,
        extra_columns: Sequence[str] | None = None,
    ) -> RecordingSummary: ...

    def get_extra_columns(
        self, as_of_date: date | str | None = None
    ) -> tuple[str, ...]: ...
    def get_extra_column_union(self) -> tuple[str, ...]: ...
    def migrate_schema(self) -> None: ...

# apps.exception_tracking.store (Worker C seam)
def capture_exceptions(
    as_of_date: date | str,
    occurrences: Sequence[Mapping[str, object] | ExceptionOccurrence],
    *,
    db_path: str | Path | None = None,
    extra_columns: Sequence[str] | None = None,
) -> RecordingSummary: ...
```

Worker C's occurrence mapping additionally accepts:

```python
{
    "exception_rule_identifier": "CBR1_...",
    "key_columns": (("ACCOUNT_ID", "A"),),
    "exception_timestamp": datetime(..., tzinfo=UTC),
    "exception_rule_index": "R001",
    "exception_extra_values": {"SEGMENT": "Retail", "SCORE": "42"},
}
```

Aliases `rule_index` and `extra_values` are accepted for compatibility. The
ordered selection is passed separately as `extra_columns`:

```python
capture_exceptions(
    as_of_date,
    occurrences,
    db_path=resolved_path,
    extra_columns=("SEGMENT", "SCORE"),
)
```

Worker B reads:

```python
columns = repository.get_extra_columns(as_of_date)   # ordered selection for date
union = repository.get_extra_column_union()          # stable all-time schema order
records = repository.list_exceptions(as_of_date)
record.exception_rule_index                          # historical run-local Rxxx
record.exception_extra_values                        # {"SEGMENT": "Retail", ...}
```

The API record field names proposed for B are `exception_rule_index` (string)
and `exception_extra_values` (object). B may expose the ordered selection as
`extra_columns` on date/list responses. B must use the selected columns as the
sole source of appended data columns; A stores values but does not choose
workbook layout.

## Schema additions

Each date table keeps its existing ten columns and gains two backward-compatible
columns:

```sql
exception_rule_index TEXT NOT NULL DEFAULT '',
exception_extra_values TEXT NOT NULL DEFAULT '{}'
```

`exception_rule_index` is the historical run-local rule id (for example
`R001`). `exception_extra_values` is a compact JSON object mapping selected
column names to exact text values. Values are stored as text; dates/datetimes
use ISO-8601, booleans use `True`/`False`, and `None` becomes `""`. Missing keys
mean "no value for this exception"; no value is fabricated.

Two metadata tables hold ordered selection context:

```sql
CREATE TABLE exception_tracking_extra_columns (
    column_name TEXT PRIMARY KEY,
    column_order INTEGER NOT NULL UNIQUE,
    first_seen_at TEXT NOT NULL
);

CREATE TABLE exception_tracking_date_selections (
    as_of_date TEXT PRIMARY KEY,
    columns_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

- `column_order` is the stable first-seen order across all captures. Backdated
  captures append newly introduced columns at the end; they do not reorder
  existing columns.
- `date_selections.columns_json` is the ordered JSON array recorded for one
  as-of date (including `[]` for an explicit empty selection). It is replaced by
  the latest explicit capture selection for that date.
- The metadata tables never appear as available as-of dates.
- Values for deselected columns remain in `exception_extra_values` for future
  retrieval/reselection; they are simply not part of the date's current ordered
  selection.

## Rule Index precedence

- A stores exactly the nonblank `exception_rule_index` supplied by capture. It
  never reads the current rule catalog and never derives a value from catalog
  order, row order, or exception position.
- Same-date reruns preserve the existing nonblank Rule Index; a later capture
  only fills a blank legacy value. This keeps historical context stable.
- Two nonblank, different Rule Index values for the same exception in one
  capture batch are rejected as ambiguous.
- Legacy rows without Rule Index read as `""`; no value is backfilled or guessed.

## Extra-column selection and values

- The selection is ordered and must contain nonblank, unique names. Comparison
  is case-insensitive after whitespace normalization, so `SEGMENT`/`segment`
  cannot both appear.
- Names that collide with standard tracking/template headers are rejected with
  `InvalidExtraColumnsError` rather than silently dropped. Reserved normalized
  names include: `Exception ID`, `Exception Status`, `Status`, `Commentary`,
  `Exception Commentary`, `Rule Index`, `Exception Rule Identifier`,
  `Key Columns`, `Exception Timestamp`, `Exception As-of Date`,
  `Exception First Seen As-of Date`, `Exception Last Seen As-of Date`,
  `Exception First Seen Timestamp`, and `Exception Last Seen Timestamp`.
- When an explicit `extra_columns` selection is supplied, every
  `exception_extra_values` key must be in that selection. Values for other
  columns are rejected, enforcing that this setting is the sole source of
  appended data columns. Missing selected values are allowed and display empty.
- An explicit empty selection clears the date's ordered selection and appends no
  data columns. Stored values are retained but not selected.
- `extra_columns=None` is the legacy-compatible path: preserve an existing date
  selection; if none exists, infer first-seen keys from supplied values. New
  capture code should always pass the explicit ordered selection.
- Duplicate occurrences of the same exception ID in one capture merge values.
  The same column with two different nonblank values is rejected as ambiguous;
  a missing value yields to a supplied one.
- Same-date rerun value precedence: a supplied value updates that column;
  an absent key preserves the previously stored value. No historical value is
  deleted or fabricated.
- Values are stored per exception/date at capture time. Later source uploads,
  saved-run deletion, restarts, or configuration changes are not required to
  retrieve them.

## Stable schema union and later-added columns

- `get_extra_columns(date)` returns that date's recorded ordered selection.
- `get_extra_column_union()` returns all columns ever selected, ordered by first
  capture appearance. This is the stable schema union for historical display.
- Older records do not gain values for columns introduced later. B fills missing
  values with empty strings when rendering/exporting; A never backfills.
- If a column is introduced on a later as-of date, the older date's record still
  returns only the values it actually captured. The older date's selection
  metadata is not rewritten.
- If a user changes the selection order on a later date, existing registry order
  remains stable; the later date's own `date_columns` positions reflect its new
  order.

## Migration and compatibility

- Existing populated databases with the original ten-column date tables remain
  readable. Missing `exception_rule_index`/`exception_extra_values` read as
  `""`/`{}`; no business value is rewritten.
- The first write to an old date table adds the two columns with their defaults
  inside the same transaction. `migrate_schema()` performs the upgrade for every
  existing date table explicitly.
- Metadata tables are created lazily on write/migration. On a legacy database
  without them, `get_extra_columns()` returns `()` and exports append no data
  columns.
- No Django migration is required or created: the tracking SQLite file is a
  separate, unmanaged database. The schema upgrade is raw SQLite and is
  documented in the delivery report.
- Commentary, status, first/last history, and existing IDs are preserved by
  migration and same-date upserts.

## Reviewer sign-off items

1. New date-table columns are `exception_rule_index` and
   `exception_extra_values`; metadata lives in the two tracking metadata tables.
2. Rule Index is capture-supplied historical context; existing nonblank values
   win on same-date reruns.
3. The ordered selection is the sole source of appended columns; unselected
   values are rejected when an explicit selection is supplied.
4. Reserved/duplicate header names are rejected, not silently skipped.
5. `extra_columns=None` preserves/inferrs for legacy callers; explicit empty
   clears the date selection.
6. Union order is first-capture appearance, so backdated columns append.
7. Legacy ten-column databases are read-compatible and lazily upgraded on write.
