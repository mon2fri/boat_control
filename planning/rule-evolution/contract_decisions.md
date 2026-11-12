# Rule-evolution contract decisions (integrator-owned)

Date: 2026-11-12. Only the integrator edits this file. Broadcast amendments
to all affected workers promptly.

BASE_COMMIT: `4b7c5bf72df3e65b55d118d7e9647173ed0b73f3`

## Status: PARTIAL FREEZE — A frozen 2026-11-12; B/C pending

A delivered (`feat/rule-evolution-worker-a`, 6 commits `3bc6c09`…`854cdda`
on base `4b7c5bf`, checkout clean). B/C still active. A-side interfaces below
are FROZEN; B/C must build against them. B/C portions remain provisional.

The defaults below come from `shared_contract.md` and the requirements doc.
They are NOT yet agreed interfaces. Workers A/B must each send an interface
skeleton + representative payloads before full dependent implementation; the
integrator will then freeze the actual field names/tokens/endpoints here.

## Provisional defaults carried over

- Existing-rule PUT accepts optional top-level `save_decision`:
  `modify_current` | `save_as_new`. Extensive-edit 409 code
  `rule_save_decision_required` with `original_rule_id`,
  `original_identifier`, `proposed_identifier`, `extreme_changes[]`.
- Retry carries explicit choice + original revision/concurrency token; stale
  source yields a distinct stale-revision error; no write before choice.
- Saved-as-new outcome is explicit; source selection preserved; duplicate
  identities follow existing reuse/hint behavior; cross-lineage target identity
  requires explicit conflict handling.
- A publishes a narrow rule-evolution service: resolve target identifier in
  lineage/revision context; bounded ordered predecessor chain with canonical
  identifiers, revision/event IDs, relationship type; Copy/save-as-new edges
  excluded from inheritance; missing/conflicting/cyclic context reported
  explicitly; existing `superseded_by` chains preserved; no invented
  YAML/import relationships.
- B consumes A's service (no SQL reverse-engineering, no Rxxx/name/substring
  guessing). Target lineage/revision/event context threaded into capture and
  persisted in run snapshots.
- Tracking metadata (provisional shape, location TBD by B/C agreement):
  `status: RecertificationRequired`, `recertification_required: true`,
  `recertification_reason: "Recertification due to rule change"`,
  `carried_from_exception_id`, `carried_from_as_of_date`,
  `carried_from_rule_identifier`, `rule_evolution_event_id`, `recertified_at`.
  Must survive serializer/schema/mapping + scoped projections.
- `RecertificationRequired` is reviewable under New Exceptions Only even when
  commentary is nonblank. Never collapse pending into Commented via text check.
- Proposed acceptance: POST `/api/exception-tracking/recertify/` with
  `as_of_date` + selected `exception_ids` + server-validated target revision
  tokens; atomic reject on unknown/stale IDs; retry-safe; unchanged-text
  acceptance supported; blank text never certified; clears stay cleared.
- Upload edits text but does not implicitly certify inherited text.
- Imports/startup: unchanged canonical definitions reuse history context, no
  duplicate events; unannotated YAML identities are independent rules; lineage
  requires explicit metadata or user resolution; no interactive prompt during
  unattended startup; atomic failure behavior TBD and must be confirmed before
  A implements it.
- Migrations additive; backfill only documented predecessor links; old stores,
  workbooks, run docs, config files keep loading; no mass recertification on
  migration.

## Confirmed vs provisional

- CONFIRMED (requirements): Sept 30 v1 commentary → Oct 30 v2 exception with
  exact label `Recertification due to rule change` after Oct 15 recorded
  revision; no Oct 15 run required; both old/new IDs intact; history table in
  configuration DB (`rules_rule_evolution_history` proposed); commentary/provenance
  in tracking DB; no cross-DB FKs; canonical IDs from executable logic.
- PROVISIONAL (all wire/token/endpoint/status-location details above): subject
  to A/B/C agreement and freezing here.

## Awaiting

- [x] A: service signature + history endpoint shape + rule-save JSON sketches
  — DELIVERED and FROZEN (see below).
- [ ] B: tracking/recertify JSON placement + acceptance/upload semantics sketches
- [ ] C: acknowledgement of A/B payloads, wire/domain mapping plan
- [ ] Integrator freeze of: acceptance endpoints, status transitions,
  provenance location (B/C portions)

