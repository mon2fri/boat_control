# Worker A delivery — exception tracking storage and identity

Status: **COMPLETE FOR WORKER A SCOPE / REVIEWER SIGN-OFF REQUIRED**

Branch: `work/20261103-exception-tracking-worker-a`

Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/exception-tracking/worker-a`

## Commits

| Commit | Purpose |
| --- | --- |
| `bbdc06d` | Publish the storage/identity/run-capture contract early for Workers B/C/D. |
| `0422f04` | Implement identity, SQLite repository, history/commentary semantics, and dedicated tests. |
| `cc76cbc` | Harden read-side date-table schema validation and add its regression test. |

No merge commit, no integration/main change, and no other worker's file was modified.

## Changed files

- `backend/apps/exception_tracking/__init__.py` — public re-exports for B/C.
- `backend/apps/exception_tracking/errors.py` — actionable `ValueError` hierarchy.
- `backend/apps/exception_tracking/identity.py` — canonical rule-id validation, literal
  exception ID, lossless ordered `key_columns` JSON, collision errors, strict ISO-date/table
  safety, UTC timestamp helpers.
- `backend/apps/exception_tracking/domain.py` — `ExceptionOccurrence`, `ExceptionRecord`,
  `RecordingSummary`, and derived status.
- `backend/apps/exception_tracking/repository.py` — `ExceptionTrackingRepository` plus
  module-level helpers: one table per date, ten columns, transactional upsert, cross-date
  history maintenance, commentary carry-forward, atomic commentary updates.
- `backend/apps/exception_tracking/store.py` — Worker C adapter
  `capture_exceptions(as_of_date, occurrences, *, db_path=None)`.
- `tests/backend/test_exception_tracking_identity.py` — identity/date/serialization tests.
- `tests/backend/test_exception_tracking_store.py` — schema, history, rerun, backdate,
  collision, rollback, persistence, commentary, and B/C adapter tests.
- `docs/20261103_exception_tracking_storage_contract.md` — frozen contract, signatures,
  schema, semantics, and reviewer sign-off items.

## Published interfaces

Worker B imports from `apps.exception_tracking.repository`:

```python
ExceptionTrackingRepository(database_path)
  .list_as_of_dates() -> list[date]                    # ascending
  .list_exceptions(as_of_date) -> list[ExceptionRecord]
  .get_exception(as_of_date, exception_id) -> ExceptionRecord | None
  .list_exception_history(exception_id) -> list[ExceptionRecord]
  .update_commentaries(as_of_date, updates) -> int     # changed rows, atomic
  .record_exceptions(as_of_date, occurrences) -> RecordingSummary
```

`ExceptionRecord` exposes the exact fields Worker B's `record_to_dict` expects, including
`key_columns: str`, date/datetime objects, and `status` in `New | Commented | NotCommented`.

Worker C imports from `apps.exception_tracking.store`:

```python
capture_exceptions(
    as_of_date,
    occurrences,  # mappings with exception_rule_identifier, ordered key_columns pairs,
                  # optional exception_timestamp/commentary
    *,
    db_path=None,
) -> RecordingSummary
```

Worker C's exact payload shape (`key_columns` as ordered `(name, value)` pairs) is covered by
tests. The repository is the single write path; there is no second storage implementation.

## Contract decisions

1. **Literal ID.** `exception_id = <CBR1_...>_<value1>_<value2>...`. No `exception_` prefix,
   no hashing, escaping, or case folding. Canonical rule identifiers are required; `R001`
   and missing identifiers are rejected with an actionable error.
2. **Lossless keys.** `key_columns` stores a compact JSON object in configured key order,
   e.g. `{"id":"ABC","type":"123"}`. Unicode is stored as UTF-8, not escaped. This matches
   Worker B's published wire example.
3. **Collision handling.** Two different key tuples that produce the same literal ID (for
   example `("a_b","c")` and `("a","b_c")`) raise
   `ExceptionIdentityCollisionError`. The check covers the incoming batch, the target table,
   and every other existing date table. Nothing is written on collision.
4. **Schema.** One table per date named `exceptions_YYYYMMDD`, generated only from a strictly
   validated ISO date and defensively quoted. Exactly the ten requested columns exist; a
   pre-existing table with missing or unexpected columns raises `SchemaMismatchError` on both
   write and read.
5. **History.** `first/last_seen_as_of_date` are min/max as-of dates across all date tables;
   `first/last_seen_timestamp` are min/max capture timestamps across all tables. A backdated
   run updates the metadata in every affected table.
6. **Timestamps.** Stored as timezone-aware ISO-8601 UTC text. Naive caller timestamps are
   rejected; legacy naive values read from disk are interpreted as UTC. `exception_timestamp`
   is the latest capture for that date and same-date reruns move it monotonically.
7. **Status.** Derived, never stored: nonblank commentary → `Commented`; otherwise the
   earliest occurrence → `New`; later occurrences → `NotCommented`.
8. **Commentary.** A new occurrence with no supplied commentary inherits the most recent
   strictly-earlier occurrence's commentary, including an explicit blank. A same-date rerun
   with omitted commentary preserves the stored value. `""` is an explicit clear. Explicit
   edits apply to the selected date and are never retroactively overwritten; later captures
   carry the most recent earlier value forward.
9. **Reruns.** Same-date captures upsert in one transaction, never delete historical rows,
   never delete omitted exceptions, and preserve commentary.
10. **Paths.** The repository accepts an injected resolved path and creates its parent on
    first write. `default_database_path(project_root)` returns
    `<project_root>/data/exception_tracking.db`. Reads against a missing file return empty
    results without creating the file. Worker B owns settings persistence and host-path
    validation.
11. **Transactions.** Every write uses `BEGIN IMMEDIATE`; any validation, collision, schema,
    or SQLite failure rolls the whole call back.

## Requirement coverage (Worker A scope)

- Requirement 1 (unified literal exception ID): **complete**, including composite, Unicode,
  null/missing, duplicate, and underscore-ambiguity cases.
- Requirement 3 (separate SQLite file, one table per date, ten columns): **complete**;
  every requested column is physically present with the requested declared type.
- Requirement 5 (three statuses): **complete** in storage/read models.
- Requirement 8 backend update path (validate IDs and update commentary atomically):
  **complete** at the storage layer; Worker B owns workbook parsing and HTTP validation.
- Requirements 2, 4, 6, 7, 9: Worker A supplies the storage/read/update primitives only;
  date propagation, settings, API/workbook, and UI remain with Workers B/C/D.

No known requirement gap inside Worker A's assigned scope.

## Verification

```bash
uv run pytest -q tests/backend/test_exception_tracking_identity.py tests/backend/test_exception_tracking_store.py
# 67 passed

