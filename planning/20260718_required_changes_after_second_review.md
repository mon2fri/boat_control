# Required Changes After Second Convergence Review

Date: 2026-07-18  
Source: `reviews/20260718_review_convergence_second_pass.md`  
Status: Required before acceptance

## Working protocol

For every checklist item, the assigned worker must:

1. **Follow** the initial requirement, canonical contract, and review finding.
2. **Code** the change and regression tests.
3. **Document** the accepted behavior and any operational constraints.
4. **Review** the diff and attach exact test/build evidence.

Workers must not move, rename, delete, or reorganize `planning/` or its files. They may mark their
assigned checkboxes after all four stages are complete.

## Priority 0 — convergence blockers

### 1. Preserve an explicit empty rule selection

Owner: **Worker A and Worker B**

- [ ] Worker B: send an explicit empty `rule_ids` list when the user deselects every rule; do not
  translate it to `null` or omit it.
- [ ] Worker A: distinguish an omitted/default selection from an explicit empty list, and execute no
  validation rules for the explicit-empty case.
- [ ] Both: add a cross-boundary test proving that deselecting every rule produces zero rule results
  and does not silently run the complete rule catalog.

### 2. Establish one executable API contract

Owner: **Worker A and Worker B**

- [ ] Worker A: correct `docs/20260718_api_contract.md` so execute, detail, history, rename, export,
  and error examples exactly match real serialized responses, including the nested `result` object.
- [ ] Worker A: replace or generate the hand-written Python `SCHEMA` from authoritative serializers
  or checked-in contract fixtures.
- [ ] Worker B: make Zod schemas consume the same checked-in fixtures and remove superseded or
  reconciliation-pending contract descriptions.
- [ ] Both: add conformance tests that pass actual Django responses through the frontend Zod schemas
  and fail if either side changes independently.

### 3. Define rule violation semantics

Owner: **Worker A and Worker B**

- [ ] Worker A: decide and document whether rule logic describes an invalid state or a required valid
  state, then make evaluator behavior and violation detail text follow that decision.
- [ ] Worker B: align rule-editor labels, previews, examples, result text, and help documentation with
  the accepted semantics.
- [ ] Both: test an unambiguous example such as “status must equal active,” covering matching and
  non-matching rows through editor serialization, backend evaluation, and result rendering.

## Priority 1 — correctness and required features

### 4. Replace the grouping placeholder with an executable representation

Owner: **Worker A and Worker B**

- [ ] Worker A: define and validate an expression tree or constrained grammar that represents mixed
  `and`/`or` grouping without ambiguity; persist and evaluate it deterministically.
- [ ] Worker B: build grouping controls that serialize only that representation; do not split a free
  text expression into arbitrary whitespace tokens.
- [ ] Both: add round-trip tests for at least three conditions, including `(A and B) or C` and
  `A and (B or C)`.

### 5. Define record identity and matching behavior

Owner: **Worker A and Worker B**

- [ ] Worker A: require validated key column(s), or document and implement an approved positional
  matching strategy; remove the silent first-common-column assumption.
- [ ] Worker A: reject or explicitly handle duplicate and null keys so joins cannot multiply rows
  unnoticed.
- [ ] Worker B: add an accessible key-column selection/validation step if keyed matching is chosen.
- [ ] Both: test reordered rows, missing rows, duplicate keys, composite keys, and null keys.

### 6. Complete session and request hardening

Owner: **Worker A**

- [ ] Always derive common columns from server session metadata; never trust client-provided common
  columns during preparation or filter validation.
- [ ] Require a valid session for filter validation and verify filter values/availability server-side.
- [ ] Remove `file_path` from run-history responses.
- [ ] Clean up uploaded files after failed inspection and implement periodic cleanup for abandoned or
  expired sessions.
- [ ] Document process/restart behavior or replace process-local sessions with a shared persistent
  session store suitable for the supported deployment.
- [ ] Enforce the no-filter/full-set confirmation requirement at execution, using the configured
  threshold and session-owned row counts.

### 7. Implement settings, saved filters, and preset sources

Owner: **Worker A and Worker B**

- [ ] Worker A: implement validated settings read/update APIs for preset source paths, rule config
  paths, and the full-set confirmation threshold.
- [ ] Worker A: implement saved-filter list/create/update/delete storage and APIs.
- [ ] Worker A: implement configured preset/network-source listing and loading with allowed-root and
  safe-descendant checks; do not allow arbitrary paths or runtime URLs.
- [ ] Worker B: connect editable settings, saved-filter management, and preset upload mode to the
  implemented endpoints with loading, validation, error, and unsaved-change states.