## FROZEN — A interfaces (Worker A delivery 2026-11-12)

### A→B Python service (`backend/apps/rules/evolution.py`)

- `detect_extensive_changes(previous_draft, new_draft) -> list[str]`,
  subset of `["conditions_replaced", "expectations_replaced"]`.
- `get_predecessor_chain(target_identifier, *, lineage_id=None,
  max_depth=64) -> list[PredecessorLink]`, newest-first, ONLY
  `modify_current` executable-revision edges (incl. trustworthy
  `legacy_backfill` with `commentary_policy=
  carry_forward_recertification`). Raises `LineageNotFound` /
  `LineageAmbiguous(lineage_ids)` / `LineageCycle`; never guesses.
  `save_as_new` roots yield `[]` (no inheritable edge).
- `resolve_revision_context(target_identifier, *, lineage_id=None,
  revision_number=None, event_id=None) -> RevisionContext` with status
  `ok | missing | ambiguous`.
- `PredecessorLink`: `event_id`, `lineage_id`, `revision_number: int`,
  `source_identifier`, `target_identifier`, `relationship="revision"`,
  `change_type`, `save_decision`, `created_at`.
- B MUST persist `lineage_id` / `revision_number` / `event_id` in run
  snapshots (B-owned) — canonical identifiers alone are ambiguous across
  lineages.

### A→C JSON (rule-save contract)

- PUT `/api/rules/<id>/` accepts top-level `save_decision:
  modify_current | save_as_new` + `source_identifier` (concurrency token =
  identifier the draft was based on). Controls never enter authored payload
  or hash inputs. Invalid value → `400
  {"code":"rule_save_decision_invalid"}`.
- 409 extensive edit (no write before choice):
  `code=rule_save_decision_required` with `original_rule_id`,
  `original_identifier`, `proposed_identifier`,
  `extreme_changes[]` (subset of `conditions_replaced`,
  `expectations_replaced`).
- 409 stale confirmation (checked before extensive detection):
  `code=rule_save_stale` with `original_rule_id`,
  `original_identifier`, `current_identifier`, `lineage_id`,
  `revision_number`.
- 409 cross-lineage reuse: `code=rule_identity_reuse_conflict` with
  `original_rule_id`, `original_identifier`, `proposed_identifier`,
  `existing_rule_id`, `existing_lineage_id`. No merge, no commentary transfer.
- Success modify_current → `200` with `previous_rule_id`,
  `resulting_rule_id`, `save_decision`, `lineage_id`,
  `evolution_event_id`. Save-as-new → `201` plus `"saved_as_new": true`;
  equivalent-identity reuse adds `"equivalent_rule": true,
  "equivalent_rule_id"`. Snapshots gain optional `lineage_id` /
  `revision_number`; old fixtures stay readable.
- `GET /api/rules/<id>/history/` (read-only) → `{rule_id, lineage_id,
  revision_number, events[]}` with before/after payloads, change summaries,
  save decisions, commentary policy.

### Import/startup policy (CONFIRMED for this round)

- Exports include `lineage_id` as explicit revision metadata. Reimports
  strip it from hash validation and pass it as a hint: hint + unknown
  identity + known lineage with rows → revision edge (`import_sync`,
  carry-forward); hint + unknown lineage → fresh lineage preserving the id
  (export→empty-DB round trip); unannotated changed content → independent
  lineage, no edge; contradicting hint → 409/conflict, atomic, no partial
  mutation. Repeated identical application records nothing.
- Unattended ambiguous lineage FAILS ATOMICALLY (400/409 message, no prompt,
  no guessed edge). This answers requirements §11's operational fallback
  provisionally; user may still request different wording.
- Legacy `superseded_by` chains backfilled as `legacy_backfill` revision
  edges with `commentary_policy=carry_forward_recertification` (pre-feature
  revisions treated as inheritable). B implements carry accordingly.

### Ownership amendment (integrator-approved)

- Worker A minimally adapted `tests/integration/test_workflow.py`
  (outside its listed ownership) to the mandated 409-first flow, plus one
  catalog API test (inside ownership). APPROVED as a contract-mandated
  mechanical adaptation; recorded here as an explicit reassignment. If
  integration review finds issues, the integrator will repair them as
  integration-only fixes rather than rewriting A's branch.
