# Grouped validation integration review

## Disposition

**NOT READY** — code, independent regression coverage, integrated test/build
gates and a real-browser smoke are complete, and the isolated app is available.
The worker implementation/delivery records are now outdated by reviewer fixes.
Per the shared contract, their corrections are a delivery gate. Manual follow-up
prompts are in `docs/20261108_grouped_validation_integration_fixes.md`; no worker
worktree was modified and no documentation update is claimed on those branches.

This is **not** a finding that the integrated UI is unusable. The code is ready
for exploratory testing, but this review does not claim final readiness while
the explicit documentation gate remains outstanding.

## Baseline and branch state

- Setup baseline: `e972e3fe72c820e9a76316137e5cfba6389374bd`.
- Requirement parent: `6b4bc94` on `main` at worker dispatch.
- Integration branch: `work/20261108-grouped-validation-integration`.
- Integration worktree:
  `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/integration`.
- Initial HEAD: `e972e3f`; initial worktree clean. Current HEAD is recorded in
  the final section after the bounded integration fixes are committed.
- Original checkout remains on `work/20261108-grouped-validation`; its
  untracked `screenshots/` directory was noted but not inspected or changed.
- Worker worktrees A, B, C, D were each clean (`git status --short --branch`).
  No worker worktree or branch was modified, reset, pushed, merged or deleted.

## Delivery discovery and cherry-pick audit

Each branch was compared against setup commit `e972e3f` with `git log`,
`git diff --stat`, full file inspection, and `git diff --check`. All incoming
range diffs passed `git diff --check`; this was treated only as hygiene, not
proof of correctness.

| Worker | Original delivery commit | Resulting integration commit | Result |
| --- | --- | --- | --- |
| A | `c388ce9241dc562d63ecb82eccca0fdd2b0f8173` | `9dbc7ea` | Accepted; pure validation helpers. |
| A | `057dbab74bb999649b37ec2dc72a84bb6b04459f` | `018ab75` | Accepted; rule schema/catalog/identity. |
| A | `f24acfaf07fddf9af03852e2cbd544bfc3ad71fe` | `fba2283` | Accepted; implementation/delivery docs. |
| B | `e0573d8b8e58aa202b22038621d9bc0c169f9175` | `418c44b` | Accepted with documented config-view conflict resolution. |
| B | `3dccf93fa5f109a7422ae83afd26e78060a059f2` | `5912229` | Accepted; implementation/delivery docs. |
| Reviewer | — | `0992b78` | Fixed A-materialized tree runtime incompatibility. |
| C | `81fa44b33f3214348f02253572673565d42af9e8` | `381454a` | Accepted; domain/API/state transport. |
| C | `d6b97a94f4d23c6e7689d7b65498cd2d985f3695` | `295de62` | Accepted; delivery documentation. |
| C | `a6edaa7cf0a56c1feb03dcfdc2416e82c61802f6` | `475d8b3` | Accepted; no-filter/mixed-form fix. |
| C | `f249301a31fe4fc3ceedad6b0cd9b62918295b5d` | `c7930b7` | Accepted; cherry-pick order docs. |
| D | `656ed1527ca3e89df759f388d007b4d359c9d4f2` | `3e812bc` | Accepted; visual filter/outcome editors. |
| D | `9704c2c2eb55f82f74355ee82155ca97bf578eda` | `33c10d7` | Accepted; implementation/delivery docs. |
| D | `ed908c4b1e4558e249494102ab5b8ba038c17efa` | `a06fac4` | Accepted; compatibility clarification. |
| Reviewer | — | Pending | Bounded cross-layer/UI/config/contract/sample fixes are in progress in this worktree only. |

Dependency order was A helpers → A rule schema/identity → B runtime (consumes A)
→ C transport/state → D editors. No dependency commit was cherry-picked twice.
The only cherry-pick conflict was `backend/apps/configs/views.py` between A and
B: the integration keeps A's shared `rule_definition_payload` full-expression
serializer and retains B's filter/config validation and runtime changes. B's
duplicate snapshot serializer was deliberately not kept. The resolution is
covered by the grouped rule config/API tests.

## Review findings and reviewer fixes

### High — B could not execute A's real nested outcome representation

A materializes `Rule.logic_grouping_tree` as an immutable `GroupingNode` and
publishes `Rule.outcome_expression`; B's tests used wire-dictionary
`SimpleNamespace` mocks and its parser rejected the real tree. The integration
fix in `0992b78` consumes the explicit expression and delegates predicates and
tree operations to A's pure helpers. The real-model regression exercises the
four-clause Y/N expression; it proves one violation per failing row and complete
outcome column/value context. See the implementation/follow-up record in
`docs/20261108_grouped_validation_integration_fixes.md`.

