# 2026-11-03 Exception tracking — Worker C delivery

## Status

**IMPLEMENTATION COMPLETE — INTEGRATED VERIFICATION PASSED AGAINST DEPENDENCY SNAPSHOT; FORMAL DEPENDENCY COMMIT STILL PENDING**

Worker C implemented As-of Date propagation, run capture, saved-run metadata, and
backward compatibility. The real A/B integration boundary was exercised in a
throwaway worktree against Worker B's committed API/settings commits and Worker A's
current implementation snapshot: **384 passed, 1 pre-existing failure** across
`tests/backend`, `tests/contracts`, and `tests/integration`.

Worker A's implementation is not committed yet on
`work/20261103-exception-tracking-worker-a` (only contract doc `bbdc06d` and
untracked implementation files are present). The reviewer must integrate A's
implementation commit before the final gate. Worker C has not merged or cherry-picked
any dependency into its branch.

## Worktree and branch

- Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/exception-tracking/worker-c`
- Branch: `work/20261103-exception-tracking-worker-c`
- Starting commit: `aabcf5c` (`Plan parallel exception tracking delivery and reviewer gates`)
- Worker C commits:
  - `36d09ab` — `feat: capture exception tracking on run submission`
  - `5fbf6c7` — `test: cover real run capture and empty tracking dates`
- Working tree: clean (generated `data/prepare_cache/` removed; untracked pre-existing
  user data untouched).

## Reading confirmation

Read completely:

- `requirements/20261103_exception_tracking_enhancement.md`
- `planning/20261103_exception_tracking_coordinator_reviewer_instruction.md`
- `planning/20261103_exception_tracking_worker_c_capture_instruction.md`
- Worker A/B/C/D instruction files
- Worker A published contract `docs/20261103_exception_tracking_storage_contract.md`
  (commit `bbdc06d`)
- Worker B published contract `docs/20261103_exception_tracking_api.md`
  (commits `b653834`, `9f047d9`, `91ee51d`)

## Actual exception row shapes inspected

The capture adapter reads the existing `ValidationViolation` dataclass:

- `rule_id` (run-local `Rxxx`), `rule_identifier` (canonical `CBR1_...` or `None`),
  `rule_name`, `key_columns` (`dict[str, Any]` in configured key order),
  `row_index`, `violating_column`, `violating_value`, `comparison_value`,
  `extra_values`, `grouping_values`.
- `ExecutionResult.key_columns` is the configured key-column order.
- `ExecutionResult.rule_bindings` maps every selected local rule to its canonical
  identifier, including zero-violation rules.
- `ValidationResult.rule_summaries[rule_id]["rule_identifier"]` is a third
  canonical-identifier source for compatibility.
- Multiple violations for the same rule and row (different violating columns)
  exist; requirement 1 does not include the violating column in the identity, so
  Worker C collapses them into one occurrence.

## Contract decisions

### As-of Date

- Strict ISO `YYYY-MM-DD`; `datetime`, timestamps, locale formats, whitespace, and
  impossible dates are rejected with HTTP 400.
- Precedence: execute request `as_of_date` → upload session date → backend default.
- Default is the last Monday-Friday of the previous calendar month using the current
  UTC date, including January/year rollover and weekend rollback.
- Upload accepts an optional `as_of_date`, validates before storing files, retains it
  on the in-memory session, and returns it. Preset loads follow the same rule.
- Saved runs persist `as_of_date` as a top-level ISO string; run metadata list/detail
  and rename return it; old runs load `null` without being modified.

### Capture and identity

- Occurrence payload sent to Worker A:

  ```python
  {
      "exception_rule_identifier": "CBR1_...",
      "key_columns": (("id", "ABC"), ("type", "123")),
      "exception_timestamp": datetime(..., tzinfo=UTC),
  }
  ```

  This matches Worker A's published mapping contract exactly.
- Canonical identifier precedence: violation identifier → run binding → rule summary.
  A missing identifier fails with an actionable error; `Rxxx` is never converted.
- Key values follow configured order. Null, missing, and empty values fail rather
  than producing an ambiguous ID.
- Occurrences are deduplicated by `(rule identifier, ordered key values)`. A detects
  underscore collisions across dates and rolls back.
- Empty runs still call capture so Worker A creates a selectable date table and a
  header-only commentary template.
- Capture happens **before** the run JSON is published. Capture failure returns HTTP
  500 with `tracking_failed`, `retryable`, and `as_of_date`; no run is saved. Same-date
  retries are idempotent. A crash after the tracking commit and before run publication
  leaves valid observed rows and is safe to retry.

### Results export ownership

- Worker B owns `GET /api/exception-tracking/export/?run_id=<run-id>` and the shared
  `/export/?as_of_date=...` workbook. Worker C intentionally did **not** add a second
  results export endpoint or workbook, and removed an early duplicate implementation.
- Worker C supplies the top-level run `as_of_date` that B resolves. Legacy runs without
  a date return B's actionable `run_has_no_as_of_date` error.

### Test isolation

- `tests/conftest.py` sets every pytest test's `EXCEPTION_TRACKING_DB` to a temporary
  path. No test reads or writes the live `data/exception_tracking.db`.
- `tests/integration/run_e2e_workflow.py` also points tracking at a throwaway directory
  and removes it on exit.

## Changed files

- `backend/apps/runs/as_of_date.py` (new): strict date parsing, default, precedence.
- `backend/apps/runs/tracking_capture.py` (new): violation→occurrence conversion,
  identity validation, dedupe, Worker A/B adapters, failure wrapping.
- `backend/apps/runs/services.py`: `as_of_date` on `ExecutionResult` and
  `execute_comparison`.
- `backend/apps/runs/views.py`: date resolution, capture-before-save, 400/500 errors.
- `backend/apps/runs/persistence.py`: top-level `as_of_date`, `created_at` injection,
  metadata/index/rename/load compatibility.
- `backend/apps/runs/persistence_serializers.py`: `as_of_date` metadata field.
- `backend/apps/runs/serializers.py`: request `as_of_date`.
- `backend/apps/files/sessions.py`: session `as_of_date`.
- `backend/apps/files/views.py`: upload validation, response propagation, inspect response.
- `backend/apps/files/preset_views.py`: preset-load date validation and propagation.
- `tests/backend/test_as_of_date.py` (new)
- `tests/backend/test_tracking_capture.py` (new)
- `tests/backend/test_upload_date.py` (new)
- `tests/backend/test_run_capture_views.py` (new)
- `tests/backend/test_exception_tracking_run_capture_integration.py` (new, real A/B gate)
- `tests/backend/test_persistence.py`: As-of Date round-trip, rename, legacy index/doc.
- `tests/conftest.py` (new): tracking DB isolation.
- `tests/integration/run_e2e_workflow.py`: tracking DB isolation/cleanup.
- `docs/20261103_exception_tracking_run_capture.md` (new): full C contract and
  semantics.
- `docs/20260718_runs_api.md`, `docs/20260718_persistence_api.md`,
  `docs/20260718_exports_api.md`: As-of Date, capture failure, legacy, and results
  template handoff.

No frontend, Worker A storage/identity, or Worker B API/workbook/settings files were
modified.

## Requirement coverage (Worker C portion)

| Requirement | Status | Evidence |
| --- | --- | --- |
| 1 — unified exception identity | C supplies canonical rule identifier + ordered key values to A; never guesses | `tracking_capture.py`, capture tests, real integration test asserts `CBR1_..._1` |
| 2 — As-of Date selector/default | Backend validation/default/propagation done; D owns the picker UI | `as_of_date.py`, upload/execute view tests |
| 3 — separate SQLite capture | C invokes A's transactional store; A owns schema/table semantics | `capture_run_exceptions`, empty-run test |
| 4 — configurable DB path | C resolves B's `get_exception_tracking_path()` and passes it explicitly; B owns settings | `resolve_tracking_db_path`, real integration test |
| 5–8 — status/history/tab/template/import | A/B/D owned; C does not duplicate | contract docs, no duplicate workbook |
| 9 — result-page commentary template | B's shared `?run_id=` endpoint consumes C's top-level `as_of_date` | real integration test downloads and opens B's workbook |

## Verification

### Worker C branch

```text
uv run pytest -q tests/backend/test_as_of_date.py tests/backend/test_tracking_capture.py
45 passed

