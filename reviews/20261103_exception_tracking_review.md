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

## Follow-up: Exception Tracking Template optimization (2026-11-04)

### Baseline, worker tips and dependency order

- Integration review baseline: `db5d57b82a68d550ca0234e81355f5be50023a43`
  (`Fix UTF-8 preparation cache reads on Windows`). The cache read still uses
  explicit UTF-8; `git diff db5d57b..HEAD -- backend/apps/files/preparation_cache.py`
  is empty.
- Worker tips inspected, including final rework commits:
  - A `8168fd99760fa7dcc2a867ec5fac6bc18054a635` — storage and precedence fix.
  - B `7580dbb` — API/workbook and date-scoped schema rework/type fix.
  - C `f251a5e59c07866cfa5eba4348e34ac1b3026306` — capture/config/report scope.
  - D `80e2ec8389070fb009bae79315b45dc50d98a699` — frontend controls.
- Workers share the older `aabcf5c` base, not the integration tip. Their full
  branch diffs include already-integrated earlier exception-tracking work and
  removals caused by that divergence; no worker branch was merged wholesale.
  Only reviewed template-optimization commits listed below were cherry-picked.
- Integration order was A storage → B API/workbook → C capture/config/reports →
  D frontend. B consumes A's persisted selection/value contract; C sends the
  ordered selection through A and owns report filtering/config backend; D maps
  B/C interfaces.
- Worker worktrees remain intact. A and B each retain their pre-existing
  untracked `data/prepare_cache/`; C/D were clean at handoff. No live database
  was used.

### Reviewed commit mapping

The selected template-optimization commits were integrated as follows; omitted
worker report-only commits are summarized here rather than copied into the
integration review tree.

- Worker A:
  - `5057fba` → `2b06548` storage contract.
  - `dd2d7f5` → `a382281` persisted ordered selection, Rule Index and values.
  - `df93efd` → `4d4f884` empty-filling export helper.
  - `8168fd9` → `e1cb1f8` reviewer-requested Rule Index precedence correction.
- Worker B:
  - `3a7f8e2` → `189fba5` API/workbook contract.
  - `17da6ef` → `823c221` v2 workbook, tracking table endpoint, filters/sort/page.
  - `e32561e` → `fb33487`; `eb04b82` → `669df2a` compatibility and formula-safe
    selected headers.
  - `b8b5530` → `738ba7d`; `8c9177b` → `d6eac43`; `7812e01` → `39e3a42`
    canonical A metadata, documentation alignment and row grouping.
  - `f1723d5` → `5bf5ada` date-scoped selected columns (rework below).
  - `7580dbb` → `6c3ebf2` no-redefinition fix required by mypy.
- Worker C:
  - `c8898b2` → `07037c0` capture, rows-and-columns config and report filtering.
  - `3f0b20c` → `514c89f` reserved headers/source fixture correction.
  - `f02d5fd` → `8d9a30e` real-storage verification.
  - `532001b` → `7730f00` API docs for report scope override.
- Worker D `80e2ec8` → `329dc83` frontend selection, table chooser/paging and
  New Exceptions Only controls.
- Generated deployable assets are rebuilt and committed after final source
  acceptance; the review/test fix for `test_run_detail_views.py` and real A/B
  schema regression are reviewer-owned.

Earlier A/B/C/D exception-tracking and D selector/identity commits were already
represented in this integration history and were not cherry-picked a second
time. In particular, D's As-of Date selector and stable-ID feature remain in
place. The Windows UTF-8 cache fix remains the parent baseline.

### Frozen cross-worker contract and requirement coverage

- **Only source of appended data:** the ordered **Extra Columns for Commentary
  Template** selection. Existing Extra Column, attribute comparison sections,
  keys/aggregations and exception-table display fields do not infer or inject
  template data columns. Selection order is retained. Empty latest selection
  adds no source columns.
