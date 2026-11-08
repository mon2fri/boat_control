# 2026-11-08 Grouped validation — Worker C delivery

## Status

**ORIGINAL C DELIVERY COMPLETE — POST-INTEGRATION DOCUMENTATION NOW UPDATED**

The first part of this record describes Worker C’s original delivery and its
pre-integration validation. Integration later found page-level and config/rule
resolution defects that C’s non-visual work could not catch on its own. The
reviewer fixed those gaps; section “Post-integration documentation update” below
distinguishes the original delivery, integration defects, reviewer fixes and
reviewer-run regression evidence.

Worker C implemented the non-visual frontend domain/wire mapping, shared grouping
helpers, workflow state/actions, configuration persistence, saved-filter and
saved-run restoration, and the pre-execution guard for grouped filters. Worker D
still owns the visual editor/page wiring documented below. No backend, D-owned
visual component, other worktree or main branch was modified by C.

## Branch / worktree / commits

- Branch: `work/20261108-grouped-validation-worker-c`
- Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-c`
- Base: `e972e3f` (`docs: prepare parallel grouped validation assignments and review workflow`)
- Ordered commits for reviewer cherry-pick:
  1. `81fa44b` — `feat(frontend): transport grouped filters and rule outcomes`
     (source, tests, implementation documentation)
  2. `d6b97a9` — `docs: record worker C grouped validation delivery`
  3. `a6edaa7` — `fix(frontend): treat no filters as unrestricted and reject mixed legacy outcomes`
     (fix source/tests plus implementation/delivery documentation)
  4. This final delivery-record commit (documentation only)

Dependency commits: **none**. C did not cherry-pick or merge A/B/D work. The
payload shape follows `planning/20261108_grouped_validation_shared_contract.md`
and must be reconciled against real A/B responses during integration.

## Changed files

Source:

- `frontend/src/api/domain.ts`
- `frontend/src/api/wire.ts`
- `frontend/src/api/mapping.ts`
- `frontend/src/api/configContent.ts`
- `frontend/src/lib/grouping.ts` (new)
- `frontend/src/features/rules/groupingTree.ts`
- `frontend/src/features/rules/useRules.ts`
- `frontend/src/features/results/useRunExecution.ts`
- `frontend/src/state/WorkflowContext.tsx`

Tests:

- `frontend/src/lib/grouping.test.ts` (new)
- `frontend/src/api/groupedMapping.test.ts` (new)
- `frontend/src/api/configContent.grouped.test.ts` (new)
- `frontend/src/state/WorkflowContext.grouped.test.ts` (new)
- `frontend/src/features/results/useRunExecution.test.ts`
- `frontend/src/features/rules/useRules.test.ts`
- `frontend/src/state/WorkflowContext.test.ts` (fixture fields)
- `frontend/src/state/savedRunRestoration.test.ts` (fixture fields)
- `frontend/src/features/filters/useFullSetGuard.test.tsx` (fixture fields)

Documentation:

- `docs/20261108_grouped_validation_worker_c_implementation.md`
- `reviews/20261108_grouped_validation_worker_c_delivery.md`

Not touched: `frontend/src/features/filters/FilterBuilder.tsx`,
`FilterRowEditor.tsx`, `frontend/src/features/rules/RuleEditor.tsx`,
`GroupingTreeEditor.tsx`, `PreparePage.tsx`, `UploadPage.tsx`,
`ResultsPage.tsx`, `frontend/dist/**` or any backend file.

## Acceptance criteria covered (Worker C portion)

| Requirement | C evidence |
| --- | --- |
| Nested filter expressions survive save/load/import/export and run restoration | `configContent.grouped.test.ts`; `groupedMapping.test.ts` run-document cases; `WorkflowContext.grouped.test.ts` |
| Existing filter configs keep legacy combination behaviour | absent grouping maps to legacy AND/null relation; explicit tests |
| Multiple grouped outcomes round-trip | `groupedMapping.test.ts`, `configContent.grouped.test.ts`; legacy single outcome stays legacy |
| Removing/editing referenced clauses cannot silently execute altered logic | invalid/unknown/duplicate/omitted tree validation; reducer keeps tree + errors; `useRunExecution` blocks before fetch |
| Runtime IDs map to persisted indexed references | filter/outcome reorder tests at every boundary |
| Column-against-column remains usable as legacy single outcome | `groupedMapping.test.ts` legacy column comparison test |
| Missing columns surface before execution | `validateWorkflowFilters` column-membership check; config warnings for excluded columns/families |
| Invalid restored run does not broaden execution | invalid saved tree preserved with errors; invalid/grouped reapir state blocks run |

Not in C scope: backend evaluation/null-blank semantics, visual editor UI,
HTML/Excel report content, canonical identity computation.

## Interfaces Worker D must consume

See the full checklist in
`docs/20261108_grouped_validation_worker_c_implementation.md`. Summary:

- Workflow fields: `filterRelation`, `filterGroupTree`, `filterGroupingErrors`.
- Actions: `setFilterConfiguration`, `setFilterRelation`, `setFilterGroupTree`,
  `restoreRunConfiguration`.
- Helpers: `workflowConfigurationFromRun`, `validateWorkflowFilters`,
  `workflowReducer`.
- Domain: `SavedFilter.relation/groupTree/groupingErrors`;
  `Rule.logicClauses/logicRelation/logicGroupTree/logicGroupingErrors`;
  `RunRequest.filterRelation/filterGroupTree/filterGroupingErrors`;
  `RunResult.filtersRelation/filtersGroupTree/filtersGroupingErrors`.
- Pure grouping: `buildFlatGroupTree`, `validateGroupingTree`,
  `resolveGroupedExpression`, `toPersistedGroupingTree`,
  `fromPersistedGroupingTree`, `remapGroupingTree`, `collectGroupingIds`,
  `GroupingValidationError`.
- D must dispatch `setFilterConfiguration` on config load and
  `restoreRunConfiguration` on saved-run deep links, and include the new filter
  fields in the `RunRequest`.

## Verification performed

Environment: isolated worker-c worktree; fresh `npm ci` in `frontend/` (no
dependencies shared with another worktree).

```text
cd frontend
npx tsc -b tsconfig.app.json --pretty false
# exit 0, no diagnostics

npx vitest run \
  src/lib/grouping.test.ts \
  src/api/groupedMapping.test.ts \
  src/api/configContent.grouped.test.ts \
  src/state/WorkflowContext.grouped.test.ts \
  src/features/results/useRunExecution.test.ts \
  src/features/rules/useRules.test.ts
# 6 test files passed, 64 tests passed

npx vitest run --testTimeout=20000 --hookTimeout=20000 --maxWorkers=2
# 59 test files passed, 558 tests passed

git diff --check
# no output (clean)
```

`npm run lint` was also attempted. It remains red on pre-existing repository-wide
rules (unsafe `any` and `set-state-in-effect` in existing files); this is not a
new grouped-validation regression and is not part of the reviewer's stated gate.
No generated bundles or dependency folders were committed.

## Defects, causes and fixes

All defects found while implementing are recorded in the implementation doc:

1. Config row filtering shifted persisted `cN` references when a row failed to
   resolve. Fixed by index-preserving placeholders and validation errors.
2. Invalid present trees could have been rescued by flat relation/legacy AND.
   Fixed by making a present tree authoritative and error-preserving.
3. Contradictory `logic` + `logic_clauses` payloads were ambiguous. Schemas and
   mappers now reject them.
4. Reordering runtime clauses corrupted persisted references. Added explicit
   runtime↔index remapping at every save/load boundary with reorder tests.
5. Optional legacy run fields changed exact mapped-result shape. Fixed by only
   emitting grouping fields when the persisted run contains them.
6. TypeScript `exactOptionalPropertyTypes` rejected the refinement callback shape.
   Fixed the optional property declaration; `tsc -b` passes.
7. A stale flat relation blocked a run after every filter was removed. Zero
   clauses now mean no row restriction, and config serialization omits grouping
   when no filters remain.

## Remaining issues as originally delivered

These were C’s pre-integration open items and are superseded by the
post-integration record below:

1. Reconcile the multi-outcome wire shape with real A/B responses.
2. D wiring was still required for config load, run request construction,
   saved-run deep links and visual editors.
3. Browser/UI verification and backend grouped evaluation were not performed by C.
4. Pre-existing frontend lint failures were outside this delivery.

---

# Post-integration documentation update

Read-only sources from the integration branch:

- `docs/20261108_grouped_validation_integration_fixes.md`
- `reviews/20261108_grouped_validation_integration_review.md`

Reviewer integration commits: `0992b78` (backend grouped-outcome normalization)
and `fa17108` (bounded frontend/UI/contract integration). Review-closure docs
commit: `370eac3`. **C did not cherry-pick integration code or rerun integrated
gates.** Everything in the “reviewer-run” subsection is attributed to the
reviewer.

## 1. Original delivery and validation (pre-integration)

Original C commits and their accepted integration commits:

| C commit | Purpose | Integration commit |
| --- | --- | --- |
| `81fa44b` | domain/API/state transport | `381454a` |
| `d6b97a9` | delivery documentation | `295de62` |
| `a6edaa7` | no-filter/mixed-form fix | `475d8b3` |
| `f249301` | cherry-pick order docs | `c7930b7` |

C’s original evidence was:

- `tsc -b` clean;
- 6 focused grouped-validation test files / 64 tests passed;
- full frontend suite 59 files / 558 tests passed;
- `git diff --check` clean.

That evidence remains valid for the original non-visual scope. It did not cover
page wiring, D’s editors, or the later integration-only fixes.

## 2. Defects discovered during integration

1. **Page-level config load/save did not propagate filter grouping.** Prepare and
   Upload pages dispatched only `setFilters` on load and built save content from
   filter rows alone. `FilterBuilder` was uncontrolled in `PreparePage`.
2. **`ResultsPage.buildRunRequest` omitted grouping.** Relation, tree, repair
   errors and explicit-grouping requirements never reached the run request.
3. **Saved-run deep links did not use `restoreRunConfiguration`.** Individual
   dispatches restored other configuration but not grouped filters or invalid
   expression errors.
4. **Newly authored multi-filter expressions could fall back to legacy AND.**
   Missing relation/tree was interpreted as legacy AND for every caller, allowing
   an unfinished new expression to run with unintended flat semantics.
5. **The strict config serializer could throw during render.** Adding an
   incomplete filter row caused React Router’s error boundary instead of an
   actionable save error.
6. **Unresolved flat filters were dropped.** A missing filter under a flat/legacy
   relation disappeared from the resolved rows, potentially broadening scope. C’s
   earlier placeholder logic only covered unresolved rows referenced by a tree.
7. **Missing condition references could rebind to another clause.** A saved
   missing `c0` could map to a later condition renumbered to runtime `c0`.
8. **Partial rule imports were applied.** `RulesPage` proceeded with drafts even
   when resolution produced blocking invalid-grouping/missing-column warnings.
9. **Family expansion changed positive any-match semantics.** Expanded tree
   leaves always used AND; positive predicates require OR, negative predicates
   require AND. Flat expressions also needed generated grouping to preserve
   precedence.
10. **One-clause new-form grouping fields were accepted then discarded** by the
    backend normalization path.

## 3. Reviewer-authored fixes and regression evidence

### 3a. Frontend-only grouping mode/explicitness state

The reviewer added state/transport that is deliberately **not persisted on the
wire**:

- `FilterGroupingMode = GroupRelation | "custom"`.
- `WorkflowState.filterGroupingMode` and `WorkflowState.filterGroupingRequired`.
- `RunRequest.filterGroupingRequired`.
- `setFilterConfiguration` accepts `mode` and `requireExplicit`.
- `validateWorkflowFilters`, `mapFilterConfigurationToWire`,
  `mapRunRequestToWire` and `resolveGroupedExpression` accept the explicit
  multi-filter requirement.
- `workflowConfigurationFromRun` infers mode/explicitness from restored
  relation/tree/errors.
- The active mode decides what is serialized. A retained custom tree stays dormant
  while the user temporarily selects flat AND/OR and is restored when switching
  back. Newly authored multiple filters block until a relation/tree is explicitly
  chosen; restored legacy configs/runs still default to legacy AND.
- `tryMapWorkflowToRowsColumnsConfig` returns `{content, error}` rather than
  throwing during render; `ConfigManager.saveDisabled` and page error messages
  block saving invalid expressions.

### 3b. Page integration fixed by the reviewer

- `PreparePage`/`UploadPage` now dispatch `setFilterConfiguration` with relation,
  tree, mode, errors and explicit-grouping state, and include grouping in save
  payloads.
- `PreparePage` mounts `FilterBuilder` controlled through
  `grouping`/`onGroupingChange`.
- `ResultsPage.buildRunRequest` carries grouping fields, and deep-link restoration
  uses `restoreRunConfiguration`.
- `RulesPage` refuses partial rule-config imports when blocking
  `invalid_grouping` warnings exist.

### 3c. Missing-reference and family-semantics fixes

- Unresolved filters now attach blocking restoration errors even for flat/legacy
  expressions.
- Missing condition/outcome references become explicit `__missing_cN__`
  sentinels; lookup cannot fall through to a later rebounded index.
- Missing rule columns/families produce blocking warnings and prevent partial
  import.
- Family expansion uses OR for positive predicates and AND for negative
  predicates inside the original expression; flat grouped expressions are wrapped
  in a generated tree when needed.
- Unsupported legacy single-outcome family expansion is rejected instead of
  silently choosing the first member.

### 3d. Reviewer regression tests

- `frontend/src/api/groupedMapping.test.ts`: new multi-filter request without
  explicit grouping throws; legacy request still omits grouping fields.
- `frontend/src/api/configContent.grouped.test.ts`: selected flat relation does
  not activate a dormant custom tree; new multi-filter save without explicit
  expression is blocked; unresolved flat/legacy filter rows block; family
  condition expansion preserves positive OR/negative AND semantics; unresolved
  condition references stay distinct; missing flat grouped outcomes are blocking.
- `frontend/src/state/WorkflowContext.grouped.test.ts`: new multiple filters are
  blocked until grouping is selected; flat mode retains a dormant custom tree.
- `frontend/src/pages/ResultsPage.grouped.test.ts`: `buildRunRequest` sends the
  active nested tree, errors and explicit-grouping requirement.
- `frontend/src/pages/RulesPage.test.tsx`: invalid grouped rule config is not
  partially imported.
- `tests/backend/test_grouped_validation_integration.py`: real A-materialized
  four-clause Y/N expression executes through B’s runtime; five violations,
  both passing cases and complete outcome context.

### 3e. Reviewer-run integrated verification (not run by C)

The reviewer reported:

- backend `check` passed; `makemigrations --check --dry-run` found no changes;
- backend suite `tests/backend tests/contracts tests/integration`: **774 passed**
  under isolated `GROUPED_VALIDATION_HOME` settings;
- `mypy backend` passed for 94 source files;
- changed-file Ruff passed; full Ruff retained only 5 unchanged baseline findings;
- frontend suite: **65 files / 599 tests passed**;
- frontend production build passed with the existing 731.11 kB chunk warning;
- `git diff --check` clean under the generated-dist exception;
- sample evaluator: 11 selected, 3 passes (`1,2,8`), 8 violations
  (`3,4,5,6,9,10,14,15`), with null vs empty-string rows distinguished;
- limited headless Chrome smoke covered adding two filters, selecting CUSTOM
  GROUPS, creating a group, and observing validation errors without a page crash.

The reviewer explicitly did **not** claim full numbered UI acceptance.

## 4. Remaining limitations and pending user UI acceptance

- The integration disposition was **NOT READY** only pending worker
  documentation corrections. This record and the implementation record now
  include the required integration findings; reviewer confirmation of the
  documentation gate is still required.
- Frontend grouping mode/explicitness is UI-only and intentionally absent from the
  wire; restored state is inferred from the persisted relation/tree/errors.
- Full user visual acceptance remains pending: nested filter truth table,
  save/reload/restart, simple and nested outcomes, opposite-flags Y/N table,
  null/blank negative operators, clause edit/remove/reorder, config/run
  restoration, legacy and column-against-column compatibility, reports and
  exception-tracking inspection.
- Backend grouped evaluation, report/tracking content and browser acceptance
  remain reviewer/user evidence, not Worker C test claims.
- Pre-existing full-repository Ruff findings remain unchanged.

# S35 + legacy R056/R057 run-response follow-up

## Reproduction and boundary

The integration worktree was inspected read-only and its S35 configuration,
legacy R056/R057 rules, saved-run documents, database and uploads were preserved.
The reproduction copied/used those artifacts without modifying the integration
worktree.

The backend completed and persisted the attempted runs. Saved runs
`e4ad6f7e9feb` and `24ec2b1936a8` contain both legacy rules, nested aggregation
and S35’s two comparison sections; `c41490b1adc4` contains R056 only after a
temporary rule removal. `GET /api/runs/e4ad6f7e9feb/` and
`GET /api/runs/c41490b1adc4/` returned **HTTP 200** with the same payload that
the UI rejected. The failure is therefore the frontend validation after a
successful `POST /api/runs/execute/`, not a backend execution failure.

Exact paths:

```text
result.filter_relation       = null
result.filter_grouping_tree  = null
```

The run-result serializer and historical-run normalization explicitly emit null
when no grouping exists. C’s schema required `"and" | "or"` / an object whenever
the field was present, so both the current and legacy response schemas rejected
the completed run with `Response failed validation`. No other R056/R057 field
failed; nested aggregation, comparison sections, target columns, nullable
comparison values and legacy single-outcome responses mapped correctly.

## Fix and regression evidence

Fix commit `3660f80`:

- accepts explicit null for run-request/result `filter_relation` and
  `filter_grouping_tree`;
- maps null as legacy AND / no custom tree without dropping data;
- still rejects malformed relation strings and malformed trees;
- adds an actual saved-run snapshot fixture for S35 + R056/R057 and tests for
  schema acceptance, nested aggregation, comparison sections, aggregation
  columns, both legacy rules, group statistics and saved-run `loadRun()` retrieval.

C validation on the worker branch:

```text
npx tsc -b tsconfig.app.json --pretty false
# success

npx vitest run src/api/s35LegacyRunResponse.test.ts
# 1 file passed, 4 tests passed

npx vitest run --testTimeout=20000 --hookTimeout=20000 --maxWorkers=2
# 60 files passed, 562 tests passed
```

## Dependencies for reviewer integration

- Apply fix `3660f80` after integration frontend fix `fa17108`.
- Apply the accompanying documentation correction after the previously integrated
  Worker C docs commit `152f13d`.
- `0992b78` is needed for real multi-outcome runtime execution but not for this
  legacy R056/R057 run-response schema fix.
- C did not cherry-pick any integration commit.

## Remaining issue requiring Worker B follow-up

The separate R079 grouped-outcome run (`fdef26c436ab`) returns a compound
`violating_value` object, e.g. `{"sa_flag": "Yes", "cva_flag": "Yes"}`. The
scalar `violating_value` contract does not permit that object. This is outside
the S35 + R056/R057 failure and was not broadly accepted. B and the reviewer need
to settle the payload: keep `violating_value` scalar and use
`outcome_columns`/`outcome_values` for the map, or add an explicit object field
with frontend rendering support.

## Disposition after S35 follow-up

Worker C’s original delivery remains documented above, with the reviewer’s
integration fixes attributed to the reviewer. The S35/R056/R057 null-grouping
contract mismatch is fixed and covered on the worker branch. Full user UI
acceptance, including the S35 run flow and the separate R079 payload decision,
remains pending.
