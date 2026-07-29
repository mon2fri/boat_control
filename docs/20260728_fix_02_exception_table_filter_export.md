# Issue 2 Fix: Exported HTML cannot filter the exception table

**Date:** 2026-07-28  
**Priority:** HIGH  
**Status:** Fixed

## Problem

The `FilterDropdown` component in `ExceptionTable.tsx:407` renders its checkbox
options only while React state `isOpen` is true. The HTML export (`exportRenderedHtml.ts`)
clones the live DOM; if the dropdown is closed at clone time — which it always is,
because it starts closed — the `.th-filter-option input[type="checkbox"]` elements
are absent from the cloned document.

The export JS (`exportRenderedHtml.ts:433`) attaches a `change` listener on
`.th-filter-option input[type="checkbox"]` and calls `applyDetailFilters()`. But
since no checkboxes exist in the clone, filtering never works. Sorting survives
because sort buttons are always rendered with `data-detail-sort` attributes.

## Fix

Changed `FilterDropdown` to always render the options container, hidden via
`hidden={!isOpen}` instead of conditional rendering (`{isOpen && (...)}`).

This ensures the checkbox elements exist in the cloned DOM at export time.
The export JS already:
1. Sets `hidden = true` on all `.th-filter-dropdown` elements at clone time (line 462)
2. Re-wires click listeners to toggle `hidden` on the dropdown
3. Handles `change` events on checkbox inputs to filter the table

No changes to `exportRenderedHtml.ts` were needed.