- **Historical schema rule:** for As-of Date D, use D's own exact ordered
  selection, then append columns selected on later As-of Dates, chronologically
  and in each later selection's order, skipping names already present. A column
  selected only on an earlier date but deselected on D is omitted on D. This
  reconciles “only the configured selection” with “later-selected columns are
  empty on earlier records”: e.g. August `[REGION, SEGMENT]`, September
  `[SEGMENT, PORTFOLIO]` produces August `[REGION, SEGMENT, PORTFOLIO]` (blank
  historical Portfolio) and September `[SEGMENT, PORTFOLIO]` (no stale Region).
  The tracking API's columns and both workbook paths use this same schema.
- **Storage:** selected values and historical Rule Index are captured per
  exception/date in the separate SQLite database. Legacy ten-column tables are
  read-compatible and upgraded transactionally; repeated migration, rollback,
  database reopen and later-added empty values are tested. No Django migration
  is required. Values are not reconstructed from source uploads or current rule
  catalog order.
- **Rule Index precedence:** newest capture timestamp wins per same-date
  Exception ID, independent of occurrence timestamp; equal capture timestamp
  uses later serialized write. A capture lacking Rule Index does not clear it;
  conflicting nonblank values within one capture still fail. The internal
  capture timestamp column is a migration-safe storage marker, not a wire field.
- **Workbook v2/UI order:** `Exception ID`, `Exception Status`, `Commentary`,
  `Rule Index`, then standard tracking metadata in documented order, then the
  date-scoped selected data columns. First four XLSX columns have visible
  dimensions; all remaining columns are actually hidden but retain values.
  Exception Tracking defaults to the same first four and exposes the remaining
  metadata/selected columns with its chooser. v1 imports remain compatible;
  v2 requires the first four headers, and later data is informational.
- **Rows and columns config:** backend serializes `commentaryTemplateColumns`
  separately from `extraColumns`, preserves order, rejects invalid/reserved or
  duplicate names, and returns `[]` for older config missing the field. Frontend
  load explicitly replaces current state, so stale selections clear.
- **Run capture/source values:** C validates the concrete selection against the
  uploaded source headers and captures only those selected values. Comparison
  side wins when that source column is present; otherwise baseline is used;
  otherwise empty text. Rule Index is the historical run-local rule ID. Capture
  stores all violations before display filtering and fails closed if tracking
  capture/enrichment fails.
- **New Exceptions Only:** checked by default; includes New + NotCommented,
  excludes Commented, with unknown legacy statuses kept visible. It changes
  result/ordinary HTML/Excel view only. Tracking persists all exceptions, and
  commentary XLSX always includes every exception, New/NotCommented before
  Commented, sorted deterministically by Exception ID. Commentary is prefilled.
- **Tracking table operations:** server-side filter/sort occurs over the full
  date dataset before pagination; default page size 50 and allowed 50/100/200/500.
  Filter choices come from the complete set. Filter changes reset to page one;
  stable ID tie-breaks are applied.
- **Import safety:** v1/v2 file/version policy, required version-specific
  headers, selected date, ID/duplicate/missing validation, upload limits and
  atomic commentary updates remain. Appended informational values/formulas are
  ignored; commentary formula cells remain rejected. Invalid rows never update
  a subset of the database.

### Findings and rework rounds

1. **A Rule Index conflict (rework accepted).** Initial A contract preserved a
   nonblank prior Rule Index on same-date rerun, while B/C specified newest
   capture wins. Returned to A. A added the migration-safe capture timestamp
   marker and tests for newer captures with older occurrence timestamps, older
   out-of-order captures and exact ties. Independently verified; integrated as
   `e1cb1f8`.
2. **B automatic union leaked deselected historical columns (rework accepted).**
   Browser reproduction used August `[REGION, SEGMENT]` then September
   `[SEGMENT, PORTFOLIO]`; before rework the September output still contained
   prior-only `REGION`. Returned to B. B implemented the date-aware rule above
   for tracking metadata and both exports, added tests for later-added blanks,
   explicit empty latest selection, and compatibility fallback, and committed
   `f1723d5` (`5bf5ada` integrated). Integration added a real A repository + B
   API/workbook test in `tests/backend/test_exception_tracking_integration.py`.
   Independent focused real-service tests passed. Actual Chrome recheck shows
   September only Segment/Portfolio and August also includes empty Portfolio.
