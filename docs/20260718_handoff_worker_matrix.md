# A/B Implementation Matrix

Date: 2026-07-18
Owner: Worker C
Status: **FROZEN** — maps every contract element to exactly one implementation owner.

## Ownership legend

- **A** = Worker A (backend)
- **B** = Worker B (frontend)
- **J** = Joint (both workers must coordinate)

---

## API routes

| Route | Method | Backend owner | Frontend owner | Notes |
|-------|--------|--------------|----------------|-------|
| `/api/health/` | GET | A | — | Already implemented |
| `/api/files/upload/` | POST | A | B | Already implemented both sides |
| `/api/files/inspect/` | POST | A | B | Already implemented both sides |
| `/api/files/filters/prepare/` | POST | A | B | Session-based, already implemented |
| `/api/files/filters/validate/` | POST | A | B | Session-based, already implemented |
| `/api/files/targets/validate/` | POST | A | B | Session-based, already implemented |
| `/api/files/targets/input/` | POST | A | B | Already implemented both sides |
| `/api/files/<session_id>/values/` | GET | A | B | **New endpoint** — Worker A implements |
| `/api/rules/` | GET/POST | A | B | Already implemented both sides |
| `/api/rules/<rule_id>/` | GET/PUT/DELETE | A | B | Already implemented both sides |
| `/api/rules/remote/` | POST | A | — | Local paths only |
| `/api/settings/` | GET/PUT | A | B | **New endpoint** — Worker A implements |
| `/api/filters/` | GET/POST | A | B | **New endpoint** — Worker A implements |
| `/api/filters/<filter_id>/` | PUT/DELETE | A | B | **New endpoint** — Worker A implements |
| `/api/files/presets/` | GET | A | B | **New endpoint** — Worker A implements |
| `/api/files/presets/load/` | POST | A | B | **New endpoint** — Worker A implements |
| `/api/runs/execute/` | POST | A | B | Needs `grouping_tree` support |
| `/api/runs/` | GET | A | B | Remove `file_path` from response |
| `/api/runs/<run_id>/` | GET | A | B | Already implemented both sides |
| `/api/runs/<run_id>/details/` | GET | A | B | **New endpoint** — Worker A implements |
| `/api/runs/<run_id>/rename/` | PUT | A | B | Already implemented both sides |
| `/api/reports/export/` | POST | A | B | Needs complete export (no truncation) |

---

## Wire schemas and Zod

| Contract element | Backend source | Frontend source | Joint test |
|-----------------|---------------|----------------|------------|
| Upload request | `apps.files.views.FileUploadView` | `wire.uploadRequestSchema` | C4 contract test |
| Upload response | `apps.files.views.FileUploadView` | `wire.wireUploadResponseSchema` | C4 contract test |
| Inspect response | `apps.files.views.HeaderInspectionView` | `wire.wireInspectResponseSchema` | C4 contract test |
| Prepare response | `apps.files.filter_views.FilterPreparationView` | `wire.wirePrepareResponseSchema` | C4 contract test |
| Filter validation | `apps.files.filter_views.FilterValidationView` | `wire.wireFilterValidationSchema` | C4 contract test |
| Target validation | `apps.files.filter_views.TargetColumnsView` | `wire.wireTargetValidationSchema` | C4 contract test |
| Column values | **New** `apps.files` | `wire.wireColumnValuesPageSchema` | C4 contract test |
| Rule list | `apps.rules.views.RulesListView` | `wire.wireRulesListSchema` | C4 contract test |
| Rule create | `apps.rules.views.RulesListView` | `wire.wireRuleCreateResponseSchema` | C4 contract test |
| Rule object | `apps.rules.views.RuleDetailView` | `wire.wireRuleSchema` | C4 contract test |
| Execute request | `apps.runs.views.ExecuteComparisonView` | `wire.wireRunRequestSchema` | C4 contract test |
| Execute response | `apps.runs.views.ExecuteComparisonView` | `wire.wireRunDocumentSchema` | C4 contract test |
| Run document | `apps.runs.persistence` | `wire.wireRunDocumentSchema` | C4 contract test |
| History list | `apps.runs.persistence.list_runs` | `wire.wireRunListItemSchema` | C4 contract test |
| Detail page | **New** `apps.runs` | `wire.wireDetailPageSchema` | C4 contract test |
| Rename response | `apps.runs.views` | `wire.wireRenameResponseSchema` | C4 contract test |
| Settings | **New** `apps.settings` | `wire.wireSettingsSchema` | C4 contract test |
| Saved filters | **New** `apps.filters` | `wire.wireSavedFilterSchema` | C4 contract test |
| Preset sources | **New** `apps.files` | `wire.wirePresetSourceSchema` | C4 contract test |
| Grouping tree | `apps.rules.services` | `wire.wireGroupNodeSchema` | C4 contract test |
| Error envelope | All views | `wire.wireErrorSchema` | C4 contract test |

---

## Components and services

