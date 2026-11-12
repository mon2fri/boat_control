# Rule-evolution Round-2 delivery — Worker D (backend)

Date: 2026-11-12. Branch: `feat/rule-evolution-worker-d` (base `02afe4bb`,
checkout clean before and after; no pushes, no merges, no frontend/dist/
lockfile changes, no live data touched — all stores isolated under
`tmp_path` with `GROUPED_VALIDATION_HOME` pointed at throwaway dirs).

## Commits (4, in order)

1. `46ce119` — Round-2 template: replace provenance columns with
   Commentary Recertify (workbook, columns, runs template_columns,
   workbook tests).
2. `cfbb7db` — Round-2 upload: authoritative per-row decisions from
   current DB state (domain, repository, package exports, api_services).
3. `c73c684` — Round-2: update existing upload tests to the new contract.
4. `1058f00` — Round-2 evidence: template layout + upload matrix +
   end-to-end tests (new `tests/backend/test_commentary_recertify_upload.py`).

## 1. Template layout (exact)

`Exceptions`-sheet headers, both scopes (run-scoped `?run_id=` = result
page, date-scoped `?as_of_date=` = tracking page) and both entry points
share the single `CommentaryTemplateExportView` path:

`Exception ID | Exception Status | Commentary | Rule Index |
Exception Rule Identifier | Key Columns | Exception Timestamp |
Exception As-of Date | Exception First Seen As-of Date |
Exception Last Seen As-of Date | Commentary Recertify`
(+ ordered user detail columns after that; hidden-column rule unchanged:
columns 5–10 hidden, 1–4 and 11+ visible).

- Removed from download: `Recertification Reason`, `Carried From
  Exception ID`, `Carried From As-of Date`, `Carried From Rule
  Identifier`, `Rule Evolution Event ID`, `Recertified At`. Old names stay
  reserved in `columns.RESERVED_EXTRA_COLUMN_NAMES` and
  `runs/template_columns.RESERVED_HEADERS` so user detail columns cannot
  recreate them; pre-Round-2 workbooks carrying them still import (values
  ignored). `RECERT_HEADERS` constant retained for that purpose.
- `Commentary Recertify` defaults blank for every row (including pending
  rows). Excel list validation `"Keep Current,Updated"`,
  `allow_blank=True`, applied to `K2:K<last>` when rows exist.
- Pending review shows through `Exception Status =
  RecertificationRequired`; provenance/audit remain database-only
  (`recertification_*`, `carried_from_*`, `rule_evolution_event_id`,
  `recertified_at` still in list/detail payloads, unchanged shape).
- Import identity unchanged (first-4-header prefix check, extra columns
  ignored, formula cells in Commentary rejected, legacy v1 imports with
  empty choice set).

## 2. Upload decision implementation + validation/error codes

Parse (`workbook.parse_commentary_workbook`) collects trimmed
`Commentary Recertify` values and raises **before any DB write**:

- code `invalid_recertification_selection` (HTTP 400),
  `details = {"invalid_rows": [{"row", "exception_id", "value"}]}`.

Service (`api_services.import_commentary`, helper `_decide_upload`,
predicate `_is_pending`) trims spreadsheet text (whitespace-only is
empty; internal whitespace/line breaks preserved), never normalizes IDs
or keys, and decides per row from CURRENT DB state:

| Row state | Choice | Outcome |
|---|---|---|
| pending | Keep Current | keep stored text; clear pending (nonempty DB → Commented, empty → Not Commented/New by first-seen) |
| pending | Updated + nonempty | store trimmed text; clear pending (unchanged text still accepts) |
| pending | Updated + empty | clear text; clear pending (deliberate clear) |
| pending | blank | preserve text, status, pending mark |
| nonpending | any valid choice | ignored; ordinary rules below apply |
| nonpending | nonempty | store as new value (even on stale templates) |
| nonpending | empty/whitespace-only | preserve stored text and status (never clears) |

