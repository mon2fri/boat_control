# Worker C Release Gate Review

Date: 2026-07-18
Owner: Worker C
Frozen contract commit: `267521e`
Status: **READY**

---

## 1. Contract artifacts published

| Document | Path |
|----------|------|
| Rule semantics | `docs/20260718_contract_rule_evaluation.md` |
| API contract (final) | `docs/20260718_contract_api_final.md` |
| Delivery topology | `docs/20260718_contract_single_port_delivery.md` |
| Performance/pagination | `docs/20260718_contract_performance_and_pagination.md` |
| A/B handoff matrix | `docs/20260718_handoff_worker_matrix.md` |
| Machine-readable schema | `tests/contracts/v1/contract_schema.json` |
| Example fixtures | `tests/contracts/v1/examples.json` |

## 2. Contract test evidence

### Backend (Python)

```
$ python -m pytest tests/contracts/test_backend_contract.py -v
16 passed in 0.94s
```

| Suite | Tests | Result |
|-------|-------|--------|
| `TestContractVersion` | 3 | PASS |
| `TestHealthContract` | 1 | PASS |
| `TestUploadContract` | 1 | PASS |
| `TestInspectContract` | 1 | PASS |
| `TestFilterPrepareContract` | 1 | PASS |
| `TestFilterValidateContract` | 1 | PASS |
| `TestTargetValidateContract` | 1 | PASS |
| `TestRulesContract` | 2 | PASS |
| `TestExecuteContract` | 2 | PASS |
| `TestHistoryContract` | 1 | PASS |
| `TestRenameContract` | 1 | PASS |
| `TestErrorEnvelopeContract` | 1 | PASS |

### Frontend (TypeScript)

```
$ npx vitest run tests/contract.test.ts
Test Files  1 passed (1)
     Tests  23 passed (23)
```

| Suite | Tests | Result |
|-------|-------|--------|
| Zod schema validation | 7 valid + 1 rule detail + 1 invalid | PASS |
| Mapper round-trip | 4 | PASS |
| Invalid examples | 4 | PASS |

### Full frontend suite

```
$ npx vitest run
Test Files  28 passed (28)
     Tests  150 passed (150)
```

### Lint

```
$ python -m ruff check backend/ tests/contracts/
All checks passed!
```

## 3. Known discrepancies (not blocking)

| ID | Description | Impact | Owner |
|----|-------------|--------|-------|
| F7 | `wireRunMetadataSchema` still includes `file_path` field; backend history endpoint still returns it | Low — frontend shows extra field, no breakage | Worker A to remove from backend, Worker B to remove from Zod |
| F9 | Backend has no `grouping_tree` evaluator yet | Medium — grouping tree is defined in contract but backend must implement before grouping features work | Worker A |
| F12 | Stale `ValidationResult` construction in `tests/integration/test_workflow.py` (2 failures) | Low — pre-existing test debt, not related to new contracts | Worker A |

## 4. Stale documents superseded by new contracts

The following existing docs are superseded by the frozen contract set. Workers must use only the new docs:

1. `docs/analysis_worker_c_dependency_resolution.md`
2. `docs/20260715_plan_worker_c_dependency_resolution.md`
3. `docs/20260715_dependency_analysis.md`
4. `docs/20260716_contract_worker_c_dependency_resolution.md`
5. `docs/20260717_contract_worker_c_dependency_resolution.md`
6. `docs/20260717_contract_api_final.md`
7. `docs/20260717_contract_single_port_delivery.md`
8. `docs/20260717_contract_performance_and_pagination.md`
9. `docs/20260718_contract_api_final.md` (superseded by this release's version)

## 5. Frozen contract commitments

- **Rule semantics**: Required-state model. `is_violation = NOT evaluate(logic, row)`.
- **Execute response**: Nested shape `{ run_id, report_name, created_at, result: {...} }`.
- **Grouping tree**: Leaf nodes use `conditionId: string` (not `index: integer`).
- **Session model**: Opaque session IDs throughout; no file paths exposed to clients.
- **Delivery topology**: Single-port Django serving from port `8000`; SPA fallback for non-API routes.
- **Pagination**: Offset-based with max page size 200; `total` field always present.

## 6. Gate decision

**READY**

Workers A and B can begin implementation against this frozen contract set without making any shared contract decisions themselves. All contract tests pass. Known discrepancies are documented and assigned.

## 7. Open risks

1. Worker A must implement `grouping_tree` evaluation before grouping features work end-to-end.
2. Worker A must remove `file_path` from history endpoint and Worker B must remove it from `wireRunMetadataSchema` to close F7.
3. The 2 stale test failures in `tests/integration/test_workflow.py` will persist until Worker A updates the `ValidationResult` fixture construction.
