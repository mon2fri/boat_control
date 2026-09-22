# 2026-09-18 Rule Identifier Worker D Delivery Review

Status: **COMPLETE**

Worker: D  
Branch: `work/cbri-worker-d`  
Worktree: `C:\Users\zwj80\Documents\codings\boat_control-worktrees\worker-d`

## Reading Confirmation

Read completely:

- `README.md`
- `requirements/20260918_validation_rule_identifier.md`
- `planning/20260918_canonical_business_rule_identifier_implementation_plan.md`
- `planning/20260918_rule_identifier_coordinator_reviewer_instruction.md`
- `planning/20260918_rule_identifier_worker_a_identity_store_instruction.md`
- `planning/20260918_rule_identifier_worker_b_catalog_api_instruction.md`
- `planning/20260918_rule_identifier_worker_c_run_contract_instruction.md`
- `planning/20260918_rule_identifier_worker_d_frontend_instruction.md`

Inspected the available current contract and frontend evidence:

- `tests/contracts/v1/contract_schema.json`
- `tests/contracts/v1/examples.json`
- `frontend/tests/integration-fixtures/e2e_responses.json`
- `frontend/tests/contract.test.ts`
- `frontend/tests/config_api.test.ts`
- `frontend/tests/integration.test.ts`
- frontend wire/domain/mapping, endpoint, hook, Rules page, config, workflow, pagination, and focused test files listed below.

The accepted Worker B API examples and accepted Worker C contract fixtures requested by the Worker D
instruction are not present in this worktree. No Worker B/C delivery review files are present, and
the worker branches currently point at the same baseline commit. Therefore there is no frozen Gate 2
wire contract that can be consumed safely.

## Owned-File Inventory

Worker D owns the following implementation surfaces after Gate 2 freezes the backend contract:

- `frontend/src/api/wire.ts`
- `frontend/src/api/domain.ts`
- `frontend/src/api/mapping.ts`
- `frontend/src/api/endpoints.ts`
- `frontend/src/features/rules/useRules.ts`
- `frontend/src/features/rules/SortableRuleList.tsx`
- `frontend/src/features/rules/RuleEditor.tsx` and related rule components
- `frontend/src/pages/RulesPage.tsx`
- `frontend/src/features/configs/ConfigManager.tsx`
- `frontend/src/features/configs/ConfigLoader.tsx`
- `frontend/src/features/settings/useSettings.ts`
- `frontend/src/state/WorkflowContext.tsx` where rule selection state is affected
- focused frontend unit, integration, and browser journey tests
- frontend/user documentation and `frontend/dist` only after source tests and build pass

Shared hotspots requiring coordinator sequencing were not edited:

- `frontend/src/api/wire.ts`
- `frontend/src/api/mapping.ts`
- contract fixtures and schema files
- `docs/20260718_rules_api.md`
- `docs/20260718_contract_api_final.md`
- `frontend/dist`

Before Gate 2, no frontend implementation, backend code, shared fixture, or generated distribution file
was edited. The implementation below was added only after the coordinator supplied the accepted Worker
B catalog commits.

## Inspection Findings

The baseline frontend is not compatible with the required delivery contract yet. These are recorded
for post-Gate-2 implementation, not implemented as provisional behavior:

- `frontend/src/api/wire.ts:144-189` models rules as an unpaginated `{ version, rules }` response,
  has no read-only `rule_identifier` or persisted `enabled`, and only exposes the old replace/mutation
  response shapes.
- `frontend/src/api/mapping.ts:229-283` maps rules without a canonical identifier or enabled state;
  `mapRuleToWireDraft` correctly omits `index`, but the response and mutation mappings need the frozen
  create/edit/import shapes before they can be changed safely.
- `frontend/src/api/mapping.ts:415-562` maps run results without `rule_bindings`, per-rule canonical
  identifiers, or violation canonical identifiers. `frontend/src/api/domain.ts:86-110` and
  `185-226` likewise have no corresponding domain fields.
- `frontend/src/api/endpoints.ts:303-357` uses the old list, replace, and reorder endpoints. The
  required enablement, bulk, export/snapshot, atomic import, cursor-page, and stale-cursor behavior
  cannot be implemented without Gate 2 request/response examples.
- `frontend/src/pages/RulesPage.tsx:50-55` initializes selection to every returned rule, contrary to
  server `enabled` initialization. Lines `61-95` resolve config client-side and call destructive
  `/rules/replace/`; lines `142-145` and `362-365` build saved config content from the currently
  rendered rule list.
- `frontend/src/pages/RulesPage.tsx:108-121` treats create success as only `{ ruleId, message }` and
  updates local selection without the required persisted-enable response or business-edit prior/resulting
  ID transfer semantics.
- `frontend/src/features/rules/SortableRuleList.tsx:23-56` implements local ten-item pagination over
  the already materialized array. It is not the required initial 50-plus-enabled response with
  click-triggered ten-record continuation pages, pinned enabled rows, cached Previous, or stale-cursor
  refresh handling.
- `frontend/src/features/rules/SortableRuleList.tsx:58-110` defines Select all over the currently
  materialized rules without distinguishing Select displayed from a global catalog action.
