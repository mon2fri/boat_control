# Rule-evolution contract decisions (integrator-owned)

Date: 2026-11-12. Only the integrator edits this file. Broadcast amendments
to all affected workers promptly.

BASE_COMMIT: `4b7c5bf72df3e65b55d118d7e9647173ed0b73f3`

## Status: PARTIAL FREEZE — A+B frozen 2026-11-12; C pending.
## Round-1 amendment (user directive, 2026-11-12): immediate-previous scope.

Carry-forward consults ONLY the immediate previous as-of date (the single
latest date table strictly earlier than the target), for both scenarios:

1. As-of date movement (same exception, same identifier): the same-ID lookup
   reads only the immediate previous table. Older dates are never scanned;
   same-date rows are never eligible.
2. Rule evolution (changed identifier): each predecessor edge resolves its
   candidate only in the immediate previous table. No tombstone resurrection
   is possible across a gap because gaps are not searched.

Consequences (documented intent): a commented date followed by an uncommented
(or row-less) immediate previous date does not propagate further; each
carried date seeds the next one day-by-day. Same-date predecessor text never
carries (mid-day revision reruns start uncommented for new IDs).

Same-ID safety rule (unchanged-rule fix): when edges exist but yield no
candidate, the same-ID fallback runs only if the target identifier never
appears as a source in its own predecessor chain. A revert/round-trip shape
(target revised away from before) keeps blocking silent copies.

Reload semantics (documented intent): capture-time INSERT is the single carry
point. Same-date recapture preserves stored commentary (empty is
indistinguishable from intentionally cleared), and reads/reloads never
synthesize commentary. Commentary uploaded after a date was captured is
visible on its own date only; later dates pick it up only if captured
afterwards. Saved-run documents persist capture-time statuses; the live
tracking store is authoritative on reload via `refresh_result_dict`.

A delivered (`feat/rule-evolution-worker-a`, 6 commits `3bc6c09`…`854cdda`
on base `4b7c5bf`, checkout clean). B delivered
(`feat/rule-evolution-worker-b`, 6 commits `8f90f9f`…`2472a82` on base
`4b7c5bf`, checkout clean, all B-owned paths). C still active. A+B interfaces
below are FROZEN; C must build against them.

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
- [x] B: tracking/recertify JSON placement + acceptance/upload semantics
  sketches — DELIVERED and FROZEN (see below).
- [ ] C: acknowledgement of A/B payloads, wire/domain mapping plan
- [ ] Integrator freeze of: C wire/domain acknowledgement only (all wire
  contracts now frozen)

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

## FROZEN — B interfaces (Worker B delivery 2026-11-12)

Source: `docs/20261112_rule_evolution_tracking_contract.md` on
`feat/rule-evolution-worker-b`. No competing field names; C builds against
exactly these.

### Tracking list rows (backward compatible)

`GET /api/exception-tracking/?as_of_date=...` rows gain optional fields
(existing fields unchanged; legacy rows return defaults):

- `status: "RecertificationRequired"` (exactly one new status value;
  `New` / `NotCommented` / `Commented` behavior unchanged).
- `recertification_required: true`,
  `recertification_reason: "Recertification due to rule change"` (exact
  label lives ONLY here, never inside `exception_commentary`, so uploads
  cannot accidentally certify it), `carried_from_exception_id`,
  `carried_from_as_of_date`, `carried_from_rule_identifier`,
  `rule_evolution_event_id`, `recertified_at: null`.
- `revision_token`: `""` for never-carried rows, else the
  `rule_evolution_event_id` that created the target revision. This token is
  the concurrency guard for acceptance.
- `available_filters.status` includes `RecertificationRequired`;
  `filter_status` and status sorting accept it; pending rows sort with `New`.
- Pending rows keep inherited text verbatim in `exception_commentary` yet
  stay reviewable under New Exceptions Only across results, run detail,
  tracking counts, HTML/Excel reports, workbook exports, filters, sorting,
  recapture. Pending NEVER collapses into Commented via a text check.

