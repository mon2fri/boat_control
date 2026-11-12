# Round 1 reviewer integration fixes — filter and rule logic

Date: 2026-11-08. Branch: `work/20261108-grouped-validation-integration`.
Baseline: `aa4ed06`. Requirement:
`requirements/20261108_req_filter_rule_logic_enhancement.md`.

This record covers the accepted round 1 worker deliveries and the one
reviewer-authored fix. It is separate from the earlier grouped-validation
records, which remain valid.

## Accepted worker deliveries

All ten commits applied cleanly in dependency order (A → B → C helper → C
summary → D). No cherry-pick conflicts and no duplicate dependency commits.

| Worker | Original | Integration | Subject |
| --- | --- | --- | --- |
| A | `9f08f6a` | `ae16586` | fix: preserve rule import validation errors for invalid grouping |
| A | `dedaaa7` | `6bbf791` | test: add round1 rule grouping contract regressions |
| A | `b9ab55d` | `51dced1` | docs: record round1 worker A grouping contract work |
| B | `699a0d8` | `8917365` | fix: format compound report values for excel export |
| B | `113f055` | `5239125` | docs: record round one compound export delivery |
| C | `82c9379` | `cd31d09` | feat(frontend): support section labels in grouping hierarchy formatting |
| C | `8ec444b` | `33e20e5` | fix(frontend): show persisted applied-filter grouping in overall results |
| C | `f9fd4c4` | `40730cc` | docs: record round 1 overall results grouping delivery |
| D | `777890d` | `e4804fe` | feat(frontend): implement round one filter and grouping editor fixes |
| D | `95d5cc7` | `a686092` | test(frontend): cover round one filter and grouping editor behaviour |
| D | `ac17b61` | `af0400c` | docs: record round 1 Worker D implementation and delivery |

## Fix 1 (Worker A) — rule import keeps the actionable grouping error

- **Defect:** importing a rule whose grouping was invalid reported
  `Invalid logic relation: None` (an identity error) instead of
  `logic_relation is required when there are 2+ logic clauses`, and lost the
  rule name and actionable context.
- **Cause:** `_import_rule_content` called `calculate_rule_identifier` while
  formatting a validation failure. For a draft that fails grouping validation
  the canonicalizer raises `RuleIdentityError`, which replaced the validation
  message.
- **Change:** `backend/apps/configs/views.py` computes the identity for error
  reporting inside `try/except RuleIdentityError`; an uncomputable identity is
  reported as `uncomputable identity` while the rule name and the complete
  validation message are preserved. Import stays transactional.
- **Regression:** `tests/backend/test_round1_rule_grouping_contract.py`
  (`test_import_rejects_missing_grouping_transactionally`,
  `test_import_reports_tree_validation_error_when_identity_is_uncomputable`).
- **Verification:** 13 focused tests; the file also asserts the R079-shaped
  four-clause/root-OR rule survives save/load/export/import with the golden
  identity `CBR1_1FB1N7BHJ3WTCD3BB1KW` unchanged across an unchanged PUT, that
  missing/invalid grouping is rejected without mutating the catalog, and that
  legacy single-outcome rules still work.

## Fix 2 (Worker B) — compound observed values are formatted for Excel/HTML

- **Defect (Bug 3):** downloading Excel for S35 + `outcome_groups`/R079 failed
  with `Export failed: Cannot convert {'sa_flag': 'Yes', 'cva_flag': 'Yes'} to Excel`.
- **Cause:** grouped outcomes store `violating_value` as a flat map of observed
  columns. `export_excel` routed that value through `_excel_value`, which only
  handled strings, so openpyxl received a `dict`. The HTML export rendered the
  same map as a Python `dict` repr.
- **Change:** `backend/apps/reports/services.py` gains one deliberate report-cell
  formatter, `_report_cell_value`, used by `_excel_value`, `_sanitize_csv_value`
  and `_escape_html`. Mappings become `column=value, …` text preserving every
  entry and column order; `(null)` and `(blank)` keep null/blank distinct,
  matching the accepted frontend display convention. Formula protection is
  applied after formatting. Nothing in `apps/rules`, the runtime, the stored
  `violating_value` contract, exception identity or the accepted `a552dbc`
  frontend contract changed.
- **Regression:** `tests/backend/test_report_export_compound_values.py` —
  real grouped rule execution, real XLSX generation and reopen with openpyxl,
  one exception per rule/key, null/blank context, no dict-valued cells,
  legacy scalar export unchanged, formula escaping (`=SUM(A1:A2)` →
  `'=SUM(A1:A2)`), compound formula protection, HTML readability/escaping and
  the `/api/reports/export/` endpoint.
