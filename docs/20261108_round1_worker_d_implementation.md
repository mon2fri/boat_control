# Round 1 Worker D — filter/rule/grouping editor implementation

Date: 2026-11-08. Worker: D (frontend filter/rule/grouping editor components).
Branch: `work/20261108-grouped-validation-round1-worker-d`.

## Starting point and baseline

- Starting HEAD recorded before any edit: **`aa4ed06`**
  (`docs: assign round one filter and rule enhancements by ownership`).
- The worktree baseline includes `aa4ed06` and therefore the accepted integration
  history up to that commit: the grouped validation delivery, the R079 editor
  hydration/save fix, the S35/R079 response fixes (`a552dbc`) and the round 1
  ownership/instruction snapshot.
- No other worktree, user config/data, dependency or generated bundle is part of
  this delivery.

## Requirement coverage

Source of truth: `requirements/20261108_req_filter_rule_logic_enhancement.md` and
`planning/20261108_round1_filter_rule_logic_worker_d_instruction.md`.

| Item | Implementation |
| --- | --- |
| B1 free-text filter values for `contains` | `FilterRowEditor` now passes `freeText` to its value picker, so a fragment such as `oomber` is accepted with Enter even when it is not an enumerated CSV value. The existing literal matching/null semantics and starred single-file guard are unchanged. |
| B4 R079 full root/group hierarchy | `GroupingTreeEditor` no longer unwraps a persisted root OR into a two-group forest. The whole tree is rendered, so R079 shows overall **Group 3 OR** above Group 1 and Group 2. The outcome hierarchy preview renders `overall: group 1 OR group 2` plus the child lines. Persisted trees are not rewritten to fix labels. |
| E1 hierarchical filter hints | New `formatFilterGroupingHierarchy` renders `overall: group 1 OR group 2`, then `group 1: filter 1 AND filter 2`, matching the Outcome Groups presentation. Flat AND/OR modes render one `overall:` line. |
| E2 FILTER X labels | Every filter row shows a visible `Filter N` label in the same style as `Condition N`/`Outcome N`; accessible row labels are unchanged. |
| E3 Remove all groups | The filter, condition and outcome `Use all … AND/OR group` shortcuts are replaced by `Remove all groups`. The action clears only that section's grouping choice (`mode`/`tree`, `conditionJoin`/`groupTree`, `logicRelation`/`logicGroupingTree`); clauses and values are retained. |
| E4 hint icons | `SectionHint` renders a focusable exclamation icon next to the Row Filters title and the Filter groups / Condition groups / Outcome groups titles. Explanatory text lives in a hover/focus tooltip. Validation errors remain visible. |
| E5 remove Use Single Outcome | The multi-outcome `Use single outcome` action is removed. Legacy single-outcome editing and the column-mode `Discard extra outcomes` safety action remain. |
| E6 nested disabled removal | Nested groups render a disabled `Remove group` control. Its focusable wrapper exposes the tooltip `This group is part of group 3, please remove group 3 first to remove this group.` with the actual immediate parent number. Root groups keep an enabled `Remove group`. |

## Behavioral decisions and interfaces

- `GroupingTreeEditor` owns presentation only. It now always renders the
  persisted root when the value is a group. A tree created in the editor is
  emitted with the same shape, so the root is never hidden. The tree is never
  flattened, emptied or converted to AND for display.
- `showHelp` is a new optional `GroupingTreeEditor` prop. Parents that place a
  `SectionHint` next to the section title pass `false` so the same copy is not
  duplicated.
- `SectionHint` (new shared component) is a focusable `span` with
  `role="img"`, an accessible label and a `role="tooltip"` child. It reuses the
  existing `.value-hint` hover/focus CSS and therefore works from the keyboard.
- `CollapsibleCard` gained an optional `hint` node. Its header is now a wrapper
  containing the toggle button and the hint, avoiding nested interactive
  controls while keeping the existing button accessible name.
- Remove-all helpers are pure adapters owned by D:
  `clearFilterGrouping()` and `clearLogicOutcomeGrouping()`. Condition removal is
  a direct state patch. None of them change clause/value arrays.
