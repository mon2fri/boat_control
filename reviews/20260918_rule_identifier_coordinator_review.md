# 2026-09-18 Canonical rule identifier — coordinator review

Status: **READY** — final 20260918 release review completed from `c607f2b` plus the
coordinator's final verification fixes. This is a release-gate disposition; it does not perform or
claim the user's eventual merge/release operation.

## Baseline inventory

Recorded before any worktree/branch creation. Commands were read-only.

| Item | Value |
| --- | --- |
| Original workspace | `C:\Users\zwj80\Documents\codings\boat_control` |
| Starting branch | `main` |
| Baseline commit | `45a0ae77ad8a43be9b5f5f13bdeed657472905de` |
| Baseline subject | `feat: enhance extra columns configuration in reports and tables` |
| Pre-existing worktrees | original workspace only |

Pre-existing modified/untracked paths (user-owned; not stashed, reset, cleaned, overwritten, or committed):

- `Lib/` (untracked)
- `data/prepare_cache/` (untracked)
- `scripts/pip3.14.exe` (untracked)
- `scripts/pip3.exe` (untracked)

Instruction/plan documents are present on the baseline:

- `requirements/20260918_validation_rule_identifier.md`
- `planning/20260918_canonical_business_rule_identifier_implementation_plan.md`
- `planning/20260918_rule_identifier_coordinator_reviewer_instruction.md`
- `planning/20260918_rule_identifier_worker_a_identity_store_instruction.md`
- `planning/20260918_rule_identifier_worker_b_catalog_api_instruction.md`
- `planning/20260918_rule_identifier_worker_c_run_contract_instruction.md`
- `planning/20260918_rule_identifier_worker_d_frontend_instruction.md`

No coordination commit was required.

## Branch and worktree topology

Created by the coordinator from baseline `45a0ae77ad8a43be9b5f5f13bdeed657472905de`. No force flags.

| Branch | Worktree |
| --- | --- |
| `work/cbri-integration` | `C:\Users\zwj80\Documents\codings\boat_control-worktrees\integration` |
| `work/cbri-worker-a` | `C:\Users\zwj80\Documents\codings\boat_control-worktrees\worker-a` |
| `work/cbri-worker-b` | `C:\Users\zwj80\Documents\codings\boat_control-worktrees\worker-b` |
| `work/cbri-worker-c` | `C:\Users\zwj80\Documents\codings\boat_control-worktrees\worker-c` |
| `work/cbri-worker-d` | `C:\Users\zwj80\Documents\codings\boat_control-worktrees\worker-d` |

Original workspace remains on `main` at the baseline. Workers must not edit it.

## Frozen Gate 0 contracts

Workers must not invent conflicting alternatives.

- Public identifier: `CBR1_` plus exactly 20 uppercase Crockford Base32 characters (25 characters total). Encodes the first 96 bits of SHA-256 over deterministic compact UTF-8 JSON with an explicit v1 schema marker. Full hex digest and canonical payload are retained for collision verification. Mismatches are rejected.
- Included identity fields: condition predicates (`column_name`, `operator`, effective value set), normalized mixed AND/OR topology, logic clause (`format`, `column_name`, `operator`, effective targets), `comparison_mode` including effective default. Exact persisted strings; no trim/case-fold/Unicode-normalize/numeric coerce unless the evaluator does the same.
- Excluded identity fields: `Rxxx`/`rule_id`, name, description, extra columns, hide-comparison, display ordering, condition/group leaf IDs.
- Conservative equivalence: ignore condition/group sequence, leaf IDs, same-operator parenthesization, multi-value ordering/duplicates. Preserve duplicate condition nodes and mixed-operator structure. Do not distribute, absorb, imply, eliminate contradictions, simplify thresholds, apply domain reasoning, or convert multi-value predicates into multiple predicates.
- Catalog/enablement: SQLite is authoritative. UI-created rules save immediately and enable by default. Empty enabled set means zero rules, not all rules. Soft archive; never reuse deleted/archived `Rxxx`. Identities are append-only.
- Import: parse/validate completely before mutating. Recalculate identifiers; ignore supplied `Rxxx`/IDs/digests except reject diagnostic mismatch. Atomic reuse/unarchive/import-missing; enable exactly the config set in config order; never delete omitted catalog/history rows.
- Pagination: first response is first 50 non-archived catalog rules plus all enabled rules, deduplicated. Each Next-page cursor reads at most 10 new rules until `has_more` is false. Cursors bind to store revision; stale/invalid cursors are rejected.

