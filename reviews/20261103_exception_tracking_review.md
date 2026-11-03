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
| `git diff --check` | Passed after all final edits (rerun before commit below). |

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
