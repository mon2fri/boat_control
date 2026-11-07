# Exception tracking — coordinator/reviewer instruction

Prepare and integrate the four workers; implementation is not performed by this setup task. Requirement: requirements/20261103_exception_tracking_enhancement.md. Integration branch: `work/20261103-exception-tracking`. Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/exception-tracking/integration`. Original baseline: `d28327f18125f04af613e681d87609bacbcee541`. Original checkout remains on main. Pre-existing user changes: staged and unstaged requirement content; untracked data/prepare_cache/. Requirement snapshot copies current working contents only; do not alter original index/data.

## Ownership and parallel execution

- Worker A: [SQLite history and identity foundation](20261103_exception_tracking_worker_a_storage_instruction.md), branch `work/20261103-exception-tracking-worker-a`, worktree `/home/zwj808/PycharmProjects/boat_control-worktrees/exception-tracking/worker-a`.
- Worker B: [Settings, tracking APIs and Excel exchange](20261103_exception_tracking_worker_b_api_instruction.md), branch `work/20261103-exception-tracking-worker-b`, worktree `/home/zwj808/PycharmProjects/boat_control-worktrees/exception-tracking/worker-b`.
- Worker C: [Run capture and date propagation](20261103_exception_tracking_worker_c_capture_instruction.md), branch `work/20261103-exception-tracking-worker-c`, worktree `/home/zwj808/PycharmProjects/boat_control-worktrees/exception-tracking/worker-c`.
- Worker D: [Upload date, tracking UI, settings and results export](20261103_exception_tracking_worker_d_frontend_instruction.md), branch `work/20261103-exception-tracking-worker-d`, worktree `/home/zwj808/PycharmProjects/boat_control-worktrees/exception-tracking/worker-d`.

Workers can investigate, implement and test their owned areas concurrently against the shared proposed contract. Before implementation diverges, review and freeze identity serialization/collision handling, chronological history, commentary carry-forward/blank handling, same-date retry behavior, run-failure behavior, path platform behavior, Python service signatures, endpoint paths/request/response examples and XLSX columns/date binding. Record decisions in reviews/20261103_exception_tracking_review.md. Resolve questions from repository evidence; surface material requirement ambiguity to the user with a concrete recommendation. Exactly one active owner per file. Shared contract fixtures belong to B; C requests changes; root backend configuration belongs to reviewer except URL registration owned by B. Reviewer owns cross-cutting configuration and generated build output.

## Integration and independent review

1. Record setup baseline commit, worker starting commits and clean/dirty status. Never stash/reset/clean user work or access the live tracking database in tests.
2. Review A foundation and independently run its tests before cherry-picking its explicit commits into integration. B and C then receive accepted A commits as needed. Review B API/workbook/settings and C run capture independently, integrate B then C, and send accepted contract changes to D. D may develop against fixtures throughout.
3. Review and integrate D. Resolve conflicts deliberately, ask owners to review material resolutions, run targeted checks after each batch. Return substantive defects to owners and repeat review/test until resolved. Do not integrate worker merge commits or unrelated changes blindly.
4. Run full checks below, inspect final diff, rebuild frontend output according to repository conventions, update API/user docs. Record exact results and environmental blockers. Never call incomplete required behavior ready.

```bash
uv run python backend/manage.py check
uv run python backend/manage.py makemigrations --check --dry-run
uv run ruff check backend tests
uv run mypy backend
uv run pytest -q tests/backend tests/contracts tests/integration
npm --prefix frontend test -- --run
npm --prefix frontend run build
git diff --check
```

Review adversarial cases: prior-month last weekday/year rollover, timezone boundaries, multiple key columns and ambiguous IDs, stable canonical identity across reordered rule lists, table-name injection, same-date and backdated runs, blank/commented status transitions, commentary propagation, transactional XLSX rejection, formulas as text, invalid Linux/Windows paths, restarts, no exceptions, historical runs and failed capture. Verify every requested database column physically exists and history remains correct in all affected tables. Confirm configurable storage is separate from existing app databases and no live data is committed.

## Actual web UI handoff

Use isolated sample data/database and document exact backend/frontend startup commands, URLs and ports based on repository launch instructions. Start the app if environment permits and smoke-test in a real browser when available; otherwise mark browser validation outstanding explicitly. Provide a reproducible sample input/rule set yielding stable exceptions across two dates plus a new exception on the second date. Give the user numbered steps and expected results: check default calendar date; run first date and inspect New IDs; download XLSX; enter commentary and upload; confirm Commented/prefilled export; run second date and confirm carried commentary, NotCommented for recurring uncommented IDs, New for new IDs, correct first/last dates; compare result-page and tracking-page templates; reject unknown-ID import with no partial updates; change database path and verify after restart; reopen both dates and old saved runs. Include evidence/screenshots if tooling permits. Do not present automated tests as actual browser validation.

Final artifact: reviews/20261103_exception_tracking_review.md with requirement 1–9 coverage, worker and integrated hashes, contract decisions, findings/revisions, independent tests/build results, UI startup and validation steps, remaining blockers and READY FOR USER UI VALIDATION or NOT READY. Leave integration branch/worktree available; do not merge main, deploy or delete worktrees. User performs final functional acceptance in the web UI.
