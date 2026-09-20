# 2026-09-18 Rule Identifier Worker B Delivery Review

## Status

`WAITING_FOR_GATE_1`

Gate 1 is not ready. This branch contains no accepted Worker A delivery or repository
documentation, and the Worker B instruction explicitly requires waiting for the coordinator's
Gate 1 approval. No backend APIs, migrations, tests, frontend files, contracts, or launcher files
were modified for this review.

## Reading Confirmation

Read completely:

- `requirements/20260918_validation_rule_identifier.md`
- `planning/20260918_canonical_business_rule_identifier_implementation_plan.md`
- `planning/20260918_rule_identifier_coordinator_reviewer_instruction.md`
- `planning/20260918_rule_identifier_worker_a_identity_store_instruction.md`
- `planning/20260918_rule_identifier_worker_b_catalog_api_instruction.md`
- `planning/20260918_rule_identifier_worker_c_run_contract_instruction.md`
- `planning/20260918_rule_identifier_worker_d_frontend_instruction.md`

Inspected current implementation, tests, launchers, and documentation:

- `backend/apps/rules/services.py`
- `backend/apps/rules/serializers.py`
- `backend/apps/rules/views.py`
- `backend/apps/rules/urls.py`
- `backend/apps/configs/services.py`
- `backend/apps/configs/serializers.py`
- `backend/apps/configs/views.py`
- `backend/boat_control/settings.py`
- `backend/boat_control/urls.py`
- `scripts/dev.sh`
- `trigger.py`
- `tests/backend/test_rules.py`
- `tests/backend/test_configs.py`
- `tests/backend/test_configs_api.py`
- `docs/20260718_rules_api.md`
- `docs/20260718_reference_operations_guide.md`
- `docs/20260718_rule_semantics.md`

No `reviews/20260918_rule_identifier_worker_a_delivery.md` or accepted Worker A repository
contract is present in this worktree.

## Owned-File Inventory

The post-Gate-1 Worker B scope is:

- `backend/apps/rules/services.py`
- `backend/apps/rules/serializers.py`
- `backend/apps/rules/views.py`
- `backend/apps/rules/urls.py`
- Rule-specific integration under `backend/apps/configs/`
- The `migrate_rules_to_db` management command and its tests
- `scripts/dev.sh`
- `trigger.py`
- Backend rule/config API and migration tests
- Backend rules/config operations documentation

Shared integration hotspots require coordinator sequencing and must not be edited before ownership
is explicitly active:

- `backend/apps/rules/services.py`
- launcher files
- `docs/20260718_rules_api.md` and related API/operations documentation
- shared contract JSON and frontend files, which are not Worker B-owned

Worker B must consume Worker A's accepted canonicalizer, models, repository signatures, error types,
transaction semantics, and cursor primitives. It must not duplicate canonicalization or invent a
parallel repository/API contract.

## Current Baseline Findings

- `apps.rules.services` currently reads and writes `config/rules/rules.yaml`; `load_rules()` and
  `save_rules()` are the live storage path.
- The current `Rule` dataclass has `rule_id` but no `rule_identifier` or persisted enablement state.
- `RulesListView` returns the complete YAML collection. Create/update/delete/reorder mutate the YAML
  collection, and `ReplaceRulesView` replaces the collection and reassigns IDs from `R001`.
- Current rule serializers accept drafts but the response serializers are not used to enforce a
  canonical identifier or catalog pagination shape.
- `/api/rules/configs/` is a generic file CRUD API in `apps.configs`; it stores arbitrary YAML
  content and does not apply a catalog transaction.
- `scripts/dev.sh` and `trigger.py` run Django migrations but do not run a legacy rule migration
  command.
- Existing rule tests intentionally assert YAML replacement, sequential replacement IDs, and empty
  replacement behavior. They will need coordinated replacement/extension after Gate 1 rather than
  being changed in this gated review.
- `docs/20260718_rules_api.md` documents YAML as live storage and a remote YAML endpoint that is not
  present in the current `backend/apps/rules/urls.py`; this documentation must be reconciled in the
  later Worker B documentation pass.

## Risks and Questions

- **Gate dependency:** Which exact Worker A commit and delivery document freeze the repository
  signatures, domain `Rule` shape, model names, and cursor/error types? Worker B cannot safely wire
  views or serializers until these are accepted.
- **Endpoint shape:** Should the existing `POST /api/rules/` remain create-only while a new explicit
  import/export endpoint replaces `POST /api/rules/replace/`, or will the coordinator freeze another
  route? The current route is destructive and incompatible with catalog retention.
