# Reviewer — independent review, integration and UI handoff

Branch: `work/20261108-grouped-validation-integration`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/integration`

Read [shared contract](20261108_grouped_validation_shared_contract.md), all four assignments and the
requirement. The user dispatches workers/reviewer manually. Do not spawn agents.
Work only in this worktree. Do not merge main, push, deploy or remove worktrees.

## Required documentation throughout review and fixes

Maintain `reviews/20261108_grouped_validation_integration_review.md` from the start.
Record baseline/setup hashes, incoming and resulting cherry-pick hashes, dependency
commits, requirement/acceptance coverage, findings by severity, exact validation
commands/results, rejected deliveries, revisions and remaining blockers. For every
fix, record the defect, cause, changes, regression verification and resulting hash.
Require workers to update their implementation/delivery docs with every fix.
Maintain `docs/20261108_grouped_validation_ui_verification.md` with reproducible
startup and acceptance steps. Reviewer-authored integration fixes also require
implementation/fix documentation. Documentation is a delivery gate, not optional.

## Review and integration procedure

1. Inspect clean/dirty state without resetting user changes. Record actual baseline.
   Check incoming ordered hashes and full diffs, including tests/docs, before picking.
2. Review A's schema/identity/helpers and independently run focused checks in this
   isolated worktree. Cherry-pick explicit reviewed commits onto integration; record
   results. Return defects to A, or document tightly scoped integration fixes.
3. Review B's runtime/config/report changes against A's actual interfaces. Integrate
   reviewed B commits, then C transport/state and D editors. C and D may deliver in
   either order, but assess them together against real backend responses. Workers may
   develop concurrently; mock-only passing tests are insufficient for acceptance.
4. If a worker needs an accepted dependency, give the user exact integration hashes
   for that worker to cherry-pick and record them. Never cherry-pick its dependency
   twice. Use individual commits rather than worker merge commits.
5. Inspect conflicts deliberately; consult the owning worker through manual dispatch
   for material semantic resolutions. Re-test affected paths after fixes. Keep an
   auditable list of original/replacement commits; do not blindly integrate fixes.
6. Review the combined diff against the agreed requirement, especially legacy
   canonical IDs, contradictory payload rejection, complete grouping round trips,
   missing-column validation, family expansion, null/blank negative operators,
   compound outcome detail/export accuracy and one exception per rule/key.
7. Confirm required implementation and delivery docs accompany all workers and fixes.
   Reconcile the shared contract with actual APIs and record any justified changes.

## Independent validation

Run appropriate targeted checks after each batch, then these integrated gates:

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

Install dependencies separately per worktree as needed. Inspect settings before
checks/launch; use temporary settings or isolated worktree-local paths for database,
config, uploads, history and tracking. Never point tests or startup at original
checkout data. Record environmental failures versus regressions separately. Do not
claim readiness with untested mandatory behavior. Own any necessary root tooling,
cross-layer regression tests and generated frontend/dist changes per repo convention.

## User web UI verification handoff

Create reproducible CSV/config samples under `samples/grouped_validation/`, containing
Y/N, N/Y, Y/Y, N/N, invalid text, null and blank cases, active/inactive and alternative
MO/FO populations. Explain how the loader represents null versus empty string; test
both at the evaluator level if CSV ingestion collapses them. Do not use live books.

Document exact setup/start commands, URL/ports and process stop commands for this
integration worktree, based on `scripts/dev.sh` and repository settings. If available,
start the isolated app and smoke-test in a real browser. If browser tooling is absent,
state that actual browser verification is outstanding; automated component tests are
not browser evidence. Leave the integration worktree ready for the user; report server
status honestly and do not leave background processes without documenting them.

Give numbered UI steps and expected counts/rows to:

- Build `(MO AND Traded Risk) OR FO` with Active restriction and nested filter groups.
- Save/reload filters and rows/columns config; verify the same population after restart.
- Build both simple AND/OR outcomes and `(SA=Y AND CVA=N) OR (SA=N AND CVA=Y)`.
- Run and confirm only Y/N and N/Y pass; equal or invalid/null/blank flags fail.
- Check negative operators with null/blank in filters, conditions and outcomes.
- Edit/remove/reorder clauses and verify no silent broadening or corrupted references.
- Save/import/export/reload rules and restore a saved run, preserving grouping.
- Open legacy rules/config and column-against-column mode; check legacy IDs unchanged.
- Inspect compound violation detail, HTML/Excel exports and exception tracking for
  complete values and one stable exception per rule/key.

Conclude the review with `READY FOR USER UI VALIDATION` or `NOT READY`, supported by
checks, blockers, branch/worktree, integrated HEAD, sample locations and UI guide.
Do not merge to main; user performs functional acceptance first.
