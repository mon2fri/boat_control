# 2026-11-12 Rule Evolution Worker B Delivery

## Status

`IMPLEMENTATION COMPLETE — FINAL INTEGRATION CHECK PENDING WORKER A`

Worker B's cross-revision commentary inheritance and full recertification
lifecycle are implemented and tested on `feat/rule-evolution-worker-b`. The
agreed Worker A lineage service does not exist in this checkout yet, so the
delivery uses the agreed-protocol stub in focused tests and degrades to
legacy same-identity carry otherwise. The final actual integration check must
run after Worker A's prerequisite commit is cherry-picked (request below).

## Commits (branch `feat/rule-evolution-worker-b`, base `4b7c5bf`)

- `8f90f9f` — feat: add rule-evolution lineage interface and recertification storage
- `89b5f81` — feat: thread lineage context through run capture and persistence
- `c64453c` — feat: recertification list/import/export APIs and workbook provenance
- `5142a1d` — feat: surface pending recertification in HTML/Excel exception reports
- `0d950ce` — test: rule-evolution recertification evidence and lineage walk fixes
- (new) adapt to frozen A interfaces + persist revision_number/event_id
- (this note; contract doc committed alongside it)

## Files touched (all inside Worker B ownership)

- `backend/apps/exception_tracking/lineage.py` (new): agreed A-interface
  protocol (`PredecessorEdge`, `LineageResolution`, `inheritable_edges`,
  `get_lineage_resolver` probing `apps.rules.rule_evolution`) plus the
  test-only `InMemoryLineageResolver` with transitive bounded walk.
- `backend/apps/exception_tracking/domain.py`: `RecertificationRequired`
  status, provenance fields, `revision_token`, `RecertificationSummary`,
  pending-first `status_for`, `lineage_id` on occurrences, `carry_warnings`.
- `backend/apps/exception_tracking/errors.py`: `StaleRevisionTokenError`,
  `BlankCommentaryCertificationError` (+ lineage errors live in lineage.py).
- `backend/apps/exception_tracking/repository.py`: additive schema migration,
  cross-revision carry, atomic `recertify_exceptions`, lineage-aware capture.
- `backend/apps/exception_tracking/store.py`: `lineage_id` coercion,
  `lineage_resolver` passthrough.
- `backend/apps/runs/tracking_capture.py`: per-rule `lineage_context`,
  auto hook, resolver forwarding, `resolve_run_lineage_context`.
- `backend/apps/runs/tracking_context.py`: new status sets, pending-first
  derivation, recertification provenance in `refresh_result_dict`.
- `backend/apps/runs/persistence.py`, `views.py`, `run_detail_views.py`,
  `serializers.py`: lineage context saved in snapshots (additive), threaded
  through execute, flattened detail carries status/provenance, wire fields.
- `backend/apps/exception_tracking/api_services.py`, `serializers.py`,
  `views.py`, `urls.py`: recert fields in list payloads, atomic recertify
  service, `POST /api/exception-tracking/recertify/`.
- `backend/apps/exception_tracking/workbook.py`, `table.py`, `columns.py`:
  six appended provenance columns (import prefix unchanged), rank, reserved
  names.
- `backend/apps/reports/services.py`: appended `Recertification` marker column
  in the HTML exception table and Excel Exception Table.
- `tests/backend/test_rule_evolution_recertification.py` (new, 28 tests) plus
  contract updates to pinned workbook/API header assertions and the
  `capture_run_exceptions` mock signature.
- `docs/20261112_rule_evolution_tracking_contract.md` (new): sample JSON and
  acceptance/error semantics published for C via the integrator.

Did not touch: `backend/apps/rules/**`, frontend sources, generated bundles,
live databases/configs, root checkout, other workers' files.

## Schema upgrade strategy

Additive `ALTER TABLE ... ADD COLUMN` with safe defaults, applied lazily by
`_ensure_date_table` on write and by `migrate_schema()` explicitly. Legacy
tables (10 base columns) and intermediate tables (base + context) read fine
before migration; missing recertification flags read as not-pending, so
migration never re-marks accepted or ordinary commentary. New rows carry
`recertification_required INTEGER 0/1` plus six text provenance columns and
`recertified_at`. Fresh tables are created with the full schema. Reads of
unknown/new columns still fail closed via `SchemaMismatchError`.