### High — frontend grouping editor was not connected to save/run/restore

C documented page-level wiring obligations, but the delivered pages still
loaded only rows, saved configs without group fields, submitted runs without the
tree, and restored saved runs without the grouped restoration action. D's
`FilterBuilder` was mounted uncontrolled. In addition, the mapper allowed a
newly authored multi-filter to fall back to legacy AND. A real browser click on
an incomplete filter also exposed a page crash because config serialization
threw during render.

The bounded reviewer fix wires Prepare/Upload config load/save, controlled filter
grouping, Results request construction and saved-run restoration. UI-only mode
and explicitness state distinguish new editing from legacy AND while ensuring
inactive retained custom trees are not serialized. New multi-filter saves/runs
are blocked until explicit grouping; invalid config serialization now produces
an actionable message and disables config save instead of crashing. Regression
tests cover workflow mode, config/run mapping and saved-run state; a real-browser
smoke is recorded below.

### High — unresolved flat filters/rule clauses could be dropped or rebound

C's filter resolver preserved broken references when a tree existed, but a
missing filter under a flat/legacy relation could disappear from the rows and
change scope. Rule condition restoration could map a missing saved `c0` to a
later condition re-numbered as runtime `c0`. Rule config import proceeded with
partial drafts after warnings. Family expansion always used AND for tree leaves,
changing positive any-match semantics.

Integration fixes attach blocking errors to unresolved filter rows, preserve
missing rule references with sentinels, refuse partial invalid rule-config
imports, and expand positive families with OR / negative families with AND
inside the containing expression. When an expression cannot be preserved, it is
rejected instead of broadened. Regression tests cover flat missing filters,
condition index collisions, positive family expansion, missing outcomes, and
incomplete save/run blocking.

### Medium — A silently normalized grouping fields on one new outcome

`validate_rule` accepted a one-entry `logic_clauses` payload with a relation/tree;
`normalize_rule_draft` then dropped that redundant grouping. The integration fix
rejects relation/tree fields on the new single-outcome form, consistent with the
shared contract. A real API compatibility regression was added.

### Manual worker documentation corrections still required

Worker implementation/delivery docs describe the original accepted commits but
do not contain the post-integration findings/fixes above. Because worker trees
must remain untouched and workers must be dispatched manually, the report does
not claim those docs have been corrected. Required prompts for A–D and B are in
`docs/20261108_grouped_validation_integration_fixes.md`. This is the outstanding
documentation gate behind **NOT READY**.

## Requirement coverage (integrated evidence, not worker claims)

| Requirement area | Integrated evidence/status |
| --- | --- |
| Nested overall filters, truth table, persistence | Backend grouping truth tables; frontend config and wire round trips; real-browser controlled custom-group smoke; full save/reload and 11-row sample evaluator. |
| Legacy filter AND behavior | Absent grouping remains legacy AND in API/config/run restoration tests. Newly authored multi-filter state is explicitly blocked until a relation/tree is chosen. |
| Simple AND/OR and nested outcomes | Backend truth tables plus frontend mapping/component tests. |
| `(SA=Y AND CVA=N) OR (SA=N AND CVA=Y)` | Actual A `rule_from_payload` model executed through B runtime and sample evaluator; only Y/N and N/Y pass. Sample count: 3 pass, 8 violations. |
| Null/blank operators in filters, conditions, outcomes | A pure helper tables, B runtime tables, frontend help, and evaluator tests for both `None` and `""`; numeric behavior unchanged. |
| Applicability/required-state semantics | Backend tests prove conditions gate applicability and false outcomes produce a single violation per rule/key. |
| Save/load/import/export/run/history restoration | Backend saved filters/config/run persistence and report tests; frontend mapping/config/state tests; pages now pass grouping end-to-end. User must still verify visually. |
| Invalid references/missing columns | Backend validation rejects unknown/missing columns and bad trees; frontend restoration uses explicit missing sentinels and blocks partial import/save/run. |
| Canonical ID/legacy compatibility | A golden legacy IDs and multi-expression identity tests; one-clause new form normalizes to legacy only when grouping fields are absent. |
| Compound exception/report/tracking context | Backend tests assert one violation per row/rule and full outcome fields; HTML/Excel and stable tracking identity tests pass. |
| Column-against-column compatibility | Legacy model and UI component tests plus seeded `R001` sample rule; multiple column-comparison outcomes remain rejected. |