## Ownership matrix

| Owner | Exclusive files / areas | Gate |
| --- | --- | --- |
| Worker A | `backend/apps/rules/identifiers.py`, `models.py`, `repository.py` (or coordinator-approved equivalent), `backend/apps/rules/migrations/`, focused identifier/repository tests, canonical format/schema technical docs | Gate 1 — implement now |
| Worker B | `backend/apps/rules/services.py`, `serializers.py`, `views.py`, `urls.py`; rule-specific `backend/apps/configs/`; `migrate_rules_to_db`; `scripts/dev.sh` and `trigger.py` migration integration; backend rule/config API and migration tests; backend rules/config operations docs | Gate 2 — after Gate 1 |
| Worker C | `backend/apps/runs/` services/serializers/views/detail/persistence; identifier pass-through in `backend/apps/reports/`; `tests/contracts/v1/contract_schema.json`, `examples.json`, contract tests; run/persistence/report/integration tests; backend API/run/compatibility docs | Gate 3 — after Gate 2 freeze |
| Worker D | frontend wire/domain/mapping/hooks/components/pages/tests; frontend/user docs; `frontend/dist` after tests and production build | Gate 3 — after Gate 2 freeze; integrate C before D if contracts overlap |
| Coordinator | planning instructions, this review, ownership reassignments, conflict resolution, final documentation consistency, integration branch | All gates |

Shared hotspots — exactly one active owner at a time:

| File | Active owner now | Later owner |
| --- | --- | --- |
| `backend/apps/rules/services.py` | none until Gate 2 | Worker B |
| `tests/contracts/v1/contract_schema.json` | none until Gate 3 | Worker C |
| `tests/contracts/v1/examples.json` | none until Gate 3 | Worker C |
| `frontend/src/api/wire.ts` | none until Gate 3 | Worker D |
| `frontend/src/api/mapping.ts` | none until Gate 3 | Worker D |
| `docs/20260718_rules_api.md` | none until Gate 2 | Worker B, then Worker C may extend run fields only with coordinator approval |
| `docs/20260718_contract_api_final.md` | none until Gate 3 | Worker C |
| launcher files and `frontend/dist/` | none | Worker B (launchers), Worker D (`frontend/dist`) |

## Worker launch status

| Worker | Workstream | Launch mode |
| --- | --- | --- |
| A | Canonical identity and SQLite catalog foundation | Implement A1–A4 in `work/cbri-worker-a` |
| B | Backend catalog/configuration APIs and migration | Read/inspect/acknowledge only until Gate 1 is READY |
| C | Run propagation, persistence, contracts, and reports | Read/inspect/acknowledge only until Gate 2 contract freeze |
| D | Frontend catalog, enablement, configuration, and pagination | Read/inspect/acknowledge only until Gate 2 wire freeze |

## Integration order

1. Worker A → Gate 1 independent verification
2. Worker B → Gate 2 independent verification and freeze backend response examples
3. Worker C then Worker D (parallel worktrees; integrate C before D if contract artifacts overlap)
4. Gate 4 full suite from the integration worktree

Worker commit hashes, revision rounds, requirement-by-requirement disposition, and final test evidence will be recorded after each gate.

## Gate 1 — Worker A foundation

Worker A commits integrated in order:

1. `a287880` — canonical identity/catalog foundation
2. `b4163cf` — transactional repository
3. `0286dae` — delivery evidence
4. `71616d8` — completed handoff documentation

Coordinator verification from `work/cbri-integration`:

| Check | Result |
| --- | --- |
| `uv run pytest -q tests/backend/test_rule_identifiers.py tests/backend/test_rule_repository.py tests/backend/test_rules.py` | **52 passed** |
| `uv run python backend/manage.py check` | passed |
| `uv run python backend/manage.py makemigrations --check --dry-run` | no changes detected |
| `uv run python backend/manage.py migrate --check` | passed |
| `uv run ruff check backend/apps/rules tests/backend/test_rule_identifiers.py tests/backend/test_rule_repository.py` | passed |
| `uv run mypy backend/apps/rules` | passed |
| `git diff --check` | passed |