### Explicit acceptance (only path that clears pending)

- `POST /api/exception-tracking/recertify/` with `{as_of_date,
  exception_ids, revision_tokens}` (`revision_tokens` echoes each row's
  token; missing entries default to `""`). Unchanged-text acceptance
  supported.
- Success `200`: `{as_of_date, accepted[], already_accepted[], total,
  exceptions[]}`. Repeats are retry-safe no-ops (`already_accepted`).
- Errors, all atomic (nothing written): `404 unknown_exception_ids`
  (`details.unknown_ids`); `409 stale_revision_token`
  (`details.stale_ids`); `400 blank_commentary_not_certified`
  (`details.blank_ids` — blank is never certified); `400
  invalid_recertification_request` (empty selection); `400
  invalid_as_of_date`.
- Nothing else certifies: download, rerun, export, upload (even unchanged
  text), or text edits only edit text. Clearing pending text keeps the row
  pending and reviewable.

### Workbook (XLSX)

- Exceptions sheet appends six informational columns after standard
  metadata, before user detail columns: `Recertification Reason | Carried
  From Exception ID | Carried From As-of Date | Carried From Rule Identifier
  | Rule Evolution Event ID | Recertified At`.
- Template Version (B2) / As-of Date (B3) positions, import ID matching,
  extra-column order, formula protection unchanged. Old workbooks without
  the new columns keep importing. Import IGNORES the provenance columns.

### Reports

- HTML exception table + Excel `Exception Table` sheet append a
  `Recertification` column (exact reason for pending rows; blank otherwise).
  Membership and counts unchanged: pending rows are part of New Exceptions
  Only, not an additional population.

### B→A consumption + inheritable edges

- B adapts to frozen `get_predecessor_chain` / `resolve_revision_context`
  by duck-typed adapter (matched by class name so the B-only checkout stays
  importable). `LineageNotFound` → legacy same-identity carry;
  `LineageAmbiguous` / `LineageCycle` → warn in
  `RecordingSummary.carry_warnings`, carry nothing, never guess.
- Inheritable change types: `executable_revision`, `legacy_backfill` with
  `commentary_policy == "carry_forward_recertification"`.
- Ambiguity surfacing is log + `carry_warnings` only; a C-visible review
  affordance is C/integrator work (tracked as a known limitation).

### Prerequisite log (A→B, COMPLETED 2026-11-12)

- Worker B requested A's evolution service to run the real-service
  integration check. APPROVED prerequisite: A commits `3bc6c09` (models +
  migration, required dependency) then `337a7e6` (evolution service),
  cherry-picked by B itself into `feat/rule-evolution-worker-b` in that
  order. No uncommitted files pulled. COMPLETED as B commits `51c03ac`
  (← `3bc6c09`) and `665cd65` (← `337a7e6`), both clean `-x`
  cherry-picks, plus B follow-ups `5dd6135` (loud-degrade divergence fix,
  no wire changes), `fd6b747` (real-service carry test, PASS), `130f836`
  (delivery addendum). B HEAD `130f836`, checkout clean.
- Real-service result: Sept-30 v1 commentary → Oct-30 v2 carry with NO
  Oct-15 run through the REAL `get_predecessor_chain`: PASS (verbatim text,
  exact reason label outside text, full provenance, both exception IDs
  intact).
- INHERITED-COMMIT WARNING for integration: when cherry-picking into
  `feat/rule-evolution-integration`, apply A's full sequence first
  (`3bc6c09`, `337a7e6`, `fd8a8a0`, `99191ff`, `8639e13`, `854cdda`), then
  B's commits in order EXCLUDING `51c03ac` and `665cd65` (already present
  via A) — i.e. pick `8f90f9f`, `89b5f81`, `c64453c`, `5142a1d`,
  `0d950ce`, `2472a82`, `5dd6135`, `fd6b747`, `130f836`.
