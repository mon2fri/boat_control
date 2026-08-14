# Session Changelog — Semantic Label Updates, New Books Section, and Filter Popup Fix

**Date:** 2026-08-14
**Branch:** `fix/multi-value-filter-semantics`
**Scope:** Rename metric labels to use "Books" terminology, add New Books section for B-only rows, fix filter popup overflow and add global clear button.

---

## 1. Semantic Label Renames

Changed metric card labels throughout the UI and exports to use "Books" terminology instead of generic "Rows" / "Records".

| Before | After |
|--------|-------|
| Records loaded | Books after filters |
| Rows with rule exception | Books with rule exception |
| Rows with changes | Books with changes |
| Rows with exception | Books with Exception |
| Attributes with rule exception | Attributes with rule exception |

### Files changed
- `backend/apps/reports/services.py` — exported HTML and Excel labels
- `frontend/src/features/results/OverallSummaryCards.tsx` — metric tile labels
- `frontend/src/features/results/RuleResultSection.tsx` — rule card labels

---

## 2. New Books Section — B-Only Row Detection

Added a **"New Books" card** between the "Overall Result" and "Exception Rule Summary" sections. It surfaces records that appear in the comparison file (B) but have no matching key in the baseline file (A).

### Backend changes

**`backend/apps/runs/services.py`**
- New `NewBookRow` dataclass: `row_index`, `key_columns`, `grouping_values`, `extra_values`
- `ComparisonResult` extended with `new_book_count: int = 0` and `new_book_rows: list[NewBookRow]`
- `compare_rows()` now uses an anti-join to detect B-only rows:
  ```python
  b_only_df = df_b.join(df_a.select(key_columns), on=key_columns, how="anti")
  ```
- `compute_group_statistics()` accepts `new_book_rows` and produces a `"new_books"` aggregation section

**`backend/apps/runs/serializers.py`**
- New `NewBookRowSerializer` and `ComparisonResultSerializer` extended with `new_book_count` and `new_book_details`

**`backend/apps/runs/persistence.py`**
- `load_run()` now sets backward-compat defaults for `new_book_count` (0), `new_book_details` ([]), and `new_books` ([]) for older persisted runs

### Frontend changes

**`frontend/src/api/wire.ts`**
- `wireComparisonSchema` extended with `new_book_count` and `new_book_details`
- `wireGroupStatisticsBundleSchema` extended with `new_books`

**`frontend/src/api/domain.ts`**
- `DetailRow.kind` now includes `"added"` in addition to `"changed"` / `"exception"`
- `OverallSummary` extended with `newBookCount?: number`
- `GroupStatisticsBundle` extended with `newBooks?: GroupStat[]`

**`frontend/src/api/mapping.ts`**
- `mapRunDocumentToResult()` populates `newBookCount` and appends `kind: "added"` rows to `changeDetails`
- `mapGroupStatisticsBundle()` maps `new_books` from the wire bundle

**`frontend/src/features/results/NewBooksCard.tsx`** *(new file)*
- Renders the New Books card: title, count metric, `GroupStatisticsPanel` for aggregation breakdown, and a key-column detail table

**`frontend/src/pages/ResultsPage.tsx`**
- `<NewBooksCard>` inserted between the Overall Result section and `<ExceptionRuleSummary>`, only rendered when `newBookCount > 0`

**`frontend/src/features/results/OverallSummaryCards.tsx`**
- 6th metric tile "New Books" added, rendered only when `newBookCount > 0`

### Reports export changes

**`backend/apps/reports/services.py`**
- **HTML export**: "New Books" section with count, aggregation stats, and key-column table inserted after overall section
- **Excel export**: "New Books" count added to Overall sheet; dedicated "New Books" sheet with key-column rows

**`frontend/src/features/reports/exportRenderedHtml.ts`**
- `labelFor('new-books')` added for TOC generation

---

## 3. Filter Popup Fixes

### Issue: filter dropdown clipped when only 1 row remains

When a filter reduced the table to a single row (or any count ≤ 10), the filter dropdown was clipped by parent `overflow: hidden` containers.

**Fix:** Added `overflow: visible` to `.detail-scroll`, `.detail-grid`, and `.detail-grid-header` in `frontend/src/index.css`, allowing absolutely-positioned dropdowns to escape.

### Issue: no way to clear all filters at once

The per-column "Clear" button inside each dropdown was gated with `hidden={selected.length === 0}`, so it was invisible when no value was selected for that column. There was no global "clear all" option.

**Fix:**
- Removed the `hidden` gate from the per-column "Clear" button (`DetailTable.tsx`) — it is now always visible
- Added a "Clear all filters" toolbar above the table in `PaginatedDetailSection` / `DetailTable`, shown only when filters are active
- Added `.detail-toolbar` CSS styles

### Files changed
- `frontend/src/index.css`
- `frontend/src/features/results/PaginatedDetailSection.tsx`
- `frontend/src/features/results/DetailTable.tsx`

---

## Test updates

- `tests/backend/test_reports.py` — updated label assertions, added `new_book_count` / `new_book_details` to sample fixture
- `frontend/src/features/results/results.test.tsx` — updated label assertions
