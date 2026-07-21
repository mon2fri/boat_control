# 2026-07-21 Enhancement implementation plan and worker instruction

Source: [`requirements/20260721_enhancement_requirement.md`](../requirements/20260721_enhancement_requirement.md)

## Confirmed product decisions

These decisions were confirmed on 2026-07-21 and are requirements, not worker discretion:

1. `Unique Count` means the number of distinct key-column combinations in the applicable result
   population. Overall must remove duplicate key combinations across attribute changes and rule
   exceptions.
2. Grouping values always come from the **comparison** file, including when the same grouping column
   has a different baseline value.
3. Null and empty-string grouping values are separate rows, displayed as `Null` and `Empty`.
4. Each key-column and `COLUMN` detail filter is a searchable checkbox multi-select. Selected values
   are OR-ed within one field; separate fields are AND-ed. Filtering is server-side because details
   are paginated.
5. The Page 2 red loading reminder is exactly: `Loading data, please wait, DO NOT refresh...`
6. Applied filtering rows appear as read-only text at the bottom of the Overall result card.
7. Multiple values in Value against column logic are OR-ed for **every** operator, including
   `does not equal` and `does not contain`. Implement this literally and cover the negative-operator
   behavior with tests.
8. HTML and CSV exports list the complete result data without applying any interactive details-table
   filters. A filter currently selected in the browser must never reduce exported rows.
9. `Attribute Count` counts every emitted attribute-change or rule-exception occurrence. Unlike
   `Unique Count`, it is not de-duplicated by key and column. Overall Attribute Count is therefore
   the total number of applicable change/exception occurrences.

## Scope guardrails

- Implement only the twelve items in the source requirement and the clarified decisions above.
- Preserve existing upload/session reuse, comparison-column exclusions, config behavior, condition
  grouping trees, result pagination, history/load/rename/delete, exports, themes, and layout outside
  the named components.
- Keep production requests same-origin and do not add external assets or runtime traffic.
- Do not add a frontend runtime build requirement; commit the refreshed `frontend/dist` output.
- Use `groupingColumns` as an optional ordered subset of the selected comparison columns. Empty means
  no grouping statistics.
- Treat the comparison file as the source for filtering rows, rule-condition value choices, rule
  evaluation rows, and grouping values.
- Preserve backward compatibility for persisted runs that have no grouping metadata/statistics.
- Do not perform opportunistic refactors or unrelated fixes.

## Phase 1 — Freeze the contract and add grouping-column workflow state

### Frontend state and Upload page

1. Add `groupingColumns: string[]` to `WorkflowState` in `frontend/src/state/WorkflowContext.tsx`,
   initialized to `[]` for a new upload.
2. Add reducer actions:
   - `{ type: "setGroupingColumns"; columns: string[] }`
   - Include `groupingColumns` in the `Action` union type.
3. In the `setComparisonColumns` and `removeComparisonColumn` reducers, additionally filter
   `groupingColumns` to only those still present in the new `comparisonColumns` set (same pattern as
   `keyColumns` and `targetColumns`).
4. Add `groupingColumns: string[]` to the `reset` initial state (already `[]`).
5. Extend `HeaderReview` component (`frontend/src/features/upload/HeaderReview.tsx`):
   - Add optional props `groupingColumns: string[]` and `onGroupingColumnsChange: (columns: string[]) => void`.
   - Render a new **Grouping Columns** card immediately after the **Key columns** card in the same
     visual family. The card uses `SearchableMultiSelect` restricted to `selectedColumns` (comparison
     columns) with the same searchable checkbox behavior.
   - Heading: `Grouping Columns` with hint text: `Optional. Pick columns for group-level statistics.`
6. In `UploadPage.tsx` (`frontend/src/pages/UploadPage.tsx`):
   - Pass `groupingColumns` and `onGroupingColumnsChange` props to `HeaderReview`.
   - `onGroupingColumnsChange` dispatches `{ type: "setGroupingColumns", columns }`.
   - Grouping columns are optional — no validation gate on them; the Continue button remains gated
     only on `comparisonColumns.length > 0` and `keyColumns.length > 0`.