- **Reviewer verification:** the pre-fix module (extracted from `8917365^`)
  was executed against the same saved run and reproduced the user's exact error
  `ValueError: Cannot convert {'sa_flag': 'Yes', 'cva_flag': 'Yes'} to Excel`;
  the integrated code returned HTTP 200 and the reopened workbook contained 14
  R079 rows with the observed flags preserved and 0 dict-valued cells.

## Fix 3 (Worker C) — Overall Results shows the persisted filter grouping

- **Defect (Bug 2):** the Overall result card showed only a flat list of
  applied filters, so a saved nested expression such as
  `Filter 1 AND (Filter 2 OR Filter 3)` was indistinguishable from a flat AND
  list. The line also used live editor state instead of the persisted run.
- **Cause:** `OverallSummaryCards` received only `result.overall` and the page
  rendered `formatFilterRow` values joined with `;`, ignoring the persisted
  `filter_relation` / `filter_grouping_tree`.
- **Change:** `frontend/src/features/results/appliedFilterSummary.ts` (new)
  builds the summary from the persisted run fields, resolving the saved tree
  with `allowLegacyAnd: true` and rendering `overall: …` plus every child
  group. `OverallSummaryCards` renders the hierarchy and the `FILTER n` list,
  shows `No filtering rows applied` for a run without filters and an accessible
  error for a broken saved expression (never flattened). `ResultsPage` passes
  the persisted `filtersApplied`, `filtersRelation`, `filtersGroupTree` and
  `filtersGroupingErrors`.
- **Shared interface:** `formatGroupTreeHierarchy(node, clauseLabel, options?)`
  gained an optional third argument (`rootLabel`, `groupLabel`,
  `operatorLabels`). Existing two-argument calls, including D's, are unchanged.
- **Regression:** `frontend/src/features/results/appliedFilterSummary.test.ts`,
  `OverallSummaryCards.test.tsx`, `frontend/src/features/rules/groupingTree.test.ts`
  and an actual saved nested-filter run fixture
  (`frontend/src/api/__fixtures__/s35NestedFilterRunResponse.fixture.ts`).
- **Reviewer verification:** the isolated saved run produced by the reviewer
  renders `overall: FILTER 1 AND group 1` / `group 1: FILTER 2 OR FILTER 3`,
  and Chrome rendered the same lines on the Results page and after a
  `/results/<run-id>` reload.

## Fix 4 (Worker D) — filter/rule/grouping editor round 1

- **B1 free-text contains:** `FilterRowEditor` passes `freeText` to the value
  picker, so a fragment such as `oomber` is accepted with Enter even when it is
  not an enumerated CSV value. Literal matching and null semantics unchanged.
- **B4 R079 hierarchy:** `GroupingTreeEditor` no longer unwraps a persisted root
  OR into a two-group forest; the whole tree is rendered, so R079 shows the
  overall **Group 3 OR** above Group 1 and Group 2. Persisted trees are not
  rewritten to fix labels.
- **E1/E2 hierarchical hints and FILTER X labels:** `formatFilterGroupingHierarchy`
  renders `overall: …` plus numbered group lines, and each filter row carries a
  visible `FILTER n` label in the style of `Condition n` / `Outcome n`.
- **E3 Remove all groups:** the `Use all … AND/OR group` shortcuts are replaced
  by `Remove all groups` for filters, conditions and outcomes. The action clears
  only that section's grouping choice; clauses and values are retained, and
  saving/running multiple clauses still requires an explicit grouping (no AND
  fallback was added).
- **E4 accessible hints:** the new `SectionHint` component is a focusable
  `role="img"` exclamation icon with an accessible label and a
  `role="tooltip"` child, shown on hover and keyboard focus; validation errors
  stay visible. `CollapsibleCard` gained an optional `hint` slot and no longer
  nests interactive controls.
- **E5 Use Single Outcome removed:** the multi-outcome shortcut is gone; the
  column-mode `Discard extra outcomes` safety action and legacy single-outcome
  editing remain.
- **E6 nested disabled removal:** nested groups render a disabled
  `Remove group` control inside a focusable wrapper whose tooltip is
  `This group is part of group 3, please remove group 3 first to remove this
  group.` with the actual immediate parent's number. Root groups keep an enabled
  `Remove group`.
- **Regression:** `frontend/src/features/filters/FilterRowEditor.test.tsx`,
  `FilterBuilder.test.tsx`, `filterGrouping.test.ts`,
  `frontend/src/features/rules/GroupingTreeEditor.test.tsx`,
  `RuleEditor.test.tsx`, `RuleEditor.outcomes.test.tsx`, `logicOutcomes.test.ts`.
- **Ownership:** no C-owned file was modified. `showHelp={false}` keeps the
  shared help copy in the new section hint icons instead of duplicating it.

## Fix 5 (reviewer) — a saved filter operator in wire spelling made a run unusable

