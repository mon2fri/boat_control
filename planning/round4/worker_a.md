# Round 4 worker A: Template scope across backend and frontend

Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/round4/worker-a`

Branch: `work/20261109-round4-worker-a`

## Working agreement

Implement only Round 4 in `planning/round4/requirements_snapshot.md`; earlier rounds are regression context. Read `planning/round4/README.md` first. Work only in your assigned worktree/branch. Do not change main, user CSVs, config, screenshots, live databases, lockfiles without necessity, or another worker's files. Use synthetic isolated data for tests. Do not start a shared server or perform human UI acceptance. Commit your code, meaningful regression tests, and `reviews/20261109_round4_worker_a_delivery.md`; report commit hashes, files, tests actually run, unresolved risks, and API contracts. Do not mark unrun checks as passed. Coordinate shared contracts with the integrator early; do not edit another owner's files silently.

Use `uv run pytest <focused tests>` at repository root; frontend checks run from `frontend` with `npm test -- <paths>`, `npm run lint`, and `npm run build` as appropriate. Dependencies are not copied into new worktrees; install from lockfiles if needed. Preserve existing grouping, canonical rule identifiers, numeric rule ordering, formula protection, commentary import compatibility, and additional commentary columns.

## Assignment

Own Round 4 enhancement 1 end to end.

Report-page download must include exactly persisted exceptions captured by this run's enabled rules. Exception Tracking download must include all known exceptions for the selected as-of date. Never narrow the report template to New Exceptions Only, visible table filters, pagination, or current catalog selection. Reopening an older run must retain that run's membership even after another run updates the same date. A zero-exception run must yield an empty valid template, never fall back to date-wide records.

Inspect `backend/apps/exception_tracking/{api_services,views,serializers}.py`, `backend/apps/runs/{persistence,tracking_capture}.py`, `frontend/src/api/endpoints.ts`, `frontend/src/features/reports/ExportControls.tsx`, ResultsPage and ExceptionTrackingPage. Existing export accepts run_id but currently resolves it to a date and exports every record; the report currently calls the date-only endpoint. Prefer extending that existing contract with explicit run scope (run_id) while keeping the date-only caller intact. Validate missing/invalid run IDs, contradictory date/run arguments, absent tracking context and legacy snapshots explicitly; never silently broaden scope. Derive membership from persisted run exception IDs and canonical identifiers, not display rule indices alone or latest-run markers in the date store. Do not regenerate IDs with different semantics. Preserve persisted commentary/status by intersecting run membership with date records. Agree and document behavior if a historic snapshot lacks needed membership.

Ownership: tracking API/service/serializer changes, any necessary run persistence/capture adjustments, frontend endpoint/export wiring and their scope tests. Do not edit workbook.py, reports/services.py, or reports/rule_headers.py. Worker B owns summary formatting and workbook rendering. You own passing B's rule summaries into workbook generation and selecting the correct run/date snapshot source; ask B for its function/argument contract before editing the export call. Avoid date-wide historical metadata accidentally replacing current run context.

Prove with two runs on one date, overlapping and disjoint rules/exception IDs, later same-date recapture, disabled rule, repeated rule identity across dates, empty run, New Exceptions Only on/off, report versus tracking frontend requests, and subset-template import preserving unrelated commentary. Inspect import missing-ID semantics: a valid run subset must upload safely without clearing omitted date records. Keep existing date template upload safeguards.