7. Update tests in `frontend/src/features/upload/HeaderReview.test.tsx`:
   - Add test that Grouping Columns card renders after Key columns.
   - Add test that selecting/deselecting grouping columns fires `onGroupingColumnsChange`.
   - Add test that removing a comparison column also removes it from grouping columns.
8. Update `frontend/src/journey.test.tsx` to verify grouping columns survive the upload → prepare
   navigation.

### Wire contract

1. Add `grouping_columns: string[]` (optional, defaults to `[]`) to the execution request schema
   `wireRunRequestSchema` in `frontend/src/api/wire.ts`.
2. Add `grouping_columns: string[]` to `wireRunResultSchema` and `wireRunDocumentSchema` so
   persisted results carry grouping metadata.
3. Define `GroupStatistics` wire schema:
   ```typescript
   wireGroupStatisticsSchema = z.object({
     column: z.string(),
     unique_count: z.number().int().nonnegative(),
     attribute_count: z.number().int().nonnegative(),
     rows: z.array(z.object({
       value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
       unique_count: z.number().int().nonnegative(),
       attribute_count: z.number().int().nonnegative(),
     })),
   });

   wireGroupStatisticsBundleSchema = z.object({
     overall: z.array(wireGroupStatisticsSchema),
     attribute_changes: z.array(wireGroupStatisticsSchema),
     validation_rules: z.record(z.string(), z.array(wireGroupStatisticsSchema)),
   });
   ```
4. Add `group_statistics: wireGroupStatisticsBundleSchema.optional()` to `wireRunResultSchema`.
5. Extend `RunResult` domain type (`frontend/src/api/domain.ts`) with:
   ```typescript
   interface GroupStatRow {
     value: string | number | boolean | null;
     uniqueCount: number;
     attributeCount: number;
   }
   interface GroupStat {
     column: string;
     uniqueCount: number;
     attributeCount: number;
     rows: GroupStatRow[];
   }
   interface GroupStatisticsBundle {
     overall: GroupStat[];
     attributeChanges: GroupStat[];
     validationRules: Record<string, GroupStat[]>;
   }
   ```
   Add `groupStatistics?: GroupStatisticsBundle` to `RunResult`.
6. Extend `RunRequest` domain type with `groupingColumns: string[]`.
7. Update `mapRunRequestToWire` in `frontend/src/api/mapping.ts` to include `grouping_columns`.
8. Update `mapRunDocumentToResult` in `frontend/src/api/mapping.ts` to map `group_statistics` from
   wire format to domain `GroupStatisticsBundle`.
9. Add `grouping_columns: string[]` to `ExecutionResult` dataclass in
   `backend/apps/runs/services.py`.
10. Add `GroupStatistics` and `GroupStatisticsBundle` dataclasses in `backend/apps/runs/services.py`.
11. Add `grouping_columns` field to `ExecutionResultSerializer` in
    `backend/apps/runs/serializers.py` and new `GroupStatisticsSerializer`.
12. Update `backend/apps/runs/views.py`:
    - Extract `grouping_columns` from `request.data`.
    - Validate: each must be a unique member of `comparison_columns`; reject unknown, excluded, and
      duplicate names with 400.
    - Pass to `execute_comparison`.
13. Update `backend/apps/runs/persistence.py` `save_run` to persist `grouping_columns` and
    `group_statistics` in the run document.
14. Ensure `load_run` returns missing fields as defaults (`[]` / empty bundle) for backward compat.
15. Update `execute_comparison` signature to accept `grouping_columns` parameter and pass it through.

### Likely files (Phase 1)

- `frontend/src/state/WorkflowContext.tsx`
- `frontend/src/pages/UploadPage.tsx`
- `frontend/src/features/upload/HeaderReview.tsx`
- `frontend/src/features/upload/HeaderReview.test.tsx`
- `frontend/src/journey.test.tsx`
- `frontend/src/api/domain.ts`
- `frontend/src/api/wire.ts`
- `frontend/src/api/mapping.ts`
- `frontend/src/api/endpoints.ts`
- `frontend/src/index.css` (if any layout tweaks needed)
- `backend/apps/runs/serializers.py`
- `backend/apps/runs/views.py`
- `backend/apps/runs/services.py`
- `backend/apps/runs/persistence.py`
- `backend/apps/runs/run_detail_views.py`
- `backend/apps/runs/urls.py`

