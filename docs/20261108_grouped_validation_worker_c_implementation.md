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

## Remaining coordination risks as originally delivered

These were the open items when C handed over, before integration:

- The shared contract was followed literally: multi-outcome wire payloads omit
  `logic`. If Worker A/B decide to emit both `logic` (first clause) and
  `logic_clauses` for compatibility, C’s contradictory check must be relaxed by
  the reviewer/worker after integration.
- D had not yet completed the page/component wiring in the integration checklist
  above. C deliberately did not edit D-owned visual files.
- Real browser/UI behaviour was not claimed by C.

The first two items were subsequently resolved or reworked by the reviewer; see
the post-integration record below.

---

# Post-integration documentation update

Source read-only from the integration branch:

- `docs/20261108_grouped_validation_integration_fixes.md`
- `reviews/20261108_grouped_validation_integration_review.md`
- Integration commits: `0992b78` (backend grouped-outcome normalization fix) and
  `fa17108` (bounded frontend/UI/contract integration fix); final review-closure
  documentation commit `370eac3`.

C did not cherry-pick integration code or rerun the integrated gates. All
integrated results below are **reviewer-reported**, not Worker C claims.

## 1. Original Worker C delivery and its validation

- Original C commits: `81fa44b`, `d6b97a9`, `a6edaa7`, `f249301`.
- Accepted into integration as `381454a`, `295de62`, `475d8b3`, `c7930b7`
  respectively, in that order.
- C’s own pre-integration evidence was `tsc -b` clean, 6 focused test files / 64
  tests, full frontend suite 59 files / 558 tests, and `git diff --check` clean.
- Original C scope intentionally stopped at non-visual transport/state/config
  helpers. Page and visual-editor wiring was documented as D work, not claimed as
  delivered.

## 2. Defects discovered during integration

### 2a. Page-level grouping was never connected end-to-end

- `PreparePage` and `UploadPage` config loading dispatched only `setFilters`
  instead of C’s `setFilterConfiguration`, so loaded relation/tree/errors were
  discarded.
- Config saving omitted `filterRelation`, `filterGroupTree`, grouping mode and
  explicitness state, so saved rows-and-columns configs lost grouping.
- `FilterBuilder` was mounted uncontrolled in `PreparePage`; its relation/tree
  did not flow into workflow state.
- `ResultsPage.buildRunRequest` omitted `filterRelation`, `filterGroupTree`,
  `filterGroupingErrors` and the new explicit-grouping requirement, so a run
  could execute without the configured expression.
- Saved-run deep-link restoration dispatched individual field updates instead of
  `restoreRunConfiguration`, so restored filters were not grouped and invalid
  expression errors were not carried into execution state.
- The strict config serializer could throw during render for an incomplete new
  filter; React Router then replaced the page with its error boundary.

### 2b. Newly authored multi-filter expressions could fall back to legacy AND

C’s `resolveGroupedExpression` treated missing relation/tree as legacy AND for
every caller. That is correct for old payloads, but wrong for a newly authored
multi-filter editor state: an unfinished expression could execute as an
unintended flat AND instead of blocking until the user chose AND, OR or custom
grouping.

### 2c. Unresolved flat filters were dropped

`resolveRowsColumnsConfig` appended only successfully resolved filters. If a
flat/legacy relation contained an unresolved row, that row disappeared without a
blocking error, potentially broadening the population. The earlier C fix covered
unresolved rows referenced by a tree only.

### 2d. Missing condition references could rebind to a different clause

When a saved condition `cN` could not be resolved, later conditions were still
numbered from the compacted runtime list. A missing saved `c0` could therefore
map to a later valid condition that had been renumbered to runtime `c0`.

### 2e. Partial rule imports were applied after warnings

`RulesPage` applied resolved rule drafts even when resolution produced invalid
grouping/missing-column warnings, allowing a partial or altered rule set to be
imported.

### 2f. Family expansion changed positive any-match semantics

Family expansion of a saved tree leaf always used AND. For positive predicates
(`eq`/`contains`) this changed “any family member matches” into “all family
members match”. Negative predicates need AND; positive predicates need OR.
Flat expressions containing expanded families also needed a generated tree to
preserve the original precedence.

### 2g. One-clause new-form grouping fields were accepted then discarded

The backend accepted `logic_relation`/`logic_grouping_tree` beside a single
`logic_clauses` entry and then dropped them during normalization. This did not
change truth semantics but silently accepted an unsupported representation.

## 3. Reviewer-authored fixes and regression evidence

### 3a. Frontend grouping mode/explicitness state (`fa17108`)

The reviewer added frontend-only, non-wire state:

- `FilterGroupingMode = "and" | "or" | "custom"` in `domain.ts`.
- `WorkflowState.filterGroupingMode` and `filterGroupingRequired`.
- `RunRequest.filterGroupingRequired`.
- `setFilterConfiguration` accepts `mode` and `requireExplicit`.
- `validateWorkflowFilters`, `mapFilterConfigurationToWire`,
  `mapRunRequestToWire` and `resolveGroupedExpression` accept an explicit
  multi-filter requirement.