uv run pytest -q tests/backend/test_persistence.py tests/backend/test_upload_date.py \
  tests/backend/test_run_capture_views.py \
  tests/backend/test_exception_tracking_run_capture_integration.py
34 passed, 1 skipped
```

The skip is the real A/B boundary, which is intentionally gated on dependency
imports (see integrated result below).

```text
uv run pytest -q tests/backend
1 failed, 326 passed, 1 skipped

uv run pytest -q tests/contracts tests/integration
3 failed, 17 passed
```

The 3 contract failures are the expected fail-closed dependency errors: execute
endpoint tests reach capture and Worker B's settings resolver/A's store are absent
from this branch. They pass in the integrated verification below.

```text
uv run python backend/manage.py check
System check identified no issues (0 silenced).

uv run python backend/manage.py makemigrations --check --dry-run
No changes detected

uv run ruff check backend/apps/runs backend/apps/files <new/changed tests>
All checks passed.

uv run mypy backend/apps/runs backend/apps/files
Only pre-existing backend/apps/rules/repository.py:218 error.

git diff --check
passed
```

### Real A/B integrated verification (throwaway worktree, not merged)

Worktree `/tmp/opencode/verify-exception-c2` was created detached at C commit
`e27e82a`, Worker B commits `9f047d9`, `91ee51d`, and `34d5b11` were cherry-picked
for verification only, and Worker A's current implementation snapshot
(`domain.py`, `errors.py`, `identity.py`, `repository.py`, `store.py`) was copied in
without committing. No dependency was merged into the assigned branch.

```text
uv run pytest -q tests/backend tests/contracts tests/integration
1 failed, 384 passed

