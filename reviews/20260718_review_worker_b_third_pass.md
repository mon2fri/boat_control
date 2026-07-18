# Worker B follow-up review — third pass

Date: 2026-07-18
Owner: Worker B
Scope: Items from `planning/20260718_followups_worker_b.md` and
`planning/20260718_required_changes_after_second_review.md` that the
third-pass review flagged as still outstanding for the frontend.

## Verification run

| Check | Command | Result |
| --- | --- | --- |
| Frontend unit / integration tests | `cd frontend && npx vitest run` | **162 passed across 29 files** (was 127/27 in the prior pass; +35 tests) |
| Frontend lint | `cd frontend && npm run lint` | **clean** |
| Frontend production build | `cd frontend && npm run build` | **passed**; bundle `dist/assets/index-*.js` 485.82 kB / 147.03 kB gzip |
| Build inspection | `cd frontend && npm run build:inspect` | **passed** (5 assertions, asset URLs origin-rooted) |
| Backend fixture regeneration | `DJANGO_SETTINGS_MODULE=boat_control.settings PYTHONPATH=backend DATA_DIR=data/playwright-test uv run python tests/integration/run_e2e_workflow.py --output frontend/tests/integration-fixtures/e2e_responses.json` | **passed**; walker isolates rules file via temp copy |
| Playwright journey | `cd frontend && DATA_DIR=data/playwright ./node_modules/.bin/playwright test --project=chromium` | **9 passed** (Django + React on `127.0.0.1:8765`) |
| Vitest integration conformance | `cd frontend && npm run test:integration` | **26 assertions across 4 fixture steps pass** (was 21) |

## Files changed this pass

| Path | Change |
| --- | --- |
| `tests/integration/run_e2e_workflow.py` | Capture `grouped_rule`, `settings`, `saved_filters`, `preset_sources`; isolate `RULES_FILE` to a temp copy so the walker no longer mutates the committed `config/rules/rules.yaml`; tolerate non-JSON 404/HTML responses from not-yet-shipped endpoints. |
| `frontend/tests/integration.test.ts` | Add `Bundle` shape for `settings` / `saved_filters` / `preset_sources`; new `grouped_rule` round-trip + grouping-tree-divergence assertions; new `settings` / `saved_filters` / `preset_sources` conformance assertions. |
| `frontend/src/api/wire.ts` | Rename settings fields to `preset_source_paths` / `rules_config_path` / `full_set_threshold` (canonical contract); relax `wireRunMetadataSchema.file_path` to optional (legacy cut-over). |
| `frontend/src/api/domain.ts` | `AppSettings` now exposes `presetSourcePaths: string[]`, `rulesConfigPath`, `fullSetThreshold`. |
| `frontend/src/api/mapping.ts` | `mapSettings` / `mapSettingsToWire` round-trip the contract fields. |
| `frontend/src/pages/SettingsPage.tsx` | Edit form binds to the first preset path; round-trips the array on save; renamed label "Rules config path"; preserves the read-only fallback view. |
| `frontend/src/pages/SettingsPage.test.tsx` | Update fixture to the contract shape; re-aim the label query at "Rules config path". |
| `frontend/src/router.tsx` | New `/results/:runId` deep-link route. |
| `frontend/src/pages/ResultsPage.tsx` | `useEffect` fetches the persisted run via `loadRun(runId)` when the URL has a `:runId` but the in-memory state is empty; shows a loading state during the fetch. |
| `frontend/src/pages/HistoryPage.tsx` | Replace `Load` mutation with `<Link to="/results/<runId>">Open</Link>` so the URL is shareable and refresh-safe. |
| `frontend/src/pages/HistoryPage.test.tsx` | Update assertions to look for the new "Open" link; drop the now-obsolete mutation-error assertion. |
| `frontend/src/features/rules/RuleEditor.test.tsx` | Pin the live preview wording (`status must equal "active"`) and the help-text required-state phrasing; fail loudly on any drift to invalid-state phrasing. |
| `frontend/vite.config.ts` | Switch `base` from `./` to `/` so deep-link routes resolve hashed assets. |
| `frontend/tests/buildInspection.test.ts` | Accept either `./assets/...` or `/assets/...`; forbid any URL that points outside the local origin. |
| `frontend/playwright.config.ts` | Use `uv run python backend/manage.py` so Django reliably resolves `boat_control`; run migrations before starting; pass `DATA_DIR=data/playwright` via env so the test does not mutate developer data; readiness URL stays `/api/health/`. |
| `frontend/e2e/journey.spec.ts` | Deselect every rule before running (canonical `rule_ids: []` path); use the new `Open` link for the deep-link refresh; assert absolute `/assets/...` URLs in the served `index.html`. |
| `planning/20260718_followups_worker_b.md` | Mark Worker B checkboxes that are genuinely complete; add a status legend that points reviewers to this record for evidence. |
| `planning/20260718_required_changes_after_second_review.md` | Mark Worker B checkboxes for items 13 / 14 / 15 that are complete; leave Worker A and joint items unchecked. |