- `workflowConfigurationFromRun` infers mode/explicitness for restored runs.
- `mapWorkflowToRowsColumnsConfig` resolves the active mode only: a retained but
  dormant custom tree is not serialized while the user temporarily selects flat
  AND/OR; switching back to custom preserves that tree.
- Newly authored multi-filter editor state requires an explicit relation/tree.
  Restored legacy configurations/runs still default to legacy AND.
- `tryMapWorkflowToRowsColumnsConfig` returns `{content, error}` instead of
  throwing during render; `ConfigManager.saveDisabled` disables save and the page
  shows the actionable error.

Page wiring added by the reviewer:

- `PreparePage`/`UploadPage` dispatch `setFilterConfiguration` with relation,
  tree, mode, errors and explicitness; save payloads include grouping.
- `PreparePage` passes controlled `grouping`/`onGroupingChange` to
  `FilterBuilder`.
- `ResultsPage.buildRunRequest` carries relation/tree/errors/required flag, and
  deep links dispatch `restoreRunConfiguration`.
- `RulesPage` refuses partial imports when blocking `invalid_grouping` warnings
  are present.

Reviewer regression evidence:

- `frontend/src/api/groupedMapping.test.ts`: newly authored multi-filter run
  without explicit grouping throws; legacy run still omits grouping fields.
- `frontend/src/api/configContent.grouped.test.ts`: selected flat relation does
  not activate a retained custom tree; saving new multiple filters without an
  explicit expression is blocked; unresolved flat/legacy filter rows block
  instead of disappearing; condition families expand with operator semantics;
  unresolved condition references stay distinct; missing flat grouped outcomes
  are blocking.
- `frontend/src/state/WorkflowContext.grouped.test.ts`: new multiple filters are
  blocked until grouping is chosen; switching a custom tree to flat AND retains
  the dormant tree.
- `frontend/src/pages/ResultsPage.grouped.test.ts`: `buildRunRequest` sends the
  active nested tree, repair errors and explicit-grouping requirement.
- `frontend/src/pages/RulesPage.test.tsx`: invalid grouped rule config is not
  partially imported.

### 3b. Missing references and family semantics (`fa17108`)

- Unresolved filters now add blocking restoration errors even when no tree is
  present.
- Missing rule condition/outcome references use explicit `__missing_cN__`
  sentinels; index lookup no longer falls through to a later rebounded clause.
- Missing columns/families for rule conditions/outcomes produce blocking
  `invalid_grouping` warnings; `RulesPage` refuses partial import.
- Family expansion uses OR for positive predicates and AND for negative
  predicates inside the containing expression. Flat grouped expressions are
  wrapped in a generated tree where necessary to preserve precedence.
- Legacy single-outcome family expansion that would select one member silently is
  rejected with an actionable import error.
- Reviewer regression tests are listed in section 3a and in
  `configContent.grouped.test.ts` / `RulesPage.test.tsx`.

### 3c. Backend/runtime and one-outcome fixes outside C

- `0992b78` replaced B’s dictionary-only runtime normalization with A’s explicit
  `Rule.outcome_expression` and `apps.validation_logic` helpers. The reviewer’s
  real-`Rule` four-clause Y/N test executes the opposite-flags truth table,
  including null/blank, with five violations and complete outcome context.
- The one-clause new-form grouping rejection is Worker A’s schema/normalization
  fix, covered by the integrated cross-layer regression. C’s transport already
  writes a single outcome in legacy form.

### 3d. Reviewer-run integrated verification (attributed, not rerun by C)

The reviewer reported, under isolated `GROUPED_VALIDATION_HOME` settings:

- backend `check`: passed;
- `makemigrations --check --dry-run`: no changes;
- `pytest` on `tests/backend tests/contracts tests/integration`: **774 passed**;
- `mypy backend`: passed for 94 source files;
- changed-file Ruff: passed; full Ruff retained only the 5 unchanged baseline
  findings;
- frontend suite: **65 files / 599 tests passed**;
- frontend production build: passed with the existing 731.11 kB chunk warning;
- `git diff --check`: clean under the repository’s generated-dist exception;
- sample evaluator: 11 selected, 3 passes (`1,2,8`), 8 violations
  (`3,4,5,6,9,10,14,15`); null and empty-string rows distinguished;
- limited headless Chrome smoke: uploaded samples, selected `ID`, entered
  Prepare, added two filters, selected CUSTOM GROUPS, created a group and saw
  validation errors without a page crash.

Full numbered visual acceptance was explicitly **not** completed by the reviewer.

## 4. Remaining limitations and pending acceptance

- The integration review disposition was **NOT READY** only because worker
  documentation records were stale. This update corrects Worker C’s records; the
  reviewer must confirm the documentation gate.
- Frontend-only mode/explicitness state is intentionally not persisted on the
  wire. Restored runs/configs infer mode from persisted relation/tree.
