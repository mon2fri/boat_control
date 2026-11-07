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

### Extra Columns for Commentary Template (page two)

- A separate collapsible card labelled **Extra Columns for Commentary Template**
  sits to the right of **Attribute Comparing Sections** and below **Extra
  Columns**.
- Its ordered selection is independent of the existing Extra Column setting,
  attribute-comparison sections and every exception-table display choice.
  Nothing is inferred from those settings; an empty selection appends no data
  columns.
- Config for rows and columns stores it as the ordered
  `commentaryTemplateColumns` field. The run request sends
  `commentary_template_columns`. Older configs without the field load as an
  empty selection rather than retaining stale session values.
- Values are persisted by the backend at capture time and later displayed in
  Exception Tracking / exported in the commentary template.

### Exception Tracking tab

Route: `/exception-tracking` (navigation item **Exception Tracking**).

- One **As-of Date** selector replaces the old separate date input and
  recorded-date select. Its first click opens a dropdown of up to the 10 latest
  available dates with tracking data, newest first; **Other date…** is always
  the final option, even with zero or fewer than ten dates.
- Choosing **Other date…** opens a custom calendar. Every date with recorded
  data — including older dates outside the latest ten — carries a green dot,
  an `aria-label` stating “has tracking data”, and bold weight. Unrecorded dates
  remain plain but selectable and show the existing no-data state. Today uses
  a warning-coloured outline and the selected date uses an accent fill, so the
  three indicators are visually and programmatically distinct.
- The calendar supports month navigation, Escape/Cancel dismissal without
  changing selection, and arrow-key day movement. Available dates and calendar
  markers share the same authoritative `/exception-tracking/dates/` list;
  successful run capture, saving a new tracking database path, or importing
  commentary invalidates both the date list and cached rows.
  Successful run capture invalidates the available-date list and cached rows;
  saving a new tracking database path or importing commentary invalidates it too.
- Default visible columns, in order: **Exception ID**, **Exception Status**,
  **Commentary**, **Rule Index**. All remaining standard metadata columns and
  the selected Extra Columns for Commentary Template are available through the
  accessible column chooser but hidden initially.
- Additional data columns come solely from Worker B's ordered
  `detail_columns`/`columns` metadata for the selected date; the UI never infers
  them from the Extra Column setting or comparison sections.
- Paging defaults to 50 rows with 50/100/200/500 options. Sorting and filtering
  are sent to Worker B's complete-dataset endpoint (`offset`, `limit`, `sort`,
  `order`, `filter_<column>`), so they apply to every row before the page is
  sliced. Filter options come from the API's complete-dataset
  `available_filters`.
- The table displays all eight requested fields plus status/context when their
  columns are revealed.
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

### New Exceptions Only

- The Results page exposes a checked-by-default **New Exceptions Only** toggle
  before running and after a result is loaded.
- Checked scope includes `New` and `NotCommented` (recurring uncommented)
  exceptions and hides `Commented` exceptions from the result page and ordinary
  HTML/Excel reports. Unchecked includes all exceptions.
- The filter is display/report-only: the backend persists every exception for
  the As-of Date. Toggling an existing result reloads that saved run with
  `new_exceptions_only` and passes the same flag to Excel export; commentary
  templates always include all exceptions.
- When the checked scope has no visible exceptions, the page explains that
  Commented exceptions can be shown by unchecking the toggle.

### Results page commentary template

- **Download commentary template** appears beside the existing HTML/Excel
  exports.
- It calls the same `GET /api/exception-tracking/export/?as_of_date=...`
  endpoint and workbook format as the Exception Tracking tab, using the run's
  persisted As-of Date. Commented exceptions are therefore pre-filled by the
  backend from the tracking database.
- Runs without an As-of Date show the button disabled with an explanatory
  tooltip rather than producing a template for a guessed date.

### Exception IDs in result detail tables

- Both the per-rule exception-detail table and the cross-rule Exception Table
  show a leading **Exception ID** column. It replaces any positional/row-index
  identifier and is never synthesised from table position.
- The frontend prefers a backend-supplied `exception_id` on violation rows and
  paginated detail rows. When an older payload omits it, the frontend derives
  the exact same literal ID from the canonical rule identifier plus the
  configured key-column values in configured order
  (`<rule_identifier>_<value1>_<value2>...`), matching the commentary workbook.
  Incomplete identity data renders `—` rather than guessing.
