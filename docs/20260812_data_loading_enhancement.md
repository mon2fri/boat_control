# Data Loading Enhancement

**Date:** 2026-08-12
**Requirement:** `requirements/20260812_data_loading_enhancement.md`

## Scope

Page 2 data preparation now supports reuse across sessions, gives users a
five-minute loading estimate, and does not block the response on cache-file
writing.

## Implementation

### Cross-session preparation cache

- Preparation results are stored under `data/prepare_cache/`.
- Cache keys contain SHA-256 identities for both uploaded files and the
  selected comparison columns. File identity is content-based, so uploads
  with different names but identical bytes reuse the same result.
- File ordering is canonicalized in the key. Results are oriented back to the
  current file A/file B order when loaded.
- Cache writes use a temporary file followed by replacement to avoid exposing
  partial JSON files.
- Existing legacy name-based cache entries remain readable.
- Upload cleanup preserves files referenced by preparation caches. Cache files
  are not deleted when a session or upload copy is removed, so the same bytes
  can reuse the preparation result in a later session.

### Loading progress

- The preparation request remains asynchronous from the browser's perspective.
- While the request is pending, the progress indicator advances linearly from
  0% to 99% over five minutes.
- The indicator reaches 100% only after the preparation response succeeds.
- The display continues to show an explicit estimate rather than implying
  that column processing alone represents total elapsed work.

### Background cache persistence

- The backend returns the fully prepared data as soon as preparation finishes.
- Persisting that result is submitted to a bounded thread pool and is not part
  of the request's critical path.
- Cache-write failures are logged without turning a successful preparation
  request into an error.

## Files

| File | Change |
|------|--------|
| `backend/apps/files/preparation_cache.py` | Content-addressed cache read/write, orientation, and cleanup helpers |
| `backend/apps/files/filter_views.py` | Cache lookup and background persistence job |
| `backend/apps/files/services.py` | Cache-aware upload cleanup integration |
| `backend/boat_control/settings.py` | Persistent preparation-cache directory |
| `frontend/src/pages/PreparePage.tsx` | Five-minute loading estimate and cache status UI |
| `frontend/src/api/domain.ts` | Optional cache-use field on preparation results |
| `frontend/src/api/endpoints.ts` | Cache-use response mapping and reload request support |
| `frontend/src/api/wire.ts` | Preparation response schema additions |
| `tests/backend/test_preparation_cache.py` | Persistence, reversed-file, legacy-cache, and cleanup coverage |

## Verification

- Backend targeted tests: 30 passed.
- Backend full suite: 283 passed; one Windows `PermissionError` while replacing
  the OneDrive-backed results index passed when rerun in isolation.
- Frontend tests: 404 passed.
- Frontend TypeScript/Vite production build: passed.