- `frontend/src/features/settings/useSettings.ts:79-105` only manages named file-like config CRUD;
  it has no catalog snapshot export/import lifecycle, success counts, duplicate-submission guard, or
  post-commit refresh semantics.
- Existing focused tests in `frontend/src/pages/RulesPage.test.tsx:163-275` assert the obsolete
  `/rules/replace/` and select-all behavior. They must be replaced or revised against the accepted
  Gate 2 contract rather than adapted with guessed response fields.
- Existing contract/integration fixtures in `tests/contracts/v1/examples.json` and
  `frontend/tests/integration-fixtures/e2e_responses.json` contain the old list and run contracts;
  they do not provide the required pagination, enablement, import/export, or canonical-ID examples.

## Risks and Questions

- Gate 2 is not ready: Worker B's backend behavior has not been integrated or independently accepted,
  and the required frozen API examples are absent. Implementing now would require inventing contracts,
  which the assignment explicitly forbids.
- Please provide the accepted exact schemas and fixtures for initial listing, continuation pages,
  stale-cursor errors, single/bulk enablement, create/edit responses, snapshot export, atomic import,
  and the post-import counts/bindings before frontend schema work begins.
- Please provide Worker C's exact run request/result/detail shapes, including whether canonical IDs and
  `rule_bindings` are required, nullable, or omitted for legacy saved runs.
- The frontend currently has named configuration-file CRUD and a client-side rules resolver. Gate 2
  must identify the authoritative endpoints and whether named config save/load is retained as a wrapper
  or replaced by the catalog snapshot export/import operations.
- The frozen contract must specify how enabled pinned records are marked and deduplicated, how cursor
  revision failures are represented, and the cache identity needed for Previous navigation.
- The frozen contract must specify business-logic edit selection transfer and failure behavior so the
  UI does not create a transient unchecked state or accidentally disable the wrong local ID.
- The integrated contract fixtures must include an enabled rule outside the first 50, an empty enabled
  export/import, a stale cursor, an import failure, and a legacy run without canonical identifiers.

## Implementation and Verification

Accepted dependency commits cherry-picked for compilation:

- `9fe2f21` — Worker A canonical identity foundation
- `47c32f6` — Worker A transactional catalog repository
- `4e552a3` and `63def6c` — Worker A handoff documentation
- `b29a78b` — Worker B catalog APIs and migration
- `5a48707` — Worker B delivery documentation

Worker D frontend commit:

- `002c0c9` — `feat: integrate canonical rule catalog frontend`

Changed Worker D files:

- `frontend/src/api/wire.ts`, `domain.ts`, `mapping.ts`, `endpoints.ts`
- `frontend/src/features/rules/useRules.ts`, `SortableRuleList.tsx`, and focused tests
- `frontend/src/features/configs/ConfigLoader.tsx`
- `frontend/src/pages/RulesPage.tsx` and focused tests
- rebuilt `frontend/dist/`

Implemented against the accepted Worker B API:

- canonical identifier and server `enabled` mapping;
- first-page catalog metadata and opaque cursor continuation through `useInfiniteQuery`;
- server-enabled selection initialization;
- immediate create/update snapshot handling;
- optimistic single and explicit displayed-ID bulk enablement with rollback;
- backend atomic config import, empty selection preservation, success counts, and stale-cursor refresh;
- run request empty `rule_ids` preservation and strict new/legacy canonical result mapping;
- focused endpoint, mapping, selection, pagination, and config-loader regression coverage.

Verification results:

- `npm --prefix frontend test -- --run`: **47 files, 410 tests passed**
- `npm --prefix frontend test -- --run tests/contract.test.ts tests/integration.test.ts`: **2 files, 49 tests passed**
- `npm --prefix frontend run build`: **passed**; Vite generated rebuilt assets
- `git diff --check`: **passed**
- The pre-C integration attempt had 17 passes and 3 database-access failures; after cherry-picking C's
  test-isolation correction, the final integrated contract/integration run passed 20 tests.

## Final Delivery

Worker C was integrated and the exact committed v1 fixtures are consumed. New catalog and run
responses require canonical identifiers, server enablement, pagination metadata, and `rule_bindings`.
Legacy persisted run documents use the separate legacy parser and retain missing identifiers as absent
or null without guessing from `Rxxx`.

Correction commit:

- `8c2eeb7` — `fix: align frontend with canonical run contracts`

The correction includes the strict new/legacy Zod schema split, exact C fixture updates in the
frontend-owned integration fixture, SQLite-authoritative rules export via POST, safe removal of the
unsafe client-content rules update action, pinned/50/10 pagination tests, and optimistic rollback
coverage.

Final verification:

- `npm --prefix frontend test -- --run`: **47 files, 413 tests passed**
- `npm --prefix frontend test -- --run tests/contract.test.ts tests/integration.test.ts`: **49 tests passed**
- `uv run pytest -q tests/contracts tests/integration`: **20 tests passed**
- `npm --prefix frontend run build`: **passed**, rebuilt `frontend/dist`
- `git diff --check`: **passed**

No required Worker D follow-ups remain. **COMPLETE**.
