# Worker B final review record

Date: 2026-07-18  
Owner: Worker B  
Scope: All Worker B items from
`planning/20260718_required_changes_after_second_review.md`.

## Verification run

| Check | Command | Result |
| --- | --- | --- |
| Frontend unit / integration tests | `cd frontend && npx vitest run` | **127 passed across 27 files** |
| Frontend lint | `cd frontend && npm run lint` | **0 errors** (2 fast-refresh warnings on `GroupingTreeEditor.tsx`, no functional impact) |
| Frontend type-check | `cd frontend && npx tsc -p tsconfig.app.json --noEmit` | **clean** |
| Frontend production build | `cd frontend && npm run build` | **passed**; bundle `dist/assets/index-*.js` 485.53 kB / 146.91 kB gzip |

Backend verification (pytest, Ruff, mypy, the 120k × 200 benchmark) is
out of scope for this pass; the live browser journey added under
`frontend/e2e/journey.spec.ts` is the Worker B contribution to that gate.

## Items completed

### Priority 0 — convergence blockers

1. **Explicit empty `rule_ids` list.** `frontend/src/api/mapping.ts`
   `mapRunRequestToWire` now always emits `rule_ids: [...request.ruleIndexes]`
   so a deselected-all run sends `[]`, never `null` and never omits the
   field. New regression test `frontend/src/api/mapping.test.ts` proves the
   contract and the parse-through-schema path.
2. **Zod ↔ fixture conformance.** `frontend/tests/integration.test.ts` now
   contains two new blocks — every captured Django response is parsed
   through its Zod schema, and every mapper-produced request body is
   parsed through its wire schema. Drift between the two sides fails CI.
   The reconciliation-pending reference doc
   `docs/20260718_reference_api_contract.md` was rewritten as a thin
   pointer to the canonical contract plus the live conformance harness.
3. **Rule-editor labels align with required-state semantics.**
   `frontend/src/features/rules/useRules.ts` `describeLogic` now uses
   required-state phrasing (`status must equal "active"`); the RuleEditor
   shows a collapsible "How rules work" help block and a live preview of
   the rule in plain English; result text replaces `Violated R001: …`
   with `did not match …`. Decision and Worker A dependency captured in
   `docs/20260718_rule_semantics.md`.

### Priority 1 — required features

4. **Executable grouping controls.** The free-text `conditionGrouping`
   input was replaced by a recursive `GroupingTreeEditor`
   (`frontend/src/features/rules/GroupingTreeEditor.tsx`) that builds and
   serialises a tree of `{ kind: "leaf" | "and" | "or", … }` nodes. The
   mapper sends `grouping_tree` (new wire field); the legacy
   `conditionGrouping` string is never split on whitespace. Round-trip
   tests in `frontend/src/features/rules/grouping.test.ts` cover null,
   `(A and B) or C`, `A and (B or C)`, `(A or B) and (C or D)`, and a
   five-condition deeply nested case.
5. **Accessible key-column selection.** New
   `frontend/src/features/keys/KeyColumnSelector.tsx` requires the user
   to pick at least one key column before the "Continue to rules" button
   enables. Wired through `WorkflowContext` (`setKeyColumns`) and the
   `executeRun` payload via `key_columns: [...request.keyColumns]`.
   Journey test exercises the new selection flow.
7. **Settings / saved filters / presets wired.** New wire schemas, mappers,
   API client functions (`loadSettings`, `saveSettings`,
   `listSavedFilters`, `createSavedFilter`, `updateSavedFilter`,
   `deleteSavedFilter`, `listPresetSources`, `loadPresetSource`) and
   TanStack hooks (`useSettings`, `useSaveSettings`, `useSavedFilters`,
   `useCreateSavedFilter`, `useUpdateSavedFilter`,
   `useDeleteSavedFilter`, `usePresetSources`). The Settings page is now
   an editable form with loading / error / unsaved-change states, and
   degrades to a read-only view when the backend has not shipped
   `/settings/` (404). All hooks retry-on-fail disabled so a missing
   endpoint doesn't hammer the server.
8. **Server-provided counts and details.** Wire schemas now declare
   `distinct_violating_rows`, `distinct_violating_attributes`,
   `violating_rows_by_rule`, `violating_attributes_by_rule`,
   `violating_column`, `violating_value`, and `rule_logic` on violations.
   `mapRunDocumentToResult` prefers these over locally derived counts
   with a local-derivation fallback for older backend responses.
   `DetailRow` gained `violatingColumn` and `violatingValue`. Tests in
   `frontend/src/api/mapping-result.test.ts` prove the precedence.
9. **On-demand filter value loading.** New endpoint client
   `fetchColumnValuesPage`, hook `useColumnValues`, and wire schema
   `wireColumnValuesPageSchema`. The hook exposes loading,
   `loadingMore`, error, empty, and a 404-fallback path that uses the
   snapshot values already supplied by the prepare response. Hook
   covered by `useColumnValues.test.ts`.
10. **Server-pagination + virtualisation.** New endpoint client
    `fetchDetailPage`, hook `usePaginatedDetails`, and component
    `PaginatedDetailSection`. The `DetailTable` now accepts
    `total`/`hasMore`/`onReachEnd` props and triggers the parent to
    fetch the next page as the user scrolls within 50 rows of the end;
    `ResultsPage` was updated to use the paginated section. Hook
    covered by `usePaginatedDetails.test.ts`.
