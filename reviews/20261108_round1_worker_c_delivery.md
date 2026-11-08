# Round 1 Worker C delivery — Overall Results grouping

## Status

Implementation complete in the prepared round 1 worktree.

- Branch: `work/20261108-grouped-validation-round1-worker-c`
- Starting HEAD: `aa4ed06377a629e4b7393b357a6c9a10eafef1dd`
- Baseline includes `aa4ed06`, `a552dbc` and the accepted S35 nullable-grouping
  fix.
- No integration commit was cherry-picked, no push, no merge, no cross-worktree
  edit, no user config/data mutation and no generated bundle commit.

## Assignment coverage

| Item | Owner | Status |
| --- | --- | --- |
| Bug 2 — Overall Results shows complete applied-filter grouping from the saved run | C | Done |
| Shared hierarchy formatting for D's E1/B4 hints | C | Done |
| FILTER/CONDITION/OUTCOME-capable labels, stable `overall`/group numbering | C | Done |
| Existing API/state/nonvisual ownership | C | Preserved and regression-tested |
| Legacy no-filter/flat-AND and saved-run restoration | C | Preserved and tested |
| Invalid reference blocking | C | Preserved and tested |
| Accepted R079 / S35 fixes | C | Untouched |
| D-owned editors/components | D | Not edited |

## Root cause and fix

The Overall result card only rendered flat applied-filter text from the editor
state and ignored the persisted `filter_relation` / `filter_grouping_tree`.
The card now receives the persisted run fields from `ResultsPage`, resolves the
saved tree, and renders the complete expression:

```text
overall: FILTER 1 AND group 1
group 1: FILTER 2 OR FILTER 3
FILTER 1: system contains "oomber"; FILTER 2: status equals "active"; FILTER 3: status equals "inactive"
```

An invalid/missing reference shows an accessible error and keeps every filter
row; it is never flattened. A legacy multi-filter run without a tree remains
`overall: FILTER 1 AND FILTER 2 ...`.

## Published interfaces for D

- `formatGroupTreeHierarchy(node, clauseLabel, options?)`, where options can
  set `rootLabel`, `groupLabel` and `operatorLabels`.
- Existing two-argument calls are unchanged.
- `summarizeAppliedFilters(...)` is C-owned and results-specific; D does not
  need to consume it.

## Verification evidence

```text
./node_modules/.bin/tsc -b tsconfig.app.json --pretty false
# success

./node_modules/.bin/vitest run \
  src/features/results/appliedFilterSummary.test.ts \
  src/features/results/OverallSummaryCards.test.tsx \
  src/features/rules/groupingTree.test.ts \
  src/features/results/results.test.tsx
# 4 files passed, 45 tests passed

./node_modules/.bin/vitest run --testTimeout=20000 --hookTimeout=20000 --maxWorkers=2
# 70 files passed, 2 skipped (72)
# 628 tests passed, 2 skipped (630)
```

`git diff --check` clean.

The fixture is the actual saved run `4b9e700766fa_baseline_vs_candidate.json`
from the integration history, copied read-only. It contains the requested
`Filter 1 AND (Filter 2 OR Filter 3)` expression and is exercised through the
real wire schema, API mapping and saved-run state restoration.

## Ordered commits and dependencies

1. `82c9379` — shared `groupingTree.ts` helper + test;
2. `8ec444b` — Overall Results summary + ResultsPage wiring + fixture/tests;
3. this documentation commit last.

Integration order:

1. C helper commit before D's editor UI (D uses the backward-compatible helper).
2. C summary commit after the helper commit.
3. C docs last.
4. Reviewer runs the integrated frontend suite and production build, then real
   browser/UI acceptance. C does not claim browser verification.

## Remaining issues

- D still owns visible editor hints, remove-all-grouping behaviour, tooltip
  accessibility and the R079 root preview.
- No remove-all-grouping state/reset request was received from D. If needed,
  document the interface first and add only the owned state boundary.
- Reviewer must confirm the real saved nested-filter run and the S35/outcome
  groups browser flows.
