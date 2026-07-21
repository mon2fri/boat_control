# Phase 6 — Group-statistics presentation

Date: 2026-07-21

## Summary

Created the frontend components that render group-level statistics in the
results page. Each grouping column appears as a collapsible `<details>` card
with a summary line showing total Unique and Attribute counts, expanding to
a table of per-value counts. Cards are distributed evenly across rows with
at most 4 per row.

## New files

| File | Purpose |
|------|---------|
| `frontend/src/features/results/groupLayout.ts` | Pure `distributeEvenly<T>()` helper: splits items into rows of at most `maxPerRow`, differing by at most 1. |
| `frontend/src/features/results/groupLayout.test.ts` | 11 tests covering 0–10 items, edge cases, custom maxPerRow. |
| `frontend/src/features/results/GroupStatisticsPanel.tsx` | Renders a list of `GroupStat` objects as collapsible cards with per-value tables. |

## Modified files

| File | Change |
|------|--------|
| `frontend/src/features/results/RuleResultSection.tsx` | Accepts optional `groupStats?: GroupStat[]` prop; renders `GroupStatisticsPanel` when present. |
| `frontend/src/pages/ResultsPage.tsx` | Imports `GroupStatisticsPanel`. Renders it in Overall card (after summary + applied-filter statement), in Attribute Changes card, and passes per-rule stats to `RuleResultSection`. |
| `frontend/src/index.css` | Added `.group-stats-panel`, `.group-stats-row`, `.group-stats-card`, `.group-stats-summary`, `.group-stats-table`, `.group-stats-total` styles. |

## Layout algorithm

`distributeEvenly(items, maxPerRow=4)`:
1. If items fit in one row, return `[items]`.
2. Compute row count `n = ceil(items.length / maxPerRow)`.
3. Each row gets `floor(items.length / n)` items; the first `items.length % n` rows get one extra.
4. Rows differ by at most 1 item.

Examples: 5 → [3,2], 6 → [3,3], 7 → [4,3], 8 → [4,4], 9 → [3,3,3], 10 → [4,3,3].

## Rendering per group column

- Uses `<details>/<summary>` for native collapsible behavior.
- Collapsed by default (no `open` attribute).
- Summary: `{column} — Unique: {totalUniqueCount} | Attribute: {totalAttributeCount}`
- Expanded: `<table>` with Value, Unique Count, Attribute Count columns.
- Total row is bold with a top border.
- Null values display as `Null`, empty strings as `Empty`.

## Gate results

```
uv run pytest -q         → 146 passed
uv run ruff check        → All checks passed
npm --prefix frontend test → 236 passed (225 existing + 11 new layout tests)
npx tsc --noEmit         → clean
npx vite build           → built
```
