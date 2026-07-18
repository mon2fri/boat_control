# Requirements — Single-Port Delivery and Final Fixes

Date: 2026-07-18  
Source: `reviews/20260718_review_convergence_third_pass.md`  
Goal: Run the complete Boat Control application from one process-facing port and close every failed
or missing acceptance item.

## Mandatory protocol

For every checklist item, the assigned worker must complete these stages in order:

1. **Follow** the initial requirement, canonical API contract, and latest convergence review.
2. **Code** the implementation and automated regression tests.
3. **Document** setup, behavior, limitations, and operational decisions.
4. **Review** the diff and record exact commands and results under `reviews/`.

Workers must not move, rename, delete, rewrite, or reorganize `planning/` or its files. They may mark
only their assigned checklist items after all four stages are complete.

## Worker B — single-port frontend delivery package

Worker B owns making the React application suitable for Django to serve on the same origin and port.
Worker B does not start a second Vite server in the final single-port workflow.

### B1. Produce a Django-consumable React build

- [ ] Configure Vite production output to a stable directory agreed with Worker A, preferably
  `frontend/dist/`, with relative or root-local asset URLs that work when served by Django.
- [ ] Ensure the production build contains no external scripts, styles, fonts, images, source maps,
  or runtime network dependencies.
- [ ] Keep `/api/` requests same-origin and remove any production dependency on port `5173`.
- [ ] Keep Vite proxying only for the optional frontend-only development command; the normal project
  launcher must use Django's single port.
- [ ] Add an automated production-build inspection that fails on external HTTP(S) asset references.

### B2. Support Django SPA routing

- [ ] Confirm all React routes work when Django returns the built `index.html` for non-API paths.
- [ ] Ensure direct navigation and refresh work for `/upload`, `/prepare`, `/rules`, `/results`,
  `/history`, `/settings`, and run-detail routes.
- [ ] Ensure client routing never captures `/api/`, Django static URLs, exported files, or health
  endpoints.
- [ ] Document the exact fallback behavior Worker A must implement, including the expected build and
  asset paths.

### B3. Make Playwright reproducible

- [ ] Add `@playwright/test` to `frontend/package.json` and `package-lock.json`; do not require an
  unrecorded one-off npm install.
- [ ] Correct Playwright's readiness URL to the implemented health endpoint.
- [ ] Configure Playwright to build React and start Django's single-port server automatically.
- [ ] Make the browser journey use the same Django-served production files users will run.
- [ ] Keep the external-origin request guard and cover upload → prepare → keys → rules → execute →
  history/load → rename → export plus deep-link refresh.
- [ ] Document the one-time browser binary installation and the repeatable test command.

### B4. Frontend acceptance evidence

- [ ] `npm test` passes with no failures.
- [ ] `npm run lint` passes; resolve the two fast-refresh warnings by moving grouping helpers out of
  the component module.
- [ ] `npm run build` passes.
- [ ] `npm run test:integration` passes using freshly generated Django fixtures.
- [ ] `npm run test:e2e` passes against Django's single port.
- [ ] Submit `reviews/20260718_review_worker_b_single_port.md` with exact output, tested routes, and
  any remaining Worker A dependency.

## Worker A — Django single-port host and all remaining failures

Worker A owns serving Worker B's production build from Django and resolving every backend, contract,
correctness, feature, performance, and delivery failure identified by the third-pass review.

### A1. Serve React and APIs from one Django port

- [ ] Configure Django to serve the compiled React assets locally on the same origin as `/api/`.
- [ ] Serve React's `index.html` for approved non-API SPA routes and deep links.
- [ ] Never apply the SPA fallback to `/api/`, static assets, exports, health endpoints, or unknown
  asset files.
- [ ] Return correct MIME types and cache headers: immutable caching for hashed assets and no-cache
  or revalidation for `index.html`.
- [ ] Return a clear startup error if the frontend build is absent, including the required build
  command.
- [ ] Update `scripts/dev.sh` so its default behavior builds when needed and starts only Django on
  `http://127.0.0.1:8000/`; provide an explicit optional `--hot` mode only if two-port Vite hot reload
  remains useful.
- [ ] Update README/setup documentation so the normal user command is `./scripts/dev.sh` followed by
  opening `http://127.0.0.1:8000/`.

### A2. Restore backend quality gates

- [ ] Update stale integration fixtures for all required `ValidationResult` metrics so the complete
  pytest suite passes.
- [ ] Fix the mypy import/plugin configuration so `uv run mypy backend` runs from the repository root
  and passes strict checking.