---

## Phase 2 — Enforce comparison-file-only filtering and rule inputs

### Requirement mapping: R2

1. **Column values endpoint** (`backend/apps/files/column_values.py`):
   - The `ColumnValuesView.get` currently reads values from **both** files and merges them. Change
     it to read only from file B (comparison file) when the session distinguishes baseline vs
     comparison. The session object stores `file_a_path` (baseline) and `file_b_path` (comparison).
   - Remove the `in_file_a`/`in_file_b` star logic from the column-values endpoint; all returned
     values come from the comparison file. Alternatively, keep the response shape for backward
     compat but always set `in_file_b = true` and `in_file_a = false` for starred values.
   - The column values are used by `FilterRowEditor`, `RuleEditor` conditions, and the new
     Value-against-column multi-value control.

2. **Prepare endpoint** (`backend/apps/files/filter_services.py` `prepare_filters`):
   - Change `get_column_values` to accept a single file path (the comparison file) instead of
     both. Return values only from the comparison file.
   - Update `FilterPreparationView` to pass only the comparison file path.

3. **Filter rows** (`backend/apps/runs/services.py` `apply_filters`):
   - Currently filters both `df_a` and `df_b`. Change to filter **only** `df_b` (comparison)
     before joining. Then join baseline using the filtered comparison keys.
   - In `execute_comparison`:
     - Apply filters only to `df_b` (comparison file).
     - Join baseline rows using the filtered comparison keys: `df_b_filtered.join(df_a, on=key_columns, how='left')`.
     - This ensures baseline rows are matched against the filtered comparison set.

4. **Rule condition evaluation** (`backend/apps/runs/services.py` `_check_rule`):
   - The rule is checked against `df_a_final` (baseline) currently. Change to evaluate against the
     comparison row. The comparison row values are the reference for conditions and logic.
   - For Column-against-column: the comparison column value is on the left, baseline column value
     on the right.

5. **Column selectors** for Filtering Rows and all validation rule conditions/logic remain limited
   to `comparisonColumns`.

### Likely files (Phase 2)

- `backend/apps/files/column_values.py`
- `backend/apps/files/filter_views.py`
- `backend/apps/files/filter_services.py`
- `backend/apps/runs/services.py`
- `frontend/src/features/filters/FilterRowEditor.tsx`
- `frontend/src/features/rules/RuleEditor.tsx`
- Backend column-value/run tests
- Frontend hook/editor tests

---

## Phase 3 — Page 2 copy, loading reminder, and rule logic controls

### Red loading reminder (R3)

1. In `PreparePage.tsx` (`frontend/src/pages/PreparePage.tsx`):
   - The existing loading state at line 148-152 shows `Loading column values…`. Replace with:
     ```
     Loading data, please wait, DO NOT refresh...
     ```
   - Add `className="alert alert--error"` to the status paragraph so it uses the existing
     error/red design token (consistent with existing `alert--error` class in `index.css`).
   - Keep the spinner, loading logic, and cancellation behavior unchanged.

### Rule explanation copy (R4)

1. In `RuleEditor.tsx` (`frontend/src/features/rules/RuleEditor.tsx`):
   - Replace the current `<details className="rule-semantic-help">` content (lines 121-135) with
     the exact requirement text:
     ```tsx
     <p>
       A rule describes the <span className="text-green text-bold">required/expected state</span> for
       one column (and optionally a set of preconditions).
     </p>
     <p>
       <strong>Rows</strong> that <span className="text-green">match</span> the rule are
       <span className="text-green"> valid</span>;
       <strong>Rows</strong> that <span className="text-red">DO NOT match</span> are reported as
       <span className="text-red"> exceptions</span>.
     </p>
     <p>
       Example: <code>status must equal to "active"</code> flags every row whose status is
       anything other than <code>active</code>.
     </p>
     <p>
       <strong>Conditions</strong> narrow the rows the rule applies to (e.g. only check
       <code>status</code> when <code>region</code> is <code>HBAP</code>);
       <strong>Logic</strong> clause is the actual required state.
     </p>
     ```
