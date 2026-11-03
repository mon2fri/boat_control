# 2026-11-03 Exception Tracking Worker B Delivery

## Status

`IMPLEMENTATION COMPLETE — FINAL INTEGRATION DEPENDENCY PENDING`

Worker B's API, workbook, settings and tests are committed on
`work/20261103-exception-tracking-worker-b`. The B/A boundary was executed
successfully against Worker A's current repository implementation in its
worktree; Worker A had not committed that implementation at the time of this
handoff. The reviewer must integrate the accepted Worker A repository commit,
then rerun the B integration test (it is skipped in the B-only branch).

## Read and inspected

Read completely:

- `requirements/20261103_exception_tracking_enhancement.md`
- `planning/20261103_exception_tracking_worker_b_api_instruction.md`
- `planning/20261103_exception_tracking_coordinator_reviewer_instruction.md`
- `planning/20261103_exception_tracking_worker_a_storage_instruction.md`
- `planning/20261103_exception_tracking_worker_c_capture_instruction.md`
- `planning/20261103_exception_tracking_worker_d_frontend_instruction.md`
- Worker A's published contract `docs/20261103_exception_tracking_storage_contract.md`

Inspected the existing settings, URL, run persistence, report export, and test
patterns before implementing.

## Commits

- `b653834` — docs: publish exception tracking API and XLSX contract
- `9f047d9` — feat: add exception tracking database path setting
- `91ee51d` — feat: add exception tracking API and commentary workbook
- `8b4fa17` — test: add skipped real-repository integration boundary
- `a9d937a` — test: verify tracking API against real storage adapter
- `e364f30` — fix: preserve literal apostrophes in commentary workbook
- `34d5b11` — fix: accept Excel date cells for workbook as-of date

## Changed files

- `backend/apps/exception_tracking/__init__.py`
- `backend/apps/exception_tracking/api_services.py`
- `backend/apps/exception_tracking/dates.py`
- `backend/apps/exception_tracking/serializers.py`
- `backend/apps/exception_tracking/urls.py`
- `backend/apps/exception_tracking/views.py`
- `backend/apps/exception_tracking/workbook.py`
- `backend/apps/settings/serializers.py`
- `backend/apps/settings/services.py`
- `backend/apps/settings/views.py`
- `backend/boat_control/urls.py`
- `docs/20261103_exception_tracking_api.md`
- `tests/backend/test_exception_tracking_api.py`
- `tests/backend/test_exception_tracking_integration.py`
- `tests/backend/test_exception_tracking_workbook.py`
- `tests/backend/test_settings.py`

Worker B did not modify Worker A's repository/identity/domain modules, Worker C's
run capture, frontend files, generated build output, live data, or the original
checkout.

## Published contract decisions

Endpoints under `/api/exception-tracking/`:

- `GET dates/` → `{dates, default_as_of_date}`
- `GET ?as_of_date=YYYY-MM-DD` → `{as_of_date, total, exceptions}`; status is
  always returned; omitted date uses the backend default.
- `GET export/?as_of_date=...` or `export/?run_id=...` → shared XLSX attachment.
  `run_id` reads Worker C's persisted top-level `as_of_date`; no guessing for old
  runs.
- `POST import/` multipart `file` plus optional `as_of_date` → updated/cleared/
  unchanged counts and refreshed records.

XLSX workbook `exception_commentary/v1`:

- `Template` sheet records version, exact as-of date, generation time and blank
  commentary instructions.
- `Exceptions` sheet has nine columns: the eight tracking-view columns plus
  `Status`.
- Import validates exact date and exact exception-ID set, rejects unknown,
  duplicate and missing IDs, malformed sheets/headers, formulas in commentary,
  files over 10 MiB, and more than 100,000 rows. All validation occurs before a
  single repository update call.
- Text is formula-injection protected; literal apostrophes before formula-like
  text round-trip.
- Blank commentary is an explicit clear for the selected date; history/status
  then follow Worker A's frozen semantics.

Date default:

- Last Monday-Friday of the previous month, including January/year rollover.
  The backend exposes and uses this default; the frontend must not compute it as
  authority.

Settings:

- New `exception_tracking_path` (default `data/exception_tracking.db`) in
  `.config`, response and validation.
- Linux absolute paths are used as-is on Linux; Windows drive/UNC paths are used
  as-is on Windows. Foreign absolute paths are not rewritten as relative paths;
  they are rejected with a clear host message. Relative values remain raw in
  `.config` and resolve against the project root when opened.
- Parent must be creatable/writable; an existing directory or unusable path is
  rejected with HTTP 400. There is no server-side picker; Worker D owns picker
  behavior.

## Requirement coverage (Worker B portion)

- Req. 2: backend default date and wire support complete; UI picker is D.
- Req. 3: B consumes A's ten-column store; B does not create a second store.
- Req. 4: settings persistence and path validation complete; picker is D.
- Req. 5: status is returned by the list API and XLSX; authority remains A.
- Req. 6: date-filtered list and all eight displayed fields plus status complete.
- Req. 7: download commentary template complete.
- Req. 8: validated, atomic XLSX import complete.
- Req. 9: same shared workbook/export endpoint supports result-page download via
  `run_id` (needs Worker C `as_of_date` persistence).

## Commands and results

```text
uv run pytest -q tests/backend/test_exception_tracking_workbook.py \
  tests/backend/test_exception_tracking_api.py tests/backend/test_settings.py
39 passed

uv run pytest -q tests/backend tests/contracts tests/integration
319 passed, 4 skipped, 1 failed
```

The single failure is pre-existing and unrelated:
`tests/backend/test_rule_identifier_release_review.py::test_migration_reconciles_later_file_edits`
fails because a legacy YAML draft lacks `rule_id` (`KeyError: 'rule_id'`).

```text
uv run python backend/manage.py check
System check identified no issues (0 silenced).

uv run python backend/manage.py makemigrations --check --dry-run
No changes detected
```

Targeted lint/type checks for B files pass. Repository-wide `ruff check backend
tests` and `mypy backend` still report pre-existing failures in
`backend/apps/rules/...`, `backend/apps/configs/views.py`, and
`tests/backend/test_rule_catalog_api.py`.

B/A real-dependency verification was run by temporarily placing Worker A's
current `domain.py`, `errors.py`, `identity.py` and `repository.py` into the B
worktree (then removing them):

```text
uv run pytest -q tests/backend/test_exception_tracking_integration.py
4 passed
```

`git diff --check aabcf5c..HEAD` is clean.

## Dependencies / blockers

1. **Worker A commit required.** A's storage contract doc is `bbdc06d`; its
   repository/domain/identity implementation was still uncommitted. Integrate
   the accepted A repository commit before final B verification.
2. **Worker C commit required for result-page `run_id` export.** C must persist
   top-level `as_of_date` in new run documents. Old runs remain readable and get
   an actionable 400 instead of a guessed date.
3. The pre-existing full-suite test, ruff and mypy failures listed above must be
   resolved or accepted by the coordinator/reviewer; they are not caused by
   Worker B.