3. **B mypy issue (rework accepted).** Full mypy after date-scoping found a new
   local-variable `no-redef` in B's compatibility fallback. Returned to B;
   `7580dbb` renamed the fallback variable without changing behavior. Targeted
   tests/Ruff passed; after integration full mypy returned to only the two
   pre-existing unrelated errors.
4. **Commit conflicts and resolution:** the branches have old common ancestry and
   prior feature history is not an exact fast-forward. Conflicts were resolved
   narrowly: old automatic-detail tests/docs are superseded by the latest
   selection contract; stable Exception ID fallback documentation remains.
   Retained both the previous run-detail identity-input test and C's
   New-Exceptions scope test; retained the null group-statistics mapping test
   alongside D's saved-run restoration test. Worker-specific delivery reports
   were not copied over the integration review. No user planning/config/data
   file was staged.

### Independent validation results

- Worker A after precedence rework:
  `uv run pytest -q tests/backend/test_exception_tracking_identity.py tests/backend/test_exception_tracking_store.py tests/backend/test_exception_tracking_template_storage.py`
  — **104 passed**; targeted Ruff and storage-package mypy passed. Integration
  run of the same storage/identity set — **106 passed**.
- Worker B after date-scoping rework:
  `uv run pytest -q tests/backend/test_exception_tracking_api.py tests/backend/test_exception_tracking_workbook.py tests/backend/test_settings.py`
  — **59 passed**; targeted Ruff passed. The same API/workbook suite on the
  integration branch after A/B/C integration, plus capture/config/report and
  storage tests — **259 passed**. A real A/B integration regression suite
  (`tests/backend/test_exception_tracking_integration.py`, API and workbook)
  — **61 passed**.
- Worker C focused suite from its handoff:
  `uv run pytest -q tests/backend/test_rows_and_columns_template_columns.py tests/backend/test_tracking_context.py tests/backend/test_report_new_exceptions.py tests/backend/test_tracking_capture.py tests/backend/test_run_capture_views.py tests/backend/test_persistence.py tests/backend/test_run_detail_views.py tests/backend/test_runs.py`
  — **149 passed**.
- Worker D focused UI/config/result suite run independently — **7 files, 92
  tests passed**. Worker D's completion report records its full **54 files / 498
  tests**, production build and build inspection; integration independently
  reran the combined frontend suite below.
- Final integrated gates at `6c3ebf2`:
  - `uv run python backend/manage.py check` — pass.
  - `uv run python backend/manage.py makemigrations --check --dry-run` — pass,
    no Django migration changes.
  - `uv run pytest -q tests/backend tests/contracts tests/integration` —
    **580 passed, 1 failed**. The only failure is the pre-existing,
    unrelated `test_migration_reconciles_later_file_edits` (`KeyError: 'rule_id'`)
    in legacy rule YAML migration; it is unchanged from the recorded baseline.
  - `uv run ruff check backend tests` — the same **5 unrelated baseline
    findings** (migration import sorting and four long lines in
    `test_rule_catalog_api.py`). Targeted Ruff for all changed backend files and
    tests passes.
  - `uv run mypy backend` — only the **2 unrelated baseline** errors remain in
    `backend/apps/rules/repository.py:218` and `backend/apps/configs/views.py:322`;
    B's new API `no-redef` finding is fixed.
  - `npm --prefix frontend test -- --run` — **55 files, 501 tests passed**.
  - `npm --prefix frontend run build` — TypeScript/Vite pass (252 modules); Vite
    retains its >500 kB chunk advisory. `npm --prefix frontend run build:inspect`
    — **5 passed**.
  - `git diff --check HEAD -- backend docs frontend tests` — pass. The full
    worktree `git diff --check` still reports two trailing-space lines in the
    user's pre-existing edited requirement file; they are intentionally
    untouched. Committed implementation diff is clean.
- Generated frontend bundle remains a tracked deployable artifact; it is rebuilt
  below. No SQLite database files are tracked. The UTF-8 cache fix remains
  present. Test and browser databases/files were under `tmp_path` or
  `/tmp/opencode/boat-control-template-optimization.s0M0qn` only.

### Actual Chrome validation — completed, reviewer and user scope separated

