# Requirements — Worker C Dependency Resolution and A/B Release Gate

Date: 2026-07-18  
Goal: Remove cross-worker ambiguity before Worker A and Worker B continue the final implementation.

This requirement controls sequencing for
`planning/20260718_requirements_single_port_and_final_fixes.md`. It does not remove that document's
scope. Worker C must first publish and validate the shared dependency package described here. Worker
A and Worker B must not implement or independently change a shared interface until Worker C marks
the corresponding gate ready.

## Mandatory working protocol

For every checklist item, the assigned worker must:

1. **Follow** the initial requirement and all convergence reviews.
2. **Code** executable schemas, fixtures, or integration scaffolding where required.
3. **Document** the decision, rationale, examples, compatibility behavior, and ownership.
4. **Review** the artifacts for contradictions and attach verification evidence.

No worker may move, rename, delete, rewrite, or reorganize `planning/` or its files. Workers may mark
only their assigned checkboxes after all four stages are complete.

## Roles

- **Worker C — integration architect and dependency resolver:** owns shared decisions, canonical
  contracts, cross-boundary fixtures, delivery topology, and release gates. Worker C does not replace
  Worker A's backend implementation or Worker B's frontend implementation.
- **Worker A — backend implementer:** implements the frozen Django/API/data contract released by
  Worker C.
- **Worker B — frontend implementer:** implements the frozen React/wire/build contract released by
  Worker C.

## Phase 1 — Worker C dependency-resolution package

Worker A and Worker B may inspect and comment during this phase, but must not merge implementation
based on provisional interfaces.

### C1. Audit all current sources of truth

Owner: **Worker C**

- [ ] Compare the initial requirement, all files under `docs/`, backend serializers/URLs, frontend
  Zod schemas/mappers, integration fixtures, Playwright configuration, and the three convergence
  reviews.
- [ ] List every contradiction, missing decision, obsolete contract, fallback, and assumed endpoint.
- [ ] Create `reviews/20260718_review_worker_c_dependency_audit.md` with file/line evidence and the
  proposed resolution for each conflict.
- [ ] Identify which current documents will remain authoritative and clearly mark superseded
  documents as historical; do not delete review history.

### C2. Freeze rule semantics and grouping

Owner: **Worker C**, with written acknowledgement from **Worker A and Worker B**

- [ ] Choose one rule meaning. Recommended decision: logic describes a required valid state;
  conditions select applicable rows, and an applicable row violates the rule when mandatory logic
  evaluates false.
- [ ] Define null, missing-column, numeric conversion, string comparison, and non-applicable-row
  behavior.
- [ ] Define one recursive `grouping_tree` JSON/YAML grammar with `leaf`, `and`, and `or` nodes.
- [ ] Define leaf identity, condition ordering, maximum depth/node count, and validation for missing,
  duplicate, unknown, or cyclic references.
- [ ] Provide truth tables and complete examples for `(A and B) or C` and `A and (B or C)`.
- [ ] Publish the decision in `docs/20260718_contract_rule_evaluation.md`.

### C3. Freeze the complete API contract

Owner: **Worker C**

- [ ] Publish one canonical contract for health, upload sessions, preparation, filter validation,
  paginated column values, target/key validation, rule CRUD, settings, saved filters, preset sources,
  execute-and-save, history, paginated details, rename, and exports.
- [ ] Define method, route, authentication/CSRF behavior, headers, request schema, success response,
  pagination, stable ordering, limits, and error envelope for every endpoint.
- [ ] Preserve these decisions unless explicitly superseded: snake_case wire fields, opaque session
  IDs, explicit `rule_ids: []` meaning no rules, user-selected key columns, and nested persisted
  `result` documents.
- [ ] Remove `file_path` and every other server-internal path from client responses.
- [ ] Define session expiry, full-set confirmation, preset allowed roots, export completeness, and
  backward-compatibility behavior.
- [ ] Publish the canonical document as `docs/20260718_contract_api_final.md`.

