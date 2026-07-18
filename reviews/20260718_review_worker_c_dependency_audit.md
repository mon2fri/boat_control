# Worker C Dependency Audit

Date: 2026-07-18
Owner: Worker C
Scope: All sources of truth across docs/, backend, frontend, tests, planning, and reviews.

## Method

Every document, serializer, Zod schema, endpoint, test, and fixture was compared against every other
to identify contradictions, missing decisions, obsolete contracts, unimplemented features, and
assumed endpoints. Evidence is by file and line where possible.

## Findings

### F1. Rule semantics contradiction (CRITICAL)

| Source | Stated semantic |
|--------|----------------|
| `docs/20260718_api_contract.md` (line ~end, "Rule Logic Semantics") | "Rule logic describes a **violation condition**. When the logic evaluates to `true`, the row is reported as violating the rule." |
| `docs/20260718_rule_semantics.md` | "A rule describes the **required valid state**... Rows that *do not match* are reported as violations." |
| `backend/apps/runs/services.py:_check_rule` | Fires violation when expression is TRUE (invalid-state predicate). |
| `frontend/src/features/rules/useRules.ts:describeLogic` | Renders in required-state phrasing ("status must equal active"). |
| `frontend/src/features/rules/RuleEditor.tsx` | Shows "How rules work" help block using required-state language. |
| `frontend/src/features/results/` result text | Replaces "Violated" with "did not match" (required-state framing). |

**Resolution:** Freeze as required-state semantics. Logic describes what must be true for a row to
be valid. A row violates the rule when its logic evaluates false. Worker A must flip the evaluator
in `apps/runs/services.py` and `apps/runs/services.py:validate_rows`. Worker B's UI is already
forward-compatible.

### F2. Execute response shape inconsistency (CRITICAL)

| Source | Shape |
|--------|-------|
| `docs/20260718_api_contract.md` execute response | `comparison`, `validation`, `common_columns`, `target_columns` at top level |
| `backend/apps/runs/serializers.py:ExecutionResultSerializer` | `run_id`, `report_name`, `created_at`, `result: {comparison, validation, ...}` (nested) |
| `frontend/src/api/wire.ts:wireRunDocumentSchema` | `run_id`, `report_name`, `result: {comparison, validation, ...}` (nested) |
| `tests/integration/run_e2e_workflow.py` execute step | Backend returns nested `result` object |

**Resolution:** The backend and frontend agree: execute returns `run_id`, `report_name`, `created_at`,
and a nested `result` object. The `docs/20260718_api_contract.md` is stale and must be corrected to
match the actual nested shape. The canonical contract (C3) will fix this.

### F3. Upload response inconsistency (RESOLVED)

| Source | Shape |
|--------|-------|
| `docs/20260718_api_contract.md` upload | Returns `session_id`, `file_a_name`, `file_b_name`, `inspection` |
| `docs/20260718_files_api.md` upload | Returns `file_a_path`, `file_b_path`, `inspection` (stale) |
| `docs/20260718_api_reference.md` upload | Returns `file_a_path`, `file_b_path` (stale) |
| `backend/apps/files/views.py:FileUploadView` | Returns `session_id`, `file_a_name`, `file_b_name`, `inspection` |
| `frontend/src/api/wire.ts` upload schema | Expects `session_id`, `file_a_name`, `file_b_name`, `inspection` |

**Resolution:** Backend and frontend agree on session-based response. `docs/20260718_files_api.md` and
`docs/20260718_api_reference.md` are stale. Mark as historical; canonical contract supersedes.

### F4. Filter preparation endpoint inconsistency (RESOLVED)

| Source | Shape |
|--------|-------|
| `docs/20260718_filters_api.md` prepare | Accepts `file_a_path`, `file_b_path`, `common_columns` |
| `docs/20260718_api_contract.md` prepare | Accepts `session_id`, `common_columns` |
| `backend/apps/files/filter_views.py:FilterPreparationView` | Accepts `session_id` (derives paths from session) |
| `frontend/src/api/endpoints.ts:prepareFilters` | Sends `session_id`, `common_columns` |

**Resolution:** Backend and frontend agree on session-based preparation. The per-diff doc
`docs/20260718_filters_api.md` is stale.

### F5. Filter validation endpoint inconsistency (RESOLVED)