Used headless Google Chrome with an isolated source/config/database copy at
`/tmp/opencode/boat-control-template-optimization.s0M0qn`, Django at
`http://127.0.0.1:8011/` and Vite at `http://127.0.0.1:5176/`. The scratch
`.config` used `rule_config_path=samples/exception_tracking`,
`run_history_path=<scratch>/data/results`, and
`exception_tracking_path=<scratch>/data/custom_exception_tracking.db`. The
scratch started from migrations and `migrate_rules_to_db`; it did not use the
integration `.config`, `test-data/`, or a live DB.

- Browser saved and loaded ordered `REGION, SEGMENT`; it then loaded a legacy
  rows-and-columns config without `commentaryTemplateColumns`, and the prior
  selection cleared. A different ordered selection was then loaded for
  September.
- August 31 run: 65 exceptions. The UI used Extra Column `BALANCE`, an attribute
  comparison section, and commentary selection `REGION, SEGMENT`. The v2 XLSX
  had 65 rows, the first four columns visible, all columns 5+ hidden in actual
  Excel dimensions, and only selected/persisted commentary data appended—not
  BALANCE. Results and Exception Tracking workbook sheets matched exactly; all
  65 displayed result IDs matched tracking API and workbook IDs.
- Edited commentary for 20 August records, changed/cleared all appended data
  cells and put a formula in an informational cell. Upload succeeded (`Updated
  20`); commentary changed while stored REGION/SEGMENT values did not. Re-export
  from both entry points matched exactly. Unknown-ID, mismatched-date and
  duplicate-ID workbooks were each rejected and the original commentary stayed
  unchanged.
- September 30 run: 90 exceptions. Stored statuses were **25 New, 45
  NotCommented, 20 Commented**. With New Exceptions Only checked by default,
  Results showed 70 IDs including New/NotCommented and excluding Commented;
  unchecking showed all 90. Ordinary Excel and HTML report exception-table
  counts matched the two scopes (70/90); the commentary template always had all
  90, with uncommented before commented and deterministic ID order.
- Exception Tracking rendered exactly the first four columns by default, 50
  rows per page; Next showed the remaining 40. A Commented filter applied to the
  full dataset returned 20 and reset to page one. Page sizes 50/100/200/500
  worked; sorting by Exception ID covered all 90 deterministically. The chooser
  revealed REGION/PORTFOLIO and Show default columns restored four.
- With date-scoped B rework, September API/UI/XLSX schema was exactly
  `SEGMENT, PORTFOLIO` after the standard columns. August schema, after the
  later selection, was `REGION, SEGMENT, PORTFOLIO`, with all 65 earlier
  Portfolio values empty. Results and tracking downloads matched for each date.
- A third isolated run tested independent settings: Extra Column `BALANCE`,
  Attribute Comparing Section `PORTFOLIO`, commentary selection `REGION`. Saved
  run `detail_values` contained only REGION and the October template appended
  REGION only; BALANCE, PORTFOLIO and SEGMENT were absent.
- After both dates were captured, I removed the four CSV upload copies only
  from scratch `data/uploads`, restarted Django against the same isolated DB,
  and re-read September selection/values, Rule Index, 90 exceptions and a
  successful XLSX export. This verifies retrieval does not depend on source
  files or the process lifetime.
- Browser evidence: `/tmp/opencode/template-optimization-upload.png`,
  `template-optimization-prepare.png`, `template-optimization-results-aug.png`,
  `template-optimization-tracking-aug.png`,
  `template-optimization-commentary-import.png`,
  `template-optimization-invalid-import.png`,
  `template-optimization-results-sep-all.png`,
  `template-optimization-tracking-paging.png`,
  `template-optimization-tracking-sep.png`. XLSX/report evidence is under
  `/tmp/opencode/template-opt-*.xlsx` and `template-opt-sep-*.html`.

### Final local startup and user acceptance walkthrough

