# Issue 6 Fix: Pagination can land on an empty, invalid page

**Date:** 2026-07-28  
**Priority:** MEDIUM  
**Status:** Fixed

## Problem

`currentPage` in `SortableRuleList.tsx:47` is never clamped when rules are
deleted or the list shrinks. If a user navigates to page 2, then deletes rules
so only one page remains, the UI shows "Page 2 of 1" with an empty list.

## Fix

Added a `useEffect` that clamps `currentPage` to `max(0, totalPages - 1)`
whenever `rules.length` changes.