- [ ] Keep Ruff passing across `backend/` and `tests/`.
- [ ] Make integration tests isolate and restore configuration, uploads, results, indexes, settings,
  and sessions.

### A3. Align rule semantics with Worker B

- [ ] Adopt one rule semantic jointly with Worker B. Recommended: logic describes a required valid
  state, so a false expression is a violation.
- [ ] Update evaluator direction, null/missing/type behavior, violation details, examples, exports,
  canonical contract, fixtures, and tests consistently.
- [ ] Implement the recursive `grouping_tree` contract emitted by Worker B in serializers, YAML
  persistence, schema validation, and evaluation.
- [ ] Reject malformed trees, missing leaf references, duplicate references, cycles, and conditions
  omitted from the tree.
- [ ] Add backend and cross-boundary round-trip tests for `(A and B) or C` and `A and (B or C)`.

### A4. Implement all missing backend endpoints

- [ ] Implement validated settings read/update APIs for preset source paths, rule configuration path,
  and full-set confirmation threshold.
- [ ] Implement saved-filter list/create/update/delete APIs and atomic persistence.
- [ ] Implement configured preset/network-source listing and loading with allowed-root,
  safe-descendant, symlink, and traversal protection.
- [ ] Implement session-bound, searchable, paginated column-value APIs with starred availability.
- [ ] Implement paginated run comparison/violation detail APIs with stable ordering and total counts.
- [ ] Update Django URLs, serializers, canonical contract, tests, and frontend fixture generation for
  every endpoint.

### A5. Complete session and execution hardening

- [ ] Remove internal `file_path` values from all client responses.
- [ ] Validate selected filter values and availability against server-owned session data.
- [ ] Clean failed, abandoned, and expired uploads and document restart/multi-process session
  behavior; use a shared session store if multi-process serving is supported.
- [ ] Enforce full-set confirmation server-side using session-owned row counts and the configured
  threshold.
- [ ] Preserve explicit `rule_ids: []` as no validation rules and add an endpoint-level regression
  test.
- [ ] Retain required key-column validation for unknown, duplicate, and null keys.

### A6. Meet the large-file requirement

- [ ] Count rows without materializing all columns.
- [ ] Replace eager all-column distinct-value preparation with on-demand paginated retrieval.
- [ ] Project only key, target, filter, and rule columns before processing.
- [ ] Avoid collecting both complete CSV files twice and replace Python row loops with vectorized,
  streaming, or chunked processing where appropriate.
- [ ] Bound API detail payloads and browser-facing persistence through pagination while retaining
  complete server-side results.
- [ ] Run and document a reproducible 120k × 200 benchmark with preparation time, execution time,
  peak memory, result size, export time, and pagination behavior.

### A7. Produce complete exports

- [ ] Remove silent HTML/CSV truncation.
- [ ] Stream complete exports, or implement explicit user-selected limits that are shown in the API,
  UI, filename/metadata, and exported report.
- [ ] Retain HTML escaping and spreadsheet-formula injection protection.
- [ ] Test large results, Unicode report names, interrupted generation, and exact exported counts.

### A8. Backend and integrated acceptance evidence

- [ ] `uv run pytest -q` passes.
- [ ] `uv run ruff check backend tests` passes.
- [ ] `uv run mypy backend` passes.
- [ ] `uv run python backend/manage.py check --settings=boat_control.settings` passes.
- [ ] `./scripts/dev.sh` starts only the single Django-facing port by default.
- [ ] Root page, API health, hashed assets, all SPA deep-link refreshes, history/load, and exports
  respond correctly from port `8000`.
- [ ] Worker B's Playwright journey passes against the integrated server.
- [ ] Submit `reviews/20260718_review_worker_a_final_fixes.md` with exact outputs, benchmark results,
  security cases, and any remaining risk.

## Joint final acceptance

Owner: **Worker A and Worker B**

- [ ] Regenerate cross-boundary fixtures from the final Django implementation.
- [ ] Confirm the canonical contract, Django serializers, frontend Zod schemas, and documentation
  describe identical request/response shapes.
- [ ] Confirm the normal application uses only `http://127.0.0.1:8000/` and no second port.
- [ ] Confirm no runtime request reaches an external origin.
- [ ] Confirm pytest, Ruff, mypy, frontend tests/lint/build/integration, Playwright, and the 120k × 200
  benchmark all pass.
- [ ] Request a final independent convergence review before marking the project accepted.
