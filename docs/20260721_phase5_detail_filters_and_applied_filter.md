# Phase 5 — Result-page filters and applied-filter statement

Date: 2026-07-21

## Summary

Added server-side detail-table filtering with faceted filter UI, and a
persisted applied-filter statement in the Overall result card. Each detail
section (attribute changes, per-rule violations) now has independent filter
state with searchable multi-select controls for every key column and the
COLUMN field.

## Applied-filter statement (R7)

Added `formatFilterRow` helper that renders a filter row in natural language
(e.g. `region equals "EMEA"; status contains "active" or "pending"`).

At the bottom of the Overall result card, reads `filtersApplied` from the
persisted `RunResult`. When non-empty, renders the full filter description;
otherwise shows "No filtering rows applied".

### Files

| File | Change |
|------|--------|
| `frontend/src/features/filters/formatFilterRow.ts` | **New** — maps operator enum to readable labels, joins values with "or" |
| `frontend/src/pages/ResultsPage.tsx` | Imports `formatFilterRow`, adds applied-filter `<p>` at bottom of Overall card |

## Detail-table filtering (R6)

### Backend (`backend/apps/runs/run_detail_views.py`)

- Extracted `_flatten_rows()` helper that builds the uniform row list from
  stored run data (same logic as before, but reusable).
- Added `_apply_detail_filters()` that filters rows by `key_<col>` and
  `column` query params (AND across fields, OR within).
- Added `_compute_facets()` that computes distinct available values for
  each filterable field from the **complete unfiltered** dataset.
- `RunPaginatedDetailView.get` now:
  1. Parses filter query params (`key_<col>=val1,val2`, `column=val1,val2`).
  2. Computes facets before filtering.
  3. Applies filters, then paginates the filtered result.
  4. Returns `available_filters` in the response.

### Frontend wire schema (`frontend/src/api/wire.ts`)

- Added `available_filters: z.record(z.string(), z.array(z.string())).optional()`
  to `wireDetailPageSchema`.

### Frontend endpoint (`frontend/src/api/endpoints.ts`)

- `fetchDetailPage` now accepts optional `filters: Record<string, string[]>`.
- Passes filter params as query string.
- Returns `availableFilters` in the result.

### Frontend hook (`frontend/src/features/results/usePaginatedDetails.ts`)

- Accepts `filters` parameter (default `{}`).
- Resets pages to `[]` when `runId`, `kind`, or `filters` change.
- Passes filters to every `fetchDetailPage` call (both initial and `loadMore`).
- Exposes `availableFilters` from the last page response.

### Frontend filter bar (`frontend/src/features/results/DetailFilterBar.tsx`)

- **New component** rendering a `SearchableMultiSelect` for each key column
  and the COLUMN field.
- Options come from the `availableFilters` facet response.
- Selected values are OR-ed within a field; separate fields are AND-ed.

### Frontend section (`frontend/src/features/results/PaginatedDetailSection.tsx`)

- Maintains independent `filters` state per section.
- Passes filters to `usePaginatedDetails`.
- Renders `DetailFilterBar` when `keyColumnNames` is provided.
- Shows "No detail rows match the current filters" when filtered results
  are empty but unfiltered data exists.

### CSS (`frontend/src/index.css`)

- Added `.detail-filter-bar` flex layout with responsive wrapping.

## Gate results

```
uv run pytest -q         → 146 passed
uv run ruff check        → All checks passed
npm --prefix frontend test → 225 passed
npx tsc --noEmit         → clean
npx vite build           → built
```