- All existing detail columns remain: key columns, Rule Index in the aggregate
  table, aggregation columns, configured extra columns, Column, In Baseline and
  In Comparison. Sorting/filtering continue to work, including filtering by the
  new Exception ID.
- Paginated violation-detail mapping prefers `exception_id`; when the current
  API omits it, it derives the same canonical ID from `rule_identifier` and
  configured key-column order. It never derives identity from a page offset or
  rendered row number; missing identity context remains `—`.

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
| POST | `/runs/execute/` | accepts `as_of_date`, `commentary_template_columns`, `new_exceptions_only`; result persists them |
| GET | `/runs/` and `/runs/<id>/` | metadata/document include `as_of_date`; run detail accepts `new_exceptions_only` |
| POST | `/reports/export/` | accepts `new_exceptions_only` for ordinary HTML/Excel report scope |
| GET | `/exception-tracking/?as_of_date=&offset=&limit=&sort=&order=&filter_<column>=` | complete-dataset paging/sorting/filtering plus `columns`, `detail_columns`, `available_filters` |

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
  statuses, key-column display formats, status fallback, date sorting, and
  exception-detail ID mapping (backend field preferred, canonical fallback).
- `src/lib/exceptionIdentity.test.ts` — literal rule+key ID construction,
  configured key order, underscores/Unicode, incomplete identity, backend
  precedence.
- `src/features/results/results.test.tsx` and
  `src/features/results/ExceptionTable.test.tsx` — stable Exception ID shown as
  the exception-detail row identifier; all existing detail columns preserved;
  no row-position fallback.
- `src/features/results/usePaginatedDetails.test.ts` and
  `src/features/results/PaginatedDetailSection.test.tsx` — canonical fallback
  IDs stay stable across actual paginated violation wire rows and are displayed
  in the paginated exception table.
- `src/pages/ExceptionTrackingPage.test.tsx` — all requested columns + status,
  backend default, template download, successful import/refresh, unknown-ID
  rejection, non-XLSX rejection, empty state, older marked date via Other date.
- `src/features/tracking/AsOfDateSelector.test.tsx` — 10-latest/newest-first
  limit, fewer/empty dates, Other date placement, available-date selection,
  keyboard listbox navigation, calendar markers for older dates, plain
  unrecorded dates, selected/today/data distinctions, cancellation, arrow-key
  day movement and marker refresh when the authoritative list changes.
- `src/features/settings/useSettings.test.tsx` — database-path save invalidates
  available dates, calendar markers and loaded tracking rows.
- `src/features/results/useRunExecution.test.ts` — a successful tracking capture
  invalidates cached dates and rows; failed runs do not invalidate them.
- `src/features/targets/CommentaryColumnPicker.test.tsx` — required card label,
  ordered move/remove and independence from Extra Columns.
- `src/api/configContent.test.ts` — ordered commentary selection round-trip,
  independence from Extra Columns, and legacy-config clearing.
- `src/pages/ExceptionTrackingPage.test.tsx` — first-four default visibility,
  column chooser/order, server page sizes 50/100/200/500, global sort/filter
  parameters and default-column reset.
- `src/journey.test.tsx` — New Exceptions Only default/request scope, saved-run
  scope reload and all-commented empty message.
- `src/api/endpoints.test.ts` — Excel export sends the requested
  `new_exceptions_only` scope.
- `src/features/reports/ExportControls.test.tsx` — results page downloads the
  same date-bound template; historical runs without a date disable it.
- `src/pages/SettingsPage.test.tsx` — path loaded/saved with the B field name,
  picker fallback message, desktop host picker.

Commands run:

```bash
npm --prefix frontend test -- --run
npm --prefix frontend run build
```

The worker commit excludes generated `frontend/dist`; the reviewer rebuilt and
committed the generated assets after integrating all four workers.

## Verification status

- The worker's mocked/fixture frontend suite passed (50 files, 457 tests).
- The integrated suite passed (52 files, 473 tests); the build passed with
  Vite's advisory about the current >500 kB JavaScript chunk.
- Integrated browser checks were completed in headless Google Chrome with
  isolated sample data/database. See `reviews/20261103_exception_tracking_review.md`
  for the scenarios, evidence paths, and remaining user acceptance steps. No live
  tracking database or production data was used.