- **Pagination envelope:** The plan requires initial 50-plus-enabled records, pinned enabled
  records, `next_cursor`, `has_more`, total count, and revision, but does not freeze the exact JSON
  field names/envelope or cursor transport. Worker C/D need this frozen after Gate 2.
- **Enablement routes:** The plan permits a single mutation endpoint or validated bulk equivalent.
  The exact method/path/body and stable error mapping for unknown, archived, duplicate, and stale
  IDs remain open.
- **Configuration ownership:** The generic named-config API currently accepts arbitrary content.
  The coordinator must decide whether Worker B extends that API or adds dedicated rule snapshot
  export/import operations while preserving non-rule config behavior.
- **Legacy migration input:** The migration command must preserve legacy IDs/order/`next_index`, but
  the accepted Worker A repository must define how legacy parsed `Rule` values become exact authored
  payloads and how malformed files report failures atomically.
- **Launcher failure policy:** Both launchers need `migrate_rules_to_db` after `migrate`; the exact
  settings/environment propagation and startup error wording should be agreed before editing.
- **Existing semantic documentation:** `docs/20260718_rule_semantics.md` says Worker A confirmation
  is pending. The Worker B delivery should not silently resolve that cross-owner semantic issue while
  wiring catalog APIs.
- **Test isolation:** API and migration tests must override both database and legacy/config paths;
  current tests primarily override YAML paths and could accidentally exercise a shared SQLite DB once
  the catalog is introduced.

## PROPOSED Post-Gate-1 Request/Response Examples

These are **PROPOSED discussion examples only**, not contracts. They intentionally use placeholder
repository/API decisions until Gate 1 is accepted and the coordinator freezes the Worker A interface.
`CBR1_EXAMPLE_IDENTIFIER` is a placeholder and is not a canonicalization result.

### Proposed initial catalog response

```http
GET /api/rules/
```

```json
{
  "version": 2,
  "rules": [
    {
      "rule_id": "R003",
      "rule_identifier": "CBR1_EXAMPLE_IDENTIFIER",
      "enabled": true,
      "name": "Valid status",
      "description": "Status must be active",
      "conditions": [],
      "logic": {
        "format": "value_vs_column",
        "column_name": "status",
        "operator": "eq",
        "target_value": "active",
        "comparison_mode": "comparison_vs_baseline"
      }
    }
  ],
  "pinned_enabled": [],
  "total": 1,
  "revision": 7,
  "next_cursor": null,
  "has_more": false
}
```

The final shape must be replaced with the coordinator-approved response after Gate 1, including the
exact distinction between ordinary and pinned records.

### Proposed rule creation request/response

```http
POST /api/rules/
```

```json
{
  "name": "Valid status",
  "description": "Status must be active",
  "conditions": [],
  "logic": {
    "format": "value_vs_column",
    "column_name": "status",
    "operator": "eq",
    "target_value": "active"
  }
}
```

```json
{
  "rule_id": "R003",
  "rule_identifier": "CBR1_EXAMPLE_IDENTIFIER",
  "enabled": true,
  "message": "Rule created."
}
```

The request deliberately contains no client-selected `rule_id` or `rule_identifier`.

### Proposed continuation request/response

```http
GET /api/rules/?cursor=OPAQUE_CURSOR
```

```json
{
  "rules": [],
  "pinned_enabled": [],
  "total": 61,
  "revision": 7,
  "next_cursor": "OPAQUE_NEXT_CURSOR",
  "has_more": true
}
```

`OPAQUE_CURSOR` and `OPAQUE_NEXT_CURSOR` are placeholders. The implementation must use Worker A's
accepted revision-bound keyset primitive and must not expose an invented cursor encoding here.

### Proposed explicit enablement mutation

```http
POST /api/rules/enablement/
```

```json
{
  "rule_ids": ["R003", "R010"],
  "enabled": true
}
```

```json
{
  "rules": [
    {"rule_id": "R003", "rule_identifier": "CBR1_EXAMPLE_IDENTIFIER", "enabled": true},
    {"rule_id": "R010", "rule_identifier": "CBR1_EXAMPLE_IDENTIFIER_2", "enabled": true}
  ],
  "revision": 8
}
```

The route, method, ordering semantics, and error envelope remain coordinator decisions.

### Proposed explicit configuration import result

```http
POST /api/rules/configurations/import/
```

```json
{
  "imported": 1,
  "reused": 2,
  "enabled": 3,
  "disabled": 4,
  "bindings": {
    "R003": "CBR1_EXAMPLE_IDENTIFIER",
    "R010": "CBR1_EXAMPLE_IDENTIFIER_2"
  },
  "revision": 9
}
```