| Source | Shape |
|--------|-------|
| `docs/20260718_filters_api.md` validate | Accepts `column`, `operator`, `filter_value`, `common_columns` |
| `backend/apps/files/filter_views.py:FilterValidationView` | Accepts `session_id`, `column`, `operator`, `filter_value` (derives common_columns from session) |
| `frontend/src/api/endpoints.ts:validateFilter` | Sends `session_id`, `column`, `operator`, `filter_value` |

**Resolution:** Backend and frontend agree: filter validation uses session_id, not client-provided
common_columns. The `docs/20260718_filters_api.md` doc is stale.

### F6. Target validation endpoint inconsistency (RESOLVED)

| Source | Shape |
|--------|-------|
| `docs/20260718_filters_api.md` targets/validate | Accepts `target_columns`, `common_columns` |
| `backend/apps/files/filter_views.py:TargetColumnsView` | Accepts `session_id`, `target_columns` (derives common from session) |
| `frontend/src/api/endpoints.ts:validateTargets` | Sends `session_id`, `target_columns` |

**Resolution:** Same pattern. Session-based is canonical.

### F7. History response includes file_path (MEDIUM)

| Source | Shape |
|--------|-------|
| `docs/20260718_persistence_api.md` list runs | Includes `file_path` in response |
| `backend/apps/runs/persistence.py:list_runs` | Returns `file_path` in metadata |
| `frontend/src/api/wire.ts` history schema | Does NOT include `file_path` |

**Resolution:** Remove `file_path` from history responses. The frontend already doesn't expect it;
the backend should not expose internal paths.

### F8. Stale per-diff documentation (LOW)

These documents were created during convergence to reconcile specific divergences but are now
superseded by the actual implemented contract:

| Document | Status |
|----------|--------|
| `docs/20260718_files_api.md` | Stale: shows `file_a_path`/`file_b_path` shapes |
| `docs/20260718_filters_api.md` | Stale: shows client-provided `common_columns` |
| `docs/20260718_api_reference.md` | Stale: shows `file_a_path`/`file_b_path` shapes |
| `docs/20260718_reference_api_contract.md` | Already marked as thin pointer to canonical |
| `docs/20260718_rule_semantics.md` | Pending: awaits Worker A confirmation |
| `docs/20260718_runs_api.md` | Partially stale: shows `file_a_path` in execute request |

**Resolution:** The new `docs/20260718_contract_api_final.md` (C3) supersedes all of these. Mark
them as historical with a pointer to the canonical contract.

### F9. Grouping tree is frontend-only (HIGH)

| Source | Handling |
|--------|----------|
| `frontend/src/api/wire.ts:wireGroupNodeSchema` | Recursive `{kind: "leaf"|"and"|"or", ...}` tree |
| `frontend/src/features/rules/GroupingTreeEditor.tsx` | Builds and serializes the tree |
| `backend/apps/rules/services.py` | Stores `grouping` as `list[str] | None` (legacy) |
| `backend/apps/runs/services.py:_check_rule` | Never evaluates grouping |

**Resolution:** The canonical contract (C2) defines the `grouping_tree` grammar. Worker A must
implement evaluation. Worker B already sends the correct wire format.

### F10. key_columns missing from execute request in some docs (RESOLVED)

| Source | Execute request |
|--------|----------------|
| `docs/20260718_api_contract.md` | Includes `key_columns` |
| `backend/apps/runs/views.py` | Requires `key_columns` |
| `frontend/src/api/mapping.ts:mapRunRequestToWire` | Sends `key_columns` |

**Resolution:** All agree. No action needed.

### F11. Missing backend endpoints (HIGH — Worker A scope)

Frontend has hooks/adapters for these endpoints but Django does not implement them:

| Endpoint | Frontend consumer | Backend status |
|----------|------------------|----------------|
| `GET /api/settings/` | `useSettings` hook | Not implemented |
| `PUT /api/settings/` | `useSaveSettings` hook | Not implemented |
| `GET /api/filters/` | `useSavedFilters` hook | Not implemented |
| `POST /api/filters/` | `useCreateSavedFilter` hook | Not implemented |
| `PUT /api/filters/<id>/` | `useUpdateSavedFilter` hook | Not implemented |
| `DELETE /api/filters/<id>/` | `useDeleteSavedFilter` hook | Not implemented |
| `GET /api/files/presets/` | `usePresetSources` hook | Not implemented |
| `POST /api/files/presets/load/` | `loadPresetSource` endpoint | Not implemented |
| `GET /api/files/<session_id>/values/` | `useColumnValues` hook | Not implemented |
| `GET /api/runs/<id>/details/` | `usePaginatedDetails` hook | Not implemented |