2. Add CSS classes to `frontend/src/index.css`:
   ```css
   .text-green { color: var(--color-ok); }
   .text-red { color: var(--color-danger); }
   .text-bold, .text-green.text-bold { font-weight: 700; }
   .greybox { background: var(--color-surface-raised); padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono); }
   ```
3. Test the meaningful text content and semantic structure.

### Logic controls — Value against column (R5a)

1. In `RuleEditor.tsx`, for the `Value against column` format (when `draft.logic.format === "value"`):
   - Replace the single `<input id="logic-value">` (lines 315-325) with a `SearchableMultiSelect`
     component that has `freeText` enabled.
   - The options come from `columnValues[draft.logic.column]` (already available via props).
   - Logic values are stored as `string[]` in an array. Add a new field `values?: string[]` to
     `LogicClause` in `domain.ts`, alongside the existing `target: string`.
   - Normalize: trim whitespace, remove empty entries, de-duplicate while retaining stable order.
   - Display every normalized value as removable chips.
   - When multiple values are selected, they are OR-ed for **every operator** including negative
     operators.

2. Update `LogicClause` in `domain.ts`:
   ```typescript
   export interface LogicClause {
     id: string;
     format: LogicFormat;
     column: string;
     operator: LogicOperator;
     target: string;
     /** Multiple values for Value-against-column; OR-ed across all operators. */
     values?: string[];
   }
   ```

3. Update `wireLogicSchema` in `wire.ts`:
   ```typescript
   target_values: z.array(z.string()).optional(),
   ```
   Keep `target_value` for backward compat; read `target_values` if present, else wrap
   `target_value` in an array.

4. Update `mapLogicToWire` and `mapWireLogic` in `mapping.ts` to serialize/deserialize `values`.

5. Update `previewLogicDescription` in `RuleEditor.tsx` to show multiple values joined by "or".

6. Update validation in `validateDraft` to check `values` array (at least one non-empty value).

### Logic controls — Column against column (R5b)

1. When `draft.logic.format === "column"`:
   - Change the label "Column" to **"COLUMN in COMPARISON"** (for the left-hand column).
   - Change the label "Compared column" to **"BASELINE COLUMN"** (for the right-hand column
     / `target`).
   - The column selectors should remain limited to `comparisonColumns` for the left side. For the
     right side (baseline), show all comparison columns as options (the value comes from the
     baseline file at the matched key).

### Logic evaluation changes

1. In `backend/apps/runs/services.py` `_check_rule`:
   - Change the logic evaluation for `value_vs_column` to support multiple `target_values`:
     - If `target_values` is present and non-empty, check if the row value matches **any** of
       them (OR semantics).
     - For `eq`: `val in target_values`
     - For `neq`: `val not in target_values` (the row value must not be any of the target values)
     - For `contains`: `any(tv in val for tv in target_values)`
     - For `ncontains`: `all(tv not in val for tv in target_values)`
     - For `gt`/`lt`/`gte`/`lte`: `any(float(val) > float(tv) for tv in target_values)` etc.
   - For `column_vs_column`: keep existing behavior (compare row's comparison column with row's
     baseline column value at the same key).

2. Update `LogicClause` dataclass in `backend/apps/rules/services.py` to include
   `target_values: tuple[str, ...] = ()`.

3. Update rule YAML serialization/deserialization to include `target_values`.

### Likely files (Phase 3)

- `frontend/src/features/rules/RuleEditor.tsx`
- `frontend/src/features/rules/RuleEditor.test.tsx`
- `frontend/src/api/domain.ts`
- `frontend/src/api/wire.ts`
- `frontend/src/api/mapping.ts`
- `frontend/src/index.css`
- `backend/apps/rules/services.py`
- `backend/apps/rules/serializers.py`
- `backend/apps/runs/services.py`
- Rule/run tests and YAML round-trip fixtures

