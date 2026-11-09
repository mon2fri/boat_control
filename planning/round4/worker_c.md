# Round 4 worker C: Empty-result report exports

Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/round4/worker-c`

Branch: `work/20261109-round4-worker-c`

## Working agreement

Implement only Round 4 in `planning/round4/requirements_snapshot.md`; earlier rounds are regression context. Read `planning/round4/README.md` first. Work only in your assigned worktree/branch. Do not change main, user CSVs, config, screenshots, live databases, lockfiles without necessity, or another worker's files. Use synthetic isolated data for tests. Do not start a shared server or perform human UI acceptance. Commit your code, meaningful regression tests, and `reviews/20261109_round4_worker_c_delivery.md`; report commit hashes, files, tests actually run, unresolved risks, and API contracts. Do not mark unrun checks as passed. Coordinate shared contracts with the integrator early; do not edit another owner's files silently.

Use `uv run pytest <focused tests>` at repository root; frontend checks run from `frontend` with `npm test -- <paths>`, `npm run lint`, and `npm run build` as appropriate. Dependencies are not copied into new worktrees; install from lockfiles if needed. Preserve existing grouping, canonical rule identifiers, numeric rule ordering, formula protection, commentary import compatibility, and additional commentary columns.

## Assignment

Own Round 4 enhancement 3 for exported HTML and Excel (and CSV if per-rule sections support it). When an enabled rule captures zero exceptions, show an explicit hint in its section instead of an empty exception table. Retain its rule heading, conditions, groupings, expectations, identifier and table-of-contents entry in numeric rule order. Never emit placeholder exception records or increment counts. Keep populated tables unchanged.

The requirement literally requests `Nil exception was captured by thie rule.` (including `thie`). Use that exact copy consistently for this round and call out the source typo in delivery so the user can decide later. The existing HTML copy is `Nil exception detected under current rule.`; reconcile the new behavior rather than duplicating hints.

Ownership: `backend/apps/reports/services.py` and report export tests (including test_reports.py); any new report-only helper/tests. Do not edit existing reports/rule_headers.py, tracking workbook/API, frontend endpoints or ExportControls. Inspect the existing New Exceptions Only report projection and ensure that a rule emptied by that view shows the hint and retains truthful counts/scope. Avoid changing live ResultsPage unless the integrator establishes that exported rendering depends on it; current requirement is exported results.

Test an enabled zero-exception rule, mixed empty/populated rules, all-empty output, grouping/identity preservation, numeric order, and rules emptied by New Exceptions Only. Assert HTML has the hint and no empty per-rule table; reopen XLSX bytes to verify hint cells and no empty detail table, retaining summary metadata. Explain CSV behavior if its flat format has no per-rule sections.