**Resolution:** These are Worker A implementation items (A4 in the dependency resolution plan).
The contract (C3) defines them; Worker A implements after the gate.

### F12. Export truncation (MEDIUM)

| Source | Behavior |
|--------|----------|
| `backend/apps/reports/services.py:export_html` | Truncates at 1000 change rows, 500 violations per rule |
| `backend/apps/reports/services.py:export_csv` | Truncates at 5000 rows per section |
| `docs/20260718_exports_api.md` | Documents the truncation limits |

**Resolution:** The contract (C6) requires complete exports or explicit user-selected limits.
Worker A must implement streaming or bounded exports with clear limits.

### F13. Operator set inconsistency (RESOLVED)

| Source | Operators |
|--------|-----------|
| `docs/20260718_api_contract.md` | `eq`, `neq`, `contains`, `ncontains`, `gt`, `lt`, `gte`, `lte` |
| `backend/apps/rules/services.py` conditions | `eq`, `neq`, `contains`, `ncontains` |
| `backend/apps/rules/services.py` logic | Any string (unvalidated) |
| `frontend/src/api/wire.ts` | `eq`, `neq`, `contains`, `ncontains` for conditions |

**Resolution:** Condition operators are `eq`, `neq`, `contains`, `ncontains`. Logic operators
are `eq`, `neq`, `contains`, `ncontains`, `gt`, `lt`, `gte`, `lte` (extended set for comparison
logic). The contract (C3) will clarify which operators apply where.

### F14. scripts/dev.sh starts two ports (MEDIUM)

| Source | Behavior |
|--------|----------|
| `scripts/dev.sh` | Starts Django on :8000 AND Vite on :5173 |
| `docs/20260718_contract_single_port_delivery.md` (C5) | Will define single-port default |

**Resolution:** Worker C will define the frozen single-port topology in C5. Worker A updates
`dev.sh` after the gate.

## Authoritative documents (post-audit)

| Document | Status |
|----------|--------|
| `docs/20260718_contract_rule_evaluation.md` (C2) | **Authoritative** — rule semantics and grouping |
| `docs/20260718_contract_api_final.md` (C3) | **Authoritative** — complete API contract |
| `docs/20260718_contract_single_port_delivery.md` (C5) | **Authoritative** — delivery topology |
| `docs/20260718_contract_performance_and_pagination.md` (C6) | **Authoritative** — performance budgets |
| `docs/20260718_handoff_worker_matrix.md` (C7) | **Authoritative** — ownership matrix |
| `docs/20260718_api_contract.md` | **Superseded** by C3 (historical) |
| `docs/20260718_files_api.md` | **Superseded** by C3 (historical) |
| `docs/20260718_filters_api.md` | **Superseded** by C3 (historical) |
| `docs/20260718_rules_api.md` | **Superseded** by C3 (historical) |
| `docs/20260718_runs_api.md` | **Superseded** by C3 (historical) |
| `docs/20260718_exports_api.md` | **Superseded** by C3 (historical) |
| `docs/20260718_persistence_api.md` | **Superseded** by C3 (historical) |
| `docs/20260718_api_reference.md` | **Superseded** by C3 (historical) |
| `docs/20260718_reference_api_contract.md` | **Superseded** by C3 (historical) |
| `docs/20260718_rule_semantics.md` | **Superseded** by C2 (historical) |

## Summary of resolutions

1. Rule semantics: **required-state** (C2 defines canonically).
2. Execute response: **nested `result`** (C3 defines canonically).
3. Session model: **opaque session IDs** throughout (already implemented).
4. Stale docs: **marked historical**, new contracts supersede.
5. Grouping tree: **recursive JSON grammar** (C2 defines canonically).
6. Missing endpoints: **Worker A scope** after gate (C3 defines them).
7. Internal paths: **removed** from client responses.
8. Export truncation: **to be replaced** with complete or explicit-limit exports.