---

## Phase 4 — Compute and persist grouping statistics

### Backend computation

1. In `backend/apps/runs/services.py`, add a function `compute_group_statistics`:
   ```python
   def compute_group_statistics(
       comparison_rows: list[dict],
       key_columns: list[str],
       grouping_columns: list[str],
       attribute_changes: list[RowComparison],
       violations: dict[str, list[ValidationViolation]],
   ) -> GroupStatisticsBundle:
   ```
   - For each grouping column, extract the value from the **comparison** row.
   - Compute `GroupStatistics` for:
     - **Overall**: aggregate across all attribute changes and all rule exceptions.
     - **Attribute changes**: aggregate across `attribute_changes` only.
     - **Each validation rule**: aggregate across that rule's violations.
   - For each `GroupStatistics`:
     - `rows` contains one entry per distinct grouping value plus a `Total` row.
     - Sort order: Total first, then ordinary values (alphabetical), then `Empty`, then `Null`.
   - `Unique Count` = number of distinct key-column combinations in the group.
   - `Attribute Count` = total number of change/exception occurrences in the group (no
     de-duplication).
   - Overall `Unique Count` uses a **union** of key combinations across all categories.
   - Overall `Attribute Count` sums all occurrence counts.

2. In `execute_comparison`, after computing `comparison` and `validation`:
   - If `grouping_columns` is non-empty, call `compute_group_statistics`.
   - Attach the result to `ExecutionResult`.
   - To compute grouping statistics, we need to preserve the comparison row's grouping column
     values alongside each `RowComparison` and `ValidationViolation`. Add a `grouping_values:
     dict[str, Any]` field to `RowComparison` and `ValidationViolation` dataclasses to carry
     the grouping column values through the pipeline.

3. **Zero-exception rule handling**: even rules with zero exceptions should appear in
   `validation_rules` statistics with a single Total row showing 0/0.

4. **Legacy run loading**: in `persistence.py` `load_run`, if `group_statistics` is absent from
   the JSON, default to an empty bundle. This preserves backward compat.

### Persist and load

1. In `save_run`, persist `grouping_columns` and `group_statistics` in the result dict.
2. In the wire schemas, add the grouping fields as optional.
3. Update `mapRunDocumentToResult` to map group statistics.

### Backend tests

1. Add tests for:
   - Zero, one, and multiple grouping columns.
   - Multiple values and repeated keys (de-duplication).
   - Null and empty-string grouping values.
   - Duplicate key combinations requiring de-duplication.
   - Zero-exception rule.
   - Persisted run round-trip and legacy run loading.
   - More than four grouping columns.

### Export isolation

1. Verify that HTML/CSV export generation reads from the persisted result, not from any
   interactive filter state. The existing export implementation in
   `backend/apps/reports/` already works from persisted run data, so this should be
   confirmed with a regression test: apply a detail filter in the UI/API and verify the export
   remains complete.

### Likely files (Phase 4)

- `backend/apps/runs/services.py`
- `backend/apps/runs/serializers.py`
- `backend/apps/runs/persistence.py`
- `backend/apps/runs/views.py`
- `frontend/src/api/domain.ts`
- `frontend/src/api/wire.ts`
- `frontend/src/api/mapping.ts`
- Backend group-statistics tests
- Export regression tests

---

## Phase 5 — Result-page filters and applied-filter statement

### Detail-table filtering (R6)

1. **Backend: extend `RunPaginatedDetailView`** (`backend/apps/runs/run_detail_views.py`):
   - Accept optional query parameters for each key column and `COLUMN`:
     - `key_<col>=val1,val2` (comma-separated, OR within field)
     - `column=val1,val2`
   - Before computing the flat row list, apply filters:
     - For each filter parameter, keep only rows where the field value is in the provided list.
     - Filters are AND-ed across parameters.
   - Recalculate `total`, `offset`, `has_more` after filtering.
   - Add a `facets` response field (optional small payload) returning distinct available values
     for each key column and `COLUMN` from the **complete** (unfiltered) detail dataset.
     ```json
     {
       "available_filters": {
         "id": ["1", "2", "3"],
         "column": ["region", "status"],
         ...
       }
     }
     ```

