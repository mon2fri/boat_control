# Rule-evolution contract decisions (integrator-owned)

Date: 2026-11-12. Only the integrator edits this file. Broadcast amendments
to all affected workers promptly.

BASE_COMMIT: `4b7c5bf72df3e65b55d118d7e9647173ed0b73f3`

## Status: PROVISIONAL (pending early A/B sketches)

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

- [ ] A: service signature + history endpoint shape + rule-save JSON sketches
- [ ] B: tracking/recertify JSON placement + acceptance/upload semantics sketches
- [ ] C: acknowledgement of A/B payloads, wire/domain mapping plan
- [ ] Integrator freeze of: field names, error codes, revision/concurrency
  token, history/acceptance endpoints, import policy, status transitions,
  provenance location
