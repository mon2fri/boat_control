# Exception tracking — coordinator review and integration

## Status

**READY FOR USER UI VALIDATION.** Integration, required build, and reviewer-run
headless Chrome checks are complete. Final functional acceptance remains with the
user; the outstanding baseline test/lint/type errors are itemized below and are
outside this feature's changed files.

## Baseline and worker handoffs

- Original application baseline: `d28327f18125f04af613e681d87609bacbcee541`
  (`main`, left untouched).
- Integration setup baseline: `aabcf5c4ba796cea5ed07a9a28b67bc70cb37a10`
  (`work/20261103-exception-tracking`). Integration worktree was clean before
  changes.
- All four worker worktrees were already present; none was recreated and no
  worker was launched. All worker branches started from `aabcf5c`:

  | Worker | Branch | Starting commit | Head at review start | Initial worktree status |
  | --- | --- | --- | --- | --- |
  | A | `work/20261103-exception-tracking-worker-a` | `aabcf5c` | `ea30380012498881352688884cf7301fe065a601` | clean tracked files; untracked `data/prepare_cache/` |
  | B | `work/20261103-exception-tracking-worker-b` | `aabcf5c` | `6dd5df4237e5713de647d1b85d6fcec792237b09` | clean tracked files; untracked `data/prepare_cache/` |
  | C | `work/20261103-exception-tracking-worker-c` | `aabcf5c` | `e3045d9fc4c1981c45bedd1f39511170484659ea` | clean tracked files; untracked `data/prepare_cache/` |
  | D | `work/20261103-exception-tracking-worker-d` | `aabcf5c` | `790f7d2f070514b7e748c9e19339c55fd7e46f07` | clean tracked files; untracked `data/prepare_cache/` |

- The coordinator instructions noted pre-existing staged/unstaged requirement
  content and untracked `data/prepare_cache/` in the original `main` checkout.
  That checkout and its user data/index were not inspected or modified.
- Worker `data/prepare_cache/` directories were not modified or integrated. The
  integration test run generated its own ignored `data/prepare_cache/` artifact;
  it was left on disk.

## Frozen shared contracts and ownership (reviewer decision)

The following decisions freeze the shared contract before integration. They
resolve the sign-off items in the A/B/C handoffs and match the published API and
storage contracts unless explicitly clarified here.

1. **Identity and collision handling:** `exception_id` is the literal
   canonical `CBR1_...` rule identifier, `_`, then each configured key value in
   configured order separated by `_`; no prefix, hashing, escaping, or case
   folding. Key values are exact strings (`str()` for non-string scalars; dates
   use ISO format). Missing, null, or empty key values and noncanonical/missing
   rule IDs fail visibly; IDs are never guessed. `key_columns` is compact,
   lossless JSON object text whose member order is configured key order. Any
   distinct identity yielding the same literal ID is a collision; reject the
   whole write, checking within the batch and every date table. Reordering rule
   lists does not affect an identity; configured key-column order does.
2. **Date and storage:** supplied `as_of_date` text is exactly ISO `YYYY-MM-DD`
   with no whitespace; blank/malformed supplied values are errors. The date is
   accepted from upload/session/run as documented, with execute request override
   precedence. The backend's configured Django `TIME_ZONE` calendar date is used to calculate the last
   Monday–Friday of the previous month (including year rollover). Tracking is a
   separate SQLite file defaulting to `<project_root>/data/exception_tracking.db`.
   It has one safely generated `exceptions_YYYYMMDD` table per captured date,
   including a successful zero-exception run, with exactly the ten requested
   columns. Values are bound parameters; table names derive only from validated
   dates and are quoted. All timestamps are timezone-aware UTC.
3. **History, status, commentary, retries:** first/last as-of dates and
   occurrence timestamps are chronological min/max across all date tables,
   including backdated captures. Each date row's `exception_timestamp` is the
   latest capture for that date (monotonic on same-date retry). Status is
   derived: nonblank commentary → `Commented`; otherwise first-seen date equal
   to occurrence date → `New`; otherwise → `NotCommented`. A new occurrence
   inherits the commentary of the nearest earlier occurrence, including an
   explicit blank; backdated occurrences do not inherit from later dates. An
   omitted commentary on rerun preserves it; an explicitly blank workbook cell
   clears commentary on that date only. Later captures carry the nearest prior
   value forward; edits do not rewrite existing later rows. Same-date retries
   are transactional/idempotent and do not delete omitted exceptions or
   historical rows. Capture failure must not publish a successful run; retries
   are safe if capture committed before a process crash.
4. **API and workbook:** accept Worker B's `/api/exception-tracking/` wire
   contract: `GET dates/` returns `{dates, default_as_of_date}`; list accepts
   `as_of_date` and returns the selected rows plus derived status; export accepts
   `as_of_date` or a saved `run_id`; import accepts `.xlsx` and optional
   `as_of_date`. One shared `exception_commentary/v1` workbook serves both
   tracking and results. Its Exceptions sheet has the eight requested display
   columns plus Status; import validates exact date and exact ID set, rejects
   unknown/duplicate/missing IDs atomically, bounds files/rows/cell size, and
   treats formulas/text safely. Blank commentary is an explicit selected-date
   clear. A historical run without a persisted date is not assigned a guessed
   date.
5. **Path and picker:** setting field is `exception_tracking_path`, stored
   verbatim and resolved relative to project root only when used. Native
   absolute Linux/Windows paths are not rewritten; foreign-host/unusable paths
   are rejected clearly. Plain path text remains available. There is no Django
   server-side picker; D may use a supported desktop host bridge, otherwise the
   browser limitation must be disclosed.

### File ownership / conflict resolution

| Owner | Exclusive scope |
| --- | --- |
| A | `backend/apps/exception_tracking/{domain,errors,identity,repository,store}.py`, storage tests and storage contract. |
| B | Exception-tracking API/workbook/date modules and tests, settings API/service field, `backend/boat_control/urls.py` registration, API documentation. |
| C | Run capture/date propagation and persistence, file upload/preset/session integration, run tests and run/API documentation. |
| D | `frontend/src/**`, frontend tests and frontend documentation; not generated `frontend/dist`. |
| Reviewer | Root backend configuration and test-wide configuration except B-owned URL registration; shared `tests/conftest.py` isolation review; `.gitignore`; generated build output; final cross-cutting docs/review. |

The sole source-level overlap identified is the package marker
`backend/apps/exception_tracking/__init__.py`: A owns its public re-exports; B's
empty marker is not an implementation conflict and will not replace A's version.
No other ownership conflict is authorized. Any later conflict is to be resolved
without accepting unrelated edits from another worker's scope.

## Independent handoff review

### Worker A — SQLite/identity foundation