2. **Frontend: `usePaginatedDetails` hook** (`frontend/src/features/results/usePaginatedDetails.ts`):
   - Accept a `filters: Record<string, string[]>` parameter.
   - Pass filter parameters in the fetch URL query string.
   - Reset pages to `[]` when filters change.
   - Expose `availableFilters` from the facet response.

3. **Frontend: `PaginatedDetailSection`** (`frontend/src/features/results/PaginatedDetailSection.tsx`):
   - Accept `keyColumnNames` and maintain independent filter state.
   - Render filter controls above the table.

4. **Frontend: filter controls**:
   - Create a new component `DetailFilterBar` in `frontend/src/features/results/` that renders:
     - A `SearchableMultiSelect` for each key column name.
     - A `SearchableMultiSelect` for `COLUMN`.
     - Each control is independent (AND-ed across controls; OR within one control).
   - Each control loads its available values from the facets response.

5. **Each result section has independent filter state** — filtering one table does not affect
   another.

6. **Reset to page 1** whenever any filter changes.

7. Cover: attribute-change tables, per-rule tables, combined key/COLUMN filters, empty results,
   pagination, special characters, invalid filter parameters.

### Applied-filter statement (R7)

1. At the bottom of the Overall result card in `ResultsPage.tsx`:
   - Read `filtersApplied` from `state.result` (persisted, not current workflow state).
   - If empty: show `No filtering rows applied`.
   - Otherwise, render each filter row with full operator wording and its values:
     ```
     Filtering: region equals "EMEA"; status contains "active" or "pending"
     ```
   - Use `className="field-hint"` or a similar muted text style.

2. Add mapping and history/deep-link tests proving the statement survives reload.

### Likely files (Phase 5)

- `backend/apps/runs/run_detail_views.py`
- `backend/apps/runs/urls.py`
- `frontend/src/features/results/PaginatedDetailSection.tsx`
- `frontend/src/features/results/usePaginatedDetails.ts`
- `frontend/src/features/results/DetailTable.tsx`
- New `frontend/src/features/results/DetailFilterBar.tsx`
- `frontend/src/api/endpoints.ts`
- `frontend/src/api/wire.ts`
- `frontend/src/pages/ResultsPage.tsx`
- Detail endpoint/hook/component tests

---

## Phase 6 — Group-statistics presentation (R8–R11)

### New component: `GroupStatisticsPanel`

Create `frontend/src/features/results/GroupStatisticsPanel.tsx`:

1. **Props**:
   ```typescript
   interface GroupStatisticsPanelProps {
     stats: GroupStat[];
   }
   ```

2. **Layout helper** `distributeEvenly(items, maxPerRow = 4): GroupStat[][]`:
   - Choose row count `n` such that `ceil(items.length / n) <= maxPerRow` and rows differ by at
     most 1.
   - Examples: 5 → 3+2, 6 → 3+3, 7 → 4+3, 8 → 4+4, 9 → 3+3+3, 10 → 4+3+3, etc.
   - Implement with a tested pure function.

3. **Rendering per group column**:
   - Use `<details>/<summary>` for collapsible behavior (native, accessible).
   - Collapsed by default (`<details>` without `open` attribute).
   - Summary shows: `{column name} — Unique: {totalUniqueCount} | Attribute: {totalAttributeCount}`
   - Expanded: a `<table>` with columns `| Value | Unique Count | Attribute Count |` and rows
     for each grouping value plus the Total row.

4. **Layout**: distribute group cards evenly across rows using the layout helper. At narrow
   breakpoints, stack vertically.

5. **Value display**: `Null` for null values, `Empty` for empty strings.

### Integration points

