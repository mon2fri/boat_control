# Worker A delivery — rule evolution and save decisions (2026-11-12)

Branch: `feat/rule-evolution-worker-a` (base `4b7c5bf72df3e65b55d118d7e9647173ed0b73f3`, verified ancestor).
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-a`.

## Commits

1. `3bc6c09` — lineage/history tables + backfill migration.
2. `337a7e6` — canonical-clause helpers + `apps/rules/evolution.py` service.
3. `fd8a8a0` — repository save flows with event recording.
4. `99191ff` — API contract, history endpoint, import/startup touchpoints.
5. `8639e13` — 31 focused tests + 2 adapted existing tests.

## Files touched (within ownership)

- `backend/apps/rules/models.py` — `RuleLineage`, `RuleEvolutionHistory`
  (`rules_rule_evolution_history`), `StoredValidationRule.lineage` /
  `evolution_revision`.
- `backend/apps/rules/migrations/0003_rule_evolution_history.py` — additive
  schema + self-contained `superseded_by` backfill (reverse deletes only
  `legacy_backfill` rows and empty lineages).
- `backend/apps/rules/identifiers.py` — pure
  `normalized_condition_clauses` / `normalized_expectation_clauses` helpers.
  Canonical identifier calculation unchanged.
- `backend/apps/rules/evolution.py` — NEW A→B service (see contract below).
- `backend/apps/rules/repository.py` — save flows, idempotent
  `apply_rule_configuration(..., source, lineage_hints)`, archive/reinstate
  events, `SaveDecisionRequired` / `StaleRevisionError` /
  `IdentityReuseConflict`.
- `backend/apps/rules/views.py`, `urls.py` — `save_decision` /
  `source_identifier` PUT contract, structured 409s, snapshot
  `lineage_id` / `revision_number` / `evolution_event_id`, read-only
  `GET /api/rules/<rule_id>/history/`.
- `backend/apps/configs/views.py` — `lineage_id` export + explicit-hint
  import plumbing with `source` labels (`named_config_import` /
  `yaml_import`); contradicting hints → 409, no partial mutation.
- `backend/apps/rules/management/commands/migrate_rules_to_db.py` —
  initial sync creates lineages + creation events (`startup_sync`);
  subsequent syncs pass `source="startup_sync"`.
- `tests/backend/test_rule_evolution.py` — NEW, 31 tests.
- `tests/backend/test_rule_catalog_api.py`,
  `tests/integration/test_workflow.py` — minimal adaptation of two tests
  asserting the old silent-extensive-revision behavior (now 409-first per
  the shared contract). **Boundary flag:** the integration test file is
  outside my listed ownership; the change is mechanical and contract-
  mandated. Revert on integrator request and I will carry the failure as a
  known-failing handoff instead.

## Published contracts

### A→B Python service (`apps.rules.evolution`)

```python
detect_extensive_changes(previous_draft, new_draft) -> list[str]
# subset of ["conditions_replaced", "expectations_replaced"]

get_predecessor_chain(target_identifier, *, lineage_id=None, max_depth=64) -> list[PredecessorLink]
# newest-first; only modify_current executable-revision edges
# (incl. trustworthy legacy_backfill) with commentary_policy
# carry_forward_recertification. Raises LineageNotFound /
# LineageAmbiguous(lineage_ids) / LineageCycle. save_as_new roots
# yield [] (previous_event is None -> no inheritable edge).

resolve_revision_context(target_identifier, *, lineage_id=None,
                         revision_number=None, event_id=None) -> RevisionContext
# status "ok" | "missing" | "ambiguous"; never guesses.

@dataclass(frozen=True) PredecessorLink:
    event_id, lineage_id, revision_number: int,
    source_identifier, target_identifier: str,
    relationship: str = "revision", change_type, save_decision, created_at
