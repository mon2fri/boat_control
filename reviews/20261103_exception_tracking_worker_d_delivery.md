# Worker D delivery — upload date, tracking UI, settings path and results export

Branch: `work/20261103-exception-tracking-worker-d`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/exception-tracking/worker-d`

Read with:
- `docs/20261103_exception_tracking_frontend.md` (frontend contract and behaviour)
- Worker B's `docs/20261103_exception_tracking_api.md` (frozen backend wire contract)

## Requirement coverage

| # | Requirement | Delivery |
| --- | --- | --- |
| 1 | Unified exception ID across runs | Displayed verbatim from the backend (`exception_id`, `exception_rule_identifier`, `key_columns`); frontend never derives or hashes identity. |
| 2 | As-of Date calendar on file loading, default previous-month last weekday | Native date input on Upload; backend `default_as_of_date` preferred with local fallback; sent with upload/preset/run; restored from saved runs. |
| 3 | Separate SQLite history with requested columns | Tracking table displays all requested occurrence/history fields plus status. |
| 4 | Configurable tracking DB path with text input/system picker | Settings edits `exception_tracking_path`; absolute Linux/Windows/UNC text input; optional desktop host picker; honest browser fallback message. |
| 5 | New / Commented / NotCommented | Visible status badge in the tracking table and summary counts; backend value authoritative. |
| 6 | Exception Tracking tab with date selection and eight columns | `/exception-tracking` tab, calendar + recorded-date selection, all eight columns + status. |
| 7 | Download commentary template | Tracking page downloads `GET /api/exception-tracking/export/?as_of_date=...`. |
| 8 | Upload template with validation | Multipart upload to `/import/`; client rejects non-XLSX/empty; server unknown/duplicate/missing ID errors shown with details; list refreshes only on success. |
| 9 | Result-page template same as tracking, prefilled | Results controls call the same export endpoint with the run's persisted As-of Date; disabled for historical runs without a date. |

## Contract decisions consumed from Worker B

- `GET /api/exception-tracking/dates/` → `{ dates, default_as_of_date }`.
- `GET /api/exception-tracking/?as_of_date=` → `{ as_of_date, total, exceptions[] }` with status.
- `GET /api/exception-tracking/export/?as_of_date=` → XLSX attachment.
- `POST /api/exception-tracking/import/` → `{ as_of_date, updated, cleared, unchanged, total }`.
- Settings wire field is `exception_tracking_path`.
- No server-side path picker exists; browser/native capability is reported honestly and text input remains authoritative.

Worker C contract consumed: upload/preset accept and echo `as_of_date`; run execute accepts `as_of_date`; run document and history metadata expose top-level `as_of_date`.

## Tests / build

- `npm --prefix frontend test -- --run` → 50 files, 457 tests passed.
- `npm --prefix frontend run build` → passed (TypeScript + Vite).
- `npm --prefix frontend run build:inspect` → 5 tests passed.
- Targeted ESLint on all new/changed frontend implementation files → no findings. (Repository-wide lint still has pre-existing unrelated findings elsewhere.)
- `git diff --check` → clean.

## Evidence boundary

These are fixture/mocked frontend tests against Worker B's published contract. No real integrated backend/browser smoke test was possible on this branch because the integration branch had not yet received Workers A/B/C. The reviewer must run the frontend against the integrated API and generate `frontend/dist`.

Generated `frontend/dist` was intentionally restored/left out of this commit.
