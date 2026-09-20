# 2026-09-18 Rule Identifier Worker C Delivery Review

## Status

**COMPLETE**

Gate 2 was accepted before implementation. Worker C consumed the accepted SQLite
catalog contracts and completed run propagation, persistence compatibility, detail
pass-through, report compatibility, shared fixtures, tests, and documentation.

## Reading Confirmation

Read completely:

- `requirements/20260918_validation_rule_identifier.md`
- `planning/20260918_canonical_business_rule_identifier_implementation_plan.md`
- `planning/20260918_rule_identifier_coordinator_reviewer_instruction.md`
- `planning/20260918_rule_identifier_worker_c_run_contract_instruction.md`
- `docs/20260718_handoff_worker_matrix.md`
- `docs/20260718_runs_api.md`
- `docs/20260718_persistence_api.md`
- `docs/20260718_rule_semantics.md`
- `docs/20260718_contract_api_final.md`
- `docs/20260718_contract_rule_evaluation.md`
- `docs/20260718_exports_api.md`
- `docs/20260718_api_contract.md`

Inspected the current run, persistence, report, serializer/view, contract-fixture,
backend contract-test, backend run/persistence/detail/report-test, and integration
workflow files listed below. The requested accepted Worker A and Worker B delivery
reviews/API examples are not present under `reviews/20260918*` in this worktree;
their absence is recorded as a dependency and no interface has been inferred.

## Worktree Confirmation

- Worktree: `C:\Users\zwj80\Documents\codings\boat_control-worktrees\worker-c`
- Branch: `work/cbri-worker-c`
- Starting HEAD: `45a0ae7 feat: enhance extra columns configuration in reports and tables`
- Dependency commits cherry-picked into this branch:
  - `8087e89` from accepted Worker A `a287880`: canonical identity foundation
  - `30dcc87` from accepted Worker A `b4163cf`: transactional catalog repository
  - `d6210a9` from accepted Worker B `299730e`: SQLite catalog APIs and migration
- Worker C implementation commit: `330d0c9 feat: propagate canonical rule identifiers through runs`
- Delivery review commit: `3b124b7 docs: complete worker C rule identifier delivery`

## Owned-File Inventory

Worker C owns the following areas after the Gate 2 contract freeze:

- Execution propagation: `backend/apps/runs/services.py`, including immutable rule
  snapshots, `rule_identifier` on validation structures, summaries, violations, and
  run-level bindings.
- Run persistence/API: `backend/apps/runs/persistence.py`,
  `persistence_serializers.py`, `persistence_views.py`, `run_detail_views.py`, and
  related run views/serializers.
- Reports: identifier pass-through in `backend/apps/reports/` without changing
  report layout, filenames, anchors, or sheet names.
- Shared executable contracts: `tests/contracts/v1/contract_schema.json`,
  `tests/contracts/v1/examples.json`, and `tests/contracts/test_backend_contract.py`.
- Verification: `tests/backend/test_runs.py`, `test_persistence.py`,
  `test_run_views.py`, `test_run_detail_views.py`, `test_reports.py`, and
  `tests/integration/` run/persistence/report workflow coverage.
- Documentation: canonical run, persistence, report, compatibility, and API
  contract documentation owned by Worker C.

Frontend source remains unchanged. Worker A/B catalog implementation remains outside
this worker's implementation scope.

## Baseline Evidence Before Implementation

- `backend/apps/runs/services.py:63-74` defines `ValidationViolation` without a
  canonical identifier; `:301-309` creates summaries without one; `:837-841`
  still loads and selects rules from the file-backed `load_rules()` path. Worker B's
  accepted database-backed catalog interface is required before C can safely change
  this path.
- `backend/apps/runs/services.py:101-116` defines `ExecutionResult` without a
  `rule_bindings` snapshot. The implementation must preserve explicit empty selection
  and include selected zero-violation rules, not interpret an empty list as all rules.
- `backend/apps/runs/persistence.py:141-167` serializes validation fields but has no
  bindings or canonical identifiers. `load_run()` has compatibility defaults for
  older result fields (`:245-280`) but does not yet provide an honest missing/null
  canonical identity. It must never derive identity from an old `Rxxx`.
- `backend/apps/runs/run_detail_views.py:38-57` flattens violations into detail
  rows but currently omits `rule_id`, rule name, and any canonical identifier. The
  detail contract must retain identifiers while preserving current grouping and
  filters.
- `backend/apps/reports/services.py:160-189` and `:229-260` group/render using
  run-local rule IDs and names. Reports must read persisted snapshots, continue to
  render legacy documents, and avoid introducing canonical IDs into visible layout,
  filenames, anchors, or sheet names unless explicitly frozen.
- `tests/contracts/v1/contract_schema.json:420-469` currently requires only
  `rule_id` in violations and has no `rule_bindings`; `examples.json:149-177` has no
  new-run binding or identifier example. These shared fixtures must wait for the
  frozen Worker B response examples.
