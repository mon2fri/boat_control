# Worker A and Worker B Convergence Review — Third Pass

Date: 2026-07-18  
Reviewer: Primary agent  
Decision: **Development preview available; changes required before acceptance.**

## Verification results

| Gate | Result |
| --- | --- |
| Django system check | Passed |
| Combined development launcher | Passed; React and Django both responded locally |
| Backend pytest | **Failed: 2 failed, 73 passed** |
| Ruff | Passed |
| mypy | **Failed before analysis: `ModuleNotFoundError: boat_control`** |
| Frontend tests | Passed: 127 tests across 27 files |
| Frontend contract integration fixture | Passed: 21 tests |
| Frontend ESLint | Passed with 2 fast-refresh warnings |
| Frontend production build | Passed; JS 485.53 kB / 146.91 kB gzip |
| Playwright browser journey | **Failed to start: `playwright: not found`** |
| 120k × 200 benchmark | No result submitted |

The application can be inspected locally with `./scripts/dev.sh`, but the delivery gate is not green.

## Confirmed improvements

- Empty `rule_ids: []` is preserved by the frontend and treated as no rules by the backend.
- User-selected key columns are required; backend rejects missing, null, unknown, and duplicate keys.
- Preparation and filter validation derive common columns from the upload session.
- Backend returns explicit distinct violating-row/attribute metrics and violating values.
- Frontend consumes richer result metrics and supports key selection, grouping-tree editing, settings
  adapters, on-demand value adapters, paginated-detail adapters, and streaming export progress.
- Ruff passes and the obsolete sample `main.py` is removed.
- The one-terminal development launcher applies migrations and starts/stops both servers correctly.

## Blocking findings

### 1. Backend test suite is stale

Two integration tests construct `ValidationResult` without its four new required metrics. This is a
straightforward fixture update, but the backend gate is failed until the full suite passes.

Owner: **Worker A**

### 2. Rule semantics still diverge

The backend explicitly defines the rule expression as an **invalid-state predicate**: expression
`true` means violation. Worker B's UI and documentation use required-state wording such as “status
must equal active,” where expression `true` means valid. The same rule is therefore described to the
user with the opposite meaning from its execution.

Owner: **Worker A and Worker B** — choose one semantic and update evaluator, editor labels, previews,
examples, details, fixtures, and tests together.

### 3. Grouping tree is frontend-only

Worker B emits `grouping_tree`, while Worker A still stores/evaluates the legacy grouping list. The
new recursive editor can create expressions the backend ignores.

Owner: **Worker A** for serializer, model/YAML, validation, and evaluator; **Worker B** for a real
round-trip conformance test.

### 4. Frontend calls missing backend endpoints

There are still no Django routes/apps for editable settings, saved filters, preset sources,
on-demand paginated column values, or paginated run details. Frontend fallbacks make some screens
degrade gracefully, but the requested features are not integrated.

Owner: **Worker A** to implement and test the endpoints; **Worker B** to remove temporary fallbacks
where appropriate and regenerate real response fixtures.

### 5. Browser journey is not runnable and Django does not serve React

`@playwright/test` is absent from `package.json`/installed dependencies, so `npm run test:e2e` fails
with `playwright: not found`. Even after installation, the Playwright configuration targets Django
at port 8765 and requests `/`, but Django exposes only `/api/...` routes and no React static/SPA
fallback. Its readiness URL is also `/health/`, while the implemented endpoint is `/api/health/`.

Owner: **Worker A** for production React/static/SPA serving; **Worker B** for a pinned Playwright
dependency, correct readiness URL/command, browser installation documentation, and passing journey.

### 6. mypy remains broken

`uv run mypy backend` still cannot import `boat_control`. The explicit second-round quality item was
not completed.

Owner: **Worker A**

### 7. Large-file requirement remains unproven

Backend preparation still materializes full CSVs and rescans each selected column. Execution still
materializes each file before and after filtering, then performs Python row loops. No on-demand
backend value endpoint, paginated backend detail endpoint, or reproducible 120k × 200 time/memory
benchmark was submitted.

Owner: **Worker A** for bounded backend processing/endpoints/benchmark; **Worker B** to validate
bounded browser memory against those real endpoints.

### 8. Exports still truncate silently

The frontend can stream download progress, but the backend HTML/CSV builders retain hard-coded
detail truncation. The user is not told that exported results are incomplete.

Owner: **Worker A**

### 9. Planning and handoff evidence is incomplete

The required-change checklist remains entirely unchecked. Worker B supplied a handoff review that
correctly lists backend dependencies; no corresponding current Worker A handoff was submitted.

Owner: **Worker A and Worker B**

## Acceptance decision

Use the site now for visual and workflow inspection, not for correctness/performance sign-off. Final
acceptance requires: all backend/frontend checks green, aligned rule/grouping behavior, implemented
backend endpoints, a passing real browser journey against Django-served React, complete exports, and
the representative large-file benchmark.
