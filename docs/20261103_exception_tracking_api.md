# Exception Tracking API and XLSX contract

Status: **FROZEN BY COORDINATOR/REVIEWER; IMPLEMENTED AND INTEGRATED**

Branch: `work/20261103-exception-tracking-worker-b`

This document is the early wire contract for the exception-tracking backend. It
covers the tracking and commentary-template endpoints, the shared XLSX workbook,
the settings field, and the storage interface Worker B expects from Worker A.
Field names are frozen unless the coordinator/reviewer records a change.

## Shared decisions

- Supplied `as_of_date` strings must be exactly `YYYY-MM-DD`; whitespace-padded
  or blank supplied values are invalid, not an instruction to use the default.
  The backend is authoritative for the default date and calculates it from the
  configured Django `TIME_ZONE` calendar date.
- The default date is the last Monday-Friday of the previous calendar month
  (January rolls back to December of the previous year).
- Tracking data lives in a separate SQLite database. The default setting is
  `data/exception_tracking.db` relative to the project root.
- Status values are exactly `New`, `Commented`, and `NotCommented`.
- All timestamps are timezone-aware ISO-8601 UTC strings.
- `key_columns` is the lossless stored text representation produced by Worker A.
  The API returns that text unchanged and never guesses or re-derives identity.
- The backend never rewrites a foreign absolute path as a project-relative path.
  A native absolute path is used as-is. A path that cannot be used on the
  current host is rejected with an actionable message.
- Blank commentary semantics: a blank workbook commentary cell is an explicit
  clear for that exception at the selected date. History/status after the clear
  follows Worker A's stored-history rules (earliest occurrence with no
  commentary is `New`; later non-commented occurrences are `NotCommented`).
  Nonblank commentary means `Commented`, and the most recent applicable
  commentary is carried forward by Worker A without overwriting explicit edits.

## Endpoints

All routes are under `/api/exception-tracking/`.

### `GET /api/exception-tracking/dates/`

Returns available as-of dates and the backend default.

```json
{
  "dates": ["2026-09-30", "2026-10-30"],
  "default_as_of_date": "2026-10-30"
}
```

`dates` is ascending. Dates with no exception table are not listed.

### `GET /api/exception-tracking/?as_of_date=2026-10-30`

Returns the selected date's exceptions, including status. If `as_of_date` is
omitted, the backend default is used. Invalid dates return HTTP 400.

```json
{
  "as_of_date": "2026-10-30",
  "total": 2,
  "exceptions": [
    {
      "exception_id": "CBR1_00000000000000000000_ABC_123",
      "exception_rule_identifier": "CBR1_00000000000000000000",
      "key_columns": "{\"id\":\"ABC\",\"type\":\"123\"}",
      "exception_timestamp": "2026-10-30T08:15:00+00:00",
      "exception_commentary": "Known upstream defect",
      "exception_as_of_date": "2026-10-30",
      "exception_first_seen_as_of_date": "2026-09-30",
      "exception_last_seen_as_of_date": "2026-10-30",
      "exception_first_seen_timestamp": "2026-09-30T09:00:00+00:00",
      "exception_last_seen_timestamp": "2026-10-30T08:15:00+00:00",
      "status": "Commented"
    }
  ]
}
```

### `GET /api/exception-tracking/export/?as_of_date=2026-10-30`

Downloads the commentary template for the selected date. The response is an
XLSX attachment:

```text
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="exception_commentary_2026-10-30.xlsx"
```

The results page MUST use this same endpoint and workbook. It may pass either
`as_of_date` directly or `run_id`:

```text
GET /api/exception-tracking/export/?run_id=<run-id>
```

When `run_id` is used, Worker B resolves the persisted top-level
`as_of_date` from the saved run document (Worker C dependency). If the run has
no date, the endpoint returns HTTP 400 rather than guessing.

### `POST /api/exception-tracking/import/`

Multipart upload of an edited template. Form fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `file` | yes | `.xlsx` template returned by the export endpoint |
| `as_of_date` | no | Selected date; when present it must match the workbook metadata |

Validation is atomic and happens before any database write:

- The file must be `.xlsx`, non-empty, under 10 MiB, and have the required
  sheets/headers.
- The workbook `Template` sheet must identify the exact as-of date.
- Exception IDs must match the selected date's stored exception IDs exactly.
  Unknown, duplicate, and missing IDs are all rejected.
- A malformed workbook or any mismatched ID produces HTTP 400 and no partial
  commentary update.
- An empty date (zero exceptions) round-trips as a header-only template.

Success response:

```json
{
  "as_of_date": "2026-10-30",
  "updated": 1,
  "cleared": 1,
  "unchanged": 0,
  "total": 2,
  "exceptions": []
}
```

`exceptions` repeats the same record shape as the list endpoint after the
update so the client can refresh without a second request; clients may ignore
it and refetch.

Validation error shape:

```json
{
  "error": "The workbook contains exception IDs that are not present on 2026-10-30.",
  "code": "unknown_exception_ids",
  "details": {
    "unknown_ids": ["CBR1_..._ZZZ"],
    "duplicate_ids": [],
    "missing_ids": []
  }
}
```

