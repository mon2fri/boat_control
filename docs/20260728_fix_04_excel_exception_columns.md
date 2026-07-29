# Issue 4 Fix: Excel exports the wrong extra-column set

**Date:** 2026-07-28  
**Priority:** MEDIUM  
**Status:** Fixed

## Problem

The "Exception Table" sheet in `export_excel()` (`services.py:735`) unions every
rule's `extra_values` keys across all violations instead of using the configured
`exception_columns`. It also adds an unrequested "Rule Name" identifier column.

The `exception_columns` field was not previously stored in the persisted run
result — that was fixed in Issue #1. With that fix in place, the Excel export
can now read `result["exception_columns"]` and filter which extra columns appear.

## Fix

- Changed the Excel "Exception Table" sheet to use `result.get("exception_columns", [])`
  instead of unioning all `extra_values` keys.
- Removed the "Rule Name" column.
- Added `exception_columns` to the backward-compat defaults in `persistence.py`
  (already done in Issue #1).