- Independently inspected the identity, repository, store, domain and storage
  contract. The implementation has a single transactional write path, exact
  ten-column date tables, cross-table collision detection/history, derived
  statuses, and explicit commentary carry/clear behavior. The reported package
  marker overlap is resolved in favor of A's re-exports.
- Independent commands on A's worktree:
  - `uv run pytest -q tests/backend/test_exception_tracking_identity.py tests/backend/test_exception_tracking_store.py`
    — **67 passed**.
  - `uv run ruff check backend/apps/exception_tracking tests/backend/test_exception_tracking_identity.py tests/backend/test_exception_tracking_store.py`
    — passed.
  - `uv run mypy backend/apps/exception_tracking` — passed, no issues in six
    source files.
  - `git diff --check aabcf5c..HEAD` — passed.
- **Finding/correction:** A's parser initially accepted whitespace-padded dates.
  Reviewer commit `f918344` rejects them and adds regressions. A was then
  accepted; integrated focused storage/identity tests pass (**69 passed**).
- Accepted A code/docs commits include `bbdc06d`, `0422f04`, `cc76cbc` and
  scoped handoff updates `a8691b9`, `c6fa857`, `41730ab`, `6090f55`, `ea30380`.

### Worker B — API, workbook and settings

- Independently inspected API services/views, workbook parser/export, settings
  path resolver, serializers and published wire contract. B uses A's single
  storage adapter, returns authoritative status, validates exact workbook ID
  sets before the one storage update, has upload/row/cell limits, and uses one
  workbook for tracking/results. The path is retained separately from the
  application's existing SQLite database.
- Independent commands on B's worktree:
  - `uv run pytest -q tests/backend/test_exception_tracking_workbook.py tests/backend/test_exception_tracking_api.py tests/backend/test_settings.py`
    — **39 passed**.
  - Targeted Ruff on B's API/settings modules and tests — passed.
  - `uv run mypy backend/apps/exception_tracking backend/apps/settings` —
    reports only the known unrelated `backend/apps/rules/repository.py:218`
    error.
- **Finding/correction:** B initially accepted padded dates and treated a
  whitespace-only date as omission; its default used the process timezone.
  Reviewer commit `8fb1a9b` rejects any supplied blank/padded value, computes
  defaults in Django's configured timezone, and adds regressions. The API,
  workbook, settings and real A-store boundary then pass **47 targeted tests**.
- Accepted B commits, after A: `b653834`, `9f047d9`, `91ee51d`, `8b4fa17`,
  `a9d937a`, `e364f30`, `88c52e0`, `34d5b11`, `c081cbe`, `6dd5df4`. B's empty
  `__init__.py` add/add was resolved in favor of A's public exports.

### Worker C — run capture and As-of Date propagation

- Independently inspected conversion from actual `ValidationViolation` shapes,
  canonical rule binding fallback, key-order preservation, duplicate collapse,
  fail-closed capture-before-publish behavior, upload-session date propagation,
  and saved-run backward compatibility. The root autouse test fixture was
  reviewed: it overrides the tracking DB path per test and does not touch the
  live default. C's focused tests ran **79 passed, 1 skipped** on C's isolated
  branch; the skip is its gated A/B real-storage boundary. Targeted Ruff passed.
- C branch `git diff --check aabcf5c..HEAD` found a trailing blank line at EOF
  in its run-capture integration test.
- **Findings/corrections:** C initially accepted padded/explicitly blank dates,
  silently assigned UTC to naive timestamps, and serialized datetime key values
  with `str()`'s space instead of `isoformat()`'s `T`. Reviewer commit
  `18c483a` fixes all three and removes the EOF blank line. Integrated A/B/C
  targeted tests pass (**132 passed**, including real storage/capture).
- Accepted C commits, after B: `36d09ab`, `5fbf6c7`, `e27e82a`, `758a65f`,
  `0caef53`, `a5ea453`, `e3045d9`. Shared `tests/conftest.py` was accepted as
  a test-safety fixture after review.

### Worker D — frontend workflow

- Independently reviewed date selection/propagation/restoration, tracking
  listing/import/export, settings path input/picker fallback and results-page
  download. The frontend displays backend status and uses the shared date-bound
  workbook; browser-only picker limitations are disclosed. No scope/ownership
  conflicts or substantive frontend handoff defects found.
- Independent commands on D's worktree:
  - `npm --prefix frontend test -- --run` — **50 files, 457 tests passed**.
  - `npm --prefix frontend run build` — passed; Vite reports the existing
    >500 kB chunk-size advisory.
  - `git diff --check aabcf5c..HEAD` — passed.
- Accepted D source/documentation commit: `790f7d2`. D's build artifacts were
  not cherry-picked; reviewer rebuilt and committed `frontend/dist` after
  integration.

- **Integrated browser finding/correction:** initially, saved-run deep links
  remained in a loading state because the frontend wire schema rejected the
  backend's valid persisted `group_statistics: null`. Reviewer commit
  `2156b1f` accepts nullable statistics and adds a restoration regression; the
  test passes and both saved-run deep links were then reopened in Chrome.

## Integration batches and independent results

- A accepted after the strict-date correction: worker commits above plus
  reviewer fix `f918344`; focused integrated storage/identity suite **69
  passed**.
- B accepted after strict-date/timezone correction `8fb1a9b`; API/workbook/
  settings plus real A-store boundary **47 passed**.
- C accepted after contract correction `18c483a`; integrated A/B/C targeted
  batch **132 passed**, including real A/B storage/capture boundaries.
- D accepted as `790f7d2`; reviewer build commits `8458a47` and `618a02a`
  refresh `frontend/dist` after integration and after the saved-run fix.
- Sample acceptance inputs/rule: `samples/exception_tracking/`; reviewer
  documentation and corrected sample headers/rule are committed in `8bb19bd`
  and `7380e03`.

The required full gates and their final disposition are recorded below.

## Requirement coverage and integrated verification

| Req. | Coverage and evidence |
| --- | --- |
| 1 — unified IDs | Canonical rule ID + ordered key values, ambiguity rejected; identity/collision tests and live UI IDs ending `_A`, `_B`, `_C`. |
| 2 — default calendar date | Native calendar input; prior-month final weekday from Django timezone; boundary tests. Chrome showed `2026-10-30` on 2026-11-03. |
| 3 — isolated SQLite/schema | Separate configurable DB; store tests check all ten columns, and both UI-created date tables were independently inspected with `PRAGMA table_info` and contained exactly the ten required columns. |
| 4 — configurable path | Settings API/UI path persistence; Chrome changed to an absolute scratch path and confirmed it after backend restart. Windows/foreign-host usability is validated/rejected by settings tests; no Windows host was available for browser testing. |
| 5 — statuses | Derived backend values and storage/API tests; live UI showed Commented, NotCommented and New. |
| 6 — tracking tab | Date-selectable table displays all eight requested fields plus Status; verified in Chrome. |
| 7 — download template | XLSX download from tracking tab opened and inspected with openpyxl. |
| 8 — upload validation | Workbook tests cover malformed/unknown/duplicate/missing IDs and atomic updates; Chrome uploaded commentary and an unknown-ID workbook, which was rejected with A's commentary unchanged. |
| 9 — results export | One workbook implementation from tracking/results; Chrome deep-linked to saved results and downloaded it. The tracking/results files had identical sheets, selected date, headers, IDs, statuses and commentary. |

