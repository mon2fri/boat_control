# Issue 3 Fix: TypeScript build errors

**Date:** 2026-07-28  
**Priority:** HIGH  
**Status:** Fixed

## Problem

`npm run build` reported 10 TypeScript errors:

1. **ExceptionTable.tsx (6 errors):** Unsafe `columnOptions[key]` indexed access
   under `tsconfig.app.json`'s `noUncheckedIndexedAccess`. The guard
   `columnOptions[key] && columnOptions[key].length > 0` does not narrow the type
   for the subsequent `options={columnOptions[key]}` prop assignment because
   TypeScript's control-flow analysis does not narrow through repeated bracket
   notation with `noUncheckedIndexedAccess`.

2. **Test files (4 errors):** Missing `exceptionColumns` in `WorkflowState` test
   fixtures and missing `onToggleAll` in `SortableRuleList` test.

## Fix

### ExceptionTable.tsx
- Changed guards from `columnOptions[key] && columnOptions[key].length > 0` to
  `(columnOptions[key]?.length ?? 0) > 0`, which uses optional chaining and a
  nullish coalescing fallback.
- Kept `columnOptions[key]!` with non-null assertion for the `options` prop
  since the guard already ensures a non-empty array.

### Test files
- Added `exceptionColumns: []` to `baseState` in `useFullSetGuard.test.tsx`,
  `base()` in `WorkflowContext.test.ts`, and `base()` in
  `savedRunRestoration.test.ts`.
- Added `onToggleAll={vi.fn()}` to `SortableRuleList` in
  `SortableRuleList.test.tsx`.