- Full user UI acceptance is still pending: nested filter truth table, save/
  reload/restart, both AND/OR outcome shapes, opposite-flags Y/N table,
  null/blank negative operators, clause edit/remove/reorder, config and run
  restoration, legacy/column-against-column compatibility, and report/tracking
  inspection.
- Backend compound evaluation, export/tracking content, and browser acceptance
  remain reviewer/user responsibilities. C does not claim those integrated
  results as its own test runs.
- The pre-existing repository-wide Ruff findings remain unchanged.

---

# S35 + legacy R056/R057 run-response investigation

## Reproduction and actual failure boundary

Integration worktree inspected read-only; no integration file, database, config,
upload or result JSON was modified. The running app was at
`http://127.0.0.1:45303/`.

Evidence used:

- S35: `config/rows_and_columns/s35.yaml` from the integration worktree
  (nested aggregation, two comparison sections, no filters, empty
  `targetColumns`).
- Legacy rules: `config/rules/ui-before-flag-tests-active-backup.yaml`
  (`R056 Valid status`, `R057 Low Score`).
- Saved runs created by the failing UI attempts:
  - `e4ad6f7e9feb` and `24ec2b1936a8`: both R056 and R057 bound, nested
    aggregation, two sections.
  - `c41490b1adc4`: R056 only after R057 was temporarily removed.
- `baseline.csv` / `candidate.csv` inputs referenced by those runs.

The backend did execute and persist the run. `GET /api/runs/e4ad6f7e9feb/` and
`GET /api/runs/c41490b1adc4/` both returned **HTTP 200** with the same payload.
The failure occurs after a successful `POST /api/runs/execute/` response: the
frontend rejects the completed run document with `Response failed validation`.
This is not a backend execution failure.

Exact failing field paths:

```text
result.filter_relation          -> null
result.filter_grouping_tree     -> null
```

Both `wireRunDocumentSchema` and the legacy union branch failed those two paths:
`filter_relation` required `"and" | "or"` when present, and
`filter_grouping_tree` required an object when present. There were no other
schema issues for the R056/R057 payload after those paths were accepted. Nested
aggregation, both comparison sections, target columns, nullable comparison
values, legacy rule summaries and both legacy single-outcome violations mapped
successfully.

The backend contract permits/has this shape: `ExecutionResultSerializer` and the
run history normalization use `allow_null` / `None` for these fields, and B’s
implementation record says historical runs default them to `None`. C’s schema
treated explicit JSON null as invalid. This is a frontend contract mismatch, not
a malformed backend response.

## Isolated regression fixture

Added `frontend/src/api/__fixtures__/s35LegacyRunResponse.fixture.ts`, a snapshot
of the actual saved-run response for S35 + R056/R057 (`e4ad6f7e9feb`). The test
uses the real response shape rather than a hand-built dictionary.

Regression tests in `frontend/src/api/s35LegacyRunResponse.test.ts` cover:

- explicit-null `filter_relation` / `filter_grouping_tree` acceptance;
- empty `filters_applied` with nested aggregation enabled;
- two comparison sections with their persisted IDs/names/columns;
- aggregation columns `status`, `region`;
- legacy R056/R057 bindings, names, identifiers and violation counts;
- group statistics for both rules;
- saved-run retrieval through `loadRun()`;
- continued rejection of malformed relation strings and empty tree branches.

## Fix

- `wireRunRequestSchema` and `wireRunResultSchema` now accept explicit null for
  `filter_relation` and `filter_grouping_tree`.
- `mapWireFilterConfiguration` accepts nullable relation/tree inputs; null means
  legacy AND / no custom tree. It is not converted to an empty/free-form run.
- No unknown payload is broadly accepted: malformed relation strings, malformed
  trees and all other schema constraints remain enforced.

## C validation

```text
npx tsc -b tsconfig.app.json --pretty false
# success

npx vitest run src/api/s35LegacyRunResponse.test.ts
# 1 file passed, 4 tests passed

npx vitest run --testTimeout=20000 --hookTimeout=20000 --maxWorkers=2
# 60 files passed, 562 tests passed
```

## Dependency / reviewer coordination

- This fix is based on C’s original branch (`f249301` / docs `28f2ea7`) and does
  not include reviewer integration code.
- Reviewer should apply it after integration frontend fix `fa17108`; the docs
  correction should apply after the previously integrated C documentation commit
  `152f13d`. No dependency was cherry-picked into C.
- Backend `0992b78` is required for real runtime execution of A-materialized
  multi-outcome trees, but is not required for this legacy R056/R057 response
  schema fix.

## Remaining issue adjacent to this investigation

The integration run `fdef26c436ab` using the new grouped rule `R079` has a
separate response-shape problem: compound-outcome violations set
`violating_value` to an object (`{"sa_flag": "Yes", "cva_flag": "Yes"}`), while
the agreed scalar `violating_value` field only admits string/number/boolean/null.
That is outside the S35 + R056/R057 failure. It needs a targeted Worker B
follow-up/contract decision (for example keep `violating_value` scalar and expose
the map through `outcome_values`, or formally add a separate object field and
frontend rendering support). It was not silently accepted here.
