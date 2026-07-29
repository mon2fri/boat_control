# Issue 1 Fix: Wire exceptionColumns through API contract and run execution

**Date:** 2026-07-28  
**Priority:** HIGH  
**Status:** In Progress

## Problem

`exceptionColumns` is stored in the frontend `WorkflowState` but never sent to the
backend during run execution. The API contract (`RunRequest`, wire schema, backend
`execute_comparison`) has no `exceptionColumns` field. The persisted run result also
lacks the field, so loading a saved run cannot restore the user's exception column
selection.

The ExceptionTable component filters each rule's `extraValues` against the configured
`exceptionColumns` set. Since the backend populates `extra_values` from each rule's own
`extra_columns` (not from a global config), the picker usually has no matching data
to display.

## Fix — All files touched

### Frontend

| File | Change |
|------|--------|
| `frontend/src/api/domain.ts:119` | Add `exceptionColumns?: string[]` to `RunRequest` |
| `frontend/src/api/domain.ts:179` | Add `exceptionColumns?: string[]` to `RunResult` |
| `frontend/src/api/wire.ts:225` | Add `exception_columns: z.array(z.string()).optional()` to `wireRunRequestSchema` |
| `frontend/src/api/wire.ts:338` | Add `exception_columns: z.array(z.string()).optional()` to `wireRunResultSchema` |
| `frontend/src/api/mapping.ts:288` | Add `exceptionColumns` param to `mapRunRequestToWire`; emit `exception_columns` |
| `frontend/src/api/mapping.ts:470` | Map `result.exception_columns` into `RunResult.exceptionColumns` in `mapRunDocumentToResult` |
| `frontend/src/api/endpoints.ts:364` | Add `exceptionColumns?: string[]` to `executeRun` request param type |
| `frontend/src/pages/ResultsPage.tsx:28` | Include `exceptionColumns: state.exceptionColumns` in `buildRunRequest()` |
| `frontend/src/pages/ResultsPage.tsx:73` | Restore `exceptionColumns` in the deep-link `useEffect` when loading a persisted run |

### Backend

| File | Change |
|------|--------|
| `backend/apps/runs/services.py:92` | Add `exception_columns: list[str] = field(default_factory=list)` to `ExecutionResult` |
| `backend/apps/runs/services.py:713` | Add `exception_columns: list[str] | None = None` param to `execute_comparison()` |
| `backend/apps/runs/services.py:882` | Pass `exception_columns=exception_columns or []` in the `ExecutionResult` constructor |
| `backend/apps/runs/views.py:24` | Read `exception_columns = request.data.get("exception_columns", [])` and pass to `execute_comparison()` |
| `backend/apps/runs/persistence.py:131` | Save `exception_columns` in the persisted result dict |
| `backend/apps/runs/persistence.py:245` | Backward-compat default `exception_columns` when loading old runs |
