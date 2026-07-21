# Phase 4 — Compute and persist grouping statistics (backend)

Date: 2026-07-21

## Summary

Implemented the server-side computation of grouping statistics. When the user
selects grouping columns, the backend now computes per-column Unique Count and
Attribute Count for the Overall, Attribute Changes, and each validation rule
section. Results are persisted with the run and returned in the execution
response.

## Key decisions

1. **Unique Count** = number of distinct key-column combinations in the group.
   Overall Unique Count de-duplicates across attribute changes and rule
   exceptions (union of keys).
2. **Attribute Count** = total number of change/exception occurrences (no
   de-duplication). Each `RowComparison` contributes its `change_count`; each
   `ValidationViolation` contributes 1.
3. **Null and empty-string** grouping values are separate rows, displayed as
   `Null` and `Empty`.
4. **Sort order**: Total first, then alphabetical, then Empty, then Null.
5. **Zero-exception rules** appear in `validation_rules` statistics with a
   single Total row showing 0/0.

## Files changed

| File | Change |
|------|--------|
| `backend/apps/runs/services.py` | Added `grouping_values` field to `RowComparison` and `ValidationViolation`. Added `_sort_group_rows`, `_build_group_stats`, and `compute_group_statistics` functions. Updated `compare_rows` and `validate_rows` to accept `grouping_columns` and populate `grouping_values`. Wired `compute_group_statistics` into `execute_comparison`. |
| `tests/backend/test_runs.py` | Added 9 new tests in `TestComputeGroupStatistics` class covering: empty grouping, no data, single column, key deduplication, null/empty values, violations by rule, overall cross-section dedup, multiple columns, and `execute_comparison` integration. |

## Algorithm

`compute_group_statistics` receives the list of `RowComparison` objects
(attribute changes), the `violations_by_rule` dict, and the list of grouping
columns.

For each grouping column:

1. **Attribute Changes section**: Group `RowComparison` items by their
   `grouping_values[column]`. For each group, count distinct keys (unique) and
   sum `change_count` (attribute count).

2. **Each validation rule section**: Group that rule's violations by their
   `grouping_values[column]`. Each violation contributes weight=1.

3. **Overall section**: Combine all attribute-change items and all violation
   items. De-duplicate by key-column combination for Unique Count; sum all
   weights for Attribute Count.

4. **Sort and Total**: Each group gets a Total row at the top. Rows are sorted
   Total first, then alphabetical, then Empty, then Null.

## Gate results

```
uv run pytest -q         → 146 passed
uv run ruff check        → All checks passed
npm --prefix frontend test → 225 passed
npx tsc --noEmit         → clean
npx vite build           → built
```
