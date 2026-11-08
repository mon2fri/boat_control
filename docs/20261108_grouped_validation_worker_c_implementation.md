# Grouped validation — Worker C implementation

Date: 2026-11-08
Branch: `work/20261108-grouped-validation-worker-c`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-c`

Worker C owns the non-visual frontend domain, wire/API mapping, workflow state,
configuration persistence and saved-run restoration. Worker D owns visual pages
and components. This document records the interfaces D consumes, compatibility
rules, implementation decisions and defects found/fixed during the work.

## Scope and ownership

Changed by C:

- `frontend/src/api/domain.ts`, `wire.ts`, `mapping.ts`, `configContent.ts`
- `frontend/src/lib/grouping.ts` (new shared pure grouping utilities)
- `frontend/src/features/rules/groupingTree.ts` (condition-oriented aliases)
- `frontend/src/features/rules/useRules.ts` (non-visual rule helpers)
- `frontend/src/features/results/useRunExecution.ts` (run guard)
- `frontend/src/state/WorkflowContext.tsx` (state, actions, restoration helper)
- associated tests and this documentation

Not changed by C: `FilterBuilder.tsx`, `FilterRowEditor.tsx`, `RuleEditor.tsx`,
`GroupingTreeEditor.tsx`, `PreparePage.tsx`, `UploadPage.tsx`, `ResultsPage.tsx`
or any other Worker D visual component/page. D must wire the interfaces below.

## Payload contract implemented

### Overall row filters

Wire request / saved-filter fields:

```text
filters: [{ column, operator, filter_value?, filter_values? }, ...]
filter_relation?: "and" | "or"
filter_grouping_tree?: GroupNode
```

- Tree leaf references are persisted as `c0`, `c1`, ... in `filters` order.
- Runtime `FilterRow.id` values are never persisted.
- `filter_grouping_tree` is authoritative when present. An invalid tree is
  rejected; it is never replaced with `filter_relation` or legacy AND.
- Absent `filter_relation` + absent tree = legacy AND.
- A single filter needs no relation/tree.
- Incomplete rows are rejected when grouping fields are present. Legacy
  payloads without grouping keep the previous behaviour of ignoring incomplete
  trailing rows.

Run-result persistence uses the same `filter_relation` /
`filter_grouping_tree` names inside `result`, alongside `filters_applied`.
The mapper converts those `cN` references back to runtime `fl-N` IDs.

Named rows-and-columns configurations use camelCase (`filterRelation`,
`filterGroupingTree`) consistent with the existing config format; readers also
accept the snake_case aliases for exported/wire-shaped content.

### Rule outcomes

Wire rule fields:

```text
logic?: WireLogic                         # legacy single outcome
logic_clauses?: WireLogic[]               # multiple value-vs-column outcomes
logic_relation?: "and" | "or"
logic_grouping_tree?: GroupNode
```

- A single outcome is always written in the legacy `logic` form, preserving
  existing canonical identity treatment.
- Multiple outcomes are written only as `logic_clauses` (+ relation or tree).
- `logic` and `logic_clauses` together are rejected as contradictory. Readers
  never choose one silently.
- Multiple clauses require an explicit relation or a valid tree.
- Multiple column-against-column outcomes are rejected; legacy single
  column-against-column remains supported through `logic`.
- Outcome tree leaves are persisted as `c0`, `c1`, ... in `logic_clauses` order
  and restored to runtime `l0`, `l1`, ... IDs.

## Frontend domain interfaces for Worker D

`frontend/src/api/domain.ts`:

```ts
type GroupRelation = "and" | "or";

interface SavedFilter {
  id: string;
  name: string;
  rows: FilterRow[];
  relation?: GroupRelation | null;
  groupTree?: GroupNode | null;       // leaves reference rows[].id
  groupingErrors?: string[];
}

interface Rule {
  logic: LogicClause;                  // legacy/first outcome
  logicClauses?: LogicClause[];        // complete multi-outcome list
  logicRelation?: GroupRelation | null;
  logicGroupTree?: GroupNode | null;   // leaves reference logicClauses[].id
  logicGroupingErrors?: string[];
}

interface RunRequest {
  filters: FilterRow[];
  filterRelation?: GroupRelation | null;
  filterGroupTree?: GroupNode | null;  // leaves reference filters[].id
  filterGroupingErrors?: string[];
}