uv run ruff check backend/apps/exception_tracking tests/backend/test_exception_tracking_identity.py tests/backend/test_exception_tracking_store.py
# All checks passed

uv run mypy backend/apps/exception_tracking
# Success: no issues found in 6 source files

uv run python backend/manage.py check
# System check identified no issues (0 silenced).

uv run python backend/manage.py makemigrations --check --dry-run
# No changes detected

git diff --check
# clean
```

Full-suite result:

```bash
uv run pytest -q tests/backend tests/contracts tests/integration
# 1 failed, 349 passed
```

The single failure is pre-existing at baseline `aabcf5c` and unrelated to this work:
`tests/backend/test_rule_identifier_release_review.py::test_migration_reconciles_later_file_edits`
fails with `KeyError: 'rule_id'`. It was reproduced in a detached worktree at `aabcf5c` before
any Worker A change.

Full-tree checks also retain pre-existing findings outside this scope:

- `uv run ruff check backend tests` reports 5 existing E501/import issues in
  `tests/backend/test_rule_catalog_api.py` (and related rule test data).
- `uv run mypy backend` reports 2 existing errors in
  `backend/apps/rules/repository.py:218` and `backend/apps/configs/views.py:318`.

Neither list includes a file changed by this delivery.

## Integration notes for the reviewer

- Worker B's `get_repository()` imports `apps.exception_tracking.repository` and constructs
  `ExceptionTrackingRepository(database_path)`; that exact interface is provided.
- Worker B's `record_to_dict()` expects `date`/`datetime` objects and the exact status
  strings; `ExceptionRecord` provides them.
- Worker C's `capture_exceptions()` seam is provided with its published payload shape.
  Worker C's delivery reports a real A/B integration run against Worker A commit
  `0422f04` (450 passed, 1 pre-existing failure); this delivery's later `cc76cbc`
  commit only adds read-side schema validation and does not change any interface or
  stored format. The reviewer should rerun C's integration after cherry-picking all
  three A commits.
- Worker C has already aligned its path resolver to Worker B's
  `get_exception_tracking_path` (C commit `a5ea453`); the earlier provisional
  `get_exception_tracking_db_path` name is no longer present in C's current branch.
  No resolver-name mismatch remains.
- No live `data/exception_tracking.db` was created or read. The untracked
  `data/prepare_cache/` directory was left untouched and not committed.
- Reviewer-owned follow-up: `.gitignore` currently ignores `data/*.sqlite3` but not
  `data/exception_tracking.db`. Add that default path (and any future journal/WAL siblings)
  so a developer run cannot accidentally stage live tracking data. This worker did not
  modify root configuration.

## Reviewer sign-off items

1. Literal ID has no `exception_` prefix.
2. `key_columns` is an ordered JSON object, matching Worker B's wire example.
3. `exception_timestamp` is the latest capture for the date; history timestamps are min/max.
4. Explicit commentary edits apply to the selected date only; later existing occurrences are
   not retroactively rewritten. New occurrences carry the most recent earlier value forward.
5. Empty key values are rejected as missing identity data.
6. Collision detection scans every existing date table.
7. Table naming `exceptions_YYYYMMDD` and exact ten-column schema are accepted.
