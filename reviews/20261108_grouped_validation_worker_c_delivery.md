# 2026-11-08 Grouped validation — Worker C delivery

## Status

**IMPLEMENTATION COMPLETE IN WORKER C WORKTREE — READY FOR REVIEWER CHERRY-PICK**

Worker C implemented the non-visual frontend domain/wire mapping, shared grouping
helpers, workflow state/actions, configuration persistence, saved-filter and
saved-run restoration, and the pre-execution guard for grouped filters. Worker D
still owns the visual editor/page wiring documented below. No backend, D-owned
visual component, other worktree or main branch was modified.

## Branch / worktree / commits

- Branch: `work/20261108-grouped-validation-worker-c`
- Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-c`
- Base: `e972e3f` (`docs: prepare parallel grouped validation assignments and review workflow`)
- Ordered commits for reviewer cherry-pick:
  1. `81fa44b` — `feat(frontend): transport grouped filters and rule outcomes`
     (source, tests, implementation documentation)
  2. This delivery-record commit (documentation only)

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

## Remaining issues / reviewer decisions

1. **Reconcile multi-outcome wire shape with A/B.** C follows the shared contract
   literally: multi-outcome requests/responses use `logic_clauses` and omit
   `logic`. If the implemented backend also emits `logic` (for example the first
   clause) alongside `logic_clauses`, the contradictory check must be relaxed in
   integration after real response inspection.
2. **D wiring is required** for config load, run request construction, saved-run
   deep links and the visual filter/outcome editors. C did not edit D-owned files.
3. Browser/UI verification and backend grouped evaluation remain reviewer/A/B/D
   work. C makes no claim about real backend end-to-end execution.
4. `npm run lint` pre-existing failures remain outside this delivery.

## Disposition

Worker C's non-visual implementation, meaningful grouped mapping/state/config
tests, implementation documentation and this delivery record are committed on the
assigned branch. The branch is ready for the reviewer to cherry-pick
`81fa44b` followed by the delivery-record commit, then integrate with A/B and D.