The imported document must contain complete authored rule payloads. Supplied IDs/digests must not be
trusted; the accepted Worker A canonicalizer/repository determines the identifiers. This example is
not approval to implement this path or field set before Gate 1.

## Pre-Gate Handoff Decision

Before Gate 1 acceptance, implementation was intentionally blocked and the examples above were
proposals only. The following section records the subsequent accepted implementation evidence.

## Gate 1 Acceptance and Implementation Evidence

Gate 1 was accepted before implementation. The accepted Worker A foundation was cherry-picked as
separate commits and is not part of the Worker B implementation commit:

- `a287880` / cherry-pick `ec0e2dc`: canonicalizer, models, migration, and focused tests.
- `b4163cf` / cherry-pick `d27ea9d`: transactional catalog repository.

Worker B implementation commit:

- `299730e` — `feat: add sqlite rule catalog APIs and migration`

Changed Worker B files:

- `backend/apps/rules/services.py`, `serializers.py`, `views.py`, `urls.py`, and repository adapter
  integration.
- `backend/apps/configs/views.py` for SQLite-backed rule export and atomic rule import.
- `backend/apps/rules/management/commands/migrate_rules_to_db.py`.
- `scripts/dev.sh` and `trigger.py` migration-command integration.
- `tests/backend/test_rule_catalog_api.py` and `test_rule_migration.py`.
- Updated rule/config regression tests to assert catalog retention, persisted enablement, and stable
  catalog ordering.
- `docs/20260718_rules_api.md`, `README.md`.

Implemented B1-B7 behavior:

- Live rule reads and execution-facing `load_rules()` use initialized enabled SQLite catalog rows;
  explicit file paths remain parsers for legacy/import tests.
- Create immediately registers identity, allocates a monotonic local ID, persists authored content,
  and enables the rule. Metadata-only edits retain identity; business edits preserve the prior row
  and create/reuse the resulting identity; delete archives and disables.
- Single and atomic bulk enablement persist enabled state and order, including a valid empty set.
- Named export reads all enabled catalog rows from SQLite and includes complete payloads plus
  identifiers. Import validates before mutation, rejects duplicate/mismatching identifiers, reuses
  identities, imports missing rows, disables omitted rows, and preserves catalog history.
- Initial listing uses the repository's first-50-plus-enabled page; continuation uses revision-bound
  opaque keyset cursors with stale/invalid cursor errors.
- `migrate_rules_to_db` validates and imports the legacy file once, preserves legacy IDs/order/
  `next_index`, leaves the source untouched, and is idempotent after initialization. Both launchers
  invoke it after Django migrations.

## Verification Results

Passed:

- `uv run python backend/manage.py check`
- `uv run python backend/manage.py makemigrations --check --dry-run`
- `uv run python backend/manage.py migrate --check`
- `uv run pytest -q tests/backend/test_rule_identifiers.py tests/backend/test_rule_repository.py`
  (`11 passed`)
- `uv run pytest -q tests/backend/test_rule_identifiers.py tests/backend/test_rule_repository.py tests/backend/test_rule_catalog_api.py tests/backend/test_rule_migration.py`
  (`16 passed`)
- `uv run pytest -q tests/backend/test_rules.py tests/backend/test_configs.py tests/backend/test_configs_api.py`
  (`75 passed`)
- `uv run pytest -q tests/backend -k "rule or config or migration"`
  (`112 passed, 141 deselected`)
- `uv run ruff check backend/apps/rules backend/apps/configs tests/backend/test_rule_catalog_api.py`
- `uv run mypy backend/apps/rules backend/apps/configs`
- `git diff --check`
- Manual isolated launcher migration sequence: `migrate_rules_to_db` migrated the legacy fixture,
  then a second invocation reported the initialized no-op path.

The broad `uv run ruff check backend/apps/rules backend/apps/configs tests/backend` command still
reports pre-existing lint findings in unrelated run/persistence tests. The full backend suite also
has two pre-existing report-export layout assertion failures in `tests/backend/test_reports.py`;
the suite otherwise reported `252 passed, 2 failed`. Those files are outside Worker B ownership and
were not modified. No Worker B test or required Worker B behavior is deferred.

## Final Status

`COMPLETE` for Worker B scope. Coordinator integration must retain the separate Worker A commits,
freeze the API shapes for Workers C/D, and handle the unrelated baseline report/lint findings during
convergence.