## API payloads (published for C — see the contract doc)

- List rows gain `status: RecertificationRequired` plus
  `recertification_required/reason`, `carried_from_*`, `rule_evolution_event_id`,
  `recertified_at`, `revision_token`.
- `POST /api/exception-tracking/recertify/` takes `as_of_date`,
  `exception_ids`, `revision_tokens`; atomic reject on
  `unknown_exception_ids` (404) / `stale_revision_token` (409) /
  `blank_commentary_not_certified` (400); retry-safe no-op on repeats.

## Actual checks run

- `uv sync --frozen` then `pytest tests/backend` :
  839 passed, 5 failed — the 5 failures
  (`test_runs.py` full-execution/aggregation/nested-aggregation) reproduce on
  pristine base `4b7c5bf` (verified via `git stash -u` + rerun) and are
  unrelated (rule fixture `R079` outcome column `sa_flag` in untouched
  `services.py`). All Worker B suites pass, including the 28 new tests.
- Isolated-config run (`GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-home-b`,
  `DJANGO_SETTINGS_MODULE=boat_control.grouped_validation_settings`):
  new + API + capture-view suites, 75 passed. No live DB/config touched;
  tests use `tmp_path` stores throughout.

## Key behaviors (all covered by tests)

- Sept 30 v1 comment → Oct 30 v2 carry with no Oct 15 run; multi-hop
  v1→v2→v3; same-date carry; revert reuse still pending.
- Tombstones (cleared latest blocks older text); future comments excluded;
  key-schema mismatch blocks; key-order change carries; save-as-new/copy and
  unrelated lineages never carry; ambiguity and cycles warn without guessing;
  equal dates prefer the closest revision.
- Existing target text/acceptance never overwritten by recapture; upload edits
  text but never certifies; blank never certified; acceptance is retry-safe.
- Pending rows stay reviewable under New Exceptions Only across results,
  tracking, HTML/Excel, counts, filters, sorting, recapture; no
  `commentary.strip()` path collapses pending into accepted commentary.

## Frozen-A alignment (2026-11-12 integrator broadcast)

- B consumes `apps.rules.evolution.get_predecessor_chain` (newest-first
  `PredecessorLink`, `LineageNotFound`/`LineageAmbiguous`/`LineageCycle`) and
  `resolve_revision_context` (`ok | missing | ambiguous`) by duck-typed
  adapter; exceptions matched by class name so the B-only checkout stays
  importable. The focused-test stub mirrors the exact frozen function,
  exception, and field names.
- Run snapshots persist the frozen per-rule shape
  `lineage_id`/`revision_number`/`event_id`; capture occurrences carry
  `lineage_id` for disambiguation; unknown identifiers keep legacy
  same-identity carry.

## Remaining issues / explicit requests to the integrator

1. **Prerequisite (blocking final integration check):** please arrange
   cherry-pick of Worker A commit `337a7e6` (evolution service) into this
   worktree — it depends on `3bc6c09` (lineage/evolution-history models and
   migration) from the same A branch, so both are needed to import the real
   service. Worker B will then run the actual integration check (isolated
   config + tracking stores, Sept 30 → Oct 30 through the real
   `get_predecessor_chain`) and report. No uncommitted files pulled; B's own
   branch stays B-owned.
2. Tracking/recertify JSON placement sketches are published in
   `docs/20261112_rule_evolution_tracking_contract.md` (§1–§5; §6 updated to
   the frozen A details). No competing field names invented.
3. Ambiguity surfacing is log + `carry_warnings` only; a C-visible
   review affordance is integrator/C work.
4. The 5 pre-existing `test_runs.py` base failures are out of Worker B scope
   (confirmed present on clean base `4b7c5bf`; noted in the freeze broadcast).
5. No push/merge/cherry-pick into integration performed by Worker B.
