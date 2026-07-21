# Enhancement Implementation Review — 2026-07-21

## Confirmed product decisions

1. **Unique Count** = number of distinct key-column combinations in the applicable result population. Overall removes duplicate key combinations across attribute changes and rule exceptions.
2. **Grouping values** always come from the comparison file, including when the same grouping column has a different baseline value.
3. **Null and empty-string** grouping values are separate rows, displayed as `Null` and `Empty`.
4. **Column selectors** are searchable checkbox multi-sets. Selected values OR-ed within field, AND-ed across fields. Server-side filtering because details are paginated.
5. **Loading reminder**: `Loading data, please wait, DO NOT refresh...` in red.
6. **Applied filtering rows** shown as read-only text at the bottom of the Overall result card.
7. **Multiple logic values** are OR-ed for every operator, including negative operators (`neq`, `ncontains`).
8. **HTML/CSV exports** list complete result data without applying interactive detail-table filters.
9. **Attribute Count** counts every emitted attribute-change or rule-exception occurrence. Not de-duplicated by key and column.

## Files changed by requirement item

### R1: Grouping Columns workflow state
- `frontend/src/state/WorkflowContext.tsx` — `groupingColumns` in state + reducers
- `frontend/src/features/upload/HeaderReview.tsx` — Grouping Columns card
- `frontend/src/features/upload/HeaderReview.test.tsx` — grouping column tests
- `frontend/src/pages/UploadPage.tsx` — passes grouping props
- `frontend/src/pages/ResultsPage.tsx` — `groupingColumns` in run request

### R2: Comparison-file-only filtering
- `backend/apps/files/column_values.py` — reads only from comparison file
- `backend/apps/files/filter_services.py` — `get_column_values` comparison-only
- `backend/apps/runs/services.py` — filters only df_b, joins baseline via semi

### R3: Loading reminder
- `frontend/src/pages/PreparePage.tsx` — red text `Loading data, please wait, DO NOT refresh...`

### R4: Rule explanation copy
- `frontend/src/features/rules/RuleEditor.tsx` — updated help text with green/bold/red formatting
- `frontend/src/index.css` — `.text-green`, `.text-red`, `.text-bold`, `.greybox` classes

### R5: Rule logic multi-value
- `frontend/src/features/rules/RuleEditor.tsx` — `SearchableMultiSelect` for logic values, updated labels
- `frontend/src/api/domain.ts` — `values?: string[]` on `LogicClause`
- `frontend/src/api/wire.ts` — `target_values` in logic wire schema
- `frontend/src/api/mapping.ts` — multi-value mapping
- `backend/apps/rules/services.py` — `LogicClause.target_values`, `_check_rule` multi-value OR
- `backend/apps/rules/views.py` — `_rules_to_dict` includes `target_values`
- `backend/apps/rules/serializers.py` — `LogicClauseSerializer` with `target_values`

### R6: Detail-table filters
- `backend/apps/runs/run_detail_views.py` — filter params, facets, `_apply_detail_filters`, `_compute_facets`
- `frontend/src/api/wire.ts` — `available_filters` in detail page schema
- `frontend/src/api/endpoints.ts` — `fetchDetailPage` accepts `filters` param
- `frontend/src/features/results/usePaginatedDetails.ts` — accepts `filters`, resets on change, exposes `availableFilters`
- `frontend/src/features/results/DetailFilterBar.tsx` — **new** filter bar component
- `frontend/src/features/results/PaginatedDetailSection.tsx` — integrates filter bar
- `frontend/src/index.css` — `.detail-filter-bar` styles

### R7: Applied-filter statement
- `frontend/src/features/filters/formatFilterRow.ts` — **new** formatter
- `frontend/src/pages/ResultsPage.tsx` — applied-filter `<p>` in Overall card

### R8–R9: Group statistics computation
- `backend/apps/runs/services.py` — `compute_group_statistics`, `_build_group_stats`, `_sort_group_rows`, `grouping_values` on dataclasses
- `tests/backend/test_runs.py` — 9 new group statistics tests

### R10–R11: Group statistics presentation
- `frontend/src/features/results/GroupStatisticsPanel.tsx` — **new** collapsible card panel
- `frontend/src/features/results/groupLayout.ts` — **new** `distributeEvenly` helper
- `frontend/src/features/results/groupLayout.test.ts` — **new** 11 layout tests
- `frontend/src/features/results/RuleResultSection.tsx` — accepts `groupStats` prop
- `frontend/src/pages/ResultsPage.tsx` — renders `GroupStatisticsPanel` in all sections
- `frontend/src/index.css` — group stats styles

### Wire/state contract
- `frontend/src/api/wire.ts` — `group_statistics`, `target_values`, `available_filters`
- `frontend/src/api/mapping.ts` — `mapGroupStatisticsBundle`, multi-value mapping
- `frontend/src/api/domain.ts` — `GroupStatRow`, `GroupStat`, `GroupStatisticsBundle`
- `frontend/src/state/WorkflowContext.tsx` — `groupingColumns`
- `backend/apps/runs/serializers.py` — `grouping_columns` field
- `backend/apps/runs/persistence.py` — persists `grouping_columns` + `group_statistics`
- `backend/apps/runs/views.py` — validates `grouping_columns`

### Test updates
- `frontend/src/features/rules/RuleEditor.test.tsx` — updated for new labels/SearchableMultiSelect
- `frontend/src/features/upload/HeaderReview.test.tsx` — grouping column tests
- `frontend/src/features/filters/useFullSetGuard.test.tsx` — `groupingColumns` in baseState
- `frontend/src/features/reports/ReportName.test.tsx` — `filtersApplied` fixture

## Automated command results

```
uv run pytest -q                           → 146 passed
uv run ruff check backend tests            → All checks passed
npm --prefix frontend test -- --run        → 236 passed (32 files)
npx tsc --noEmit                           → clean
npx vite build                             → built
```

## Test counts

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| Backend (pytest) | 137 | 146 | +9 |
| Frontend (vitest) | 225 | 236 | +11 |
| **Total** | **362** | **382** | **+20** |

## Backward compatibility

- `grouping_columns` defaults to `[]` when absent from persisted runs.
- `group_statistics` defaults to `null` when absent.
- `filters_applied` defaults to `[]` when absent.
- `target_values` on logic clauses defaults to empty tuple.
- `grouping_values` on `RowComparison`/`ValidationViolation` defaults to `{}`.
- Existing exports (HTML/CSV) are unaffected and continue to work from persisted data.

## Remaining items

None. All 12 requirement items (R1–R12) have been implemented and verified.