### Required automated checks (integration HEAD)

| Command | Result |
| --- | --- |
| `uv run python backend/manage.py check` | Passed: no issues. |
| `uv run python backend/manage.py makemigrations --check --dry-run` | Passed: no changes detected. |
| `uv run ruff check backend tests` | **Not green due to 5 pre-existing findings**: one I001 in `backend/apps/rules/migrations/0002_rule_supersession.py`, four E501s in `tests/backend/test_rule_catalog_api.py`. None are in this feature's files. |
| `uv run mypy backend` | **Not green due to 2 pre-existing findings**: `backend/apps/rules/repository.py:218`, `backend/apps/configs/views.py:318`. Neither file is in this feature's scope. |
| `uv run pytest -q tests/backend tests/contracts tests/integration` | **465 passed, 1 failed**. The failure is `tests/backend/test_rule_identifier_release_review.py::test_migration_reconciles_later_file_edits` (`KeyError: 'rule_id'` in legacy rule migration). Worker handoffs report reproducing this on the untouched setup baseline `aabcf5c`; no rule migration files were changed here. |
| `npm --prefix frontend test -- --run` | Passed: **50 files, 458 tests**. |
| `npm --prefix frontend run build` | Passed (TypeScript + Vite); Vite reports its >500 kB JS chunk advisory. |
| `git diff --check` | Passed on the staged final docs/review and again on the final committed diff. |

`npm ci --prefix frontend` installed the locked dependencies. npm reported 25
dependency advisories (16 moderate, 9 high); no `npm audit fix` was run.

### Final integration commits / evidence

- Worker implementation commits accepted in order A → B → C → D. Primary code
  commits: A `0422f04` (storage/identity), B `9f047d9` + `91ee51d` (settings/API),
  C `36d09ab` + `5fbf6c7` (capture/date), D `790f7d2` (frontend). Scoped contract,
  fix and delivery commits from each worker are also present in branch history.
- Reviewer corrections: `f918344` (A strict dates), `8fb1a9b` (B strict dates
  and configured timezone), `18c483a` (C date/timestamp/key serialization),
  `2156b1f` (D saved-run null-statistics schema), plus reviewer-owned sample,
  docs and generated-build commits.
- Integration branch: `work/20261103-exception-tracking`; integrated code and
  generated-build HEAD before this final evidence-doc commit:
  `618a02ae73333b6961c95ed72128409f6aa85464`. No merge from `main` was performed.
- All test tracking databases used `tmp_path`. Actual UI checks used a throwaway
  source copy at `/tmp/opencode/boat-control-exception-ui-acceptance-v2` with
  its own app DB, run history, uploads and custom tracking DB. No live tracking
  DB or user records were opened or committed.

## Reproducible local startup and actual UI validation

### Isolated startup

Use a disposable source copy so migrations, uploads, run history, settings and
tracking data stay out of the current checkout and any live data. Run from the
integration branch:

```bash
export UI_ROOT="$(mktemp -d /tmp/boat-control-exception-tracking.XXXXXX)"
git archive HEAD | tar -x -C "$UI_ROOT"
cd "$UI_ROOT"
uv sync
npm ci --prefix frontend
UI_ROOT="$UI_ROOT" uv run python - <<'PY'
import os
from pathlib import Path
import yaml

root = Path(os.environ["UI_ROOT"])
path = root / ".config"
config = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
config["rule_config_path"] = "samples/exception_tracking"
config["run_history_path"] = str(root / "data" / "results")
config["exception_tracking_path"] = str(root / "data" / "custom_exception_tracking.db")
config["skip_migrations"] = False
path.write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")
PY
uv run python backend/manage.py check
uv run python backend/manage.py migrate --noinput
uv run python backend/manage.py migrate_rules_to_db
```

Start the servers in separate terminals, setting `UI_ROOT` to the same copied
directory in each:

```bash
cd "$UI_ROOT"
uv run python backend/manage.py runserver 127.0.0.1:8000 --noreload
```

```bash
cd "$UI_ROOT"
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173
```

Open **<http://127.0.0.1:5173/>** (Vite UI; `/api` proxies to Django on
`127.0.0.1:8000`). The integrated sample rule is `Status must be active`; sample
files and exact expected behavior are in `samples/exception_tracking/`. Press
Ctrl+C in each terminal to stop. Keep the scratch directory if you want to
inspect its SQLite files/screenshots; it is not the source worktree.

### Reviewer-run actual Chrome checks — completed

Headless Google Chrome was available. These are real UI/network checks, separate
from Vitest and Django tests:

1. Upload page displayed backend default `2026-10-30` (the previous month's last
   weekday on 2026-11-03). In Settings, changed the database path to an absolute
   scratch path and saved it.
2. Uploaded `baseline.csv` + `candidate_2026-09-30.csv`, selected `ACCOUNT_ID`,
   and ran with As-of Date `2026-09-30`. The tracking tab showed two `New` IDs,
   ending `_A` and `_B`.
3. Downloaded the XLSX, entered “Investigated; retain for vendor follow-up” for
   A and left B blank. Upload succeeded; A became `Commented`, B remained `New`,
   and a subsequent download contained A's commentary.
4. Uploaded a workbook with an unknown ID and changed commentary. The UI showed
   unknown/missing ID details; A's saved commentary and `Commented` status stayed
   unchanged (no partial write).
5. Uploaded `baseline.csv` + `candidate_2026-10-30.csv` and ran on `2026-10-30`.
   The tracking tab showed A `Commented` with carried commentary and first/last
   dates 09-30/10-30, B `NotCommented` with first/last 09-30/10-30, and C `New`
   with first/last 10-30.
6. Downloaded the tracking-page and saved-results-page workbooks. Compared with
   openpyxl: same workbook sheets, date, headers, IDs, statuses and commentary.
7. Restarted Django. Settings still showed the custom path; API/UI still showed
   both dates and all rows. Deep-linked/reopened both saved runs and downloaded
   the results-page template after restart.
8. Queried the isolated `custom_tracking.db`; `PRAGMA table_info` confirmed both
   `exceptions_20260930` and `exceptions_20261030` physically contain exactly
   the ten required columns.