- `FilterBuilder` now honors an explicit controlled `null` grouping mode instead
  of falling back to the previously remembered mode, which is required for
  Remove all groups to take effect.
- Saving/running multiple clauses still requires explicit grouping: the existing
  editor validation blocks save, and the existing workflow `requireExplicit`
  validation blocks a run. No AND fallback was added.

## Root cause notes

- **B1:** the filter value picker was created without `freeText`, so only values
  from the prepare response could be committed.
- **B4/E6:** `PerGroupingEditor` treated a persisted root OR whose children were
  all groups as a transport-only wrapper (`forestMode`) and rendered only its
  children. R079 therefore appeared as Group 1 + Group 2 with no overall Group 3
  OR, and nested groups had no persistent remove affordance.
- **E1:** the filter preview used the flat, fully parenthesised expression
  formatter rather than the hierarchy formatter already used by outcomes.
- **E3/E5:** the editor exposed shortcut buttons that re-seeded or collapsed
  grouping instead of letting the user repair the grouping explicitly.

## Dependencies and ownership

- **C-owned files were not modified.** D used the existing
  `formatGroupTreeHierarchy` export from `features/rules/groupingTree.ts`.
  The existing `groupingTree.ts` helper already supports `overall:`/`group N`
  labels, so no C change is required for this round.
- The existing workflow reducer/run guard (`requireExplicit`, `withFilterValidation`)
  already blocks an ungrouped multi-filter run when the editor reports an
  explicit remove-all state; no C change is required.
- `frontend/src/components/SectionHint.tsx` is new D-owned presentation code.
  `CollapsibleCard.tsx` is a shared visual component adjusted only to host the
  hint next to the title.
- Reviewer should integrate C's grouping/hierarchy work first if C changes
  `formatGroupTreeHierarchy`; this delivery only relies on its current signature
  `(tree, conditionLabel) => string`.

## Checks and actual results

All results below were run on this worker worktree against `aa4ed06` plus the
changes in this delivery.

```text
./node_modules/.bin/tsc -b --pretty false
PASS

./node_modules/.bin/vitest run \
  src/features/filters/FilterRowEditor.test.tsx \
  src/features/filters/FilterBuilder.test.tsx \
  src/features/filters/filterGrouping.test.ts \
  src/features/rules/GroupingTreeEditor.test.tsx \
  src/features/rules/RuleEditor.test.tsx \
  src/features/rules/RuleEditor.outcomes.test.tsx \
  src/features/rules/logicOutcomes.test.ts
PASS — 7 files / 63 tests

./node_modules/.bin/vitest run --maxWorkers=2 --testTimeout=15000
PASS — 67 passed / 2 skipped files (69 total); 622 passed / 2 skipped tests

npm run build
PASS — production build; generated dist changes were restored and not committed

./node_modules/.bin/eslint <changed source and test files>
PASS
```

Coverage added for the requested behaviours:

- free-text `oomber` add/save/reload persistence (`FilterRowEditor` and
  `FilterBuilder` probe);
- loaded R079 root OR in the tree editor and in the outcome hierarchy preview;
- hierarchical filter hints including the overall root and numbered groups;
- remove-all groups for filters, conditions and outcomes with clauses/values
  preserved;
- invalid-save blocking after remove-all until an explicit AND/OR/custom choice;
- nested disabled Remove group controls, parent-number tooltip and keyboard
  focus;
- FILTER X labels, hint-icon keyboard access, and legacy single-outcome
  behaviour.

## Limitations / remaining issues

- These are component/unit and production-build checks. No real-browser
  click-through was performed by Worker D for this round.
- The reviewer still owns the integrated frontend bundle, cross-worker
  integration tests, real XLSX/user-interface acceptance and any user config or
  data validation.
- A flat custom tree that is a bare leaf is treated as having no root group (the
  normal per-grouping states contain at least two clauses); this is unchanged
  from the previous behaviour and is not reachable through the current editors.
