# Grouped validation — Worker D delivery record

Date: 2026-11-08
Branch: `work/20261108-grouped-validation-worker-d`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-d`
Base/setup commit: `e972e3f` (`docs: prepare parallel grouped validation assignments and review workflow`)

## Status

Worker D visual implementation complete and committed. Integration-dependent
persistence/transport checks are explicitly **blocked by pending Worker C** and are not
claimed as passing. No other worker branch was merged, no agents were spawned, and no
main/integration branch was modified.

## Ordered commits for reviewer cherry-pick

The reviewer should cherry-pick in this order:

1. `656ed15` — feat(frontend): add grouped row filters and multi-outcome rule logic
2. docs commit (hash reported in the final handover) — docs: record Worker D grouped validation implementation and delivery

Exact source hash is above; the final docs hash is reported in the handover message.

## Changed files

Source:

- `frontend/src/features/filters/FilterBuilder.tsx`
- `frontend/src/features/filters/FilterRowEditor.tsx`
- `frontend/src/features/filters/filterGrouping.ts` (new)
- `frontend/src/features/rules/GroupingTreeEditor.tsx`
- `frontend/src/features/rules/RuleEditor.tsx`
- `frontend/src/features/rules/SortableRuleList.tsx`
- `frontend/src/features/rules/groupingEditorSupport.ts` (new)
- `frontend/src/features/rules/logicOutcomes.ts` (new)
- `frontend/src/index.css`

Tests:

- `frontend/src/features/filters/filterGrouping.test.ts` (new)
- `frontend/src/features/filters/FilterBuilder.test.tsx` (new)
- `frontend/src/features/rules/logicOutcomes.test.ts` (new)
- `frontend/src/features/rules/groupingEditorSupport.test.ts` (new)
- `frontend/src/features/rules/RuleEditor.outcomes.test.tsx` (new)

Documentation:

- `docs/20261108_grouped_validation_worker_d_implementation.md`
- `reviews/20261108_grouped_validation_worker_d_delivery.md`

No generated `frontend/dist` output, dependency folder, cache, database, or local test
data is committed.

## Dependencies

- Received/accepted dependency commits: **none yet**.
- Base setup `e972e3f` only. Worker A/B/C commits were not present in this worktree.
- Required Worker C interface (published in the implementation doc): filter
  grouping props/state/transport; rule outcome domain/wire/config/restoration fields;
  runtime-id ↔ indexed-id mapping; legacy single-outcome compatibility; rejection of
  contradictory representations.
- Required A/B backend semantics: tree evaluation, null/blank semantics, compound
  outcome detail/report context, canonical identity. D did not edit backend modules.

## Requirement / acceptance coverage (visual scope)

| Requirement | Coverage |
| --- | --- |
| Nested overall filter expression `(F1 AND F2) OR F3` | FilterBuilder reuses grouping tree; preview/test formatting; custom groups via GroupingTreeEditor. |
| Existing filter configs keep behaviour | Legacy multi-filter default is AND; single filter needs no grouping. |
| `A=Y OR B=Y` / `A=N AND B=N` | RuleEditor multiple outcomes with AND/OR relation; component tests. |
| `(A=Y OR B=Y) AND C=Active` / nested outcome groups | Reused custom grouping tree with nested groups; full expression preview. |
| Exact two AND groups joined by OR (`SA=Y/CVA=N` or `SA=N/CVA=Y`) | Built through the UI in `RuleEditor.outcomes.test.tsx`; full expression asserted. |
| Add/edit/remove/reorder clauses | Add/remove/reorder controls for filters and outcomes; validation/repair tests. |
| Prevent save/run on invalid references or omissions | Row/filter and outcome validation blocks save; missing/unknown/duplicate/empty/deep trees reported. |
| Single/empty configuration behaviour | Single filter/outcome valid without grouping; empty filters still mean full set; empty logic blocked. |
| Mode switching without silent data loss | Custom trees retained across AND/OR switches; column mode retains outcomes and blocks save until explicit discard/switch back. |
| Single column-against-column mode | Existing mode and tests preserved; multi column-against-column is out of scope. |
| Full-expression preview and accessible controls | Parenthesised expression previews, labelled groups/outcomes, `aria-invalid`, labelled move/remove buttons, live error lists. |
| Null/blank help text for all four operators | Filters, conditions, outcomes, and rule help state equals/contains reject null/blank; negative operators match; whitespace literal. |
| Persistence/canonical identity/evaluation | **Worker C/A/B responsibility, not available in this worktree; blocked.** |

## Exact test commands and results

From `frontend/` unless noted.

```bash
npx tsc -b --pretty false
# PASS (no output)

npx vitest run src/features/filters/filterGrouping.test.ts \
  src/features/rules/logicOutcomes.test.ts \
  src/features/filters/FilterBuilder.test.tsx \
  src/features/rules/RuleEditor.outcomes.test.tsx
# PASS — 4 files, 26 tests

npx vitest run src/features/filters/FilterBuilder.test.tsx \
  src/features/rules/RuleEditor.outcomes.test.tsx \
  src/features/rules/RuleEditor.test.tsx \
  src/features/rules/GroupingTreeEditor.test.tsx \
  src/features/filters/filterGrouping.test.ts \
  src/features/rules/logicOutcomes.test.ts \
  src/features/rules/groupingEditorSupport.test.ts
# PASS — 7 files, 52 tests

npx vitest run --maxWorkers=2 --testTimeout=15000
# PASS — 60 files, 533 tests
# Note: unconstrained runs in this container hit unrelated 5s test timeouts under
# parallel load (ExceptionTrackingPage, HistoryPage, journey, etc.). No D-owned test
# failed in the constrained full run.

npm run build
# PASS — tsc -b && vite build (generated dist changes not committed)

npx eslint <all Worker D changed/new source and test files>
# PASS for Worker D files
# Repository-wide `npm run lint` still reports pre-existing errors outside this
# assignment (api/configContent, useRules, RulesPage, legacy tests, etc.); not caused
# by this delivery.

git diff --check
# PASS — no output
```

## Defects and fixes recorded

See implementation doc “Defects found and fixed”: operator-change value clearing,
no-tree repair action, and filter remove accessible name. Each has regression coverage
in the focused tests above.

## Remaining issues / blockers

1. **Worker C integration pending:** filter grouping is not yet in workflow state,
   config persistence, run requests, or saved-run restoration; rule outcomes are not yet
   in domain types, wire mapping, config import/export, or canonical identity inputs.
   The editors are ready to consume/publish the documented fields, but only C can wire
   them without violating file ownership.
2. **No real end-to-end/browser acceptance:** no Worker C transport or backend A/B
   implementation existed in this worktree; no browser run was performed.
3. **Unconstrained full-suite flakiness:** unrelated existing tests exceed 5s under
   parallel load in this container; constrained full run passed. Reviewer should use the
   normal integrated gate environment.
4. **Not implemented by design:** multi-outcome column-against-column, deferred business
   metadata/approval workflow, and any migration/re-identification of historical rules.

## Handover

Implementation is scoped to D-owned visual files and tests. Reviewer may cherry-pick the
ordered hashes above; Worker C should wire the documented optional fields and run the
combined integration checks. Do not treat mock/component-only evidence as backend
acceptance.
