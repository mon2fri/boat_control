# Template optimization — final reviewer and integration instruction

## Mission and authoritative scope

Review all four completed worker deliveries, require rework for defects, integrate accepted changes and prepare the app for user web UI acceptance. Read requirements/20261103_exception_tracking_enhancement.md and all planning/20261103_exception_tracking_template_optimization_worker_*_instruction.md files. The latest subsection “Commentary template extra-column selection and configuration” overrides older automatic detail-column appending requirements. Follow the original coordinator/reviewer instruction for repository safety.

Integration worktree: /home/zwj808/PycharmProjects/boat_control-worktrees/exception-tracking/integration
Integration branch: work/20261103-exception-tracking
Observed baseline: db5d57b (includes Windows UTF-8 cache fix; preserve it).
Workers use sibling worker-a through worker-d worktrees and branches work/20261103-exception-tracking-worker-a through -worker-d. Observed tips: A 9b67afb, B 5f1251b, C f251a5e, D 80e2ec8. Reinspect tips and actual handoffs; these are observations, not a list to blindly cherry-pick.

## Protect and inventory

Record git status, HEAD, worktree/branch topology, worker handoffs and commit graphs. Preserve dirty .config, updated requirement, untracked planning documents and test-data. Do not stash/reset/clean or commit user configuration/live data. Make a narrow coordination commit of authoritative requirement/instructions if needed; inspect staged paths first. Inspect worker diffs and their declared dependencies; do not assume a documentation tip is the implementation commit or reapply commits already present under another hash. No merge main, deployment, worktree deletion or force operations.

## Contract and review gates

1. Reconcile actual implementations before integration: ordered commentary selection/config field, missing-field clearing, source-side value rules, persisted historical values/schema union, Rule Index context, endpoint examples, pagination/sort/filter semantics, status-aware report filtering and XLSX compatibility. Record decisions and mismatches. Assign each defect to A storage, B tracking API/workbook, C capture/config/reports or D frontend. Return substantive omissions to the owner with reproduction/expected behavior; wait for fixes and independently retest. Do not accept a required gap as a follow-up.
2. Review/integrate A storage first; then B and C in the dependency order established from their code; D after backend contracts are accepted. Cherry-pick only reviewed scoped commits. Run focused gates after each batch. Resolve conflicts intentionally and get owners to review material resolutions. If B/C depend on each other, sequence their minimal prerequisite commits explicitly.
3. Review the combined behavior with real services and persistent fixtures, not only mocked worker tests. Repeat inspect/rework/retest until all required behavior passes.

## Mandatory acceptance matrix

- Card label and placement: Extra Columns for Commentary Template, separate from Extra Column and attribute comparing selections.
- Only this ordered selection appends data columns in both download paths and Exception Tracking. Empty selection adds no data columns. Standard tracking metadata remains; no unrelated exception fields leak into appended columns.
- Config for rows and columns roundtrips ordered selection; old config missing the field clears it. Save/load and saved-run restoration remain compatible.
- Selected values and historical Rule Index persist across restart/source-upload removal. Later-added columns appear empty for earlier records. Test existing populated database migration, repeat migration, reruns and rollback without modifying live databases.
- Workbook/UI first four columns are Exception ID, Exception Status, Commentary, Rule Index. Remaining metadata/selected data columns retain prescribed order and are hidden by default. Excel dimensions really hide columns; UI chooser can reveal them. IDs are stable across pages and match exports.
- Page sizes 50(default)/100/200/500 work. Sort/filter operates over the complete matching dataset before pagination, with deterministic ordering and sensible page reset after filter changes.
- New Exceptions Only defaults checked and includes New plus NotCommented. Results and ordinary HTML/Excel reports agree; unchecked includes all. ALL exceptions persist regardless of visibility. Commentary workbooks ALWAYS include all rows, with New/NotCommented before Commented and commentary prefilled.
- Informational appended values can be edited/cleared during upload without validation failure or exception-data mutation. Invalid/duplicate IDs, wrong dates and missing required original fields still fail atomically. Verify compatibility policy for older workbook layouts and formula-text handling.
- Preserve prior date-selector behavior, old saved runs, commentary/history semantics and Windows explicit UTF-8 cache reads.

## Independent checks and final artifact

Run appropriate targeted migration/API/workbook/config/capture/report/frontend tests, then:

```bash
uv run python backend/manage.py check
uv run python backend/manage.py makemigrations --check --dry-run
uv run ruff check backend tests
uv run mypy backend
uv run pytest -q tests/backend tests/contracts tests/integration
npm --prefix frontend test -- --run
npm --prefix frontend run build
npm --prefix frontend run build:inspect
git diff --check
```

Inspect any failures against baseline; record exact blockers and results. Rebuild and commit deployable frontend/dist after source acceptance. Do not claim readiness while required product defects remain.

Use isolated data to validate August 31 and September 30 with recurring commented/uncommented and new exceptions. Add more than 50 rows for paging, different selections in each extra-column setting, a later-introduced selected column, and a legacy config. In an actual browser verify config reload, historical empty cells, visibility, sorting/filtering/pages, both checkbox states, ordinary reports versus all-row commentary downloads, and edited-informational-cell import. If no browser tooling exists, explicitly mark browser checks outstanding and give reproducible user steps; automated tests alone are not browser evidence.

Update reviews/20261103_exception_tracking_review.md with requirement coverage, worker/integrated hashes and dependency order, contract decisions, findings/rework rounds, independent tests/build/browser evidence and remaining limitations. Provide backend/frontend startup commands, URL, isolated data/config paths and a concise web UI acceptance walkthrough. Final status: READY FOR USER UI VALIDATION only when integrated implementation checks pass; otherwise NOT READY with concrete blockers. Leave integration available for user acceptance; do not merge main, push/deploy unless separately authorized, or delete workers.
