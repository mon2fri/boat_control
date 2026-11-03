# Worker D delivery — Exception Tracking As-of Date selector enhancement

Branch: `work/20261103-exception-tracking-worker-d`

## Scope delivered

- Replaced the Exception Tracking tab's separate date input and recorded-date
  select with one `AsOfDateSelector`.
- First click lists up to 10 latest distinct recorded dates, newest first, and
  always ends with **Other date…**.
- Other date opens a custom accessible calendar. Every recorded date (including
  dates older than the latest 10) has a visible dot, bold weight and
  “has tracking data” accessible label. Unrecorded dates are plain/selectable.
- Selected, today and has-data states use distinct visual and ARIA signals.
- Calendar cancellation/Escape does not change the selection; unrecorded dates
  load the existing no-data state.
- Available-date list and calendar markers share the same API data. Commentary
  import and settings save (tracking database path switch) invalidate it.
- File-loading page date selector intentionally unchanged.

## API dependency

No backend change required. Existing
`GET /api/exception-tracking/dates/` returns all distinct dates plus the
authoritative default; the frontend sorts descending, slices the latest 10 for
the dropdown, and marks the full list in the calendar.

## Verification

```bash
npm --prefix frontend test -- --run
# 52 files, 472 tests passed

npm --prefix frontend run build
# passed (TypeScript + Vite)

npm --prefix frontend run build:inspect
# 5 tests passed

git diff --check
# clean
```

Generated `frontend/dist` was restored/not committed. Browser-level validation
against the integrated app remains for the coordinator/reviewer.
