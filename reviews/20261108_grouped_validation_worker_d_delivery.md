# Grouped validation — Worker D delivery record

Date: 2026-11-08
Branch: `work/20261108-grouped-validation-worker-d`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-d`
Base/setup commit: `e972e3f` (`docs: prepare parallel grouped validation assignments and review workflow`)

## Status

Original Worker D visual implementation was completed and accepted into the integration
branch as `3e812bc` (source), `33c10d7` and `a06fac4` (docs). Post-integration review
then found page-level wiring gaps that the original D component tests could not catch:
`FilterBuilder` was mounted uncontrolled, so grouping did not survive workflow
save/load/run, and strict config serialization could crash during render for an
incomplete filter. The reviewer fixed those gaps in `fa17108` (with backend integration
fix `0992b78`). This delivery record now distinguishes the original D delivery from
those reviewer-authored corrections. Worker D did not run the integrated test suite or
the browser smoke and does not claim them as its own results.

No other worker branch was merged by D, no agents were spawned, and no
main/integration branch was modified.

## Ordered commits for reviewer cherry-pick

1. `656ed15` — feat(frontend): add grouped row filters and multi-outcome rule logic
   → accepted as integration `3e812bc`.
2. `9704c2c` — docs: record Worker D grouped validation implementation and delivery
   → accepted as integration `33c10d7`.
3. `ed908c4` — docs: clarify Worker D multi-outcome legacy logic mirror
   → accepted as integration `a06fac4`.
4. documentation-correction commit (hash reported in the final handover) — records the
   reviewer integration findings, reviewer fixes, integrated results and remaining
   user-UI acceptance gap.

Commits 1–3 are the original delivery. Commit 4 is documentation-only and responds to
the reviewer's manual follow-up prompt; it introduces no executable changes.

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
data is committed. The post-integration documentation-correction commit touches only
`docs/20261108_grouped_validation_worker_d_implementation.md` and this delivery record;
it introduces no executable changes.

## Dependencies and integration lineage

- Original D delivery dependencies: `e972e3f` only. A/B/C commits were not present in
  the D worktree during original implementation, so no integrated check was run there.
- Reviewer accepted original D commits as integration `3e812bc`, `33c10d7`, `a06fac4`.
- Reviewer-authored integration fixes relevant to D: `fa17108` (page wiring, controlled
  filter grouping, invalid-save state, missing-reference/family fixes) and `0992b78`
  (backend A-materialized outcome tree execution).
- Integration review closure commit observed in the integration branch: `370eac3`.
- Required Worker C interface (published in the implementation doc): filter
  grouping props/state/transport; rule outcome domain/wire/config/restoration fields;
  runtime-id ↔ indexed-id mapping; legacy single-outcome compatibility; rejection of
  contradictory representations. Multi-outcome drafts carry `logic` as a mirror of
  `logicClauses[0]` for `RuleDraft` compatibility; C must accept/omit that consistent
  mirror rather than treating it as a conflicting expression.
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
| Persistence/canonical identity/evaluation | Original D delivery did not wire these paths. Reviewer integration (`fa17108`) wired filter grouping through config save/load, run request and saved-run restoration and added mapper/reducer/request tests; A/B/C/A+reviewer tests cover persistence and canonical identity. See integrated results below; **user UI acceptance still pending.** |

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

## Integration findings and reviewer-authored fixes

These defects were found during the reviewer's integration of A/B/C/D; they were not
part of the original D validation evidence.

1. **Filter grouping did not reach workflow save/load/run.** `FilterBuilder` was
   mounted uncontrolled in `PreparePage`. The relation/tree stayed local to the
   component, while page config load/save, `ResultsPage.buildRunRequest`, and saved-run
   deep-link restoration omitted grouping. Reviewer fix `fa17108` wires controlled
   grouping through `PreparePage`, `UploadPage`, `ResultsPage`, `WorkflowContext` and
   the config/run mapping, adds internal UI-only mode/explicitness state, keeps legacy
   AND for configs without grouping, and blocks newly authored multi-filter save/run
   until an explicit relation/tree exists.
2. **Render-time crash for an incomplete filter.** A strict config serializer threw
   while React was rendering when a new filter row was still incomplete; React Router
   replaced the page with its error boundary. Reviewer fix `fa17108` returns an
   invalid/error state instead of throwing, adds an invalid-save state, and disables
   saving until the expression is valid.
3. **Missing-reference and family-expansion gaps.** The reviewer also blocked dropped
   unresolved flat filters, fixed condition-reference rebinding after renumbering,
   refused partial invalid rule-config imports, and changed positive family expansion
   to OR (negative to AND) inside the containing expression. These are integration-wide
   fixes in `fa17108`, not edits to D's editor.
4. **A-materialized nested outcome tree could not execute.** Reviewer fix `0992b78`
   consumes A's `rule.outcome_expression` and delegates evaluation to A's pure helpers;
   a real four-clause Y/N regression covers this. D did not author or run that fix.

Reviewer regression evidence includes page/config/run mapper tests, workflow reducer
tests, saved-run restoration tests, `ResultsPage.buildRunRequest` tests, and the full
integrated frontend suite/build. The real Chrome/Playwright smoke uploaded the sample
CSVs, selected key `ID`, entered Prepare, added two filters, chose CUSTOM GROUPS,
created an AND group, and verified an incomplete expression shows blocking validation
without a page error. That smoke covers upload and custom filter-group editing only;
complete user UI acceptance remains pending.

## Reviewer-run integrated validation (attributed to reviewer, not Worker D)

The integration reviewer reports these results after `0992b78` and `fa17108`:

- Isolated backend suite
  (`GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-checks`, isolated settings
  module): **774 passed**.
- Django `check` passed; `makemigrations --check --dry-run` reported no changes;
  `mypy backend` passed for 94 source files; changed-file Ruff passed.
- Full frontend suite: **65 files / 599 tests passed**; production build passed with the
  existing >500 kB bundle warning.
- `git diff --check` passed.
- Full `ruff check backend tests` still reports only unchanged baseline findings in the
  rules migration and rule-catalog test.

Worker D did not run these integrated commands or the browser smoke. They are not
claimed as Worker D results.

## Defects and fixes recorded during original implementation

See implementation doc “Defects found and fixed”: operator-change value clearing,
no-tree repair action, and filter remove accessible name. Each has regression coverage
in the focused tests above.

## Remaining issues / limitations

1. **Page integration is reviewer-owned, not in original D commits.** The uncontrolled
   `FilterBuilder` gap and the incomplete-filter render crash are fixed by `fa17108`;
   D's original commits alone do not persist or submit grouping.
2. **Complete user UI acceptance is pending.** The reviewer's real-browser smoke only
   covers upload and custom filter-group editing (including the invalid-expression
   blocked state). It does not cover the full numbered save/reload/run/restore,
   compound-outcome report/export, tracking, legacy and column-against-column acceptance
   sequence.
3. **Integrated gate results belong to the reviewer.** D did not run the 774-test
   backend suite, 599-test frontend suite, production build, or browser smoke.
4. **Unchanged baseline tooling findings remain:** full `ruff check backend tests`
   reports only pre-existing issues in unchanged files; unconstrained frontend suite
   runs in the D container previously hit unrelated 5s timeouts, while the reviewer's
   integrated suite passed.
5. **Not implemented by design:** multi-outcome column-against-column, deferred business
   metadata/approval workflow, and any migration/re-identification of historical rules.

## Handover

This documentation correction is documentation-only. Reviewer may consider this commit
together with the original D commits (`656ed15`, `9704c2c`, `ed908c4`) against the
integration findings. Worker D does not claim the reviewer's integrated tests or browser
smoke, and does not modify the integration worktree. The UI guide is
`docs/20261108_grouped_validation_ui_verification.md` on the integration branch; the
integration review records the isolated app at backend `127.0.0.1:8000` and frontend
`127.0.0.1:5173`, but Worker D did not verify or control those processes.
