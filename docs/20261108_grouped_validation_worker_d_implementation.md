# Grouped validation — Worker D implementation (frontend filters and rule outcomes)

Date: 2026-11-08
Branch: `work/20261108-grouped-validation-worker-d`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-d`

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
  With them, Worker C can supply persisted grouping. Without them, the editor owns the
  grouping locally so the visual interaction works while transport is pending.
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
   representations rather than choosing one silently.
5. Complete frontend config persistence (rows-and-columns and rules), saved-run
   restoration, family expansion remapping, and validation before run. D did not edit
   those C-owned modules.

## Defects found and fixed during implementation

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

## Commands and actual results

Run from `frontend/` unless noted:

- `npx tsc -b --pretty false` — passed.
- `npx vitest run src/features/filters/filterGrouping.test.ts src/features/rules/logicOutcomes.test.ts src/features/filters/FilterBuilder.test.tsx src/features/rules/RuleEditor.outcomes.test.tsx` — 26 passed (initial focused new tests).
- `npx vitest run src/features/filters/FilterBuilder.test.tsx src/features/rules/RuleEditor.outcomes.test.tsx src/features/rules/RuleEditor.test.tsx src/features/rules/GroupingTreeEditor.test.tsx src/features/filters/filterGrouping.test.ts src/features/rules/logicOutcomes.test.ts src/features/rules/groupingEditorSupport.test.ts` — 52 passed.
- `npx vitest run --maxWorkers=2 --testTimeout=15000` — 60 files / 533 tests passed. (Unconstrained full-suite runs in this container hit unrelated 5s test timeouts under load; constrained run is recorded as evidence.)
- `npm run build` — passed (`tsc -b && vite build`); generated `dist` changes were restored/removed and are not committed.
- `npx eslint <changed files>` — passed for all Worker D-touched files. Repository-wide `npm run lint` still reports pre-existing errors in files outside this assignment.
- `git diff --check` — see delivery record.

## Blocked / not claimed

- Real API/state persistence, run request wiring, config save/load/import/export,
  saved-run restoration, backend evaluation, and canonical identity are Worker C/A/B
  scope. No integrated end-to-end check was run because Worker C's commits were not
  present in this worktree at delivery time.
- No browser-level UI verification was performed in this worktree; component tests are
  not a substitute for reviewer browser acceptance.