The repository foundation exposes the documented typed snapshots, import primitives, collision and
corruption errors, revision-bound cursors, and immutable `Rule.rule_identifier` snapshots. The
worker's unrelated uncommitted `config/rules/rules.yaml` and `data/prepare_cache/` paths were not
integrated. Gate 1 is accepted. Worker B may now implement against the frozen repository contract.

## Gate 2 — Worker B backend behavior

Worker B commits integrated after Gate 1:

1. `299730e` — SQLite catalog APIs, config operations, migration command, launcher wiring, and tests
2. `9a45875` — delivery evidence

Coordinator verification from `work/cbri-integration`:

| Check | Result |
| --- | --- |
| `uv run python backend/manage.py check` | passed |
| `uv run python backend/manage.py makemigrations --check --dry-run` | no changes detected |
| `uv run python backend/manage.py migrate --check` | passed |
| `uv run pytest -q tests/backend/test_rule_catalog_api.py tests/backend/test_rule_migration.py tests/backend/test_rules.py tests/backend/test_configs_api.py` | **54 passed** |
| `uv run ruff check backend/apps/rules backend/apps/configs tests/backend/test_rule_catalog_api.py tests/backend/test_rule_migration.py` | passed |
| `uv run mypy backend/apps/rules backend/apps/configs` | passed |
| `git diff --check` | passed |

Gate 2 is accepted for release to Workers C and D. The coordinator must still verify the exact
machine-readable response shape and adversarial import/pagination cases during Gate 3 integration.

## Gate 3 — Workers C and D

Worker C was integrated before Worker D. The C implementation and contract evidence are represented
by `330d0c9` and its delivery commits `3b124b7`, `4c2a4dd`, and `8edab37`. Coordinator verification:

- Backend run/detail/report/contracts/integration focused suites: **101 passed**.
- Full backend suite after C/D integration: **273 passed**.
- Ruff for run/report/contracts/integration scope: passed.
- mypy for run/report scope: passed.
- Migration checks and Django check: passed.

Worker D frontend commits integrated after C:

- `002c0c9` — initial catalog frontend implementation
- `8c2eeb7` — canonical run-contract and SQLite-export corrections
- `e3b293b`, `b92ce9c` — delivery evidence

Coordinator verification:

- Frontend tests: **413 passed**.
- Frontend contract/integration tests: **49 passed**.
- Frontend production build: passed.
- Backend contract/integration tests: **20 passed**.

The frontend config-save path now uses the backend SQLite-authoritative export operation, and C's
run bindings/identifier fixtures are consumed rather than inferred. Gate 3 implementation evidence
is complete, subject to Gate 4 release verification below.

## Gate 4 — final release verification

Passing checks from the final integration worktree:

- `uv run python backend/manage.py makemigrations --check --dry-run`: no changes detected.
- `uv run python backend/manage.py migrate --check`: passed.
- `uv run python backend/manage.py check`: passed.
- `uv run pytest -q tests/backend tests/contracts tests/integration`: **277 passed**.
- `npm --prefix frontend test -- --run`: **413 passed**.
- `npm --prefix frontend run build`: passed.
- `uv run ruff check backend tests`: passed.
- `uv run mypy backend`: passed, 70 source files.
- `git diff --check`: passed after normalizing generated `frontend/dist` line endings.

Coordinator final fixes:

- Typed `_settings_response` and the value-family return in `backend/apps/settings/views.py` and
  `backend/apps/families/resolver.py`, removing the three full-mypy failures without changing
  runtime behavior.
- Fixed atomic configuration import ordering in `backend/apps/rules/repository.py`: old enabled
  positions are cleared before applying the imported enabled set, preventing a partial unique-order
  collision when a business-logic edit imports a new identity.
- Added `tests/backend/test_rule_identifier_release_review.py` with repeatable release scenarios.

## Final UI/UX and functional evidence

The following commands were run from `work/cbri-integration`:

- `npm --prefix frontend test -- --run`: **47 files, 413 tests passed**.
- Targeted UI journey command using `src/...` paths: **5 files, 51 tests passed**. This covered the
  Rules page, rule list selection/pagination, wire mapping, the upload-to-results journey, and config
  manager interactions.
