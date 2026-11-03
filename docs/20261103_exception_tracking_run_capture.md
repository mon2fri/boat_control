# Exception tracking — run capture and As-of Date (Worker C)

Status: implementation delivered against the Worker A storage contract
(`docs/20261103_exception_tracking_storage_contract.md`) and the Worker B API/XLSX
contract (`docs/20261103_exception_tracking_api.md`). Reviewer sign-off is
required for the decisions listed at the end.

## Scope

Worker C owns:

- As-of Date validation/defaulting and propagation from upload through run
  submission into saved-run metadata;
- conversion of executed `ValidationViolation` records into Worker A's tracking
  occurrence contract;
- run-capture failure/atomicity behaviour;
- backward-compatible saved-run loading; and
- run-capture tests.

Worker A owns the SQLite schema, literal exception IDs, collision detection,
history/status/commentary semantics, and transactional storage. Worker B owns
tracking APIs, settings persistence, and the shared commentary workbook. There is
no second workbook or storage implementation in this scope.

## As-of Date contract

- Wire format is an ISO calendar date, exactly `YYYY-MM-DD`.
- Request precedence:
  1. `as_of_date` on `POST /api/runs/execute/`;
  2. the date retained by the upload session;
  3. the backend default.
- The backend default is the last Monday-Friday of the previous calendar month.
  Production delegates to Worker B's shared `apps.exception_tracking.dates`
  helper so the upload/execute default and the tracking API default cannot
  drift; the local fallback uses the backend server's current calendar date.
  January rolls back to December of the previous year; a month ending on
  Saturday/Sunday resolves to the preceding Friday.
- Invalid dates, timestamps, whitespace-padded dates, locale formats, blank
  supplied values, and impossible dates return HTTP 400. The backend never
  silently substitutes the default for an invalid value.
- Upload (`POST /api/files/upload/`) accepts an optional `as_of_date` form field,
  validates it before storing files, retains it on the server-side upload
  session, and returns the effective date in the response. Preset loads follow
  the same rule.
- `POST /api/runs/execute/` also accepts `as_of_date` so a client can override a
  session date without re-uploading.

Example upload/execute propagation:

```json
{
  "session_id": "abc123def456",
  "comparison_columns": ["id", "name", "status"],
  "target_columns": ["status"],
  "key_columns": ["id"],
  "rule_ids": ["R001"],
  "as_of_date": "2026-10-30"
}
```

## Saved-run metadata

Every new run document stores a top-level ISO string:

```json
{
  "run_id": "abc123def456",
  "report_name": "file_a_vs_file_b",
  "created_at": "2026-10-30T12:00:00+00:00",
  "as_of_date": "2026-10-30",
  "result": {}
}
```

`GET /api/runs/` metadata and `PUT /api/runs/<run_id>/rename/` include
`as_of_date` (nullable for historical runs). `GET /api/runs/<run_id>/` returns
the same top-level field. Rename and retention preserve it.

Old saved runs remain readable without modification: a missing field loads as
`null`, and reading a run never writes tracking rows or guesses a date.

Worker B's results-page download uses
`GET /api/exception-tracking/export/?run_id=<run-id>` and reads this top-level
field. Legacy runs without a date return Worker B's actionable
`run_has_no_as_of_date` error. Worker C intentionally does not add a second
results export endpoint or workbook.

## Capture semantics

Capture runs after comparison/validation succeeds and **before** the run
document is written.

For each `ValidationViolation`, Worker C sends Worker A:

```python
{
    "exception_rule_identifier": "CBR1_00000000000000000000",
    "key_columns": (("id", "ABC"), ("type", "123")),  # configured key order
    "exception_timestamp": datetime(..., tzinfo=UTC),
}
```

- The canonical identifier comes from the violation, the run's `rule_bindings`
  map, or the run's rule summary. A local `Rxxx` is never converted or guessed
  into a canonical identifier. A missing identifier fails the capture with an
  actionable message.
- Key values follow the run's configured `key_columns` order, not dictionary
  insertion order. Values are exact source strings; non-string scalars use
  `str()`. Missing keys, `None`, and empty values are rejected rather than
  guessed.
- The exception ID excludes the violating column. Multiple violating columns for
  the same rule and key therefore collapse into one exception occurrence.
- Occurrences are deduplicated by `(canonical rule identifier, ordered key
  values)` before storage. Worker A additionally detects ambiguous literal-ID
  collisions across dates and rejects the whole capture.
- `exception_timestamp` is the same UTC timestamp recorded as the run's
  `created_at`; history first/last timestamps are maintained by Worker A.
- Empty runs are still captured with an empty occurrence sequence. Worker A
  creates the date table so the date remains selectable and exports a
  header-only template.

## Failure, retry, and atomicity

- If capture fails, `POST /api/runs/execute/` returns HTTP 500 with
  `tracking_failed: true`, `retryable: true`, and the selected `as_of_date`. No
  run document is written. A successful run is never presented with silently
  missing tracking rows.
- Worker A performs one transaction per capture and rolls back on any error
  (including identity collisions and schema mismatch).
- Retrying the same As-of Date is safe and idempotent: existing commentary and
  unrelated exceptions are preserved, and historical rows are never deleted.
- If the process dies after the tracking transaction commits but before the run
  JSON is published, the tracking rows remain. They describe occurrences that
  were genuinely observed, and rerunning the same date upserts rather than
  duplicating. This is the documented crash-window behaviour.
- Tests never touch `data/exception_tracking.db`; `tests/conftest.py` redirects
  every pytest test to a temporary `EXCEPTION_TRACKING_DB` path.

## Dependencies

Worker C integration depends on:

- Worker A: `backend/apps/exception_tracking/store.py` exposing
  `capture_exceptions(as_of_date, occurrences, *, db_path=None)` with the ordered
  pair mapping shown above. A's commits are `bbdc06d` (published contract) and
  `0422f04` (identity/repository/store implementation).
- Worker B: `apps.settings.services.get_exception_tracking_path()`, used to pass
  the configured database path explicitly, and the shared
  `/api/exception-tracking/export/?run_id=...` results download. B's commits are
  `9f047d9` (settings path), `91ee51d` (tracking API and shared workbook), and
  `34d5b11` (workbook date-cell compatibility).

Until both dependency commits are integrated, execute-endpoint tests that reach
capture fail closed with a visible "Worker A/B integration dependency" message;
they do not skip tracking silently.

## Reviewer sign-off items

1. The literal exception ID has no `exception_` prefix; requirement wording
   "exception <identifier>_<keys>" is read as the noun plus the canonical
   identifier. This matches Worker A's published decision.
2. Upload stores the effective date; execute may override it. The run document's
   top-level date is authoritative for the results download.
3. Empty runs create an empty date table. This keeps the tracking date selectable
   and is required by Worker A's contract.
4. Missing/empty key values are treated as missing identity data and fail the
   run rather than producing an ambiguous ID.
5. Capture failure returns HTTP 500 and no saved run; the same-date retry is
   documented and idempotent.
