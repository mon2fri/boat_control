# CSV Runtime Error Fix — Type Inference, Row Counting & Error Handling

**Date:** 2026-07-21
**Scope:** Backend CSV reading hardened against type-inference errors; row-counting optimised; API returns structured JSON errors for CSV failures.
**Requirement:** `requirements/20260721_runtime_error_fix.md`

---

## Problem

Real-world CSV files (e.g. cost-centre exports) contain mixed alphanumeric values in columns
that Polars infers as numeric types.  This caused:

```
polars.exceptions.ComputeError: could not parse MDBA01061046 as type 164
at column COST_CENTRE (column number 29)
```

Additionally, `prepare_filters()` called `.collect().height` on full DataFrames to get row
counts, forcing Polars to materialise every row into memory — slow for large files.

---

## Changes

### 1. Treat all CSV values as strings

Every `pl.scan_csv()` call now passes `infer_schema=False`.  Polars reads every column as
`pl.String`, eliminating type-mismatch parse errors regardless of file content.

| File | Lines | Detail |
|------|-------|--------|
| `backend/apps/files/filter_services.py` | 47–49 | New `_scan_csv()` helper wraps `pl.scan_csv(path, infer_schema=False)` |
| `backend/apps/files/column_values.py` | 29–30 | Both `scan_csv` calls updated |
| `backend/apps/runs/services.py` | 465–466, 535–536 | All four `scan_csv` calls updated |

### 2. Optimise row counting

Replaced `.collect().height` (materialises all rows) with `.select(pl.len()).collect().item()`
(counts without materialisation).

| File | Lines | Before | After |
|------|-------|--------|-------|
| `backend/apps/files/filter_services.py` | 74–75 | `pl.scan_csv(path).collect().height` | `_scan_csv(path).select(pl.len()).collect().item()` |

### 3. Remove redundant cast

`get_column_values()` previously cast columns to `pl.Utf8` after reading.  With
`infer_schema=False` all values are already strings; the cast was removed.

| File | Lines | Detail |
|------|-------|--------|
| `backend/apps/files/filter_services.py` | 56–57 | Removed `.cast(pl.Utf8)` calls |

### 4. API error handling for CSV failures

`FilterPreparationView` and `ColumnValuesView` previously had no try/except around
Polars calls.  Any CSV error (type mismatch, corrupt file, encoding issue) propagated
as a raw Django 500 with a full traceback in server logs.

Both views now catch exceptions and return structured JSON:

- `ValueError` → `{"error": "..."}` with status 400
- Other exceptions → `{"error": "..."}` with status 500 + server-side log

This matches the existing pattern in `FileUploadView` (`views.py:45-61`).

| File | Function | Detail |
|------|----------|--------|
| `backend/apps/files/filter_views.py` | `FilterPreparationView.post()` | try/except around `prepare_filters()` |
| `backend/apps/files/column_values.py` | `ColumnValuesView.get()` | try/except around `scan_csv`/`select`/`collect` block |

### 5. Header reading — no change needed

`read_csv_headers()` in `services.py` already uses `pl.scan_csv(path, n_rows=0)`, which
reads only the first line (the header).  No change was required.

---

## Files Changed

```
backend/apps/files/filter_services.py
backend/apps/files/filter_views.py
backend/apps/files/column_values.py
backend/apps/runs/services.py
```

---

## Testing

All 153 existing tests pass (`pytest tests/`).  Ruff lint clean.

Key tests exercised by this change:
- `test_filter_services.py::TestGetColumnValues` — verifies star-marking with string values
- `test_filter_services.py::TestPrepareFilters` — verifies row counts and confirmation logic
- `test_files.py::TestReadCsvHeaders` — verifies header-only reading
- `test_runs.py::TestExecuteComparison` — verifies end-to-end CSV read through runs