- `npm --prefix frontend run build`: passed; Vite rebuilt the tested production assets. The committed
  `frontend/dist` artifact was normalized afterward and `git diff --check` passed.

Functional identifier scenarios:

- Equivalent condition and grouping reorder, same-operator reassociation, multi-value order and
  duplicate-value normalization: `tests/backend/test_rule_identifiers.py` passed.
- Non-equivalent threshold redundancy, exact string changes, duplicate predicates, mixed topology,
  and logic format changes: `tests/backend/test_rule_identifiers.py` passed.
- Create/save, presentation edit stability, business-logic edit versioning, enable/disable, import,
  export, and read-only identifiers: `tests/backend/test_rule_catalog_api.py` and
  `test_rule_identifier_release_review.py` passed.
- External edit/import creates a new identity, disables the prior version, and rejects a forged
  identifier atomically: `test_external_import_versions_rule_and_invalid_import_is_atomic` passed.
- Empty enabled configuration preserves the catalog while exporting zero enabled rules, and the
  initialized empty migration does not re-import later legacy-file edits: release-review tests passed.
- More than 50 rules, an enabled rule outside the first page, deduplication, 10-rule continuation,
  and pinned enabled visibility: repository/API release-review tests passed.
- Populated legacy migration preserves `Rxxx`, order, `next_index`, enablement, and idempotence:
  `uv run pytest -q tests/backend/test_rule_migration.py` passed.
- New validation runs persist bindings and identifiers, reports/details preserve them, and old run
  documents load with absent identity rather than guessed identity: persistence, run-detail, report,
  contract, and integration tests passed.
- HTML/Excel report rendering for legacy and identifier-bearing results passed in
  `tests/backend/test_reports.py`.

Exact final focused command:

```text
uv run pytest -q tests/backend/test_rule_identifier_release_review.py tests/backend/test_rule_identifiers.py tests/backend/test_rule_repository.py tests/backend/test_rule_migration.py tests/backend/test_persistence.py tests/backend/test_reports.py
50 passed
```

## Final checklist disposition

- [x] All four worker scopes are complete with no unowned requirement.
- [x] No worker modified user-owned unrelated files.
- [x] Model and migration state matches committed code; no missing migration is generated.
- [x] Canonicalization is deterministic across process restarts and independent installations.
- [x] All configured rule definitions remain in SQLite; business-logic edits preserve prior entries.
- [x] `Rxxx` remains local and canonical identifiers remain stable across config import/order changes.
- [x] Saved configs contain exactly enabled rules and enough authored content to import missing rules.
- [x] Import is atomic and never deletes omitted catalog/history rows.
- [x] Initial list and Next-page database reads follow the exact 50-plus-enabled/10 rule contract.
- [x] Run persistence contains stable rule bindings, including zero-violation rules.
- [x] Backward compatibility, reports, exports, and browser-journey tests pass.
- [x] Relevant API, operations, migration, and implementation documents match behavior.
- [x] `frontend/dist` was rebuilt only after source tests and production build passed.
- [x] Final integration diff contains no debug code, accidental generated files, secrets, live data,
  or unrelated cleanup.

## Checklist (open)

- [ ] All four worker scopes are complete with no unowned requirement.
- [ ] No worker modified user-owned unrelated files.
- [ ] Model and migration state matches committed code; no missing migration is generated.
- [ ] Canonicalization is deterministic across process restarts and independent installations.
- [ ] All configured rule definitions remain in SQLite; business-logic edits preserve prior entries.
- [ ] `Rxxx` remains local and canonical identifiers remain stable across config import/order changes.
- [ ] Saved configs contain exactly enabled rules and enough authored content to import missing rules.
- [ ] Import is atomic and never deletes omitted catalog/history records.
- [ ] Initial list and Next-page database reads follow the exact 50-plus-enabled/10 rule contract.
- [ ] Run persistence contains stable rule bindings, including zero-violation rules.
- [ ] Backward compatibility, reports, exports, and browser journeys pass.
- [ ] Relevant API, operations, migration, and implementation documents match behavior.
- [ ] `frontend/dist` is rebuilt only after source tests and production build pass.
- [ ] Final integration diff contains no debug code, accidental generated files, secrets, live data, or unrelated cleanup.

Final status: **READY**