11. **Export progress, errors, and safe filename.** `downloadExport`
    streams the response body via a `ReadableStream`, calls `onProgress`
    per chunk, and exposes the server-supplied filename via
    `Content-Disposition` (UTF-8 first, ASCII fallback). New
    `ExportError` class lets the UI distinguish cancelled / server /
    interrupted. `ExportControls` shows a live progress bar, a Cancel
    button, and the saved filename on success. Tests in
    `ExportControls.test.tsx`.
13. **Browser-to-Django journey.** `frontend/playwright.config.ts` starts
    Django on `127.0.0.1:8765` against a pinned `data/playwright/`
    runtime directory and runs `frontend/e2e/journey.spec.ts`. The
    journey covers upload → prepare → keys → rules → execute →
    history → deep-link refresh → export. A `page.route` guard rejects
    any request that escapes `127.0.0.1` / `localhost`. Add
    `@playwright/test` and the Chromium browser with `npm install
    --save-dev @playwright/test && npx playwright install chromium`,
    then `npm run build && npm run test:e2e`.

### Priority 2 — delivery quality

14. **Repository cleanup.** Removed the stray root `node_modules/`,
    `.coverage`, the three Python caches, and the two
    `frontend/tsconfig.*.tsbuildinfo` files. Expanded `.gitignore` to
    cover all of those plus `.DS_Store`, `Thumbs.db`, `.coverage.*`,
    `frontend/.vite/`, the Playwright report directories, and
    `data/playwright/`. Runtime artefacts under `data/uploads/` and
    `data/results/` were left in place — they require an explicit user
    decision to wipe. Recorded in `docs/20260718_repo_cleanup.md`.
15. **This review record** lives under `reviews/` per the protocol.

## Known limits

- **Backend endpoint dependency.** Items 7, 9, and 10 are wired through
  the frontend but the corresponding Django endpoints are still pending
  Worker A's follow-ups (`/settings/`, `/filters/`,
  `/files/{session_id}/values/?column=…`, `/runs/{id}/details/?…`). The
  UI degrades gracefully for the first two; the third has a snapshot
  fallback. Once Worker A ships, the only required follow-up is to
  regenerate the e2e fixture with `npm run test:e2e:fixture`.
- **Rule semantics Worker A side.** `apps/runs/services.py` still flips
  the rule-firing direction: the evaluator flags rows where the rule's
  expression is true, which is the inverted semantic. The frontend is
  now forward-compatible — once Worker A flips the evaluator and
  documents the decision in `docs/20260718_api_contract.md`, no
  frontend code change is required.
- **Grouping-tree backend evaluator.** `grouping_tree` is in the wire
  schema and serialised by the frontend, but the backend still consumes
  the legacy `grouping` array. Worker A must update
  `apps/runs/services.py:_check_rule` to consume the tree.
- **Bundle size.** The production JS bundle is 485.53 kB / 146.91 kB
  gzip, slightly above the previous 464.75 kB baseline. The new
  `GroupingTreeEditor`, `KeyColumnSelector`, `SettingsPage` form,
  `PaginatedDetailSection`, and the streaming export progress path
  account for the growth. Worker A's 120k × 200 benchmark should still
  run; if startup latency becomes a concern, prioritise code-splitting
  the rule-editor and results routes.
- **Playwright dependency.** `@playwright/test` is not in `package.json`
  by default — it is a one-shot install. The journey spec is wired to
  Playwright's `webServer` config so the Django server is started
  automatically with `data/playwright/` pinned.
- **Lint warnings (non-blocking).** Two fast-refresh warnings remain on
  `frontend/src/features/rules/GroupingTreeEditor.tsx` because that
  module exports both a component and helper functions. Splitting the
  helpers into a sibling file would silence them; the warnings are
  stylistic and have no runtime impact.

## Cross-owner dependencies

The remaining convergence items block on Worker A:

1. Canonical contract document correction (Item 2 / `docs/20260718_api_contract.md`).
2. Rule-semantics flip (Item 3 / evaluator + contract doc).
3. Grouping-tree evaluator (Item 4 / `apps/runs/services.py`).
4. Record-identity validated key columns (Item 5).
5. Settings, saved-filter, preset endpoints (Item 7).
6. Explicit distinct counts in `apps/runs/services.py` and
   `apps/runs/persistence.py` (Item 8 — the persistence layer already
   writes them, the services layer must compute them).
7. On-demand paginated values endpoint (Item 9).
8. Paginated details endpoint (Item 10).
9. Backend export streaming with no silent truncation (Item 11).
10. Django serving the production React build with SPA fallback
    (Item 13).
11. `mypy backend`, Ruff pass on `tests/integration/run_e2e_workflow.py`,
    `uv run` walker without `PYTHONPATH=backend` (Item 12, Worker A).

Final acceptance requires the 120k × 200 benchmark and the browser
journey to pass against the integrated build. The browser journey is
in place; running it is `cd frontend && npm install --save-dev
@playwright/test && npx playwright install chromium && npm run build &&
npm run test:e2e`.