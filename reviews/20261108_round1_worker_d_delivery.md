# Round 1 Worker D — delivery review

Date: 2026-11-08.
Branch: `work/20261108-grouped-validation-round1-worker-d`.
Starting HEAD: **`aa4ed06`** (baseline includes the accepted grouped-validation
integration and the round 1 ownership/instruction snapshot).

This record is the reviewer handoff for Worker D's round 1 scope only. Earlier
grouped-validation delivery/review documents are unchanged.

## Ordered commits

| Order | Hash | Message | Scope |
| --- | --- | --- | --- |
| 1 | `777890d` | `feat(frontend): implement round one filter and grouping editor fixes` | D-owned source: filter/rule/grouping editors, shared hint/collapsible presentation, CSS |
| 2 | `95d5cc7` | `test(frontend): cover round one filter and grouping editor behaviour` | Component/unit tests for B1, B4, E1–E6 |
| 3 | docs commit containing this file | `docs: record round 1 Worker D implementation and delivery` | Implementation record and this handoff |

Apply in that order. The docs commit depends on both code commits only for the
hashes/records it describes; it changes no executable code.

## Original delivery vs reviewer work

- **Worker D delivery:** commits 1–2 above. They contain the editor changes and
  Worker D-run checks recorded here.
- **Reviewer integration:** not performed by Worker D. Reviewer owns cherry-pick
  order across workers, conflict resolution, generated `frontend/dist`, integrated
  suites and real browser/user acceptance.
- No result below is a reviewer-run or browser-run claim.

## Item coverage

| Item | Status | Evidence |
| --- | --- | --- |
| B1 free-text `contains` values | Delivered | `FilterRowEditor` free-text picker; `FilterRowEditor.test.tsx`; `FilterBuilder.test.tsx` add/save/reload probe for `oomber` |
| B4 loaded R079 full root hierarchy | Delivered | `GroupingTreeEditor` renders overall Group 3 OR above nested Group 1/2; R079 tests in `GroupingTreeEditor.test.tsx` and `RuleEditor.outcomes.test.tsx` |
| E1 hierarchical filter hints | Delivered | `formatFilterGroupingHierarchy`; nested and flat hint tests in `filterGrouping.test.ts` and `FilterBuilder.test.tsx` |
| E2 FILTER X labels | Delivered | Visible row label plus test in `FilterRowEditor.test.tsx` |
| E3 Remove all groups (filters/conditions/outcomes) | Delivered | `clearFilterGrouping`, `clearLogicOutcomeGrouping`, condition patch; remove-all tests preserve clauses/values and block implicit AND |
| E4 accessible hint icons | Delivered | New `SectionHint`; Row Filters / Filter groups / Condition groups / Outcome groups; keyboard-focus tests |
| E5 Remove Use Single Outcome | Delivered | Action removed; legacy single-outcome path retained; absence asserted in outcomes test |
| E6 nested disabled Remove group + parent tooltip | Delivered | Focusable disabled-control wrapper with actual parent number; keyboard/tooltip test in `GroupingTreeEditor.test.tsx` |

## Interfaces and ownership

- `GroupingTreeEditor` gained optional `showHelp` so parent titles can own the
  hint icon without duplicate copy.
- `SectionHint` is a new focusable accessible hint component.
- `CollapsibleCard` gained optional `hint` and separates the toggle button from
  the hint wrapper (no nested interactive controls).
- `clearFilterGrouping()` and `clearLogicOutcomeGrouping()` are pure adapters;
  they never touch clause/value arrays.
- `FilterBuilder` honors an explicit controlled `null` mode, which is required
  for Remove all groups to persist visually.
- **No C-owned file was modified.** The delivery uses the existing
  `formatGroupTreeHierarchy` export from `features/rules/groupingTree.ts`. The
  existing workflow `requireExplicit` validation blocks ungrouped runs, so no
  state/API change is required.
- No user configs/data, other worktrees, dependencies or generated bundles are
  included.

## Checks run by Worker D

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
PASS — 69 files (67 passed, 2 skipped) / 624 tests (622 passed, 2 skipped)

npm run build
PASS — production build completed; generated dist changes restored, not committed

./node_modules/.bin/eslint <changed source and test files>
PASS
```

`git diff --check` was run before each commit.

## Dependency / reviewer instructions

1. Integrate C's round 1 grouping/hierarchy and Overall Results work first where
   needed. This delivery currently depends only on the existing
   `formatGroupTreeHierarchy(tree, conditionLabel)` signature; if C changes that
   helper, re-run the D component tests and adjust only the import call site.
2. Cherry-pick `777890d`, then `95d5cc7`, then the D docs commit.
3. Run the targeted frontend mapping/component suites, the integrated frontend
   suite and the production build. Regenerate and commit `frontend/dist` as the
   reviewer owns the bundle.
4. Real-browser acceptance is still required for:
   - typing a free-text `contains` fragment and reloading it;
   - opening R079 and seeing the overall Group 3 OR plus Group 1/Group 2;
   - the three Remove all groups actions and blocked save/run state;
   - hover and keyboard focus hint icons;
   - nested disabled Remove group tooltips;
   - legacy single-outcome save/load and the previously accepted R079/S35 fixes.

## Remaining issues / limitations

- Worker D did not run a real browser or the integrated cross-worker suite.
- C's concurrent round 1 changes to shared hierarchy helpers were not available
  in this worktree beyond the `aa4ed06` baseline; the reviewer must confirm the
  helper signature after integration.
- The new hint icon styling and disabled nested tooltip styling were verified by
  component assertions and the production build, not by visual browser review.