### C4. Create executable contract artifacts

Owner: **Worker C**

- [ ] Add a versioned machine-readable schema or canonical JSON fixture set under
  `tests/contracts/`; prose alone is insufficient.
- [ ] Include valid and invalid examples for every endpoint plus rule/grouping examples.
- [ ] Add a backend contract test that validates Django serializer output against these artifacts.
- [ ] Add a frontend contract test that validates the same artifacts through Zod and mappers.
- [ ] Ensure contract tests fail on missing/extra required fields, wrong nesting, incorrect pagination,
  or mismatched error envelopes.
- [ ] Assign contract version `1` and define the process for intentional incompatible changes.

### C5. Freeze the single-port delivery topology

Owner: **Worker C**

- [ ] Define `frontend/dist/` as the production build handoff unless the audit proves another path is
  necessary.
- [ ] Define Django's root page, hashed asset paths, SPA fallback allow/deny behavior, API prefix,
  health URL, cache headers, MIME behavior, and missing-build error.
- [ ] Define the normal launcher behavior: `./scripts/dev.sh` exposes only
  `http://127.0.0.1:8000/`; optional Vite hot reload must require an explicit `--hot` flag.
- [ ] Define Playwright's server command, readiness URL, base URL, isolated data directories, browser
  dependency, and external-network guard.
- [ ] Publish `docs/20260718_contract_single_port_delivery.md` with a request-routing table.

### C6. Define large-file and pagination budgets

Owner: **Worker C**

- [ ] Define maximum page sizes, default page sizes, stable cursors/offsets, search behavior, and
  response caps for distinct values and result details.
- [ ] Define which result data must remain complete server-side and which API views are paginated.
- [ ] Define the 120k × 200 benchmark generator, representative cardinality, duplicate/null cases,
  machine/environment reporting, timing method, and peak-memory measurement.
- [ ] Set explicit pass/fail budgets or, if hardware-independent limits are impossible, require a
  recorded baseline and prohibit unbounded materialization/payloads.
- [ ] Publish `docs/20260718_contract_performance_and_pagination.md`.

### C7. Publish the A/B implementation matrix

Owner: **Worker C**

- [ ] Produce `docs/20260718_handoff_worker_matrix.md` mapping every contract route, schema, fixture,
  component, backend service, test, and document to exactly one implementation owner.
- [ ] Identify joint tests separately; avoid assigning one implementation file to both workers.
- [ ] List the exact artifacts Worker A must deliver before Worker B removes each fallback.
- [ ] List the exact frontend build artifacts Worker B must deliver before Worker A completes static
  serving.
- [ ] Record the frozen contract commit hash and file hashes in the handoff matrix.

### C8. Worker C release gate

Owner: **Worker C**

- [ ] Run all new backend and frontend contract tests successfully.
- [ ] Verify the final API contract, machine-readable artifacts, Zod schemas, examples, and routing
  topology contain no known contradictions.
- [ ] Obtain written acknowledgement from Worker A and Worker B in
  `reviews/20260718_review_worker_c_contract_acknowledgement.md`.
- [ ] Publish `reviews/20260718_review_worker_c_release_gate.md` with status `READY` or `NOT READY`,
  exact commands/results, frozen commit hash, and open risks.
- [ ] Mark the release `READY` only when Workers A and B can implement without making any shared
  contract decision themselves.

## Phase 2 — Worker A implementation after C gate is READY

Worker A begins only after C8 is `READY`.

### A1. Implement the frozen backend contract

Owner: **Worker A**

- [ ] Implement every endpoint, serializer, error envelope, pagination rule, session rule, rule
  semantic, grouping tree, export rule, and security constraint frozen by Worker C.
- [ ] Do not change shared wire shapes. Submit a change request to Worker C if implementation exposes
  a contract defect.
- [ ] Remove temporary or legacy backend paths only as allowed by Worker C's compatibility decision.
- [ ] Make all backend and shared contract tests pass.

### A2. Implement single-port Django hosting

