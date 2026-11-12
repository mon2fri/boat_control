# Round 4 Worker A delivery: report-run vs tracking-date template scope

Branch: `work/20261109-round4-worker-a`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/round4/worker-a`

Owns Round 4 enhancement 1 end to end. Did not touch `workbook.py`,
`reports/services.py`, or `reports/rule_headers.py` (B/C-owned).

## What changed

**Backend (`backend/apps/exception_tracking/`)**

- `api_services.py`
  - New `export_run_commentary(run_id, repository=None, *, generated_at=None)
    -> tuple[bytes, date]`: report-page scope. Membership = the persisted run
    snapshot's exception IDs (all statuses, every enabled rule; zero-exception
    rules contribute no rows). Commentary/status/detail values come from the
    live date records for those IDs, so post-run commentary edits are
    reflected. A zero-exception run yields an empty valid template, never a
    date-wide fallback. Every membership ID must resolve in the date store;
    otherwise `tracking_context_missing` (500, `missing_ids`) instead of a
    silent partial file.
  - `export_commentary(..., rule_summaries=None)` kept for tracking-date scope
    (all known exceptions for the date). When `rule_summaries` is omitted it
    best-efforts a date union via `collect_date_rule_summaries()`; a missing
    union never fails the export.
  - New `collect_date_rule_summaries(as_of_date)`: merges persisted
    `validation.rule_summaries` across runs with the same as-of date, later
    `created_at` overriding earlier per rule index (deterministic). Rules with
    date-known exceptions but no surviving snapshot are left out for the
    workbook to mark explicitly unavailable.
  - `_run_rule_summaries()`: one run's persisted snapshots (the source for
    report scope; never the live catalog). Includes enabled zero-exception
    rules. Returns `None` when the snapshot predates summaries.
  - `_run_membership_ids()`: raises `run_has_no_tracking_snapshot` (400) for
    legacy snapshots without stored violations, or stored violations without
    exception IDs. Never guesses IDs, never falls back to date-wide rows.
  - `import_commentary(..., run_id=None)`: date scope (no `run_id`) now accepts
    safe partial templates — only provided IDs are updated; omitted date
    records keep commentary (counted as unchanged, `total` stays date-wide).
    Unknown/duplicate IDs still fail atomically with no writes. Run scope
    (`run_id` given) requires exactly the run's membership: missing run IDs
    -> `missing_exception_ids`; date IDs outside the run -> new code
    `unexpected_exception_ids`; workbook/run/requested-date mismatches ->
    `date_mismatch`. Result gains `scope: "date"|"run"` (+ `run_id` when run).
  - Workbook forwarding is signature-conditional (`_build_workbook`): `rule_summaries`
    is passed only when the installed `build_commentary_workbook` accepts it,
    so this module works before and after Worker B's rendering lands.
- `views.py`: `CommentaryTemplateExportView` branches on `run_id`
  (run-scoped bytes + run-derived date for the filename) vs date/default
  scope. Import view forwards optional `run_id`.
- `serializers.py`: import serializer gains optional `run_id`; `as_of_date` +
  `run_id` may combine (service checks all three dates agree). Export
  serializer unchanged (still rejects `as_of_date` + `run_id` together).

**Frontend**

- `frontend/src/api/endpoints.ts`: kept `downloadExceptionCommentaryTemplate`
  (date-only, tracking tab); added `downloadRunCommentaryTemplate(runId)`
  (`GET /api/exception-tracking/export/?run_id=`). Doc comment now states both
  scopes.
- `ExportControls.tsx`: report-page button now calls the run-scoped download
  (independent of New Exceptions Only/filters/pagination); disabled while busy
  or when `runId`/`asOfDate` is missing; tooltip states run scope.
- `ResultsPage.tsx`: one-line hint clarification ("all of this run's
  exceptions"). `ExceptionTrackingPage.tsx` unchanged (date scope).

## API contracts

- `GET /api/exception-tracking/export/?run_id=<id>` -> run scope (see above).
  Errors: `run_not_found` 404; `run_has_no_as_of_date` 400;
  `run_has_no_tracking_snapshot` 400 (legacy/no-ID snapshot, never broadened);
  `tracking_context_missing` 500 with `missing_ids`.
- `GET /api/exception-tracking/export/?as_of_date=<d>` (or neither -> backend
  default) -> date scope, unchanged shape, date-based filename in both scopes.
  `as_of_date` + `run_id` -> 400.
- `POST /api/exception-tracking/import/` multipart `file` + optional
  `as_of_date`, optional `run_id`. Date scope: partial allowed, omitted rows
  preserved. Run scope: exact membership enforced (`missing_exception_ids`,
  `unexpected_exception_ids` with `outside_run_scope_ids`, `date_mismatch`).
  Unknown/duplicate handling unchanged.
- Proposed keyword-only optional workbook input for Worker B (also in code
  comments): `rule_summaries: Mapping[str, Mapping[str, Any]] | None` on
  `build_commentary_workbook`, keyed by run-local index (`"R001"`), each value
  `{name, rule_identifier, condition_clauses: list[str],
  expectation_clauses: list[str], condition_groupings: str,
  expectation_groupings: str}` plus legacy `{condition, condition_grouping,
  logic}` fallbacks. Missing entries must render as explicit "unavailable",
  never current-catalog logic. A passes the run snapshot for report scope and
  the latest-wins date union for tracking scope.
- Legacy/date-union policy: historic snapshots lacking membership raise
  `run_has_no_tracking_snapshot` (no silent broadening); retention-expired or
  legacy runs missing from the union simply contribute no summaries while all
  date rows still export.

## Tests run (actual)

- `uv run pytest tests/backend/test_exception_tracking_run_scope.py -x -q`
  (new, 14 tests): **14 passed**. Covers two runs/one date
  (overlapping/disjoint rules+IDs), later same-date recapture, disabled rule,
  repeated rule identity across dates, empty run + round-trip, New Exceptions
  Only independence, commentary-edit visibility, all explicit error codes,
  subset import preserving unrelated commentary, date full-upload, run-scoped
  import exactness/mismatch/unknown-run, summary passthrough
  (incl. zero-exception enabled rule) and legacy-workbook fallback.
- `uv run pytest tests/backend/test_exception_tracking_api.py
  ..._integration.py ..._workbook.py test_tracking_context.py
  test_tracking_capture.py ..._run_capture_integration.py
  test_exception_tracking_run_scope.py -q`: **123 passed**. (Two pre-existing
  run-export tests updated for the strict scope: runs now carry validation
  membership; the identical-bytes case uses a run covering the date's rows.
  The missing-ID import rejection was replaced by partial-accept; unknown/
  duplicate rejection kept.)
- `uv run pytest tests/backend -q`: **784 passed, 5 failed** —
  `test_runs.py` (TestExecuteComparison full/aggregation/nested x4+1). Verified
  **pre-existing**: same 5 fail on the clean tree (stashed changes, reran).
  Unrelated area (row-filter grouping in `runs/services.py`), not touched.
- Frontend (`frontend/`): `npm test -- ExportControls.test.tsx` **5 passed**
  (run-scope request assertion updated + New-Exceptions-Only independence);
  `npm test -- ExceptionTrackingPage.test.tsx src/api/endpoints.test.ts`
  **19 passed** (tracking tab still date-only); full `npm test` **662 passed,
  3 skipped**. `npm run lint` shows only pre-existing issues (no hits in
  `endpoints.ts`/`ExportControls.tsx`; `ResultsPage.tsx` has the pre-existing
  react-refresh warning; test-file hits match untouched-file patterns).
  `npm install` run to bootstrap; no lockfile changes (`git status` clean of
  them; `node_modules`/`.venv` ignored).

## Unresolved risks / integrator notes

- Worker B contract is proposed, not yet confirmed: exact `rule_summaries`
  kwarg name/shape and how B renders date-union conflicts (my latest-wins) and
  missing-metadata rows. My passthrough is forward/backward compatible, but
  confirm B's signature before integration; if B names it differently, only
  `_workbook_supports_rule_summaries`/`_build_workbook` need a one-line change.
- Date-union latest-wins per `Rxxx` can mask differing snapshots of the same
  index across same-date runs; B should surface provenance if it keeps more
  than the winner.
- `run_has_no_tracking_snapshot` uses 400; `tracking_context_missing` uses 500
  — confirm integrator agrees with the status mapping.
- Subset upload via the tracking tab relies on general partial acceptance;
  the accidental-row-deletion guard for date templates is now advisory
  (omitted rows are safely preserved, but no warning is emitted).