Screenshots are retained outside the repo at `/tmp/opencode/`:
`exception-tracking-upload.png`, `exception-tracking-first-run.png`,
`exception-tracking-template-download.png`, `exception-tracking-commented.png`,
`exception-tracking-import-rejected.png`, `exception-tracking-second-run.png`,
`exception-tracking-results-reopened.png`, and
`exception-tracking-after-restart.png` (plus key-selection evidence).

### Still requiring the user's validation

- Repeat the walkthrough in the user's own browser/host and accept the workflow
  functionally. Reviewer automation is not a substitute for that acceptance.
- If using a desktop host bridge, verify its native path picker on that host.
  In an ordinary browser there is no absolute-path picker; the text field is the
  supported control and the limitation is shown. Windows path behavior was
  covered by backend tests, not by a Windows browser session.
- The integration branch is not deployed, merged, or connected to live user
  data. Leave the sample copy/database separate from real application data.

## Final disposition

**READY FOR USER UI VALIDATION.** Requirements 1–9 have integrated code/tests and
the actual browser checks above completed. The user still owns final functional
acceptance. The one unrelated baseline pytest failure and existing Ruff/mypy
findings remain; they are not silently reported as green. `main` remains
untouched, no deployment occurred, and all worker worktrees remain available.

## Follow-up: Exception Tracking As-of Date selector enhancement

### Commit ownership and disposition

- D's earlier frontend workflow commit `790f7d2` was already integrated by
  cherry-pick `c71886b`; it was not cherry-picked again.
- The only new Worker D enhancement commit was
  `feb6518f8f5eca7f7ef989c65aa7e9b3d23aaa1f` (`feat: add exception tracking
  as-of date selector`). It was independently reviewed and cherry-picked as
  `6782464b2b33cadf17b34d34b8ee07990b012938`.
- Reviewer corrections are in `159d6ae0294d315514c07c38f45c24e70cf67aa1`
  (query invalidation, marker distinction, ARIA state and regressions); the
  generated production bundle is in `1415efc95195386e8069425a90499ced03e85074`.
- No backend or contract files changed for this enhancement. The existing
  `/api/exception-tracking/dates/` response remains authoritative; the frontend
  sorts/deduplicates it for the menu and uses the complete list for calendar
  markers.
- The integration worktree began this follow-up with user changes in `.config`,
  `requirements/20261103_exception_tracking_enhancement.md`, and untracked
  `test-data/`. These remain unstaged/uncommitted and untouched by this work.

### Independent review findings and corrections

Worker D's completed handoff was reviewed against the Enhancement section and
the source, tests, CSS, query hooks and results workflow.

1. **Stale dates after a successful run:** import and settings changes invalidated
   the dates/rows queries, but successful run capture did not. Because the dates
   query has a 30-second `staleTime`, returning to Exception Tracking promptly
   after a run could omit the newly captured date and its marker. The correction
   was recorded for Worker D; since the handoff was complete with no active
   worker session, no duplicate worker was started. Reviewer integration change
   invalidates dates and rows only after a successful run; a hook regression
   verifies success invalidates and failure does not.
2. **Today + selected visual overlap:** `.is-selected` overrode the prior
   `.is-today` border/shadow, hiding today's warning outline when today was also
   selected. The integration correction uses an outline that remains visible
   over the selected fill; data retains its separate green marker. Actual Chrome
   computed styles confirm distinct outline, fill and marker colors.
3. **Popup ARIA state:** while the calendar dialog was open, the trigger still
   advertised a collapsed listbox. It now reports an expanded dialog, with a
   regression for open/cancel state. Actual Chrome keyboard navigation and
   Escape dismissal were also checked.
4. **Sort test coverage:** D's original latest-date fixture was already in
   descending order. The integration regression now supplies unsorted duplicate
   dates and verifies distinct newest-first results, the ten-item cap and final
   Other date option.

Worker D's branch/worktree was left unchanged after its delivered commit. The
corrections live as reviewer changes on the integration branch; the full
integrated frontend tests and actual browser checks below passed afterward.

### Exact validation results

- Worker D branch, after its production build existed:
  - `npm --prefix frontend test -- --run` — **52 files, 472 tests passed**.
  - `npm --prefix frontend run build` — passed (TypeScript + Vite); advisory for
    the >500 kB JavaScript chunk.
- Integrated branch after selector and reviewer corrections:
  - `npm --prefix frontend test -- --run` — **52 files, 473 tests passed**.
  - `npm --prefix frontend run build` — passed; same chunk-size advisory.
  - `npm --prefix frontend run build:inspect` — **5 tests passed**.
  - Targeted ESLint on the changed selector, tracking hook, run hook and tests —
    passed.
  - `git diff --check` — passed. Generated `frontend/dist` was rebuilt and
    committed in `1415efc95195386e8069425a90499ced03e85074`.
- No backend code changed, so backend/contract tests were not rerun for this
  frontend-only enhancement. The previously recorded backend baseline results
  remain as documented above.

### Actual browser validation — completed

Google Chrome `156.0.8078.79` was used against the integrated frontend and an
isolated scratch app/database at
`/tmp/opencode/boat-control-exception-ui-acceptance-v2`. No live data was used.

- Verified the tracking tab has one selector and no separate Recorded dates
  control. With four available dates, the menu showed `Nov 04`, `Nov 03`,
  `Oct 30`, `Sep 30` in descending order, followed by `Other date…`.
- Selected recorded dates and confirmed they loaded their exception rows.
  Selected unrecorded `2026-11-15` from the calendar and confirmed the existing
  no-data state. Cancel preserved the current selection.
- Opened `Other date…`, navigated to November, and verified November 3 (today,
  selected after selection, and containing data) had three distinct signals:
  computed warning outline `rgb(255, 187, 51)`, selected fill
  `rgb(219, 0, 17)`, and data marker `rgb(0, 132, 127)`.
- Keyboard-operated the menu with End/Enter, moved a calendar day with
  ArrowRight, and dismissed with Escape; the selected date did not change.
- Ran a new comparison for `2026-11-04`, then returned to Exception Tracking.
  The successful run invalidated the cached list; the newly captured date
  appeared first without waiting for the former 30-second stale time.
- Changed Settings to a separate empty scratch DB: the menu contained only
  Other date and the page showed no data. Switched back to the original scratch
  DB: recorded dates and markers returned.
- Confirmed the file-loading page still uses its original native date input.
- Automated selector tests cover empty/fewer/more-than-ten dates, unsorted and
  duplicate input, older marked dates outside the latest ten, keyboard behavior
  and marker refresh. The actual scratch browser DB had four dates; it was not
  used as evidence of the ten-item cap.

Screenshots are available in `/tmp/opencode/`:
`exception-tracking-selector-markers.png`,
`exception-tracking-selector-no-data.png`,
`exception-tracking-selector-db-switch.png`, plus the earlier workflow
screenshots listed above.

### Concise UI validation steps for the user

