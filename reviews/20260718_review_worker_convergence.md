# Worker A and Worker B Convergence Review

Date: 2026-07-18  
Reviewer: Primary agent  
Decision: **Changes required — the submissions do not yet form a working integrated product.**

## Scope reviewed

- Initial requirement and both worker task lists.
- Worker A's Django services, APIs, tests, and backend documentation.
- Worker B's React client, tests, documentation, and frontend handoff review.
- The actual frontend request/response schemas against the actual Django URL and serializer
  contracts.

Worker B's `reviews/20260718_review_frontend_handoff.md` accurately identifies the primary contract
split. Worker A supplied backend/API documents but no backend review artifact. Neither worker marked
their task checklist, and no end-to-end test launches the React client against the Django API.

## Verification evidence

| Check | Result |
| --- | --- |
| Backend tests | 64 passed |
| Backend coverage | 84% overall |
| Ruff | Passed |
| mypy | **Failed to start** because `boat_control` is not on mypy's import path |
| Frontend tests | 61 passed in 17 test files |
| Frontend ESLint | Passed |
| Frontend production build | Passed |

These results show that each half is internally testable. They do not establish convergence because
the frontend tests mock the frontend's expected contract rather than exercise Django's contract.

## Findings

### Critical — no usable frontend/backend workflow

The React API client and Django API differ on upload field names and response shape, session/file
identity, filter operators and endpoints, rule schemas and mutation responses, execution endpoint
and result shape, rename method/body, export flow, and settings/saved-filter/preset endpoints. The
first upload call sends `file1`/`file2`, while Django requires `file_a`/`file_b`, so the real workflow
fails at its first server operation.

Adopt the existing Django snake_case wire vocabulary as the temporary canonical base, with an
opaque upload session replacing exposed paths as described below. Worker A must publish one
OpenAPI-like contract fixture; Worker B must map that wire model to the existing camelCase UI model.

### Critical — execution is not automatically persisted

`ExecuteComparisonView` returns the computation result directly and never calls `save_run`.
Consequently execution returns no run ID or report metadata, history remains disconnected from new
runs, and the UI cannot rename or export the result. Execution and persistence must be one service
operation from the caller's perspective, with failure behavior defined and tested.

### Critical — client-controlled filesystem paths

Inspection, filter preparation, and execution accept arbitrary path strings and check only whether
they exist. A local caller can make the application read any CSV-accessible path. Upload should
return an opaque session ID; the server must resolve IDs only to files inside the configured upload
root. Preset locations require an explicit configured allowlist and safe descendant checks.

### High — comparison/validation correctness defects

- `ncontains` filters File A but leaves File B unfiltered.
- `column_vs_column` rules are stored but execution compares against `target_value` as a literal;
  the second column is never read.
- Rule execution labels a row as a violation when the configured expression evaluates true. The
  product semantics must explicitly define whether logic describes the invalid state or the required
  valid state, then code, UI wording, examples, and tests must agree.
- The first common column is silently treated as a unique record key. Duplicate keys create
  many-to-many joins and incorrect change counts; the initial requirement never defines identity.
- Targets and filter columns/values are trusted again at execution rather than validated against the
  server-derived common-column/value set.
- String operators assume string columns, while CSV inference may produce numeric types.

### High — implementation does not meet the large-file constraint

Filter preparation materializes each entire CSV to count rows, then scans both files again for each
common column. With 200 columns this can perform roughly 402 full scans and returns every distinct
value for every column in one response. Execution then materializes both full filtered tables and
iterates rows in Python. This contradicts the planned projected/lazy processing and has no submitted
120k × 200 benchmark evidence.

Column values should be fetched on demand or in bounded pages, row counts should use a single scan,
projection should occur before collection, and comparison/validation should remain vectorized or
streamed with paginated details.

### High — rule and run persistence are incomplete

- Rule grouping is stored but never evaluated.
- Rule writes and run index updates have no process/thread locking, so concurrent changes can be
  lost even though individual file replacement is atomic.
- Renaming changes index metadata and the filename but does not update `report_name` inside the run
  JSON; reloading returns the old name.
- Retention deletes a result before committing the new index, which is not recoverable if index
  persistence fails.
- Remote rules fetch arbitrary URLs during runtime. This conflicts with the local-only runtime goal
  and introduces server-side request forgery risk. A configured local/network file allowlist is the
  safer interpretation of the requirement.

### Medium — required settings, filters, presets, and production serving are absent

The frontend calls settings, saved-filter, and preset endpoints that Django does not expose. Django
also has no submitted production route/static setup that serves the built React application. The
settings page is read-only even though the requirement permits user configuration.

### Medium — result data cannot satisfy all requested statistics

The backend reports total rule hits, but does not clearly provide distinct violating row count and
violating attribute count overall and per rule. Multiple rules on one row can overcount the required
row metric. Rule details also do not identify the violating attribute/value pair needed by the UI and
exports.

### Medium — repository and delivery hygiene

Generated uploads/results, caches, coverage data, TypeScript build-info files, and `dist/` are present
in the worktree. The ignore file covers several of these, but submitted runtime fixtures should be
kept under explicit test fixtures and delivery evidence should not rely on mutable `data/` content.
The original sample `main.py` also remains unrelated to the Django entry point.

## Convergence gate

The work is ready for acceptance only when all of the following pass:

1. One canonical contract is checked into `docs/` and represented by backend serializers plus
   frontend Zod adapters.
2. A real integration test covers upload → prepare → select rules → execute-and-save → load → rename
   → export against Django, without mocked API responses.
3. The correctness and path-safety findings above have regression tests.
4. A representative 120k × 200 benchmark records runtime and peak memory with bounded detail/value
   payloads.
5. pytest, Ruff, mypy, frontend lint/tests/build, and the integrated workflow all pass.

The detailed owner lists are in `planning/20260718_followups_worker_a.md` and
`planning/20260718_followups_worker_b.md`.