Owner: **Worker A**, consuming Worker B's B2 build artifact

- [ ] Serve Worker B's production build, static assets, approved SPA fallbacks, APIs, health, and
  exports from port `8000` exactly as frozen by Worker C.
- [ ] Update `scripts/dev.sh` to the frozen default single-port behavior and optional `--hot` mode.
- [ ] Add routing, cache, MIME, missing-build, deep-link, and API-non-interception tests.

### A3. Resolve all backend failures and missing features

Owner: **Worker A**

- [ ] Make pytest, Ruff, mypy, Django check, isolated workflow generation, and contract tests pass.
- [ ] Implement bounded CSV preparation/execution and the frozen pagination endpoints.
- [ ] Implement settings, saved filters, preset sources, session cleanup, full-set confirmation,
  complete exports, explicit result metrics, and all security requirements.
- [ ] Run and document Worker C's 120k × 200 benchmark protocol.
- [ ] Submit `reviews/20260718_review_worker_a_after_c_gate.md` with exact evidence.

## Phase 2 — Worker B implementation after C gate is READY

Worker B begins only after C8 is `READY`.

### B1. Implement the frozen frontend contract

Owner: **Worker B**

- [ ] Align all Zod schemas, mappers, hooks, forms, rule/grouping controls, settings, presets, filters,
  pagination, result metrics, exports, and error handling with Worker C's contract artifacts.
- [ ] Do not add speculative fallbacks for missing final endpoints. Track backend readiness through
  the handoff matrix instead.
- [ ] Make all frontend and shared contract tests pass.

### B2. Produce the frozen single-port build artifact

Owner: **Worker B**, consumed by Worker A's A2

- [ ] Produce the exact build directory and asset layout frozen by Worker C.
- [ ] Keep all production API calls same-origin and all runtime resources local.
- [ ] Provide an automated build manifest or check Worker A can use to detect a valid build.
- [ ] Notify Worker A only when the artifact passes production build inspection.

### B3. Complete browser acceptance

Owner: **Worker B**, after Worker A completes A1 and A2

- [ ] Pin Playwright dependencies and run the real browser journey against Django's port `8000`.
- [ ] Cover the complete workflow, deep-link refresh, external-network blocking, pagination, settings,
  presets, saved filters, grouping, empty rule selection, rename, and complete exports.
- [ ] Remove superseded fixture fallbacks and regenerate final cross-boundary fixtures.
- [ ] Submit `reviews/20260718_review_worker_b_after_c_gate.md` with exact evidence.

## Phase 3 — Worker C final integration review

Worker C resumes after Worker A and Worker B report completion.

### C9. Audit implementation against the frozen contract

Owner: **Worker C**

- [ ] Compare every implemented Django response and frontend request/schema to contract version 1.
- [ ] Reject undocumented divergence; do not silently update the contract to match accidental code.
- [ ] Verify rule semantics/grouping with cross-boundary truth-table tests.
- [ ] Verify pagination stability, session security, preset path safety, complete exports, and no
  internal-path leakage.

### C10. Run the final acceptance matrix

Owner: **Worker C**

- [ ] Backend pytest, Ruff, mypy, and Django checks pass.
- [ ] Frontend unit, lint, type/build, integration, and Playwright checks pass.
- [ ] Single-port launcher exposes only port `8000` by default and all SPA routes refresh correctly.
- [ ] No runtime request reaches an external origin.
- [ ] The 120k × 200 benchmark meets Worker C's frozen budgets/baseline requirements.
- [ ] Repository status contains no generated dependencies, caches, uploads, results, databases, or
  build artifacts intended to remain untracked.

### C11. Final decision

Owner: **Worker C**

- [ ] Publish `reviews/20260718_review_worker_c_final_acceptance.md` with a clear `PASS` or `FAIL`,
  exact evidence, unresolved risks, and the reviewed commit hashes.
- [ ] Mark `PASS` only if no mandatory gate is failed, skipped, or satisfied solely by a mock/fallback.
