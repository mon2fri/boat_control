# Issue 5 Fix: Select all only selects the current page

**Date:** 2026-07-28  
**Priority:** MEDIUM  
**Status:** Fixed

## Problem

`handleToggleAll()` in `SortableRuleList.tsx:105` operates only on the visible
page's rules (`paginatedRules`). The checkbox label says "Select all on this page."
The control also disappears when there are ≤ PAGE_SIZE rules.

The requirement says select all/deselect all should apply to the complete rule list.

## Fix

- Changed `handleToggleAll()` to operate on all rules: select all when not all
  are selected, deselect all when all are selected.
- Changed the label from "Select all on this page" to "Select all".
- Show the checkbox whenever there are at least 2 rules (instead of > PAGE_SIZE).