Use the isolated startup commands and URLs in **Reproducible local startup**
above; start with a fresh scratch copy and the supplied sample CSVs. Run the
first and second sample dates, then:

1. Open **Exception Tracking**. Confirm there is one **As-of Date** selector and
   no Recorded dates control. Click it; confirm dates are newest-first and
   **Other date…** is last. With the two supplied sample dates, both should be
   listed and Other date should still appear.
2. Click an available date and confirm its rows load. Choose **Other date…**,
   move to a month containing an older recorded date, and confirm it has a dot
   while an unrecorded date is plain. Select a plain date and confirm the
   no-data message. Cancel or press Escape and confirm the displayed selection
   is unchanged.
3. Use Tab/Arrow/End/Enter/Escape to operate the menu and calendar. Confirm the
   data dot, today outline and selected fill remain distinguishable when they
   overlap.
4. In Settings, switch `exception_tracking_path` to a new absolute scratch DB.
   Return to Exception Tracking: the menu should offer only Other date and the
   selected date should show no data. Restore the original path; the dates and
   markers should return. A successful new run should add its As-of Date to the
   menu immediately on return to the tab.
5. Return to file loading and confirm its As-of Date control is unchanged.

To exercise the menu cap and older-than-ten marker manually, seed the isolated
scratch DB (never a live DB) with twelve dates after startup:

```bash
cd "$UI_ROOT"
DJANGO_SETTINGS_MODULE=boat_control.settings PYTHONPATH=backend uv run python - <<'PY'
from datetime import UTC, date, datetime
from apps.exception_tracking.store import capture_exceptions
from apps.settings.services import get_exception_tracking_path

db = get_exception_tracking_path()
rule = "CBR1_00000000000000000000"
for month in range(1, 13):
    day = date(2025, month, 15)
    capture_exceptions(
        day,
        [{
            "exception_rule_identifier": rule,
            "key_columns": (("ACCOUNT_ID", "SELECTOR-DEMO"),),
            "exception_timestamp": datetime(2025, month, 15, 12, tzinfo=UTC),
        }],
        db_path=db,
    )
PY
```

The menu should show the ten latest seeded dates, newest first; the calendar
should still mark Jan/Feb dates outside the menu. This seed is confined to the
scratch DB.

### Follow-up readiness

**READY FOR USER UI VALIDATION.** The new selector requirements were independently
reviewed, defects were corrected on the integration branch, frontend tests/build
passed, and the actual browser scenarios above were completed. User functional
acceptance remains outstanding. No backend changes, deployment, main merge or
live-data access occurred; the worker worktrees and user changes remain intact.

## Follow-up: Commentary template exception details and table identity

### Commit integration and ownership

- Worker B's new backend commits were cherry-picked first, after the existing
  B/A integration was verified:
  - `027b6c1` → `9c2f5be` — detail-template contract.
  - `37c81e5` → `c153562` — shared workbook/API detail enrichment.
  - `b28849c` → `bda078b` — real-store integration test.
  - `8dd3d03` → `a792589` — B delivery report.
  - `254057b` → `df5a7eb` — skip unrelated runs while resolving date details.
  - `3945e01` → `a0b8d2e` — performance evidence.
- Worker D's earlier selector commit `feb6518` was already integrated. The only
  new D commit `3cf507c81567496506e49f00418acb814302e756` was integrated after
  B as `cdfcfb78a87aa6246b091748339346988c76ad2f`.
- Worker branch heads at this review: B
  `3945e016f0fabb7329c965df69766a6a80fdc9f3` (tracked tree clean; pre-existing
  untracked `data/prepare_cache/`) and D
  `3cf507c81567496506e49f00418acb814302e756` (clean). Neither worker worktree
  was changed by the integration review.
- Reviewer integration fixes: `0930544` (informational-column visibility and
  paginated identity fallback/tests); generated `frontend/dist` is committed in
  `713b37e9fcd55b34f63251d8305a4a1122ce31a0`.
- No Worker B/D merge commits or earlier duplicate feature commits were
  integrated. Existing user changes in `.config`,
  `requirements/20261103_exception_tracking_enhancement.md`, and untracked
  `test-data/` remain untouched and uncommitted.

### Independent findings and revisions

1. **B — respect Exception Table visibility.** The first backend revision
   appended configured exception/extra columns even when the saved run had
   `extra_column_display.exception_tables == false`. That differed from the
   visible Results Exception Table. The correction omits those extras when
   explicitly hidden, while retaining keys, Rule Index and visible aggregation
   columns. Added a regression.
2. **B — multiple rules and historical context.** Added tests that resolve values
   from two rule IDs/detail sets and confirm a historical exception without a
   matching saved run gets no invented detail columns or values. Existing newest
   run precedence remains covered.
3. **D — paginated identity response mismatch.** D initially consumed only an
   optional `exception_id`, but the existing paginated violation API sends
   `rule_identifier` and key columns. D's new test mocked an `exception_id` the
   endpoint does not provide. The correction prefers an explicit ID, then uses
   the canonical rule ID plus configured key order as the same literal fallback
   used by the workbook. The paginated exception table shows that ID. Missing or
   noncanonical identity context renders `—`; no row/page index or local `Rxxx`
   is used. Added tests for the actual wire shape, multiple pages, explicit blank
   IDs and missing historical identity.

The B and D handoffs were complete with no active worker sessions. These findings
were recorded as owner corrections; reviewer fixes were applied only on the
integration branch, with no duplicate worker launched and no worker worktree
modified.

### Exact validation results

- Worker B worktree focused suite:
  `uv run pytest -q tests/backend/test_exception_tracking_integration.py tests/backend/test_exception_tracking_api.py tests/backend/test_exception_tracking_workbook.py tests/backend/test_settings.py`
  — **48 passed, 5 dependency-gated skips**. The integrated B/A/API/workbook/
  settings/run-detail focused suite passed **65 tests** against real tracking
  storage where applicable.
- Worker D worktree after production build:
  - `npm --prefix frontend run build` — passed.
  - `npm --prefix frontend test -- --run` — **53 files, 486 tests passed**.
  - `npm --prefix frontend run build:inspect` — **5 passed**.
  - Its generated assets were restored; D's worktree is clean.
- Integrated final checks:
  - Django `check` — passed; `makemigrations --check --dry-run` — no changes.
  - `uv run pytest -q tests/backend tests/contracts tests/integration` —
    **479 passed, 1 failed**. The sole failure remains the unrelated baseline
    `test_migration_reconciles_later_file_edits` (`KeyError: 'rule_id'`).
  - Full Ruff retains the same five unrelated baseline findings; full mypy the
    same two baseline findings recorded above. Targeted Ruff on changed backend
    files passed. The targeted frontend ESLint run had no errors and two existing
    fast-refresh warnings in `DetailTable.tsx`.
  - `npm --prefix frontend test -- --run` — **54 files, 489 tests passed**.
  - `npm --prefix frontend run build` — passed (TypeScript + Vite), with Vite's
    >500 kB bundle advisory; `npm --prefix frontend run build:inspect` — **5
    passed**.
  - `git diff --check` — passed after normalizing Vite-emitted trailing
    whitespace in the generated JS bundle.