Use **Reproducible local startup** above (disposable `UI_ROOT`, migrations,
backend `127.0.0.1:8000`, Vite `127.0.0.1:5173`, URL
<http://127.0.0.1:5173/>). Configure only the scratch `.config`; keep run history
and `exception_tracking_path` under that scratch `data/` directory.

For reproducible data, from the copied source tree run:

```bash
python samples/exception_tracking/template_optimization/generate_data.py \
  "$UI_ROOT/template-optimization-data"
```

Then in the UI:

1. Upload the August 31 pair from `template-optimization-data/`; use As-of Date
   `2026-08-31`, key `ACCOUNT_ID`, existing Extra Column `BALANCE`, and Attribute
   Comparing Section `PORTFOLIO`. Set **Extra Columns for Commentary Template**
   in order to `REGION, SEGMENT`. Save a rows-and-columns config, run, verify 65
   New IDs and the first four visible tracking columns. Download from Results
   and Exception Tracking; compare IDs, headers, hidden columns and values.
2. Enter commentary for the first 20 IDs. Change/blank appended informational
   values (including an informational formula) and upload. Verify the import
   succeeds, the status/commentary changes, and the next downloads preserve the
   original stored source values.
3. Upload the September 30 pair, load the saved rows-and-columns config, and
   change the commentary selection to `SEGMENT, PORTFOLIO` (leave BALANCE and
   PORTFOLIO as the other independent selections). Run with **New Exceptions
   Only** checked. Expect 90 stored rows and 70 visible; uncheck to show all 90.
   The tracking table should page 50/40, offer 100/200/500, sort/filter over all
   rows and show only the first four columns until the chooser reveals others.
4. The September template should append only Segment/Portfolio; the August
   historical template should also include later-added Portfolio with empty
   cells. Both downloads for the same date must match, include all rows, and
   prefill commentary; ordinary HTML/Excel reports follow the New Exceptions
   Only toggle.
5. To verify old-config clearing, save/POST a rows-and-columns config without
   the field, for example:

   ```bash
   curl -X POST http://127.0.0.1:8000/api/rows-and-columns/configs/ \
     -H 'Content-Type: application/json' \
     -d '{"name":"legacy-no-template-columns","content":{"keyColumns":[{"kind":"column","name":"ACCOUNT_ID"}]}}'
   ```

   Load it through the UI and confirm the current commentary selection clears;
   reload the saved new config to restore its ordered selection. Finally test an
   unknown/duplicate ID and a wrong As-of Date; each upload should fail without
   partial commentary updates.

**READY FOR USER UI VALIDATION.** All four worker scopes are integrated; A's
Rule Index and B's date-schema issues were returned, corrected and independently
retested. Combined storage/API/capture/report/frontend suites, production build,
and actual browser checks pass for the new behavior. The only automated blockers
are pre-existing baseline pytest/Ruff/mypy findings stated above. The user still
performs final functional acceptance. User `.config`, requirement edits,
untracked planning instructions/addendum and `test-data/` remain untouched and
uncommitted. No merge to main, push, deployment, worker worktree deletion or
live-data modification occurred.

## User UI acceptance and final change set (2026-11-07)

The user confirmed that UI testing is OK. Final functional acceptance is
complete. The latest requirement amendment
`### Commentary workbook default column visibility` supersedes the earlier
workbook hiding rule: the six standard metadata columns (5–10) are hidden, but
selected data columns are visible by default. The final workbook source and tests
match that amendment; the Exception Tracking UI still defaults to its first four
columns.

Post-review implementation changes included in the final consolidation:

- `234e092` permits a selected source-data column named `Status` without
  colliding with the standard `Exception Status` column; reserved-name tests
  cover the distinction.
- `91d988d` implements the amended XLSX visibility rule and updates workbook
  tests.
- `afb974a` plus the staged `services.py`/test changes treat null or absent
  required source values as rule violations and preserve blank-versus-value
  changes with `ne_missing`; tests cover missing values, supported operators,
  condition scope, and comparison blanks.
- The frontend's selected-first value picker/tooltip behavior, the saved
  `s35.yaml` rows-and-columns config, updated `.config`, user test fixtures,
  planning instructions, and screenshot removals are included at the user's
  explicit request to commit all changes. Test CSVs contain synthetic rows only;
  no database file is staged.

Final checks after these changes:

- `uv run pytest -q tests/backend tests/contracts tests/integration` — **613
  passed, 1 known baseline failure** (`test_migration_reconciles_later_file_edits`,
  unrelated legacy `rule_id` YAML migration error).
- `npm --prefix frontend test -- --run` — **55 files, 502 tests passed**.
- `npm --prefix frontend run build` — passed; Vite's existing >500 kB chunk
  advisory remains. `npm --prefix frontend run build:inspect` — **5 passed**.
- Django `check` and `makemigrations --check --dry-run` — passed.
- Full Ruff still has **5 unrelated baseline findings**; full mypy still has
  **2 unrelated baseline findings**. Targeted tests/linters for the changed
  feature files passed.
- Committed code/doc/generated-bundle diffs pass `git diff --check`. The user's
  requirement text had two trailing spaces during validation; those lines were
  whitespace-normalized while preserving their wording before final staging.

**ACCEPTED BY USER.** All worker changes, requested reviewer corrections,
updated user requirements/planning/config/test fixtures, documentation and the
deployable frontend bundle are committed on the integration branch. No main
merge, push, deployment, worktree deletion or live-user-data modification was
performed.

## User acceptance and post-review changes (2026-11-07)

The user confirmed that UI testing is OK. Final product acceptance is therefore
complete. Three follow-on implementation commits were reviewed against the
latest requirement text before final consolidation:

- `234e092` permits a source column named `Status`; the standard workbook header
  is `Exception Status`, so the names do not collide. Reserved-header, API and
  workbook tests cover the distinction.
- `91d988d` applies the later **Commentary workbook default column visibility**
  clarification: only six standard tracking metadata columns are hidden in
  Excel; the first four and selected commentary data columns are visible. This
  later clarification supersedes the earlier “hide every column after the first
  four” requirement. The Exception Tracking UI chooser still defaults to four.
- `afb974a` reports missing required values as rule violations, while retaining
  rule-condition scope and detecting blank-vs-value attribute changes.

Current full integrated validation after those changes:

- `uv run pytest -q tests/backend tests/contracts tests/integration` — **613
  passed, 1 pre-existing failure** (`test_migration_reconciles_later_file_edits`,
  unrelated `KeyError: 'rule_id'`).
- `npm --prefix frontend test -- --run` — **55 files, 502 tests passed**.
- Production frontend build passed; `build:inspect` passed **5 tests**.
- Django `check` and `makemigrations --check --dry-run` passed. Full Ruff and
  mypy retain only the already-documented unrelated baseline findings (5 and 2,
  respectively). Targeted checks for the modified services/workbook/UI pass.

Final disposition: **USER UI ACCEPTANCE COMPLETE**. The integration worktree
contains the reviewed implementation, user-confirmed UI result, and rebuilt
deployable frontend. The user's `.config`, requirement edits, planning
instructions/addendum, sample test data and staged screenshot removals are being
committed at the user's request; no live database is included. No push, main
merge, deployment or worktree deletion was performed.

## Preserve canonical rule identity when integrating main (2026-11-07)

The user confirmed that canonical rule identity is critical and must remain.
Current `origin/main` at `b979633` reverts that foundation. A trial merge
without restoring it failed Django startup with `ModuleNotFoundError` for
`apps.rules.identifiers` and also removed `Rule.rule_identifier` and the initial
rule catalog migration while retaining their consumers.

Integrated `origin/main` into this branch while explicitly retaining all six
foundation files from accepted commit `c107977`: `identifiers.py`, the initial
catalog migration and its package marker, `services.py`, and the identifier and
repository tests. Application and test code remain identical to `c107977`.
The merge records the decision to preserve the foundation despite main's revert.

Validation of the combined result:

- Django `check`: passed.
- `makemigrations --check --dry-run`: passed, no changes detected.
- Full backend/contract/integration suite: **613 passed, 1 failed**, matching
  the previously documented `test_migration_reconciles_later_file_edits`
  legacy YAML `KeyError: 'rule_id'` failure.
- No frontend code changed; frontend checks were not repeated.
- The separate local main worktree and its uncommitted files were untouched.

This resolves the missing-foundation merge blocker. The known test failure
remains; no push, merge into main, deployment, or live-data migration was done.