Codes: `invalid_workbook`, `invalid_as_of_date`, `date_mismatch`,
`unknown_exception_ids`, `duplicate_exception_ids`, `missing_exception_ids`,
`file_too_large`, `unsupported_file_type`, `tracking_database_unavailable`,
`invalid_commentary`.

## XLSX workbook format

Workbook version: `exception_commentary/v1`.

### Sheet `Template`

Metadata used for safe round-trip validation. Users may leave this sheet alone.

| Cell | Content |
| --- | --- |
| A1 | `Exception Commentary Template` |
| A2 | `Template Version` |
| B2 | `exception_commentary/v1` |
| A3 | `As-of Date` |
| B3 | ISO date, e.g. `2026-10-30` |
| A4 | `Generated At` |
| B4 | ISO-8601 UTC timestamp |
| A5 | `Instructions` |
| B5 | Short guidance; blank commentary clears the value for this date |

### Sheet `Exceptions`

Row 1 is the header. Data starts at row 2. Required columns, in order:

1. `Exception ID`
2. `Exception Rule Identifier`
3. `Key Columns`
4. `Exception Timestamp`
5. `Exception Commentary`
6. `Exception As-of Date`
7. `Exception First Seen As-of Date`
8. `Exception Last Seen As-of Date`
9. `Status`

Only `Exception ID` and `Exception Commentary` are used to update data. The
other displayed values are informational and are re-read from the database on
import; the client cannot change identity or status through this workbook.

Formula-injection protection: every text cell written by the backend is
prefixed with an apostrophe when it begins with `=`, `+`, `-`, `@`, tab, or
carriage return. The importer reverses only that safety prefix and treats all
remaining content as literal text. Formulas are never evaluated.

Limits: 10 MiB, 100,000 data rows, and 32,767 characters per commentary cell
(the Excel cell limit).

## Settings

`GET /api/settings/` and `PUT /api/settings/` gain:

```json
{
  "exception_tracking_path": "data/exception_tracking.db"
}
```

- The value is stored verbatim in the project-root `.config`.
- Relative values resolve against the project root only when the tracking
  database is opened.
- Linux absolute paths are accepted on Linux. Windows drive/UNC absolute paths
  are accepted on Windows. A foreign absolute path is not rewritten as a
  relative path; it is rejected on the host with a clear error.
- The parent directory must be creatable/writable and the target must not be an
  existing directory. Invalid or unwritable paths are rejected on save.
- `PUT` is a full settings update, consistent with the existing endpoint.

There is no server-side file picker in this Django application. Worker D owns
the browser/native picker behavior and must retain a plain absolute-path text
input with an honest capability message.

## Storage interface consumed from Worker A

Worker A published the storage contract in
`docs/20261103_exception_tracking_storage_contract.md` (commit `bbdc06d`). It
matches the interface Worker B consumes from
`apps.exception_tracking.repository`; Worker B does not duplicate storage or
identity code.

```python
from collections.abc import Mapping
from datetime import date
from pathlib import Path

class ExceptionTrackingRepository:
    def __init__(self, database_path: str | Path) -> None: ...
    def list_as_of_dates(self) -> list[date]: ...  # ascending
    def list_exceptions(self, as_of_date: date | str) -> list[ExceptionRecord]: ...
    def update_commentaries(
        self, as_of_date: date | str, updates: Mapping[str, str]
    ) -> int: ...  # one transaction; returns changed row count
    # record_exceptions(), get_exception(), and list_exception_history() are
    # used by Worker C; Worker B does not call them.
```

Worker B reads these `ExceptionRecord` attributes: `exception_id`,
`exception_rule_identifier`, `key_columns`, `exception_timestamp`,
`exception_commentary`, `exception_as_of_date`,
`exception_first_seen_as_of_date`, `exception_last_seen_as_of_date`,
`exception_first_seen_timestamp`, `exception_last_seen_timestamp`. If Worker A
omits a derived `status` attribute, Worker B applies Worker A's frozen status
rule from those fields. All Worker A errors subclass `ValueError`; Worker B maps
them to HTTP 400 with an actionable message.

The Worker A repository commit is a dependency commit for B's final
integration tests. Worker B's parallel tests use a contract fixture for the
repository; they do not treat the fixture as production storage.

## Worker C dependency

For `GET .../export/?run_id=...` to work from the results page, Worker C must
persist a top-level `as_of_date` (ISO date string) in each new run document.
Old runs without `as_of_date` remain readable; they simply cannot seed the
tracking template until the user selects a date explicitly.

## Worker D notes

- Do not compute the default date in the browser as authority; display the
  `default_as_of_date` returned by `/dates/`.
- Use `/export/?as_of_date=...` on the tracking tab and
  `/export/?run_id=...` on the results page.
- Upload with `FormData`: `file` plus optional `as_of_date`.
- Surface `error` and `details` from 400 responses; never retry a rejected
  import automatically.