- **Severity:** high for the user's own retest path; pre-existing baseline
  defect, not introduced by round 1.
- **Defect:** loading `config/rows_and_columns/ui-flags-filter-eq.yaml` (or
  `-neq`) and running produced only **“The run failed unexpectedly”** — no
  request reached the backend.
- **Cause:** `frontend/src/api/configContent.ts` `resolveConfigFilterRow`
  copied the persisted operator into the domain model with a bare cast
  (`row.operator as FilterRow["operator"]`), while rule conditions were
  normalised through `CONFIG_TO_DOMAIN_OPERATOR`. A config that persists the
  wire spelling (`eq`, `neq`, `ncontains`) therefore produced a filter row
  whose operator was not a domain operator; `mapFilterOperatorToWire` returned
  `undefined`, the wire request omitted `operator`, and the run-request schema
  rejected the payload with `filters[0].operator → expected string, received
  undefined`.
- **Change:** one line in `resolveConfigFilterRow` —
  `operator: (CONFIG_TO_DOMAIN_OPERATOR[row.operator] ?? row.operator) as FilterRow["operator"]`
  — mirroring the existing condition handling. Both spellings are accepted
  (`eq`/`equals`, `neq`/`not_equals`, `contains`, `ncontains`/`not_contains`);
  an unrecognised value keeps its raw text and is never silently changed.
- **Regression:** `frontend/src/api/configContent.filterOperator.test.ts` —
  six operator-mapping cases plus an end-to-end check that a config persisting
  `eq`/`neq` produces a wire request that passes `wireRunRequestSchema`.
- **Verification:** the user's own `ui-flags-filter-eq` config now runs in the
  browser and emits `{"column":"cva_flag","operator":"eq","filter_values":["Yes"]}`.
- **Attribution:** reviewer-authored. Worker C owns the frontend API/state
  layer; this fix was not part of C's round 1 delivery and is not attributed to
  it.

## Known limitation carried forward (not fixed)

- **Column-family filters resolve to the first family member.**
  `resolveConfigFilterRow` uses `colResult.resolved[0]`, so the `Test` family
  (`name`, `status`) turns `Test equals active` into `name equals active`.
  The user's `s35` rows 2–3 and `ui-flags-active-systems` therefore select
  nothing, and the user's S35 run of R079 returns 0 violations. This is
  pre-existing behaviour, unchanged by round 1 and outside the round 1
  requirement. The UI guide documents the workaround (use the concrete column,
  e.g. `status`).

## Targeted follow-up prompt (next round, not a round 1 worker defect)

> **Round 2 follow-up — column-family filter expansion.** In
> `frontend/src/api/configContent.ts`, `resolveConfigFilterRow` returns only
> `colResult.resolved[0]`, so a saved filter that targets a column family
> (for example `Test` with members `name` and `status`) silently narrows to its
> first member. A saved `s35` configuration with `Test equals active` therefore
> runs as `name equals active` and selects an empty population. The loader
> already collects several runtime ids per configured row
> (`filterIdsByConfigIndex`), and `mapGroupTreeLeaves` already turns a
> multi-id configured row into an AND group, so the missing piece is to expand
> a family filter into one runtime row per available member and to keep the
> grouping tree consistent with that expansion. Please implement the expansion
> with an explicit, documented semantic (AND or OR of the family members),
> cover it with regressions for load, save, run and restoration, and record the
> chosen semantic in the shared contract. Do not change the legacy behaviour of
> configurations that name a concrete column.

## Integrated verification after the round 1 fixes

```text
GROUPED_VALIDATION_HOME=/tmp/opencode/round1-review/backend PYTHONPATH=backend \
  uv run pytest --ds=boat_control.grouped_validation_settings -q \
  tests/backend/test_round1_rule_grouping_contract.py \
  tests/backend/test_report_export_compound_values.py
18 passed

npm --prefix frontend test -- --run <11 round 1 focused files>
108 passed (11 files)

GROUPED_VALIDATION_HOME=/tmp/opencode/round1-review/backend PYTHONPATH=backend \
  uv run pytest --ds=boat_control.grouped_validation_settings -q \
  tests/backend tests/contracts tests/integration
792 passed

npm --prefix frontend test -- --run
647 passed | 3 skipped (74 files)

npx --prefix frontend tsc -b frontend/tsconfig.app.json --pretty false
passed

npm --prefix frontend run build
passed — dist/assets/index-Blsa1AJ5.js, dist/assets/index-fNqmScvO.css

uv run ruff check <changed backend files>
All checks passed!

uv run mypy backend
Success: no issues found in 94 source files
```

The full command ledger, the browser evidence and the preserved-file
checksums are in `reviews/20261108_round1_integration_review.md` and
`docs/20261108_round1_ui_verification.md`.