interface RunResult {
  filtersApplied?: FilterRow[];        // restored with stable runtime IDs
  filtersRelation?: GroupRelation | null;
  filtersGroupTree?: GroupNode | null; // leaves reference filtersApplied[].id
  filtersGroupingErrors?: string[];
}
```

`GroupNode` remains the existing recursive shape:

```ts
{ kind: "leaf"; conditionId: string }
| { kind: "and"; children: GroupNode[] }
| { kind: "or"; children: GroupNode[] }
```

## Workflow state and actions

New `WorkflowState` fields:

- `filterRelation: GroupRelation | null`
- `filterGroupTree: GroupNode | null`
- `filterGroupingErrors: string[]`

New / changed actions:

```ts
{ type: "setFilterConfiguration"; filters; relation?; groupTree?; errors? }
{ type: "setFilterRelation"; relation }
{ type: "setFilterGroupTree"; groupTree }
{ type: "restoreRunConfiguration"; result: RunResult; availableColumns?: string[] }
```

`setFilters` now preserves the existing tree/relation and recalculates
`filterGroupingErrors`; it does not prune references. Removing a referenced filter
therefore produces an actionable repair state instead of silently changing the
expression.

Exported helpers:

- `workflowReducer`
- `validateWorkflowFilters(filters, relation, tree, availableColumns?)`
- `workflowConfigurationFromRun(result, availableColumns?)`

## Shared grouping utilities for D

`frontend/src/lib/grouping.ts` (also re-exported from
`features/rules/groupingTree.ts`):

- `buildFlatGroupTree(clauses, relation)`
- `validateGroupingTree(tree, availableIds, options)`
- `resolveGroupedExpression(clauses, relation, tree, options)`
- `toPersistedGroupingTree(tree, clauses)` / `fromPersistedGroupingTree(...)`
- `remapGroupingTree(tree, idMap)`
- `collectGroupingIds(tree)`
- `GroupingValidationError`, `MAX_GROUPING_DEPTH`, `MAX_GROUPING_LEAVES`

Validation rejects unknown, duplicate and omitted references, empty branches,
malformed kinds, and unsafe depth/size. `resolveGroupedExpression` explicitly
does not fall back to a flat relation when a tree is present but invalid.

Rule helpers in `features/rules/useRules.ts`:

- `ruleLogicClauses(rule)`
- `validateRuleLogicConfiguration(rule)`
- `describeLogic(rule)` (single-outcome wording unchanged; multi-outcome includes
  the full relation/tree expression)

## Worker D integration checklist

1. **Row filter editor** — own visual state for relation/tree. Pass both to
   `setFilterConfiguration` or dispatch `setFilterRelation` /
   `setFilterGroupTree`. `groupingErrors` should render as an actionable blocking
   message.
2. **Config load (Prepare/Upload pages)** — `resolveRowsColumnsConfig` now returns
   `filterRelation`, `filterGroupTree`, `filterGroupingErrors`. Dispatch
   `setFilterConfiguration` with all three instead of only `setFilters`; otherwise
   grouping is lost on load.
3. **Config save** — include `filterRelation` / `filterGroupTree` in the state
   object passed to `mapWorkflowToRowsColumnsConfig`. Rule save/export already
   reads `logicClauses` / `logicRelation` / `logicGroupTree`.
4. **Run request** — include `filterRelation`, `filterGroupTree` and
   `filterGroupingErrors` in the `RunRequest` built by the results/prepare page.
   `useRunExecution` blocks invalid configurations before any network call.
5. **Saved-run deep link** — replace the individual restoration dispatches with
   `dispatch({ type: "restoreRunConfiguration", result, availableColumns })`, or
   use `workflowConfigurationFromRun(result)` directly. The helper always restores
   false/empty values and keeps invalid-expression errors.
6. **Rule editor** — use the new `Rule` fields directly. A single outcome must
   continue to submit through `logic`; multiple outcomes through `logicClauses` +
   relation/tree. Keep column-against-column as single-outcome only.
7. **Saved filters** — `SavedFilter` now carries the same relation/tree/errors;
   load them into filter state rather than only `rows`.

## Compatibility decisions

- Legacy filter configs/run payloads without grouping remain legacy AND.
- Legacy single-outcome rules keep `logic` and unchanged identity inputs.
- Column-against-column logic remains single-outcome and legacy-shaped.
- Existing condition grouping trees are unchanged; the new shared utility is a
  superset of the old condition helper names.
- Invalid restored expressions preserve their tree and error list. Execution is
  blocked rather than widened.
- Missing/unavailable filter columns are reported before execution; they are not
  treated as null cells or skipped.

## Defects found and fixes made

### 1. Config row filtering shifted persisted filter references

**Cause:** `resolveRowsColumnsConfig` appended only successfully resolved rows.
If an earlier row referenced a missing family/column, every later persisted `cN`
reference pointed at the wrong runtime row.

**Fix:** Track runtime IDs by original config index; unresolved referenced rows
become `__missing_cN__` leaves, which validate as unknown and block execution.
No row-index shifting occurs.

**Evidence:** `configContent.grouped.test.ts` — “does not silently drop an
unresolved referenced filter”.

### 2. Invalid trees could be rescued by the flat relation

**Cause:** An obvious implementation shortcut is to fall back to
`filter_relation`/legacy AND when tree validation fails.

**Fix:** `resolveGroupedExpression` treats a present tree as authoritative and
returns the validation errors; it never substitutes the flat relation.

**Evidence:** `lib/grouping.test.ts` — “never falls back … when a present tree is
invalid”; `groupedMapping.test.ts`, `WorkflowContext.grouped.test.ts`.

### 3. Contradictory rule representations were ambiguous

**Cause:** Both `logic` and `logic_clauses` could be present and a reader would
have to pick one.

**Fix:** Wire schemas and mappers reject both, reject neither, reject multi
column-against-column, and require explicit grouping for multiple outcomes.

**Evidence:** `groupedMapping.test.ts`, `configContent.grouped.test.ts`.

### 4. Reordering runtime clauses corrupted persisted references

**Cause:** Serializing by array position without remapping runtime IDs changes
which clause each persisted leaf points to.

**Fix:** Every save/load boundary remaps through an explicit runtime↔index map,
and tests reorder filters/outcomes before saving.

**Evidence:** `groupedMapping.test.ts` — filter and outcome reorder cases.

### 5. Optional legacy run fields changed the mapped result shape

**Cause:** Initial restoration always emitted `filtersRelation: null` and
`filtersGroupTree: null`, breaking exact legacy result fixtures.

**Fix:** Only emit those fields when the persisted run actually contains grouping
fields. `workflowConfigurationFromRun` defaults to legacy AND/null for state.

**Evidence:** full frontend suite passed after the change; legacy run mapping
test asserts the fields are absent.

### 6. `exactOptionalPropertyTypes` rejected the refinement callback shape

**Cause:** The logic-representation validator’s optional `logic_clauses` type did
not admit `undefined` under the project’s TypeScript settings.

**Fix:** Declared the optional field as `Array<...> | undefined`; `tsc -b` passes.

### 7. A stale relation blocked a no-filter run

**Cause:** Removing every filter left `filterRelation` set, and validation treated
“relation without clauses” as invalid even though no filters must impose no row
restriction.

**Fix:** Zero clauses resolve to a valid unrestricted expression regardless of a
stale relation, and configuration serialization omits grouping fields when there
are no filters.

**Evidence:** `lib/grouping.test.ts` — “ignores a stale relation when no clauses
remain”.

## Verification commands and results

```bash
cd frontend
npx tsc -b tsconfig.app.json --pretty false
# no output (success)

npx vitest run src/lib/grouping.test.ts \
  src/api/groupedMapping.test.ts \
  src/api/configContent.grouped.test.ts \
  src/state/WorkflowContext.grouped.test.ts \
  src/features/results/useRunExecution.test.ts \
  src/features/rules/useRules.test.ts
# 6 files passed, 64 tests passed

npx vitest run --testTimeout=20000 --hookTimeout=20000 --maxWorkers=2
# 59 files passed, 558 tests passed
```

`npm run lint` remains red on pre-existing repository-wide rules
(`no-explicit-any`, `set-state-in-effect` in existing pages/tests). The new
grouped-validation files do not introduce a new lint category beyond the existing
patterns in `configContent.ts`/`useRules.ts`.

## Remaining coordination risks

- The shared contract was followed literally: multi-outcome wire payloads omit
  `logic`. If Worker A/B decide to emit both `logic` (first clause) and
  `logic_clauses` for compatibility, C’s contradictory check must be relaxed by
  the reviewer/worker after integration. This must be reconciled with real
  backend responses; no backend branch was cherry-picked into C.
- D must complete the page/component wiring in the integration checklist above.
  C deliberately did not edit D-owned visual files.
- Real browser/UI behaviour is not claimed here.