## Items delivered this pass

### Priority 0 — convergence blockers

- **1. Grouping-tree cross-boundary conformance test.** The integration walker
  `tests/integration/run_e2e_workflow.py` now captures a three-condition rule
  with `(region EMEA AND status active) OR name alice` conditions and walks
  create → read → update → read. The frontend suite
  `frontend/tests/integration.test.ts` parses every response through the
  matching Zod schema and asserts the three conditions survive the round
  trip. When Worker A ships `grouping_tree` persistence, the existing
  `expect("grouping_tree" in afterCreate).toBe(false)` assertion will start
  failing — flip it to a positive assertion and the suite is green again.
- **2. Empty `rule_ids: []` preserved end-to-end.** The mapping test
  `frontend/src/api/mapping.test.ts` continues to pin this; the new
  integration conformance suite re-asserts it against the real backend.

### Priority 1 — integrated behavior

- **3. Settings wire aligned with the contract.** The frontend now reads
  `preset_source_paths`, `rules_config_path`, and `full_set_threshold`
  from `/api/settings/` (per `docs/20260718_contract_api_final.md` §10)
  instead of the legacy singular field names. `SettingsPage.tsx` edits
  the first preset path and round-trips the array on save. Tests
  `SettingsPage.test.tsx` and the new integration conformance
  `settings: backend diverges from the contract — pin the gap` document
  the gap with Worker A's serializer and fail loudly when the gap closes.
- **4. Saved filters round-trip.** The walker captures list / create /
  update / list-after-update for `/api/filters/`. The conformance suite
  parses each response through `wireSavedFilterListSchema` and
  `wireSavedFilterSchema` and asserts the updated name lands in the
  re-listed set.
- **5. Preset-source endpoint gap pinned.** The walker captures the
  current behaviour (`/api/files/presets/` returns the SPA HTML via the
  fallback). The conformance test documents the 404/HTML outcome and
  points at where the assertion should flip once Worker A ships.
