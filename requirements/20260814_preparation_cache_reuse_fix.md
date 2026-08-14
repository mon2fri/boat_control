## Requirement: Reuse the preparation cache for large (500 MB) uploads

### Problem

On page 2 (Compare & validate), when the user uploads two files that were used
before, the application should read the stored preparation cache instead of
re-processing the uploaded files. This works for small files but fails for
large files (~500 MB each): the application does not reuse the cache and instead
re-loads all data, including after an application restart.

### Root cause

The preparation cache is keyed by re-hashing the **entire file contents** on
every lookup and write, even though uploaded files are already content-addressed
on disk (each upload is stored as `UPLOADS_DIR/<sha256>.csv`):

1. `preparation_cache.py` `_file_identity()` opens each file and reads the whole
   thing in 1 MB chunks to compute a SHA-256 digest.
2. `_cache_key()` / `_cache_path()` call `_ordered_file_identities()` (two
   full-file hashes) just to decide which cache filename to read.
3. `load_preparation()` is invoked synchronously inside the HTTP request
   (`filter_views.py`), so for two 500 MB files this reads ~1 GB before it can
   even report a cache hit, and then reads the files again in the `file_hashes`
   branch to determine orientation (~2 GB total).
4. `save_preparation()` hashes each file twice as well (once for identities,
   once inside `_cache_path`), and runs in a background thread — so a follow-up
   request or an application restart before the write finishes results in a
   cache miss and full re-processing.

For small files the hashing cost is negligible; for 500 MB files it makes the
cache path effectively unusable, so the application appears to never reuse the
cache.

### Design

#### 1. Make file identity O(1) for content-addressed uploads

Since every upload is stored at `UPLOADS_DIR/<sha256>.csv`, the file's content
hash is already present in its filename. Derive the identity from the filename
when the file lives in `UPLOADS_DIR` and its stem is a 64-hex digest; fall back
to hashing the file bytes for any other file (presets copy into `UPLOADS_DIR` so
they hit the fast path; legacy/test files with arbitrary names still hash).

#### 2. Remove the redundant double-hash on load and save

Refactor the cache key builders to accept precomputed file identities instead of
file paths, and compute `_ordered_file_identities()` exactly once per
`load_preparation()` / `save_preparation()` call. Reuse the same identities for
both the cache-path lookup and the orientation decision.

#### 3. Eliminate the background-write race

With identities computed without I/O, `save_preparation()` becomes a tiny JSON
write (milliseconds). The current background `_CACHE_EXECUTOR.submit()` is
retained (decoupling cache writes was intentional) but no longer creates a
meaningful window for a cache miss after a request/restart.

#### 4. Backward compatibility

- Existing cache files remain valid: for content-addressed uploads the
  stem-derived identity equals the old byte-hash, so cache filenames still
  match and existing caches are reused.
- Legacy cache lookup paths (`_previous_cache_path`, `_legacy_cache_path`,
  `upload_refs` orientation) are preserved unchanged.

### Scope

- `backend/apps/files/preparation_cache.py`
- `tests/backend/test_preparation_cache.py`

No frontend changes are required: the prepare endpoint already reports
`cache_used`, and after a restart the frontend creates a fresh session that the
backend resolves against the persisted cache.

### Verification

1. `pytest tests/backend/test_preparation_cache.py` — existing tests pass and
   new tests cover the content-addressed fast path.
2. Full backend test suite passes.
3. Manual: upload two ~500 MB files twice. The second upload should log
   `Preparation cache decision: ... HIT` (`filter_views.py`) and return in
   milliseconds; repeat after restarting the application.