```

### A→C JSON

PUT `/api/rules/<id>/` accepts top-level `save_decision:
modify_current|save_as_new` and `source_identifier` (concurrency token =
identifier the draft was based on). Controls never enter the authored
payload or hash inputs. Invalid value → `400
{"code":"rule_save_decision_invalid"}`.

409 extensive edit (no write before choice):

```json
{"code":"rule_save_decision_required",
 "message":"Choose whether to modify the current rule or save as new.",
 "original_rule_id":"R001","original_identifier":"CBR1_...",
 "proposed_identifier":"CBR1_...","extreme_changes":["conditions_replaced"]}
```

409 stale confirmation (checked before extensive detection):

```json
{"code":"rule_save_stale","original_rule_id":"R001",
 "original_identifier":"CBR1_...","current_identifier":"CBR1_...",
 "lineage_id":"...","revision_number":2}
```

409 cross-lineage reuse (no merge, no commentary transfer):

```json
{"code":"rule_identity_reuse_conflict","original_rule_id":"R002",
 "original_identifier":"CBR1_...","proposed_identifier":"CBR1_...",
 "existing_rule_id":"R001","existing_lineage_id":"..."}
```

Success modify_current → `200` with `previous_rule_id`,
`resulting_rule_id`, `save_decision`, `lineage_id`,
`evolution_event_id`. Success save_as_new → `201` with the same plus
`"saved_as_new": true`; equivalent-identity reuse adds
`"equivalent_rule": true, "equivalent_rule_id"`. Snapshots add optional
`lineage_id` / `revision_number` (old fixtures stay readable).
`GET /api/rules/<id>/history/` → `{rule_id, lineage_id,
revision_number, events[]}` with full before/after payloads,
change summaries, save decisions, and commentary policy.

### Import/YAML lineage metadata

Exports include `lineage_id`. Reimports strip it from hash validation and
pass it as an explicit hint: hint + unknown identity + known lineage with
rows → revision edge (`import_sync`, carry-forward); hint + unknown
lineage → fresh lineage preserving the id (export→empty-DB round trip);
unannotated changed content → independent lineage, no edge; hint
contradicting the located row → 409/conflict, atomic. Repeated identical
application records nothing and does not bump the catalog revision.

## Migration behavior

- Additive only. Fresh DBs: startup sync creates one lineage + creation
  event per rule. Existing DBs: migration 0003 backfills one lineage per
  `superseded_by` component (root creation + per-edge revision events,
  cycle-guarded); rows with lineages are untouched; unknown relationships
  never invented; `backfill_legacy_lineages()` is re-runnable (no-op when
  done). Legacy edges use `commentary_policy=
  carry_forward_recertification` — B should confirm this matches the
  intended treatment of pre-feature revisions.
- `changed_by` is recorded but always null from current call sites (local
  app, no actor identity).

## Verification (isolated settings, no live data)

- `pytest tests/backend/test_rule_evolution.py` — 31 passed.
- `pytest tests/backend` (rule/config/migration/evolution scope) — 84 passed.
- Full `pytest tests/backend` — 837 passed, 5 failed in
  `tests/backend/test_runs.py` (outcome-column `sa_flag`); verified the
  same 5 fail on the clean base `4b7c5bf` — pre-existing, unrelated.
- `pytest tests/integration` — 4 passed.
- `mypy backend/apps/rules/ backend/apps/configs/views.py` — clean
  (baseline was clean; kept it clean). `ruff check` clean on all touched
  source/test files (remaining repo lints are pre-existing).

## Unresolved / needs integrator

1. Contract freeze: provisional field/status names above (notably
   `rule_save_decision_required`, `rule_save_stale`,
   `rule_identity_reuse_conflict`, `saved_as_new`, history shape) need
   `contract_decisions.md` sign-off with B/C; no frontend files touched.
2. AoT question from requirements §11: unattended startup/import with an
   ambiguous lineage currently fails atomically with a 400/409 message —
   confirm the user-facing fallback wording.
3. B-side handoff: `PredecessorLink`/`RevisionContext` are ready; run
   snapshots should persist `lineage_id`/`revision_number`/`event_id`
   (B-owned) since canonical identifiers alone are ambiguous across
   lineages.
4. Integration-test touch (above) needs explicit approval or revert.
5. No pushes/merges performed; checkout contains only the listed files.