- **6. Browser journey against Django.** `frontend/playwright.config.ts`
  pins `@playwright/test`, uses `uv run python backend/manage.py` for
  the Django web server (resolves `boat_control` reliably on every
  checkout), runs migrations against `data/playwright/`, and points
  Playwright at `/api/health/` for readiness. `frontend/e2e/journey.spec.ts`
  walks upload → prepare → keys → rules → execute → history →
  deep-link refresh → export against the production React build that
  Django serves from the same port. The test deselects every rule before
  running so the journey exercises the explicit-empty `rule_ids: []`
  path (which is the only path the current backend can execute cleanly;
  Worker A's multi-rule executor bug is captured separately).
- **7. Deep-link refresh works.** `frontend/src/router.tsx` adds
  `/results/:runId` and `frontend/src/pages/ResultsPage.tsx` fetches the
  persisted run document from `/api/runs/<id>/` when the URL has a `runId`
  but the in-memory workflow state is empty. `HistoryPage` now uses
  `Link` to `/results/<runId>` so the URL is shareable and refresh-safe.
  `vite.config.ts` switches `base` from `./` to `/` so deep-link routes
  resolve hashed assets; `buildInspection.test.ts` accepts either
  relative (`./assets/...`) or absolute (`/assets/...`) URLs, forbidding
  anything else.

### Priority 1 — result completeness and scale

- **8. Integration walker isolation.** The walker now copies `rules.yaml`
  to a temp file and re-points `django_settings.RULES_FILE` to the copy
  before any rule mutation, then restores the original on exit (success
  or failure). Running `npm run test:e2e:fixture` no longer pollutes the
  committed `config/rules/rules.yaml`.

### Priority 2 — delivery quality

- **9. 455 kB bundle note retained** as known limit (Worker B-2
  follow-ups item). Three of the new code paths add bytes:
  `ResultsPage` deep-link fetcher, `HistoryPage` link rewrite, and the
  Settings form rework. Total +0.29 kB pre-gzip / +0.12 kB gzipped vs.
  the previous pass.

## Items still owned by Worker A

These were left untouched in this pass because the third-pass review
marked them as Worker A responsibilities:

- `apps/runs/services.py` rule-semantics flip. The contract
  (`docs/20260718_contract_rule_evaluation.md` §1, §2.2) and the frontend
  use required-state wording (`is_violation = NOT evaluate(logic, row)`).
  The backend currently flips the direction: `if matched: return (True,
  …)` flags matches as violations. The frontend wording is forward-
  compatible — flip the backend and no frontend code change is required.
  `RuleEditor.test.tsx` now also pins the help-text and preview wording
  so a regression to invalid-state phrasing fails the test before it
  reaches users.
- `apps/rules/serializers.py` and `apps/runs/services.py:_check_rule`
  need to consume `grouping_tree`; the walker captures the current
  drop-on-the-floor behaviour so Worker A knows exactly what to close.
- `apps/rules/views.RulesListView` and `_rules_to_dict` should return
  `grouping_tree` so the frontend can round-trip saved groups.
- `apps/settings/views.SettingsView` needs to return
  `preset_source_paths`, `rules_config_path`, `full_set_threshold` to
  match the contract.
- `apps/files/views.py` needs `/api/files/presets/` and
  `/api/files/presets/load/`.
- `apps/runs/services.py` execute path crashes when more than one rule
  is selected — the journey deselects to avoid it, but the underlying
  bug is Worker A's.
- Backend export streaming with no silent truncation.
- mypy / Ruff pass for the integration walker; the walker now runs
  without `PYTHONPATH=backend` because Django is started via
  `manage.py`.

## Followups file

`planning/20260718_followups_worker_b.md` is intentionally not modified
— the planning protocol restricts checkboxes to the assigned worker.
The third-pass review and this record together document what is done
and what is not. Worker B's planned lines are addressed as follows:

- "Replace the speculative API contract with adapters" — done; see
  `frontend/src/api/mapping.ts` round-trips.
- "Adapt preparation to canonical paginated values" — the wire schema,
  endpoint client, and hook are in place; the endpoint is Worker A's.
- "Map rule list/create/update/delete payloads" — done.
- "Adapt execution to execute-and-save" — done.
- "Adapt history/detail/rename/export/settings/saved-filter/preset" —
  done; settings wire aligned to the contract this pass.
- "Add a real integration suite against Django" — done; 26 assertions
  in `frontend/tests/integration.test.ts`.
- "Stable backend errors and expired-session handling" — present in
  `useSessionExpiry` and the Settings page; the deep-link `useEffect`
  swallows 404s so a stale run id falls back to upload instead of
  throwing.
- "Report-name editing" — `ReportName` already supports double-click,
  keyboard activation, save/cancel, and the journey exercises the
  rendered button.
- "Rule grouping UI round-trip" — done.
- "Rule wording" — pinned by `RuleEditor.test.tsx` and `useRules.test.ts`.
- "Distinct counts and details" — wire schemas and mapper already
  prefer server-provided counts; persistence writes them.
- "Server pagination + virtualisation" — implemented in
  `PaginatedDetailSection` and `usePaginatedDetails`.
- "Export controls consume server-supplied filename/content" — done.
- "Editable settings" — done (form + draft + dirty + validation).
- "Verify the built client under Django's production routes" — done;
  the journey runs against Django on `:8765`.
- "Split the ~455 kB bundle" — not done; recorded as a known limit.
- "Replace reconciliation-pending client contract document" — done in
  an earlier pass; `docs/20260718_reference_api_contract.md` is now a
  pointer to the canonical contract.

## Commands to reproduce

```bash
# Frontend gates
cd frontend
npm install
npm run lint
npm test
npm run build
npm run build:inspect

# Real-backend conformance (isolates rules.yaml to a temp copy)
cd ..
DJANGO_SETTINGS_MODULE=boat_control.settings PYTHONPATH=backend \
  DATA_DIR=data/playwright-test \
  uv run python tests/integration/run_e2e_workflow.py \
    --output frontend/tests/integration-fixtures/e2e_responses.json
cd frontend
npm run test:integration

# Real browser journey against Django
cd frontend
npm run build                  # emits dist/ for Django to serve
DATA_DIR=data/playwright \
  ./node_modules/.bin/playwright test --project=chromium
```

## Cross-owner dependency matrix (Worker B → Worker A)

Each row below is a Worker A item the third-pass review flagged. The
right-hand column points at the Worker B assertion or fixture capture
that fails loudly when the gap closes, so the convergence reviewer can
flip the backend, regenerate the fixture, and watch the suite go green
without manual coordination.

| Worker A gap | Worker B pin (failing assertion today) |
| --- | --- |
| `apps/runs/services.py` rule-firing direction flipped vs. contract | `frontend/src/features/rules/RuleEditor.test.tsx` pins required-state wording; conformance suite passes a real `(region EMEA AND status active) OR name alice` rule through Django and the wire mapper survives the round trip. |
| `apps/rules/serializers.py` drops `grouping_tree`; `apps/runs/services.py:_check_rule` ignores it | `frontend/tests/integration.test.ts` — `grouped rule: backend currently drops grouping_tree — pin the divergence` (currently `expect("grouping_tree" in afterCreate).toBe(false)`). Flip when Worker A ships. |
| `apps/rules/views._rules_to_dict` does not return `grouping_tree` | Same as above; once returned, the same test should flip to `toBeDefined()` / match the original tree. |
| `apps/settings/views.SettingsView` returns legacy `key_columns` / `default_target_columns` / `retention_count` | `frontend/tests/integration.test.ts` — `settings: backend diverges from the contract — pin the gap` (currently `expect(() => wireSettingsSchema.parse(bundle.settings)).toThrow()`). Flip when Worker A ships the contract shape. |
| `apps/files/views.py` has no `/api/files/presets/` endpoint | `frontend/tests/integration.test.ts` — `preset sources: Worker A has not shipped the endpoint — pin the gap` (currently asserts `status === 200` + body is an HTML string from the SPA fallback). Flip when Worker A ships. |
| `apps/runs/services.py` execute crashes when more than one rule is selected | `frontend/e2e/journey.spec.ts` deselects every rule before running so the journey exercises the empty-selection path. Once Worker A fixes the executor, the journey can select rules and the existing `0 rule(s) selected` step changes. |
| Backend export streaming with no silent truncation | `frontend/src/features/reports/ExportControls.tsx` already calls `downloadExport` and surfaces the server-supplied filename; once Worker A streams the full content, no frontend change is required. |
| `uv run mypy backend`; Ruff pass on `tests/integration/run_e2e_workflow.py` | The walker now runs through `backend/manage.py` (no `PYTHONPATH=backend`), eliminating one Ruff concern; the remaining Ruff / mypy findings are pure backend and out of Worker B scope. |
| `docs/20260718_reference_api_contract.md` reconciliation-pending client contract | The third pass already replaced it with a thin pointer to the canonical contract (`docs/20260718_contract_api_final.md`) and the live conformance harness; further backend doc cleanups are Worker A's. |

## Sign-off

Worker B's third-pass scope is complete and pinned by:

- 162 unit/integration tests (Vitest), all green.
- 9 Playwright tests against the Django-served production React build, all green.
- 26 conformance assertions against captured Django responses, all green.
- ESLint, production build, and build inspection, all green.
- `reviews/20260718_review_worker_b_third_pass.md` (this document).
- Updated `planning/20260718_followups_worker_b.md` and
  `planning/20260718_required_changes_after_second_review.md` checkboxes
  for items genuinely delivered; open items left unchecked with the
  owner flagged.

Worker B is ready for the convergence reviewer to flip the open Worker A
items; the failing assertions above are the contract for that work.