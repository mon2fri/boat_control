# Follow-ups for Worker A

Date: 2026-07-18  
Owner: Worker A  
Constraint: Do not move, rename, delete, rewrite, or reorganize `planning/` or its files.

For every item, follow the requirement/canonical contract, code the change and regression tests,
document the final behavior, and review the diff plus test evidence.

## Priority 0 — unblock convergence

- [ ] Publish the canonical snake_case wire contract, including examples and error responses for
  upload sessions, preparation, rules, execute-and-save, history, detail, rename, and export.
- [ ] Replace returned/accepted arbitrary upload paths with opaque session IDs resolved beneath
  `UPLOADS_DIR`; add traversal, symlink, forged-ID, missing-file, and expiry tests.
- [ ] Make run execution automatically save its result and return a complete persisted result with
  `run_id`, report name, timestamps, source names, summaries, rule results, and change details.
- [ ] Implement the missing settings, saved-filter, and configured preset-source endpoints, or
  explicitly remove them from the accepted scope with an approved requirement decision.
- [ ] Provide contract fixtures or schema tests that Worker B can consume, then pair on a live
  Django/React workflow test.

## Priority 1 — correctness and security

- [ ] Apply `ncontains` to both files and add asymmetric regression cases.
- [ ] Implement `column_vs_column`, condition grouping, null/type semantics, and all documented
  operators; reject rather than silently ignore malformed or missing columns.
- [ ] Agree and document whether rule logic expresses a violation or a valid invariant; align
  execution, examples, detail text, and UI labels.
- [ ] Define record identity. Require validated key column(s), or explicitly implement positional
  matching; test duplicates, missing rows, reordered rows, and null keys.
- [ ] Revalidate targets, filters, selected values, and rule columns from server session metadata at
  execution time. Never trust client-provided `common_columns`.
- [ ] Restrict preset/network paths to configured roots. Replace arbitrary URL rule loading with a
  configured local/network file path, or implement a strict allowlist if URL loading is approved.
- [ ] Add safe error translation so malformed CSVs, Polars errors, corrupt YAML/JSON, and export
  failures return stable 4xx/5xx JSON without leaking host paths.

## Priority 1 — persistence and results

- [ ] Update the persisted JSON body as well as index/filename during rename; make collision and
  rollback behavior explicit.
- [ ] Add locking or another concurrency-safe store for rule and run mutations; make retention
  recoverable if index persistence fails.
- [ ] Calculate distinct violating rows and violating attributes overall and per rule, and include
  attribute/value details needed by the UI and exports.
- [ ] Stream complete exports or explicitly paginate them; do not silently truncate HTML/CSV at
  500/1,000/5,000 records.

## Priority 2 — performance and delivery

- [ ] Replace all-columns eager filter preparation with on-demand/paginated distinct values and a
  single efficient row-count strategy.
- [ ] Project common key/target/rule columns before collection and vectorize or stream comparisons
  and validations; bound persisted and response detail sizes with pagination.
- [ ] Run and document a 120k × 200 benchmark including peak memory, preparation latency, execution
  latency, result size, and the test-data generation method.
- [ ] Fix mypy invocation/import configuration so the documented strict check runs successfully.
- [ ] Configure Django to serve the production React build and verify no external runtime requests.
- [ ] Move mutable generated examples to test fixtures, clean delivery artifacts, remove the sample
  `main.py`, and add a backend review/handoff record with exact commands and results.