1. **Overall result card** in `ResultsPage.tsx`:
   - If `state.result.groupStatistics?.overall` is non-empty, render `<GroupStatisticsPanel stats={...} />`
     after `OverallSummaryCards`.

2. **Attribute changes card** in `ResultsPage.tsx`:
   - If `state.result.groupStatistics?.attributeChanges` is non-empty, render the panel.

3. **Per-rule cards** in `RuleResultSection.tsx`:
   - Accept optional `groupStats?: GroupStat[]` prop.
   - If present and non-empty, render the panel.

### Tests

1. Default collapse behavior.
2. Collapsed summary shows total Unique Count and Attribute Count.
3. Expand/collapse toggle.
4. Table values match expected data.
5. Zero-result groups show 0 counts.
6. Layout distribution for 1–9 grouping columns.
7. Rendering in all three section types.

### Likely files (Phase 6)

- New `frontend/src/features/results/GroupStatisticsPanel.tsx`
- New `frontend/src/features/results/GroupStatisticsPanel.test.tsx`
- New `frontend/src/features/results/groupLayout.ts` (pure layout helper)
- New `frontend/src/features/results/groupLayout.test.ts`
- `frontend/src/pages/ResultsPage.tsx`
- `frontend/src/features/results/RuleResultSection.tsx`
- `frontend/src/index.css`

---

## Phase 7 — Regression, build, and review

### Automated gates

Run the full gates after each phase completes:

```bash
uv run pytest -q
uv run ruff check backend tests
uv run mypy backend
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

### Django system check

```bash
cd backend && python manage.py check --deploy
```

### Manual verification journey

1. Upload asymmetric baseline/comparison CSVs (different column sets).
2. Select key columns, comparison columns, and at least five grouping columns.
3. Configure filtering rows with multiple operators.
4. Create two rules:
   - One with "Value against column" and multiple values (including negative operator).
   - One with "Column against column" and verify labels show "COLUMN in COMPARISON" / "BASELINE COLUMN".
5. Run the comparison and validation.
6. Inspect:
   - Overall result card with summary metrics and applied-filter statement.
   - Group statistics in Overall, Attribute changes, and each rule section.
   - Verify 3+2 layout for 5 grouping columns.
7. Exercise details-table filters:
   - Apply key column and COLUMN filters.
   - Verify pagination resets to page 1.
   - Verify independent filter state across sections.
8. Collapse/expand group statistics and verify correct counts.
9. Reload from Run history and compare all filters/statistics.
10. Confirm no unrelated layout or behavior changed.

### Build and commit

1. Rebuild `frontend/dist` after source tests pass:
   ```bash
   npm --prefix frontend run build
   ```
2. Inspect the production bundle for external HTTP(S) runtime references.
3. Commit all changes including `frontend/dist`.

### Review document

Write `reviews/20260721_enhancement_implementation_review.md` containing:
- The nine confirmed product decisions.
- Final API/data-shape decisions.
- Files changed by requirement item.
- Exact automated command results.
- Manual verification results.
- Any remaining limitations or risks.

---

## Acceptance checklist mapped to source requirements

- [ ] R1: Grouping Columns card matches Key Columns behavior and persists in workflow state.
- [ ] R2: Filtering and validation controls/evaluation use comparison-file columns and values.
- [ ] R3: Page 2 loading reminder is red and accessible.
- [ ] R4: Rule explanation has the specified wording and semantic styling.
- [ ] R5: Creatable multi-value logic input has correct semantics; column labels identify files.
- [ ] R6: Every details table filters by key columns and/or COLUMN over the full paginated dataset.
- [ ] R7: Overall result states the persisted filtering rows at the clarified location.
- [ ] R8: Each grouping value has correct Unique Count and Attribute Count plus Total.
- [ ] R9: Grouping statistics render for overall, attribute changes, and every validation rule.
- [ ] R10: Grouping items collapse by default, show collapsed totals, and expand to the full table.
- [ ] R11: Grouping layouts have at most four items per row and distribute rows evenly.
- [ ] R12: No unnecessary behavioral, logic, appearance, or traffic changes were introduced.