- `docs/20260718_exports_api.md:37-46` still describes export row limits that do
  not match the current full-materialization tests. This documentation should be
  reconciled as part of C's later report/documentation pass, not silently changed
  before the gate.
- No accepted Worker A/B delivery evidence is available in this worktree. Questions
  about catalog snapshot loading, enabled-rule selection, response optionality, and
  import bindings remain unresolved.

## Implemented Wire Fields

These fields match the accepted Gate 2 catalog contract and the committed v1
fixtures. Frontend consumers should use these exact snake_case names.

- **New run result:** `result.rule_bindings: object<string, string>`, mapping every
  selected local `Rxxx` to its `CBR1_` identifier, including zero-violation rules.
  Explicit zero selection is `{}`.
- **New violation:** required run-local `rule_id` plus `rule_identifier`, where the
  latter matches `^CBR1_[0-9A-Z]{20}$`.
- **New rule summary:** summary remains keyed by local `Rxxx` and contains
  `rule_identifier` alongside the persisted rule snapshot fields.
- **Violation detail:** contains `rule_id`, `rule_name`, and optional/null
  `rule_identifier`; pagination does not drop the identifier.
- **Legacy run:** absent `rule_bindings` loads as `{}`. Missing per-record or summary
  identifiers remain absent/null. No identity is inferred from `Rxxx`.

Exact committed fixture excerpt:

```json
{
  "rule_bindings": {
    "R001": "CBR1_00000000000000000000",
    "R002": "CBR1_11111111111111111111"
  },
  "validation": {
    "violations_by_rule": {
      "R001": [{
        "rule_id": "R001",
        "rule_identifier": "CBR1_00000000000000000000"
      }]
    }
  }
}
```

Worker D should map `rule_bindings` as `Record<string, string>` and treat
`validation_violation.rule_identifier` as nullable/optional for legacy documents.

The former pre-Gate-2 proposal is superseded by the implemented fields and accepted
catalog interfaces above; there are no unresolved Worker C wire-shape proposals.

## Gate 2 Decisions Consumed

- `load_rules()` reads the initialized, enabled SQLite catalog and returns immutable
  `Rule` snapshots carrying `rule_identifier`; explicit paths remain legacy parsers.
- Catalog rule responses use version 2 with `rule_identifier`, `enabled`, pinned IDs,
  revision, and opaque pagination metadata.
- New run `rule_bindings` is required by the run-result schema; legacy loading supplies
  `{}` only when the persisted field is absent.
- Legacy identities are unavailable, not guessed. Detail/report code preserves local
  grouping and historical snapshots.

## Changed Files

- `backend/apps/runs/services.py`: catalog snapshot bindings, violation and summary identifiers.
- `backend/apps/runs/persistence.py`: persisted bindings and legacy defaults.
- `backend/apps/runs/serializers.py`: identifier/binding serializer fields.
- `backend/apps/runs/run_detail_views.py`: identifier-preserving violation details.
- `backend/apps/reports/services.py`, `backend/apps/reports/views.py`: persisted snapshot
  compatibility, report ordering/layout regression fixes, and typed export content.
- `tests/contracts/v1/contract_schema.json`, `tests/contracts/v1/examples.json`: exact
  run/rule identifier fields, catalog v2 envelope, zero-selection and legacy examples.
- `tests/contracts/test_backend_contract.py`: database-backed contract assertions.
- `tests/backend/test_runs.py`, `test_persistence.py`, `test_run_detail_views.py`,
  `test_reports.py`: DB snapshot, zero-violation, round-trip, legacy, detail, and export coverage.
- `tests/integration/test_workflow.py`, `tests/backend/test_rule_migration.py`: isolated
  database test setup and lint hygiene for the accepted catalog migration.
- `docs/20260718_runs_api.md`, `20260718_persistence_api.md`,
  `20260718_contract_api_final.md`, `20260718_exports_api.md`: run and compatibility docs.

No frontend file was changed.

## Verification Results

- `uv run pytest -q tests/backend/test_runs.py tests/backend/test_persistence.py`: **58 passed**
- `uv run pytest -q tests/backend/test_run_views.py tests/backend/test_run_detail_views.py`: **6 passed**
- `uv run pytest -q tests/backend/test_reports.py tests/contracts tests/integration`: **37 passed**
- `uv run pytest -q tests/backend`: **253 passed**
- `uv run ruff check backend/apps/runs backend/apps/reports tests/backend tests/contracts tests/integration`: **passed**
- `uv run mypy backend/apps/runs backend/apps/reports`: **passed, 14 source files**
- `uv run python backend/manage.py makemigrations --check --dry-run`: **No changes detected**
- `uv run python backend/manage.py migrate --check`: **passed**
- `git diff --check`: **passed**

All result/database activity used pytest-isolated databases and temporary result paths.
The generated prepare-cache artifact was removed and no live saved runs were modified.

## Final Disposition

Worker C is complete. No required follow-up remains in this scope.

**COMPLETE**
