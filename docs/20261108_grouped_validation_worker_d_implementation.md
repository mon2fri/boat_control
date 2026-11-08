# Grouped validation — Worker D implementation (frontend filters and rule outcomes)

Date: 2026-11-08
Branch: `work/20261108-grouped-validation-worker-d`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-d`

## Documentation status after integration

This record now separates the original Worker D delivery from the later
reviewer-authored integration work. The original D commits were accepted into
`work/20261108-grouped-validation-integration` (`3e812bc`, `33c10d7`,
`a06fac4`), but that acceptance was not the end of UI integration. The reviewer
found that the pages still mounted the filter editor uncontrolled, that
grouping did not survive workflow save/load/run, and that strict config
serialization could crash during render for an incomplete filter. The reviewer
fixed those gaps in `fa17108` (with the related backend integration fix in
`0992b78`). Integrated test and browser results quoted below are
**reviewer-run**, not additional Worker D validation.

A later user-reported R079 grouped-outcome save failure was reproduced against
the integration code read-only and fixed in this branch under
“R079 grouped-outcome save failure (follow-up fix)” below. That fix is a D-owned
editor hydration/serialization correction; it requires no new Worker C code.

## Scope and ownership

Worker D owns the visual Row Filters grouping interface, the Rule Logic editor for
multiple value-against-column outcomes, their component tests, and
`GroupingTreeEditor.tsx`. Worker C owns `frontend/src/api/**`, `frontend/src/state/**`,
non-visual hooks, domain types, and persistence/transport. No C-owned module was
edited in this delivery. The editor consumes the agreed shared-tree shape
(`{"kind":"leaf","conditionId":"…"}` / `{"kind":"and"|"or","children":[…]} `) and
agreed field names through local, documented adapters:

- `filterRelation` / `filterGroupingTree` for Row Filters.
- `logicClauses` / `logicRelation` / `logicGroupingTree` for Rule Logic.

Those adapters are D-owned presentation modules and can be replaced or fed directly by
Worker C's domain types during integration.

## Design and behaviour

### Row Filters (`FilterBuilder.tsx`, `FilterRowEditor.tsx`, `filterGrouping.ts`)

- Existing single-filter and legacy multi-filter behaviour is preserved. Multiple
  loaded filters with no grouping default to the historical AND relation.
- A newly added second filter starts with no relation, so saving/running requires an
  explicit AND, OR, or CUSTOM GROUPS choice.
- AND/OR are shown as a full expression such as
  `(Filter 1: …) AND (Filter 2: …)`.
- CUSTOM GROUPS reuses the existing `GroupingTreeEditor` interaction in
  `per_grouping` mode, including nested groups and the Group 1 / Group 2 / outer-group
  workflow. The preview uses explicit parentheses so precedence is unambiguous.
- Validation blocks incomplete rows, a missing relation, empty/single-member groups,
  unsafe depth/size, omitted filters, duplicate references, and unknown/removed
  references. The user gets actionable messages instead of a silently broadened run.
- Removing a referenced filter leaves the tree visibly invalid until the user chooses
  “Remove stale filter references”; the repair prunes unknown leaves and collapses
  degenerate groups. “Use all filters in an AND/OR group” explicitly reseeds a valid
  tree from the current rows.
- Up/down controls reorder filters without changing runtime IDs, so a valid custom
  grouping remains valid and a flat expression updates its order.
- Switching custom → AND/OR → custom retains the custom tree in editor state.
- `FilterBuilder` accepts optional controlled `grouping` / `onGroupingChange` props.
  With them, the parent can supply persisted grouping. Without them, the editor owns the
  grouping locally so the visual interaction works while transport is pending.
- **Original delivery gap:** `PreparePage` mounted `FilterBuilder` uncontrolled, so the
  locally owned relation/tree was not connected to workflow state and did not survive
  config save/load or run submission. The visual editor worked in component tests, but
  the page-level path did not persist grouping. This was not caught by D's isolated
  component tests. The reviewer fixed it in `fa17108` by wiring controlled grouping,
  config load/save, run request construction, and saved-run restoration.
- A wholesale row replacement (for example a config load) resets uncontrolled local
  grouping to the legacy-compatible default; a partial edit keeps the tree so removals
  surface the repair requirement.

### Rule Logic outcomes (`RuleEditor.tsx`, `logicOutcomes.ts`)

- Single value-against-column rules still use the legacy `logic` clause and serialize
  only that representation.
- “+ Add outcome” turns the rule into a multi-outcome value-against-column rule.
  Multiple outcomes require an explicit AND, OR, or CUSTOM GROUPS relation.
- The full expression preview shows every outcome, for example:
  `(Outcome 1: SA Contributory must equal "Y" AND Outcome 2: SA-CVA Hedge Book must equal "N") OR (Outcome 3: … AND Outcome 4: …)`.
  Custom grouping also shows the existing hierarchical group breakdown.
- Outcomes can be added, removed, and reordered. Runtime outcome IDs stay stable, so a
  valid tree survives reordering. Removing a referenced outcome produces a stale
  reference error and an explicit repair action.
- Column against column remains available and unchanged for a single outcome. If extra
  value outcomes are retained, the editor warns, blocks saving in column mode, and
  restores the full outcome list when switching back. Discarding extras requires an
  explicit confirmation dialog.
- Existing persisted nested outcomes can be read from the agreed extended fields and
  round-trip through Save without losing clauses or tree structure.
- Rule list summaries use the complete outcome expression (and include outcome columns
  in the missing-column warning check) when extended outcome clauses are present;
  legacy rules still use the existing single-clause summary.

### Shared grouping tree editor (`GroupingTreeEditor.tsx`)

- Added an optional `conditionLabel` prop used by Row Filters and outcomes to render
  natural labels. Default wording is unchanged for Rule Conditions, so existing
  condition grouping tests and behaviour remain intact.
- No transport, state, or API changes were made.

### Null/blank operator help

Row Filters, Rule Conditions, outcome editors, and the rule help panel now state that
`equals`/`contains` never match null or blank values, while `not equal to`/`not contains`
do match. Whitespace-only text remains literal (no new trimming/case normalisation).

### Accessibility

- Grouping relation selects and grouping tree groups keep labels/legends and
  `aria-invalid` on missing relations.
- Outcome rows are labelled `Outcome N`; move/remove buttons have explicit
  `aria-label`s; validation lists are announced with `role="alert"`/`aria-live`.
- Filter reorder controls are labelled per filter and the remove button now exposes
  `Remove filter N` as one accessible name.

## Worker C integration requirements (published early)

1. Add optional `filterRelation`, `filterGroupingTree` to domain state/config and send
   `filter_relation`, `filter_grouping_tree` on run/config payloads. Pass grouping and
   `onGroupingChange` into `FilterBuilder`.
2. Add optional `logicClauses`, `logicRelation`, `logicGroupingTree` to rule domain
   types, wire schemas, config mapping, run/restoration and canonical identity inputs.
3. Map runtime leaf IDs (filter row IDs / outcome clause IDs) to indexed `c0`, `c1`, …
   at serialization and back at restoration. Tree leaf IDs in this editor are the
   current runtime IDs.
4. Keep legacy single-outcome `logic` unchanged; reject contradictory legacy/new
   representations rather than choosing one silently. The D editor emits `logic` as a
   compatibility mirror of the first outcome whenever `logicClauses.length > 1`, because
   the current shared `RuleDraft` type requires it. C should treat that mirror as
   consistent when it equals `logicClauses[0]` (or omit it from the wire), not as a
   competing expression; genuinely different legacy/new content must be rejected.
5. Complete frontend config persistence (rows-and-columns and rules), saved-run
   restoration, family expansion remapping, and validation before run. D did not edit
   those C-owned modules.

## Post-integration findings and reviewer-authored fixes (not original D delivery)

These items were discovered only after A/B/C/D were combined. They are recorded
here so the original D delivery is not mistaken for complete page integration.

1. **High — filter grouping was not connected to workflow save/load/run.**
   `FilterBuilder` was mounted uncontrolled in `PreparePage`, so its local
   relation/tree never entered workflow state. Page config save/load, run request
   construction, and saved-run deep-link restoration therefore omitted grouping.
   The reviewer fixed this in `fa17108` by wiring the controlled editor through
   `PreparePage`, `UploadPage`, `ResultsPage`, `WorkflowContext`, and the
   config/run mapping. UI-only `filterGroupingMode` / `filterGroupingRequired`
   state keeps a dormant custom tree available across a temporary flat-mode
   switch while only the selected expression is serialized. Legacy configs/runs
   without grouping still default to AND; newly authored multi-filter expressions
   require an explicit relation/tree.
2. **High — render-time crash on an incomplete filter.**
   The newly strict config serializer threw while React was rendering when a user
   clicked `+ Add filter` and the new row was still incomplete. React Router
   replaced the page with its error boundary. The reviewer changed config
   serialization to return an invalid/error state instead of throwing, added an
   invalid-save state, and disabled saving while the expression is invalid. This
   replaces the crash with an actionable blocked state.
3. **High — missing references and family-expansion semantics (integration-wide).**
   The integration review also found that unresolved flat filters could be dropped
   (broadening an AND scope), rule condition references could be rebound after
   renumbering, partial invalid rule imports could proceed, and positive family
   expansion could use AND instead of OR. The reviewer fixed these in `fa17108`
   with blocking restoration errors, explicit missing sentinels, refusal of
   partial imports, and positive-OR / negative-AND expansion. These are not D
   editor changes, but they affect the filter/outcome configuration workflow D
   renders.
4. **Backend integration defect recorded for completeness.** The reviewer also
   fixed A-materialized nested outcome trees not being executable by B's runtime
   (`0992b78`), with a real four-clause Y/N regression. D did not author or run
   this fix.

Reviewer regression evidence for the frontend integration is recorded in
`reviews/20261108_grouped_validation_integration_review.md`: page/config/run
mapper, reducer, saved-run restoration and `ResultsPage.buildRunRequest` tests,
plus the full integrated frontend suite/build. The reviewer's real Chrome/
Playwright smoke uploaded the sample CSVs, selected key `ID`, entered Prepare,
added two filter rows, selected CUSTOM GROUPS, created an AND group, and observed
blocking validation for an incomplete expression without a page error. That
smoke covers upload and custom filter-group editing only; it is **not** complete
user UI acceptance.

## R079 grouped-outcome save failure (follow-up fix)

Date: 2026-11-08. Branch: `work/20261108-grouped-validation-worker-d`.

### Reported symptom

Opening the existing `R079` rule (“UI Flags - opposite Yes No”) and saving it failed
with:

> rule outcome grouping must choose AND, OR, or a custom grouping expression when
> multiple clauses are configured.

Expected expression:

```text
(sa_flag = Yes AND cva_flag = No)
OR
(sa_flag = No AND cva_flag = Yes)
```

### Read-only evidence and traced cause

- `R079` exists in the integration configuration/database with four
  `logic_clauses`, `logic_relation: or`, and a `logic_grouping_tree` of two AND groups
  referencing persisted leaves `c0`/`c1` and `c2`/`c3`.
- C's `mapWireRule` remaps those leaves to runtime clause IDs `l0`–`l3` and exposes
  the tree on the canonical domain field **`logicGroupTree`**. D's editor only read
  the earlier D-only name **`logicGroupingTree`**.
- Therefore hydration returned `{ mode: "or", tree: null }` instead of
  `{ mode: "custom", tree: … }`: the editor lost the two AND groups, and the preview
  became a flat four-clause OR.
- Saving unchanged then sent only `logic_relation: "or"` (tree silently dropped), which
  changes semantics even though it does not throw.
- If custom grouping was selected/edited, D's save draft contained only the
  `logicGroupingTree` alias and no canonical `logicGroupTree`/relation. C's
  `mapRuleToWireDraft` then saw four clauses with neither explicit relation nor tree
  and threw the reported message **before any HTTP request**. This was therefore an
  editor-state/adapter defect at the D→C boundary, not a backend validation response
  and not a server error.

Reproduction against the integration code was run read-only through a temporary
esbuild/node script; no integration file was changed. It printed:

```text
hydrated editor grouping: {"mode":"or","tree":null}
canonical rule.logicGroupTree present: true
editor alias rule.logicGroupingTree present: false
UNCHANGED wire payload relation/tree: {"logic_relation":"or"}
CUSTOM editor draft save error: rule outcome grouping must choose AND, OR, or a custom grouping expression when multiple clauses are configured.
```

### Fix

- `getRuleLogicGrouping` now reads the canonical `logicGroupTree` first and accepts
  the earlier `logicGroupingTree` alias only as a compatibility fallback. A persisted
  custom tree therefore hydrates as **CUSTOM** with its runtime leaves intact.
- `toDraft` writes the canonical `logicGroupTree` consumed by C's API mapper, keeps the
  legacy alias for transitional component compatibility, and includes the tree's root
  `and`/`or` relation alongside it. An unchanged custom rule therefore preserves both
  the relation and complete executable tree.
- No validation was bypassed, no fallback to AND was added, and no tree is flattened or
  dropped. Flat AND/OR and legacy single-outcome behaviour are unchanged.

### Regression coverage and actual results

- `RuleEditor.outcomes.test.tsx`: loads the canonical R079-shaped rule, asserts the
  two-AND-groups-OR preview, and saves unchanged with four clauses,
  `logicRelation: "or"`, and the complete `logicGroupTree`.
- A second test edits Outcome 1's operator and verifies all four clauses, their column
  order, the OR relation and both AND groups are still saved.
- `logicOutcomes.test.ts`: verifies canonical `logicGroupTree` hydration and the
  transitional alias fallback.
- Targeted run:
  `npx vitest run src/features/rules/RuleEditor.outcomes.test.tsx src/features/rules/logicOutcomes.test.ts src/features/rules/GroupingTreeEditor.test.tsx src/features/rules/RuleEditor.test.tsx`
  — **4 files / 37 tests passed**; `npx tsc -b --pretty false` passed.
- Full frontend suite after the fix:
  `npx vitest run --maxWorkers=2 --testTimeout=15000` — **60 files / 535 tests
  passed**; `npm run build` passed (generated `dist` changes not committed).
- Read-only integration-mapping simulation with the fixed editor draft produced a wire
  request containing `logic_relation: "or"`, four `logic_clauses`, and the complete
  `logic_grouping_tree` with leaves remapped to `c0`–`c3`.
- Read-only backend check of that payload via integration `validate_rule` returned
  `valid=True, errors=[]`. This is a targeted compatibility check, not a claim that
  Worker D ran the integrated suite.

### Dependencies and cherry-pick order for this follow-up

- Fix commit: `975cb59` (`fix(frontend): hydrate and save canonical grouped outcome trees`).
- Tests commit: `3cc4387` (`test(frontend): cover R079 grouped-outcome load and save`).
- This docs commit is reported in the handover.
- Required integration dependency: C's canonical `logicGroupTree` domain/mapping work
  already accepted as integration `381454a` plus reviewer wiring in `fa17108`. No new
  C change is required; the earlier alias remains accepted for compatibility.
- Reviewer should cherry-pick fix first, then tests, then this docs commit. Integration
  component tests that still assert the old alias should continue to pass because the
  editor still emits it; assertions should preferably be updated to the canonical field.

### Remaining limitation

The failure and correction were verified with component tests plus read-only
integration mapper/backend checks. Full browser click-through and user UI acceptance of
R079 remain pending.

## Defects found and fixed during original implementation

1. **Logic operator changes cleared existing values.** Replacing the single logic row
   with outcome editors initially cleared selected values when the operator changed,
   which broke the existing multi-value preview contract. Cause: copied condition-row
   reset behaviour. Fix: outcome operator changes now preserve values; users can edit
   the value list explicitly. Regression evidence: existing `RuleEditor` preview test.
2. **Repair button appeared with no tree.** The stale-reference repair action was
   offered even when custom mode had no tree, where it would do nothing. Cause: repair
   predicate treated `null` tree as repairable. Fix: offer repair only for an existing
   tree with unknown/missing/structural errors; seed buttons handle the no-tree case.
3. **Removed-filter remove button had an inaccessible joined name.** The hidden text
   produced `Removefilter 2` rather than a clean accessible name. Cause: inline text
   concatenation. Fix: explicit `aria-label="Remove filter N"`.

## Tests added

- `frontend/src/features/filters/filterGrouping.test.ts`
  - Legacy AND default, flat/custom formatting with parentheses, missing/unknown/
    duplicate validation, prune repair, seed-all, condition-shape adapter.
- `frontend/src/features/filters/FilterBuilder.test.tsx`
  - Full AND/OR preview, explicit relation after adding a second filter, removed filter
    repair, reorder validity, custom-tree retention across mode switches, null/blank
    help text.
- `frontend/src/features/rules/groupingEditorSupport.test.ts`
  - Parenthesised formatting, single-member-group and depth rejection, prune/collapse,
    flat-tree construction and exact-coverage validation.
- `frontend/src/features/rules/logicOutcomes.test.ts`
  - Required two-AND-groups-OR-two-AND-groups expression, simple AND/OR, explicit
    relation requirement, removed reference detection, legacy single-clause fallback,
    persisted grouping reader, column-mode retention check.
- `frontend/src/features/rules/RuleEditor.outcomes.test.tsx`
  - Add two outcomes and save AND, save OR, build the exact
    `(SA=Y AND CVA=N) OR (SA=N AND CVA=Y)` configuration through the reused grouping
    interaction, column-mode blocking and restore, restore persisted nested outcomes
    and save unchanged, removed-outcome repair, null/blank help text.

## Original Worker D validation (before integration)

These results were run only in the D worktree against the original D commits. They are
not the integrated acceptance results.

Run from `frontend/` unless noted:

- `npx tsc -b --pretty false` — passed.
- `npx vitest run src/features/filters/filterGrouping.test.ts src/features/rules/logicOutcomes.test.ts src/features/filters/FilterBuilder.test.tsx src/features/rules/RuleEditor.outcomes.test.tsx` — 26 passed (initial focused new tests).
- `npx vitest run src/features/filters/FilterBuilder.test.tsx src/features/rules/RuleEditor.outcomes.test.tsx src/features/rules/RuleEditor.test.tsx src/features/rules/GroupingTreeEditor.test.tsx src/features/filters/filterGrouping.test.ts src/features/rules/logicOutcomes.test.ts src/features/rules/groupingEditorSupport.test.ts` — 52 passed.
- `npx vitest run --maxWorkers=2 --testTimeout=15000` — 60 files / 533 tests passed. (Unconstrained full-suite runs in this container hit unrelated 5s test timeouts under load; constrained run is recorded as evidence.)
- `npm run build` — passed (`tsc -b && vite build`); generated `dist` changes were restored/removed and are not committed.
- `npx eslint <changed files>` — passed for all Worker D-touched files. Repository-wide `npm run lint` still reports pre-existing errors in files outside this assignment.
- `git diff --check` — see delivery record.

## Original blocked / not claimed

- At original delivery time, real API/state persistence, run request wiring, config
  save/load/import/export, saved-run restoration, backend evaluation, and canonical
  identity were Worker C/A/B scope. No integrated end-to-end check was run in the D
  worktree because those commits were not present there.
- No browser-level UI verification was performed in the D worktree; component tests
  were not treated as browser acceptance.

## Reviewer-run integrated verification (attributed to reviewer, not Worker D)

The integration branch reviewer reports the following after applying reviewer fixes
`0992b78` and `fa17108`:

- Isolated backend suite:
  `GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-checks PYTHONPATH=backend uv run pytest --ds=boat_control.grouped_validation_settings -q tests/backend tests/contracts tests/integration`
  — **774 passed**.
- Django `check` passed; `makemigrations --check --dry-run` reported no changes;
  `mypy backend` passed for 94 source files; changed-file Ruff passed.
- Full frontend suite — **65 files / 599 tests passed**; frontend production build
  passed with the existing >500 kB bundle warning.
- `git diff --check` passed after final code/docs edits.
- Full repository `ruff check backend tests` still reports only unchanged baseline
  findings in the rules migration and rule-catalog test.

These are reviewer-authored results. Worker D did not run the integrated suite, did
not execute the browser smoke, and does not claim them as its own verification.

## Remaining limitations and pending user UI acceptance

- The original uncontrolled-filter page gap is fixed only by the reviewer's integration
  changes, not by the original D commits alone.
- Real-browser smoke coverage is limited to upload plus adding/grouping filters and
  observing blocking validation. Complete numbered visual acceptance (save/reload,
  run, saved-run restore, compound outcome reporting, exports, tracking, legacy and
  column-against-column checks) remains pending user execution.
- Multi-outcome column-against-column, deferred business metadata/approval workflow,
  and historical rule re-identification remain out of scope.
- The reviewer's UI guide is
  `docs/20261108_grouped_validation_ui_verification.md` on the integration branch. The
  integration review records the isolated app at backend `127.0.0.1:8000` and frontend
  `127.0.0.1:5173`; Worker D did not verify or modify those processes.
