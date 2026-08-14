## Requirement: Prewarm filter preparation into RAM after upload

### Problem

Page 2 (Compare & validate) calls the prepare endpoint
(`FilterPreparationView`), which reads both uploaded files and computes every
common column's value set on the first request. For large uploads (~500 MB
each) this reads ~1 GB synchronously inside the request, so the first prepare
request is slow even though the work is deterministic and could have been done
as soon as the files arrived.

### Design

#### 1. Background prewarm on upload

`views.py` (`FileUploadView`) and `preset_views.py` (`PresetLoadView`) start a
background preparation job (`preparation_store.prewarm_preparation`) as soon as
the files are stored. The job waits on a `threading.Event` that the view sets
only after header inspection and session creation, so it never contends with
the inspection I/O. The view generates the `session_id` up front and passes it
to `create_session`, so the job can resolve the same session.

#### 2. In-memory value-set store

`preparation_store.py` keeps the full common-column `FilterPreparationResult` in
RAM, keyed by the ordered file identities (`pair_key`). `get_prepared` reorients
the stored result for whichever argument order the caller uses. Page 2's first
request therefore only has to drop unused columns (`restrict_columns`) instead of
re-reading files. `put_prepared`/`drop_by_key` manage entries; `drop_by_key` is
called from session cleanup (`sessions._cleanup_files`) when the last session
using a file pair goes away.

#### 3. RAM-first serving, lazy disk persistence

`FilterPreparationView` now checks the RAM store first, then the persisted
cache, then computes. The prewarm job fills RAM only; the view persists the full
common-column result to disk in the background on a RAM hit, so the cross-session
reuse behavior (see `20260814_preparation_cache_reuse_fix.md`) is preserved
without writing to the cache dir during the upload itself (keeping tests
hermetic).

#### 4. Single eager read

`filter_services.prepare_filters` reads each CSV into memory once and computes
every column's value set from those frames (`get_column_values` now takes
frames), replacing the previous per-column re-scan.

### Scope

- `backend/apps/files/preparation_store.py` (new)
- `backend/apps/files/views.py`, `preset_views.py` — prewarm trigger
- `backend/apps/files/sessions.py` — caller-provided `session_id`, RAM eviction
- `backend/apps/files/filter_views.py` — RAM-first slicing + lazy persistence
- `backend/apps/files/filter_services.py` — frame-based value extraction
- `tests/backend/test_preparation_store.py` (new), `test_filter_services.py`
- `.gitignore` — ignore `data/prepare_cache/` runtime artefacts

### Verification

1. `pytest tests/backend/test_preparation_store.py` — RAM round-trip, column
   restriction, orientation, prewarm-populates-RAM, prewarm-reuses-disk-cache.
2. Full backend test suite passes.
3. `ruff check` and `mypy` clean on the changed files.
4. Manual: upload two files, then immediately open page 2. The first prepare
   request should report `cache_used` (RAM hit) and return without re-reading
   the files.
