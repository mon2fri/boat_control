# Exception tracking — frontend delivery (Worker D)

Branch: `work/20261103-exception-tracking-worker-d`

This document records the frontend implementation, the wire contract it consumes
(Worker B's published `docs/20261103_exception_tracking_api.md`), and the
verification performed while the backend branches were still being integrated.

## User-facing changes

### As-of Date

- The Upload page has a native calendar control labelled **As-of Date**.
- The initial value is the backend's `default_as_of_date` from
  `GET /api/exception-tracking/dates/` when that endpoint is available. If the
  endpoint is unavailable, the browser computes the same rule locally: the last
  Monday–Friday of the previous calendar month, including January/year rollover.
- The selected date is sent with every upload/preset load (`as_of_date`) and
  every run request (`as_of_date`), and the backend echo replaces the local value
  after upload.
- The date is held in workflow state, persisted by the backend in run metadata,
  shown in History and on the Results header, and restored when a saved run is
  reopened by deep link. Historical runs without a date stay readable; their
  commentary-template download is disabled instead of guessing a date.

### Exception Tracking tab

Route: `/exception-tracking` (navigation item **Exception Tracking**).

- Select a date with the calendar control or from the recorded-date list.
- Displays all eight requested columns plus a visible status badge:
  Exception ID, Exception Rule Identifier, Key Columns, Exception Timestamp,
  Exception Commentary, Exception As-of Date, First Seen As-of Date,
  Last Seen As-of Date, Status.
- Statuses are rendered exactly as returned by the backend: `New`, `Commented`,
  `NotCommented`. The UI only derives a status if an older fixture omits it
  (non-blank commentary → Commented; first-seen date equals occurrence date →
  New; otherwise NotCommented).
- **Download commentary template** downloads the selected date's shared XLSX.
- **Upload completed commentary template (.xlsx)** uploads the workbook with the
  selected `as_of_date`. Client-side checks reject non-XLSX and empty files;
  server validation errors (including `unknown_ids`, `duplicate_ids`,
  `missing_ids` details) are shown and the list is not treated as updated.
  A successful import invalidates and refreshes both the date list and rows.
- **Refresh list** and **Refresh dates and list** re-fetch without losing the
  selected date.

### Results page commentary template

- **Download commentary template** appears beside the existing HTML/Excel
  exports.
- It calls the same `GET /api/exception-tracking/export/?as_of_date=...`
  endpoint and workbook format as the Exception Tracking tab, using the run's
  persisted As-of Date. Commented exceptions are therefore pre-filled by the
  backend from the tracking database.
- Runs without an As-of Date show the button disabled with an explanatory
  tooltip rather than producing a template for a guessed date.

### Settings — exception-tracking database path

- Settings now edits `exception_tracking_path`, the field published by Worker B
  (default `data/exception_tracking.db`).
- Absolute Linux (`/...`), Windows drive (`C:\...` or `C:/...`) and UNC
  (`\\host\share\...`) paths are accepted. The absolute text input always
  remains the authoritative control.
- A non-absolute value is allowed (the backend resolves it against the project
  root) but is marked with an honest warning.
- **Browse…** first uses an optional desktop host bridge
  (`window.boatControlHost.pickPath` / `window.electronAPI.pickPath`). The
  Django backend intentionally has no server-side file dialog. A normal browser
  cannot expose absolute host folder paths, so the page states that limitation
  and keeps the text input usable instead of writing a fabricated path.

## Wire contract consumed

All routes are under `/api`:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/exception-tracking/dates/` | `{ dates, default_as_of_date }` |
| GET | `/exception-tracking/?as_of_date=YYYY-MM-DD` | `{ as_of_date, total, exceptions[] }` |
| GET | `/exception-tracking/export/?as_of_date=YYYY-MM-DD` | XLSX attachment |
| POST | `/exception-tracking/import/` | multipart `file`, optional `as_of_date`; atomic validation |
| GET/PUT | `/settings/` | includes `exception_tracking_path` |
| POST | `/files/upload/` | accepts `as_of_date`, echoes it |
| POST | `/files/presets/load/` | accepts `as_of_date`, echoes it |
| POST | `/runs/execute/` | accepts `as_of_date`; run document includes top-level `as_of_date` |
| GET | `/runs/` and `/runs/<id>/` | metadata/document include `as_of_date` |

The frontend accepts optional compatibility aliases (`available_dates`,
`default_date`, `updated_count`, `imported`) so fixture-driven tests can run
while the backend rolls out, but the implementation targets Worker B's frozen
names.

## Tests

New/updated focused tests:

- `src/lib/asOfDate.test.ts` — previous-month last weekday, weekend walks,
  January/December rollover, leap/short months, strict ISO validation.
- `src/pages/UploadPage.asOfDate.test.tsx` — default field, date sent as
  multipart `as_of_date`, invalid date blocks upload.
- `src/state/WorkflowContext.test.ts` — date retained across header load,
  backend echo wins, explicit date update.
- `src/journey.test.tsx` — run request contains `as_of_date`.
- `src/api/mapping.test.ts` — request/run/history date propagation, all three
  statuses, key-column display formats, status fallback, date sorting.
- `src/pages/ExceptionTrackingPage.test.tsx` — all requested columns + status,
  backend default, template download, successful import/refresh, unknown-ID
  rejection, non-XLSX rejection, empty state.
- `src/features/reports/ExportControls.test.tsx` — results page downloads the
  same date-bound template; historical runs without a date disable it.
- `src/pages/SettingsPage.test.tsx` — path loaded/saved with the B field name,
  picker fallback message, desktop host picker.

Commands run:

```bash
npm --prefix frontend test -- --run
npm --prefix frontend run build
```

`frontend/dist` is generated by the build but is intentionally not committed;
the reviewer owns generated build output.

## Verification status

- Mocked/fixture tests pass for the frontend contract above.
- Real integrated API/browser validation remains outstanding until the
  coordinator integrates Workers A/B/C and the frontend build. No live tracking
  database or production data was used.