- No database schema/migration change was made. Tests use temporary databases;
  no database or live user data was committed.

### Actual browser validation — completed

Used Google Chrome with an isolated scratch application/database at
`/tmp/opencode/boat-control-exception-detail-final`. Django ran at
`http://127.0.0.1:8001/` and the Vite UI at `http://127.0.0.1:5174/`; port 8000
was already occupied by a process rooted in the integration worktree and was
not accessed or changed.

- Uploaded the two-rule sample (R001 value-vs-constant and R002
  column-vs-column) for `2026-09-30`, with `ACCOUNT_ID` key, `REGION` aggregation,
  and `SEGMENT`/`SCORE` extra columns.
- The Results Exception Table displayed four stable IDs (R001/A, R001/B, R002/A,
  R002/C). These exactly matched the tracking API and downloaded workbook IDs.
  The workbook retained the original nine columns, followed by
  `ACCOUNT_ID`, `Rule Index`, `REGION`, `SEGMENT`, `SCORE`; values matched the
  displayed rows and both download routes produced identical Exceptions sheets.
- Changed commentary and changed/cleared appended detail cells, including a
  formula-like value. Import succeeded; only commentary changed. Re-export
  restored detail values from the saved run context.
- Unknown-ID and mismatched-As-of-Date imports were rejected, with the previous
  commentary unchanged.
- Created a historical tracking occurrence for `2025-01-15` with no saved run
  context. Its export contained exactly the original nine columns; no detail
  values were invented.
- Queried the actual paginated violation endpoint through the frontend mapper
  on four pages. IDs stayed stable and matched the full table/workbook IDs,
  although the endpoint supplies canonical rule IDs and keys rather than an
  explicit `exception_id`.
- Screenshots: `/tmp/opencode/exception-detail-results-table.png`,
  `exception-detail-tracking.png`, `exception-detail-results.png`,
  `exception-detail-commentary-import.png`, `exception-detail-invalid-imports.png`,
  and `exception-detail-historical-no-context.png`.

### Concise UI validation for the user

Use the isolated startup instructions above. In the scratch copy, set
`rule_config_path` to `samples/exception_tracking/detail` before
`migrate_rules_to_db`; start the backend/frontend using the documented ports and
open <http://127.0.0.1:5173/>.

1. Upload `samples/exception_tracking/detail/baseline.csv` and `candidate.csv`,
   select `ACCOUNT_ID` as the key, `REGION` as aggregation, and `SEGMENT`/`SCORE`
   as extra columns, then run for `2026-09-30`.
2. On Results, inspect per-rule and cross-rule tables. Confirm the four IDs and
   detail values above. Download the Results template, then select the same date
   on Exception Tracking and download its template; compare the first nine
   headers/order and appended headers/values.
3. Edit a commentary, then alter, blank and reorder appended detail values before
   uploading. Confirm import succeeds, only commentary changes, and the next
   export restores run-derived detail values. Then try an unknown ID and a
   mismatched As-of Date; each must be rejected without partial updates.
4. Scroll/paginate exception detail rows and verify IDs remain the same as the
   workbook. For historical context with no saved run, use the existing optional
   isolated DB seed instructions above; expect only the nine original columns.

**READY FOR USER UI VALIDATION.** B/backend and D/frontend deliveries are
integrated in the required order; combined tests and actual Chrome checks passed
for the new behavior. The unrelated baseline pytest/Ruff/mypy findings remain
documented. User functional acceptance is still outstanding. The `.config`,
requirement edits and `test-data/` remain untouched and uncommitted; no main
merge, deployment, worktree deletion or live-data modification occurred.

## Follow-up: Commentary template exception details and table identity

### Commit integration and ownership

- Worker B's new backend commits were cherry-picked first, after the existing
  B/A integration was verified:
  - `027b6c1` → `9c2f5be` — publish/freeze the detail contract.
  - `37c81e5` → `c153562` — append saved-run detail values in the shared
    workbook/API.
  - `b28849c` → `bda078b` — real-store detail integration test.
  - `8dd3d03` → `a792589` — B delivery report.
  - `254057b` → `df5a7eb` — skip unrelated saved runs while resolving details.
  - `3945e01` → `a0b8d2e` — performance evidence update.
- Worker D's earlier selector commit `feb6518` was already integrated; it was
  not repeated. New D commit `3cf507c81567496506e49f00418acb814302e756` was
  cherry-picked after B as `cdfcfb78a87aa6246b091748339346988c76ad2f`.
- Reviewer correction commit `0930544` covers ID fallback across paginated
  details, canonical/missing-ID behavior, and extra-column visibility. Generated
  `frontend/dist` was rebuilt in `713b37e`.
- No Worker B or D worktree was modified. The integration worktree's user edits
  in `.config`, the requirement file, and untracked `test-data/` remain
  unstaged/uncommitted. No live tracking database was opened.

### Independent findings and corrections

1. **B — only append visible table extras.** B's initial resolver appended all
   configured `exception_columns`, even when the saved run explicitly had
   `extra_column_display.exception_tables == false`. That disagreed with the
   Results Exception Table. Returned as a B backend correction; the integration
   fix omits hidden extras but retains visible key, Rule Index and aggregation
   columns. Regression coverage exercises the false flag.
2. **B — multiple rules and absent history context.** Added coverage for
   different rule identifiers/detail values and for a historical exception
   without a matching saved run. Without context, the export keeps the original
   nine columns and does not synthesize detail values.
3. **D — paginated detail wire mismatch.** The delivered frontend preferred an
   optional `exception_id`, but the existing paginated violation endpoint
   returns `rule_identifier` and `key_columns`, not `exception_id`. The worker's
   pagination test mocked a field the real API does not send. Returned as a D
   frontend correction; because the handoff was complete and no worker session
   was active, the integration reviewer fixed it without changing D's worktree
   or launching a duplicate worker. The frontend now prefers explicit IDs and
   otherwise derives the canonical literal using configured key order. The
   paginated exception table shows the ID column; noncanonical/missing identity
   remains `—`, never an incremental row number or guessed `Rxxx` ID.
4. **D — current wire shape verified.** Added an API regression confirming
   paginated violation rows retain `rule_identifier` and key values across page
   offsets. Frontend tests now use that actual shape (no mocked `exception_id`)
   and assert both stable IDs and their display in a paginated exception table.

### Exact validation results