Single atomic write via new
`ExceptionTrackingRepository.apply_commentary_upload(date, {id:
CommentaryUploadDecision(commentary: str | None, clear_recertification:
bool)})` — `None` keeps text; pending clear stamps `recertified_at`.
Unknown IDs → `UnknownExceptionError` → HTTP 400
`unknown_exception_ids` (service pre-validates IDs/duplicates/date-scope
first, so the repo error is defensive). Existing
`update_commentaries` kept untouched for compatibility. Response shape
unchanged (`updated/cleared/unchanged/total/exceptions/scope`).

## 3. Wire/error contract published for Worker E (integrator broadcast)

- Template headers: exactly §1 (11 standard + details). No provenance.
- List/detail payloads: unchanged — single status
  `RecertificationRequired` plus `recertification_required/reason`,
  `carried_from_*`, `rule_evolution_event_id`, `recertified_at: null`,
  `revision_token`. No display change.
- Upload validation: only blank/`Keep Current`/`Updated` in
  `Commentary Recertify`; violations → 400
  `invalid_recertification_selection` with per-row details, whole file
  rejected atomically (nothing written). Recertification actions apply
  only to pending rows; valid choices on nonpending rows are ignored.
- Upload response counters keep Round-1 names: text changes to nonempty
  → `updated`; to empty → `cleared`; Keep Current / identical-text
  acceptance / preserved rows → `unchanged`.
- No new endpoints; no changed routes, query params, or status values.

## 4. Verification (actual commands/results)

- `uv run pytest` (full default suite, `--ds=boat_control.grouped_validation_settings`,
  `GROUPED_VALIDATION_HOME=/tmp/opencode/worker-d-home`): **931 passed**.
  The brief's "5 known pre-existing test_runs.py base failures" do not
  occur on this base — zero failures.
- Targeted: 164 passed across the workbook/API/run-scope/integration/
  recertification/round-2 files; 38 passed in the new
  `test_commentary_recertify_upload.py` alone (template × scopes,
  14-case pending matrix, ordinary/stale/NotCommented/New rules,
  side-by-side clear-vs-preserve, invalid-case/normalization atomicity,
  retries, trimming, single-status wire, capture→export→upload→list).
- Real repository used for the matrix and end-to-end (APIClient through
  views, real SQLite in `tmp_path`); contract fakes only where the
  pre-existing suites already used them.
- `ruff check` on all touched files: clean except 5 pre-existing base
  violations left untouched (SIM118 ×2 in `repository.py` legacy
  regions; F401 ×3 in `test_rule_evolution_recertification.py`
  untouched regions — confirmed identical on stashed base).
- `git diff --check`: clean. Wendy item (first-seen backfill for
  genuinely new IDs) verified intact via `test_genuinely_new_id…`;
  Karen item (single status) verified via API list test.

## 5. Files touched (ownership-respecting)

- `backend/apps/exception_tracking/workbook.py`, `api_services.py`,
  `repository.py`, `domain.py`, `__init__.py`, `columns.py`
- `backend/apps/runs/template_columns.py` (one reserved-header addition
  for template integrity)
- `tests/backend/test_commentary_recertify_upload.py` (new),
  `test_exception_tracking_workbook.py`,
  `test_exception_tracking_api.py`,
  `test_exception_tracking_run_scope.py`,
  `test_exception_tracking_integration.py`,
  `test_rule_evolution_recertification.py`
- No reports changes needed (HTML/Excel `Recertification` column and
  counts already correct and untouched). No runs capture/persistence
  changes needed (scope behavior already correct).

## 6. Unresolved issues / notes for the integrator

- Error code `invalid_recertification_selection` and detail shape
  `{"invalid_rows": [...]}` are Worker-D-defined (no frozen contract
  existed); E should treat them as the broadcast contract above.
- `recertified_at` is now also stamped by explicit upload acceptance
  (Keep Current / Updated), not only by the recertify endpoint — audit
  consequence, flagged deliberately.
- First-seen date of a carried row is the target date, so a pending row
  cleared to empty reads `New`, not `NotCommented` — derived-status
  consequence, covered by tests.
- `ruff format` is not enforced on this base (base files fail
  `--check`); no reformatting applied to avoid churn.