## Exact independent validation record

The final integrated backend test/manage gates used isolated settings with
`GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-checks`,
`PYTHONPATH=backend`, and
`--ds=boat_control.grouped_validation_settings`. Django test databases and
exception tracking were temporary. The UI app uses the separate
`/tmp/opencode/grouped-validation-ui` home. No original-checkout data was read or
written by these commands. Earlier worker-focused tests were run before the
reviewer settings module was added; they used Django's temporary test DB and the
autouse temporary tracking DB, with test-specific temporary config/report paths.
All required full integrated gates were repeated under the explicit isolated
settings module.

| Command | Result |
| --- | --- |
| `GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-checks PYTHONPATH=backend uv run python backend/manage.py check --settings=boat_control.grouped_validation_settings` | Passed: no issues. |
| `GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-checks PYTHONPATH=backend uv run python backend/manage.py makemigrations --check --dry-run --settings=boat_control.grouped_validation_settings` | Passed: no changes detected. |
| `GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-checks PYTHONPATH=backend uv run pytest --ds=boat_control.grouped_validation_settings -q tests/backend tests/contracts tests/integration` | Passed: 774 tests. |
| `uv run mypy backend` | Passed: no issues in 94 source files. |
| `uv run ruff check backend tests` | **Failed on 5 pre-existing issues** in unchanged `backend/apps/rules/migrations/0002_rule_supersession.py` and `tests/backend/test_rule_catalog_api.py`; none is in a changed file. Worker A/B independently reported the same baseline lint issues. |
| Scoped `uv run ruff check` on changed backend sources, validation helpers, settings and new/changed tests | Passed after import/line-length fixes. |
| `npm --prefix frontend ci` | Passed installation; npm audit reported 20 existing dependency advisories (11 moderate, 9 high). No audit fix was run. |
| `npm --prefix frontend test -- --run` | Passed after final source/test edits: 65 files / 599 tests. |
| `npm --prefix frontend run build` | Passed after final source/test edits; Vite reports a 731.11 kB JS chunk warning. Generated `frontend/dist` output is reviewer-owned and included. |
| `git diff --check` | Clean after final code/docs edits (will be repeated after commit). |

Independent sample execution using `apply_filters` and the actual materialized
rule returned selected IDs `1,2,3,4,5,6,8,9,10,14,15` (11 total), three passes
(`1,2,8`), and violations `3,4,5,6,9,10,14,15` (8 total). Loader values for
IDs 6/15 were respectively `None` and `""`.

## Browser/UI evidence and processes

`/usr/bin/google-chrome` and `@playwright/test` were available. The headless
browser smoke uploaded the sample files, selected key `ID`, entered Prepare,
added two filter rows, chose CUSTOM GROUPS, and created an AND group. It passed
with no browser page errors. The smoke also verified incomplete new grouping
shows a blocking message without crashing. This is browser evidence only for
that interaction; the complete numbered user acceptance remains pending.

The isolated backend and Vite server are intentionally left running for the
user: backend `127.0.0.1:8000` (runserver process tree rooted at PID `78466`),
frontend `127.0.0.1:5173` (Vite PID `78553`). Process list and shutdown details
are in the UI guide. App data stays in `/tmp/opencode/grouped-validation-ui`.

## Remaining issues / final handoff

1. Worker A/B/C/D implementation and delivery docs must receive the manual
   corrections listed in `docs/20261108_grouped_validation_integration_fixes.md`.
2. Full repository Ruff still has the unchanged baseline issues listed above;
   changed-file Ruff is clean.
3. User must perform all numbered visual acceptance steps; component tests and
   the limited browser smoke do not substitute for that acceptance.
4. No push, deployment, merge to main, worker-worktree changes, or branch/worktree
   deletion was performed.

## Final state

- Disposition: **NOT READY** until worker documentation corrections are
  dispatched/recorded. The integrated worktree and isolated UI app remain
  available for manual verification.
- Branch/worktree: `work/20261108-grouped-validation-integration` at
  `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/integration`.
- Integrated HEAD: to be filled with the final reviewer fix/documentation commit.
- Accepted worker deliveries: A, B, C, D in dependency order; original and
  resulting hashes are listed above.
- Review: `reviews/20261108_grouped_validation_integration_review.md`.
- UI guide: `docs/20261108_grouped_validation_ui_verification.md`.
- Samples: `samples/grouped_validation/`.