uv run python backend/manage.py check
System check identified no issues (0 silenced).

uv run python backend/manage.py makemigrations --check --dry-run
No changes detected
```

The only failure is the repository baseline failure described below.

## Pre-existing repository failures (not caused by Worker C)

Reproduced on baseline `aabcf5c` in a separate worktree:

- `tests/backend/test_rule_identifier_release_review.py::test_migration_reconciles_later_file_edits`
  fails with `KeyError: 'rule_id'` in the legacy rule migration path.
- `uv run ruff check backend tests` reports 5 pre-existing errors
  (`tests/backend/test_rule_catalog_api.py` E501 and
  `backend/apps/rules/migrations/0002_rule_supersession.py` I001).
- `uv run mypy backend` reports 2 pre-existing errors:
  `backend/apps/rules/repository.py:218` and `backend/apps/configs/views.py:318`.

Worker C did not modify these areas.

## Dependency commits needed for final verification

1. **Worker A implementation commit** — required: `apps/exception_tracking.store`,
   `repository`, `identity`, `domain`, `errors` (contract doc is `bbdc06d`). Final
   integration tests cannot pass without it; C's branch fails closed with a visible
   dependency message.
2. **Worker B** — `9f047d9` (settings `get_exception_tracking_path`) and `91ee51d`
   (tracking API, shared workbook, URL registration), with workbook date-cell fix
   `34d5b11`. Optional `8b4fa17` test boundary.
3. After integrating A and B, rerun the reviewer's full commands. C's real-boundary
   test must run (not skip) and the three currently failing contract tests must pass.

## Remaining blockers / reviewer decisions

- Freeze the reviewer sign-off items in
  `docs/20261103_exception_tracking_run_capture.md`: no literal `exception_` prefix,
  upload-date precedence, empty-run date table, empty key rejection, and
  capture-failure/no-run behavior.
- Confirm `tests/conftest.py` as the shared test-isolation fixture (it was validated
  against A/B tests in the scratch integration run).
- Resolve the pre-existing baseline ruff/mypy/test failure before declaring the
  coordinator's full gate green; they are outside Worker C's scope.
- Browser/UI validation remains D/reviewer work; Worker C does not claim it.

## Disposition

Worker C scope is implemented, documented, committed, and independently verified
against the current A/B contracts. Final integration remains **NOT READY** until
Worker A commits its implementation and the reviewer integrates A+B+C and resolves the
pre-existing baseline failures.