- Worker B branch independent focused suite:
  `uv run pytest -q tests/backend/test_exception_tracking_integration.py tests/backend/test_exception_tracking_api.py tests/backend/test_exception_tracking_workbook.py tests/backend/test_settings.py`
  — **48 passed, 5 dependency-gated skips**. The B-only worktree remained
  otherwise clean except its pre-existing untracked `data/prepare_cache/`.
- After B integration, focused combined B/A/run-detail/settings tests passed:
  **65 passed**, using the real Worker A repository.
- Worker D branch: after `npm --prefix frontend run build`,
  `npm --prefix frontend test -- --run` — **53 files, 486 tests passed**;
  `npm --prefix frontend run build:inspect` — **5 passed**; production build
  passed. The generated worker-branch assets were restored and D's worktree is
  clean.
- Final integrated checks:
  - `uv run python backend/manage.py check` — passed.
  - `uv run python backend/manage.py makemigrations --check --dry-run` — passed;
    no migration changes.
  - `uv run pytest -q tests/backend tests/contracts tests/integration` —
    **479 passed, 1 failed**. The sole failure remains the unrelated baseline
    `test_migration_reconciles_later_file_edits` (`KeyError: 'rule_id'`).
  - Full `ruff check backend tests` retains the same five unrelated baseline
    findings; full mypy retains the two baseline findings already recorded.
    Targeted Ruff on the changed backend files passed.
  - `npm --prefix frontend test -- --run` — **54 files, 489 tests passed**.
  - `npm --prefix frontend run build` — passed (TypeScript + Vite); Vite's
    >500 kB chunk advisory remains.
  - `npm --prefix frontend run build:inspect` — **5 passed**. Targeted ESLint
    had no errors and two existing fast-refresh warnings in `DetailTable.tsx`.
  - `git diff --check` — passed after normalizing Vite's generated whitespace.
- No database schema or migration change was made. Backend tests use isolated
  temporary databases.

### Actual browser validation — completed

Headless Google Chrome was used with an isolated scratch copy at
`/tmp/opencode/boat-control-exception-detail-final`, with Django on `127.0.0.1:8001`
and Vite on `127.0.0.1:5174`. Port 8000 was already occupied by an existing
process rooted in the integration worktree; it was not accessed or changed.

- Ran the detailed sample for `2026-09-30` with two rules: value-vs-constant
  (R001) and column-vs-column (R002), `ACCOUNT_ID` key, `REGION` aggregation,
  and `SEGMENT`/`SCORE` extra columns. Results showed four stable IDs: R001/A,
  R001/B, R002/A and R002/C. IDs matched the tracking API and downloaded
  workbook exactly.
- The shared template retained its original nine columns in order, then
  appended `ACCOUNT_ID`, `Rule Index`, `REGION`, `SEGMENT`, `SCORE` without
  duplication. Detail values matched the Results Exception Table, including
  per-rule values. Results and Exception Tracking workbook rows matched exactly.
- Edited commentary and changed, cleared and formula-filled appended
  informational cells. Upload succeeded and changed only commentary; a later
  export restored the original saved-run detail values. Unknown-ID and
  mismatched-As-of-Date workbooks were rejected, with existing commentary
  unchanged.
- Created a historical tracking exception with no saved-run context for
  `2025-01-15`. The UI showed it; its workbook retained only the original nine
  columns and no invented detail values.
- Queried the real paginated violation endpoint in four pages through the
  frontend mapper. IDs remained stable and matched the table/workbook IDs even
  though the endpoint supplies canonical rule IDs and keys instead of an
  explicit `exception_id`.
- Screenshots: `/tmp/opencode/exception-detail-results-table.png`,
  `exception-detail-tracking.png`, `exception-detail-results.png`,
  `exception-detail-commentary-import.png`, `exception-detail-invalid-imports.png`,
  and `exception-detail-historical-no-context.png`.

### UI validation for the user

Use the isolated startup commands/URLs in **Reproducible local startup** above.
Before running `migrate_rules_to_db` in the scratch copy, set its copied
`.config` `rule_config_path` to `samples/exception_tracking/detail`. Upload
`detail/baseline.csv` and `detail/candidate.csv`, set `ACCOUNT_ID` as the key,
select `REGION` aggregation and `SEGMENT`/`SCORE` extra columns, then run at
`2026-09-30`.

On Results, compare the four displayed Exception IDs and appended detail values
with the downloaded template. Open Exception Tracking for the same date and
compare its download. Edit one commentary and alter/clear appended informational
cells, upload, then confirm commentary changes while re-exported detail values
remain sourced from the saved run. Finally try an unknown ID and a mismatched
As-of Date; both must fail without changing stored commentary. Optional
historical no-context seed steps are documented in the earlier follow-up section.

**READY FOR USER UI VALIDATION.** B backend and D frontend commits are reviewed
and integrated in order, cross-layer corrections are covered by the combined
tests and actual browser checks, and the user still performs final functional
acceptance. The unrelated baseline pytest/Ruff/mypy findings remain documented.
User changes remain uncommitted; no main merge, deploy, worker-worktree deletion
or live-data modification occurred.

## Follow-up: Commentary template exception details and table identity

### Integrated commits and ownership

- Earlier Worker B API/workbook/settings commits and Worker D's original frontend
  workflow / As-of Date selector commits were already in this branch. They were
  not replayed.
- New Worker B backend commits, integrated before D:
  - `027b6c1` contract → `9c2f5be`
  - `37c81e5` API/workbook → `c153562`
  - `b28849c` real-store integration tests → `bda078b`
  - `8dd3d03` delivery report → `a792589`
  - `254057b` saved-run scan optimization → `df5a7eb`
  - `3945e01` delivery evidence → `a0b8d2e`
- New Worker D frontend commit `3cf507c81567496506e49f00418acb814302e756`
  was integrated as `cdfcfb78a87aa6246b091748339346988c76ad2f` after B.
- Earlier D selector commit `feb6518f8f5eca7f7ef989c65aa7e9b3d23aaa1f` was
  already integrated as `6782464`; it was not cherry-picked again.
- No Worker B or D worktree was changed by this review. The pre-existing user
  changes in `.config`, the requirement file, and untracked `test-data/` remain
  unstaged and uncommitted.

### Independent review findings and resolutions

1. **Backend exception-detail enrichment:** B's service uses the tracking
   `exception_id` as the join key, scans only saved runs for the selected
   `as_of_date` (newest first), and maps key values, Rule Index, aggregation
   labels and extra values. It de-duplicates headers against the original nine
   workbook columns and across appended columns. The Results and tracking
   download routes share the same export service.
2. **Visibility mismatch returned to B:** B initially appended configured
   exception/extra columns even when the run had
   `extra_column_display.exception_tables == false`, although the Results
   Exception Table hides those columns. Reviewer change in `backend/apps/
   exception_tracking/api_services.py` now omits hidden extras while retaining
   keys, Rule Index and visible aggregations. Added regression coverage.