| Component/Service | Owner | File(s) |
|------------------|-------|---------|
| Django settings | A | `backend/boat_control/settings.py` |
| URL routing | A | `backend/boat_control/urls.py` |
| File upload/inspect views | A | `backend/apps/files/views.py` |
| Filter/target views | A | `backend/apps/files/filter_views.py` |
| Column values view | A | `backend/apps/files/` (new) |
| Rules CRUD views | A | `backend/apps/rules/views.py` |
| Rules services | A | `backend/apps/rules/services.py` |
| Run execution | A | `backend/apps/runs/services.py` |
| Run persistence | A | `backend/apps/runs/persistence.py` |
| Run views | A | `backend/apps/runs/views.py` |
| Detail pagination | A | `backend/apps/runs/` (new) |
| Settings API | A | `backend/apps/settings/` (new) |
| Saved filters API | A | `backend/apps/filters/` (new) |
| Preset sources | A | `backend/apps/files/` (new) |
| Export services | A | `backend/apps/reports/services.py` |
| Export views | A | `backend/apps/reports/views.py` |
| React app shell | B | `frontend/src/components/AppShell.tsx` |
| Router | B | `frontend/src/router.tsx` |
| Workflow context | B | `frontend/src/state/WorkflowContext.tsx` |
| API client | B | `frontend/src/api/client.ts` |
| Wire schemas | B | `frontend/src/api/wire.ts` |
| Domain types | B | `frontend/src/api/domain.ts` |
| Mappers | B | `frontend/src/api/mapping.ts` |
| Endpoints | B | `frontend/src/api/endpoints.ts` |
| Upload page | B | `frontend/src/pages/UploadPage.tsx` |
| Prepare page | B | `frontend/src/pages/PreparePage.tsx` |
| Rules page | B | `frontend/src/pages/RulesPage.tsx` |
| Results page | B | `frontend/src/pages/ResultsPage.tsx` |
| History page | B | `frontend/src/pages/HistoryPage.tsx` |
| Settings page | B | `frontend/src/pages/SettingsPage.tsx` |
| GroupingTreeEditor | B | `frontend/src/features/rules/GroupingTreeEditor.tsx` |
| KeyColumnSelector | B | `frontend/src/features/keys/KeyColumnSelector.tsx` |
| PaginatedDetailSection | B | `frontend/src/features/results/PaginatedDetailSection.tsx` |
| ExportControls | B | `frontend/src/features/reports/ExportControls.tsx` |
| useSettings hook | B | `frontend/src/features/settings/useSettings.ts` |
| useSavedFilters hook | B | `frontend/src/features/filters/` |
| usePresetSources hook | B | `frontend/src/features/upload/` |
| useColumnValues hook | B | `frontend/src/features/filters/` |
| usePaginatedDetails hook | B | `frontend/src/features/results/` |
| Playwright config | B | `frontend/playwright.config.ts` |
| E2E journey | B | `frontend/e2e/journey.spec.ts` |

---

## Tests

| Test | Owner | File |
|------|-------|------|
| Backend unit tests | A | `tests/backend/*.py` |
| Backend integration tests | A | `tests/integration/test_workflow.py` |
| E2E fixture generator | A | `tests/integration/run_e2e_workflow.py` |
| Backend contract tests | J | `tests/contracts/` (C4) |
| Frontend unit tests | B | `frontend/src/**/*.test.ts(x)` |
| Frontend integration test | B | `frontend/tests/integration.test.ts` |
| Frontend contract tests | J | `tests/contracts/` (C4) |
| Security tests | B | `frontend/src/security.test.tsx` |
| E2E journey | B | `frontend/e2e/journey.spec.ts` |
| Benchmark | A | `tests/benchmarks/` (new) |

---

## Joint tests (both workers)

These tests span the backend/frontend boundary and require coordination:

1. `tests/contracts/v1/` — Machine-readable contract fixtures validated by both sides
2. `tests/integration/run_e2e_workflow.py` — Backend fixture generator for frontend tests
3. `frontend/tests/integration.test.ts` — Frontend validation of backend fixtures
4. Cross-boundary rule semantics test — `(A and B) or C` through editor → wire → evaluator → result

---

## Worker A artifacts before Worker B removes fallbacks

| Worker A must deliver | Worker B fallback removed |
|----------------------|--------------------------|
| `/settings/` endpoint | Settings page degrades to read-only on 404 |
| `/filters/` endpoints | Saved filters UI shows empty state |
| `/files/<session_id>/values/` endpoint | Column values use snapshot from prepare |
| `/runs/<id>/details/` endpoint | Detail table loads all data in one response |
| `/files/presets/` endpoints | Preset mode hidden/disabled |
| Export without truncation | Export shows truncation warning |
| `grouping_tree` evaluation | Grouping editor sends tree but backend ignores it |
| Required-state rule evaluator | UI already uses required-state phrasing |
| `file_path` removed from history | Frontend already doesn't use `file_path` |

---

## Worker B artifacts before Worker A completes static serving

| Worker B must deliver | Worker A uses for |
|----------------------|-------------------|
| `npm run build` producing `frontend/dist/` | Django serves as application root |
| Production build with no external refs | Static file serving verification |
| All routes work with SPA fallback | URL routing configuration |
| Playwright config with correct readiness URL | Integration test setup |

---

## Frozen contract metadata

| Item | Value |
|------|-------|
| Contract version | 1 |
| Rule evaluation contract | `docs/20260718_contract_rule_evaluation.md` |
| API contract | `docs/20260718_contract_api_final.md` |
| Delivery topology | `docs/20260718_contract_single_port_delivery.md` |
| Performance budgets | `docs/20260718_contract_performance_and_pagination.md` |
| This matrix | `docs/20260718_handoff_worker_matrix.md` |
| Contract fixtures | `tests/contracts/v1/` |
| Audit record | `reviews/20260718_review_worker_c_dependency_audit.md` |