- [ ] Both: add integration tests for permitted paths, rejected traversal/symlinks, persistence, and
  settings-driven threshold changes.

### 8. Return complete result metrics and details

Owner: **Worker A and Worker B**

- [ ] Worker A: return explicit distinct violating-row and violating-attribute counts overall and per
  rule, plus violating column/value and rule-logic details.
- [ ] Worker A: define how multiple violations on the same row/attribute are counted.
- [ ] Worker B: render server-provided counts and details rather than deriving them from key strings
  or assuming one attribute per rule hit.
- [ ] Both: test multiple rules on one row, multiple attributes on one row, duplicate values, and
  zero-result cases.

## Priority 1 — large-file requirement

### 9. Redesign filter preparation for bounded work

Owner: **Worker A and Worker B**

- [ ] Worker A: count rows without materializing all columns and stop rescanning both complete files
  once per common column.
- [ ] Worker A: implement on-demand, searchable, paginated distinct-value retrieval with an explicit
  cap/order and starred availability metadata.
- [ ] Worker B: request values only for the active column/search/page and handle partial/loading/empty
  result states.
- [ ] Both: test high-cardinality columns and confirm browser/server memory remains bounded.

### 10. Redesign execution and results for bounded memory

Owner: **Worker A and Worker B**

- [ ] Worker A: project only key, target, filter, and rule columns before processing; avoid the current
  double full-file collection and Python per-row evaluation where vectorized/streamed work applies.
- [ ] Worker A: persist complete results safely while exposing bounded paginated detail endpoints.
- [ ] Worker B: integrate server pagination with virtualized result tables; do not load all detail
  records into one browser response.
- [ ] Both: document and run a reproducible 120k × 200 benchmark with preparation latency, execution
  latency, peak server/browser memory, result size, and pagination behavior.

### 11. Make exports complete and explicit

Owner: **Worker A and Worker B**

- [ ] Worker A: stream complete HTML/CSV exports, or explicitly expose/report requested export limits;
  remove silent 500/1,000/5,000 detail truncation.
- [ ] Worker B: show export progress and server errors, and use the server-provided safe filename.
- [ ] Both: test large exports, HTML escaping, spreadsheet-formula injection, Unicode names, and
  interrupted generation.

## Priority 2 — delivery quality

### 12. Make all backend quality gates pass

Owner: **Worker A**

- [ ] Fix mypy's backend import configuration so `uv run mypy backend` works from the repository root.
- [ ] Fix all Ruff findings, including those in `tests/integration/run_e2e_workflow.py`.
- [ ] Make the workflow walker run from one documented command without callers manually discovering
  required environment variables.
- [ ] Ensure integration tests isolate and restore rule configuration, uploads, results, and indexes
  instead of mutating default runtime data.

### 13. Add a live browser-to-Django acceptance journey

Owner: **Worker A and Worker B**

- [ ] Worker A: serve the built React application and local static assets through the production
  Django configuration, including SPA deep-link fallback without intercepting `/api/` routes.
- [x] Worker B: add a real browser journey against the running Django server for upload → prepare →
  keys/targets/rules → execute-and-save → history/load → rename → export. (See
  `frontend/playwright.config.ts` and `frontend/e2e/journey.spec.ts`; 9 passing tests against the
  Django-served production React build.)
- [x] Both: assert that no runtime request targets an external origin and that a deep-link refresh
  succeeds. (Worker B journey's `page.route` guard blocks any non-local request and exercises
  `/results/<runId>` deep-link refresh.)

### 14. Clean repository and delivery artifacts

Owner: **Worker A and Worker B**

- [ ] Worker A: remove the obsolete sample `main.py` and mutable uploaded/result artifacts from the
  submitted source tree; retain controlled fixtures only under tests.
- [x] Worker B: remove root `node_modules/`, add root `node_modules/` and TypeScript build-info files
  to `.gitignore`, and keep installed packages only under the frontend workspace.
- [ ] Both: remove caches, coverage output, and generated build artifacts from delivery; review the
  final status so only intentional source, configuration templates, tests, docs, and lockfiles remain.

### 15. Complete worker handoff evidence

Owner: **Worker A and Worker B**

- [x] Each worker: mark only genuinely completed items in their assigned planning/follow-up files.
- [x] Each worker: write a final review record under `reviews/` with exact commands, outputs, known
  limits, and cross-owner dependencies. (See `reviews/20260718_review_worker_b_third_pass.md`.)
- [ ] Both: obtain a final convergence review only after pytest, Ruff, mypy, frontend tests/lint/build,
  the 120k × 200 benchmark, and the live browser journey all pass.