3. **Multiple rule/history coverage:** added API-service coverage for two
   different rule identifiers/detail value sets, newest-run precedence, and a
   historical exception with no matching run context. Missing context leaves
   the original nine columns and invents no values.
4. **Paginated identity gap returned to D:** the completed D commit read only an
   optional `exception_id` from paginated detail responses, but the current
   `/runs/<id>/details/?section=violations` API supplies `rule_identifier` and
   ordered `key_columns`, not `exception_id`. D's handoff test mocked a field
   the integrated API does not send. With no active D session, I recorded the
   correction here and applied the integration reviewer fix: the wire mapper
   prefers an explicit ID and otherwise derives the canonical literal from the
   API's canonical rule ID and configured key order; missing/noncanonical
   context displays `—`. Paginated exception tables now show the ID column.
   The fix was tested against the actual paginated API shape on two pages.
5. **Invalid/missing identity:** the frontend fallback does not use row number,
   page offset, or local `Rxxx` as an ID. Empty explicit IDs fall back only when
   canonical rule/key context is complete; otherwise no ID is fabricated.

The Worker D handoff was complete and no active worker session was available;
no duplicate worker was launched. Reviewer corrections were made on the
integration branch and the worker worktree was left unchanged.

### Validation results

- Worker B branch independent backend suite:
  `uv run pytest -q tests/backend/test_exception_tracking_integration.py tests/backend/test_exception_tracking_api.py tests/backend/test_exception_tracking_workbook.py tests/backend/test_settings.py`
  — **48 passed, 5 dependency-gated skips**. After B was integrated with A, the
  same focused integrated suite plus run-detail/settings checks passed **65**.
- Worker D branch after its build:
  `npm --prefix frontend test -- --run` — **53 files, 486 tests passed**;
  `npm --prefix frontend run build` — passed; `npm --prefix frontend run build:inspect`
  — **5 passed**. The worker worktree was restored to its original generated
  assets after this independent build.
- Integrated backend/contract/full-suite checks:
  - `uv run python backend/manage.py check` — passed.
  - `uv run python backend/manage.py makemigrations --check --dry-run` — passed,
    no model changes.
  - Focused B/A/run-detail/settings tests — **65 passed**.
  - `uv run pytest -q tests/backend tests/contracts tests/integration` —
    **479 passed, 1 pre-existing failure**:
    `test_migration_reconciles_later_file_edits` (`KeyError: 'rule_id'` in the
    unrelated legacy rule migration; already reproduced on setup baseline).
  - Full Ruff still reports the same five unrelated findings; full mypy still
    reports the two unrelated findings recorded earlier. Targeted backend Ruff
    passed; mypy's only remaining diagnostic in the tracking package command is
    the existing `backend/apps/rules/repository.py:218` issue.
- Integrated frontend after reviewer corrections:
  - `npm --prefix frontend test -- --run` — **54 files, 489 tests passed**.
  - `npm --prefix frontend run build` — passed (TypeScript + Vite); >500 kB
    chunk advisory remains.
  - `npm --prefix frontend run build:inspect` — **5 passed**.
  - Targeted ESLint — no errors; two existing fast-refresh warnings in
    `DetailTable.tsx`.
  - `git diff --check` — passed after generated bundle whitespace normalization.
- No database migrations or backend schema changes were introduced by the
  detail enhancement. Tests used isolated databases; no committed/live database
  was modified.

### Actual browser validation — completed

Used Google Chrome with isolated scratch source/database at
`/tmp/opencode/boat-control-exception-detail-final`. The scratch app ran Django
on `127.0.0.1:8001` and Vite on `127.0.0.1:5174` because port 8000 was occupied
by a process rooted in the integration worktree; that process was not accessed
or changed.

- Uploaded the two-rule detail sample (R001 value-vs-constant and R002
  column-vs-column), selected `ACCOUNT_ID`, `REGION` aggregation, and `SEGMENT`
  / `SCORE` extras, then ran for `2026-09-30`.
- Results Exception Table displayed four stable IDs: R001/A, R001/B, R002/A,
  R002/C. These exactly matched both tracking API IDs and workbook IDs.
- Both Results and Exception Tracking downloads had the original nine columns
  unchanged, followed by `ACCOUNT_ID`, `Rule Index`, `REGION`, `SEGMENT`,
  `SCORE`; values matched the displayed rows, including distinct rule indices
  and aggregation/extra values. The two workbooks' Exceptions sheets matched
  exactly for the same date.
- Changed commentary and edited, blanked and added a formula to appended
  informational cells. Upload succeeded; commentary changed, while a subsequent
  export re-derived the original saved-run detail values. No informational cell
  affected identity or exception data.
- Uploaded an unknown-ID workbook and a mismatched-date workbook. Both were
  rejected; prior commentary remained unchanged. Backend tests additionally
  cover duplicate IDs and atomic rollback.
- Created a historical exception for `2025-01-15` without a saved run. It was
  selectable/exportable with the original nine columns only—no appended values
  were invented.
- Called the real paginated violation-detail endpoint through the frontend
  mapper with page size 1. Four offsets yielded four stable IDs matching the
  visible table and workbook IDs. The current Results UI renders exception
  detail tables directly; the paginated mapping path was exercised against the
  actual API response shape.

Screenshots/evidence under `/tmp/opencode/`:
`exception-detail-results-table.png`, `exception-detail-tracking.png`,
`exception-detail-results.png`, `exception-detail-commentary-import.png`,
`exception-detail-invalid-imports.png`, and
`exception-detail-historical-no-context.png`.

### User validation steps and disposition

Use the isolated startup commands above. For the detail sample, before
`migrate_rules_to_db`, set the copied `.config` `rule_config_path` to
`samples/exception_tracking/detail`; use its `baseline.csv` and
`candidate.csv`. At <http://127.0.0.1:5173/> select `ACCOUNT_ID` as the key,
`REGION` as aggregation, and `SEGMENT`/`SCORE` as extra columns, then run both
rules for `2026-09-30`. On Results and Exception Tracking, check the four IDs,
appended headers and values, and download both templates. Edit commentary plus
appended informational cells and upload; verify commentary updates while
re-exported detail values stay unchanged. Then try an unknown ID and an As-of
Date mismatch; both should fail without partial updates. The optional historical
no-context seed from the prior section can confirm a historical export keeps
nine columns only.

**READY FOR USER UI VALIDATION.** Integrated backend/frontend checks and actual
Chrome scenarios are complete. Final functional acceptance remains with the
user. Worker branches remain intact; current user edits in `.config`, the
requirement file and `test-data/` remain uncommitted. No main merge, deployment,
worktree deletion or live-data access occurred.
