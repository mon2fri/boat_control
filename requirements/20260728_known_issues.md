# Known Issues — July 28 Enhancement Branch

**Date:** 2026-07-28
**Branch status:** Feature-complete but not shippable. Three high-priority issues block builds and break core flows. Five medium/low issues affect correctness and polish.

---

## HIGH

### 1. Configured exception columns never reach run execution

**File:** `frontend/src/pages/ResultsPage.tsx:28`

`buildRunRequest()` constructs the `RunRequest` sent to the backend but omits `exceptionColumns` entirely. The `RunRequest` domain type (`frontend/src/api/domain.ts:119`) has no `exceptionColumns` field. The backend `ExecuteComparisonView` (`backend/apps/runs/views.py:24`) never reads or passes exception columns to `execute_comparison()`.

Because the exception table component (`ExceptionTable.tsx`) filters each rule's `extraValues` against the configured `exceptionColumns` set, and the backend populates `extra_values` from each rule's own `extra_columns` (not from a global config), the picker usually has no data to display. The exception table either renders empty or shows nothing useful.

**Fix required (full stack):**
1. Add `exceptionColumns?: string[]` to `RunRequest` in `domain.ts`.
2. Include `exceptionColumns` in `buildRunRequest()` in `ResultsPage.tsx`.
3. Send `exception_columns` in the POST body in `endpoints.ts` (`downloadExport` / `executeRun`).
4. Read `exception_columns` in `ExecuteComparisonView.post()` in `views.py`.
5. Store `exception_columns` in `ExecutionResult` and persist it in `persistence.py`.
6. Map `exception_columns` back into `RunResult` on the frontend (`wire.ts` → `domain.ts`).
7. Restore `exceptionColumns` into workflow state when loading a persisted run (`ResultsPage.tsx` deep-link `useEffect`).

### 2. Exported HTML cannot filter the exception table

**File:** `frontend/src/features/results/ExceptionTable.tsx:269,446`

The `FilterDropdown` component renders its checkbox options only while its React-controlled `isOpen` state is true. The export clones the live DOM; if the dropdown is closed at clone time (which it will be — it starts closed), the filter options are absent from the cloned document. The export JS (`exportRenderedHtml.ts`) expects `.th-filter-option input[type="checkbox"]` elements to already exist in the DOM.

Sorting survives because sort buttons are always rendered with `data-detail-sort` attributes and the export JS manipulates DOM order directly. Filtering does not survive because the checkboxes never existed in the cloned DOM.

**Fix required:** Render the `.th-filter-options` container (with all checkboxes) in the DOM at all times, but hide it with CSS (`hidden` attribute or `display: none`) when the dropdown is closed. The export JS already sets `hidden = true` on all `.th-filter-dropdown` elements at clone time and re-wires click listeners. As long as the option elements exist in the cloned DOM, filtering will work.

### 3. Branch does not build (`npm run build`)

**File:** `frontend/src/features/results/ExceptionTable.tsx:269` and others

`npm run build` (TypeScript strict mode) reports ten errors. Known locations:
- Unsafe `columnOptions[key]` accesses without null guards in `ExceptionTable.tsx` (lines 269, 296, 326, 356 — optional-indexing on `Record<string, string[]>` without narrowing).
- Missing required props or state fields in existing test files that now fail due to new props (`exceptionColumns`, `onToggleAll`, `PAGE_SIZE` pagination state).

**Fix required:** Guard all `columnOptions[...]` accesses (e.g. `columnOptions[key] ?? []`) and update test fixtures to include new required fields.

---

## MEDIUM

### 4. Excel exports the wrong extra-column set

**File:** `backend/apps/reports/services.py:735`

The "Exception Table" sheet in `export_excel()` unions every rule's `extra_values` keys across all violations. It does not use the configured `exceptionColumns` from the run configuration. It also unconditionally adds a "Rule Name" column that was not requested.

This means the Excel export shows every possible extra column regardless of what the user selected, and the worksheet layout does not match the frontend exception table.

**Fix required:** Read `exception_columns` from the persisted `result` dict. When present, only include those columns. When absent (backward compat), fall back to the current union behavior. Remove the unrequested "Rule Name" column.

### 5. "Select all" only selects the current page

**File:** `frontend/src/features/rules/SelectableRuleList.tsx:105`

`handleToggleAll()` toggles only the visible page's rules. The checkbox label reads "Select all on this page." The requirement says select all / deselect all, which normally means the complete rule list. The control also disappears entirely when `rules.length <= PAGE_SIZE` (line 124: `rules.length > PAGE_SIZE`), so users with ten or fewer rules never see it.

**Fix required:** Change `handleToggleAll` to operate on all rules (`rules.map(r => r.index)`). Change the label to "Select all". Show the checkbox whenever there are at least two rules (not just when > PAGE_SIZE).

### 6. Pagination can land on an empty, invalid page

**File:** `frontend/src/features/rules/SortableRuleList.tsx:47`

`currentPage` is never clamped when rules are deleted or the list shrinks. If a user navigates to page 2, then deletes rules so only one page remains, the UI shows "Page 2 of 1" with an empty list.

**Fix required:** Add an effect or derive logic that clamps `currentPage` whenever `rules.length` or `totalPages` changes. For example:
```ts
useEffect(() => {
  const maxPage = Math.max(0, Math.ceil(rules.length / PAGE_SIZE) - 1);
  if (currentPage > maxPage) setCurrentPage(maxPage);
}, [rules.length, currentPage]);
```

### 7. Configuration placement does not match the requested layout

**File:** `frontend/src/pages/PreparePage.tsx:228`

The "Exception Columns" picker is placed *after* the entire Rules section in a standalone `config-layout` div with an empty right column (`<div />`). The requirement says it should be a sibling of "Compare and Validate" and "Validation Rules" sections, sharing the same two-column layout with the config loader/saver on the right.

Currently the config-layout div at line 228 wraps ExceptionColumnPicker in isolation, separate from the first config-layout at line 130 which holds the section heading + ConfigManager.

**Fix required:** Move the `ExceptionColumnPicker` into the existing top-level config-layout, or create a new `config-layout` sibling section (with heading + picker + ConfigManager) placed between `ComparisonSectionEditor` and `RulesPage`.

---

## LOW

### 8. No targeted tests cover the new behavior

None of the following have test coverage:
- Exception column persistence through config load/save
- `exceptionColumns` propagation through run request → backend → persisted result → frontend load
- Duplicate rows across rules in the exception table
- Exception table filtering and sorting (both live and exported)
- HTML export of the exception table (filter options present in cloned DOM)
- Excel export of the "Exception Table" sheet
- Rule list pagination (page navigation, edge cases)
- Rule list select all / deselect all across pages
- `currentPage` clamping when rules shrink
