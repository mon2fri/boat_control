# Shared contract: rule evolution and recertification

## Authority and readiness

The [requirements document](../../requirements/20261112_rule_revision_and_commentary_recertification.md)
is authoritative for confirmed business behavior. This contract supplies
provisional engineering defaults for otherwise open details. The integrator
must review them with A/B/C, record an agreed interface in
`planning/rule-evolution/contract_decisions.md`, and inform the user of material
assumptions. If a product decision cannot safely use these defaults, ask the
user while continuing independent work; silence is not approval.

Confirmed scenario: September 30 v1 exception commentary must appear on the
same book's October 30 v2 exception with the exact label
**Recertification due to rule change**, following an October 15 recorded rule
revision. No run on October 15 is required. Both old and new IDs remain intact.

## Data boundaries

- Rule lineage, revisions, old/new identifier edges, definitions, save decisions,
  and their audit history live in the configuration Django database.
- Exception commentary, carry provenance, and recertification acceptance live in
  the separate tracking database. No cross-database foreign keys or assumed
  transaction spanning both stores. Read configuration history through A's
  interface and apply tracking mutations transactionally/idempotently.
- Canonical identifiers remain calculated from executable logic. Do not weaken
  canonical deduplication or substitute names/local Rxxx indices for identity.
- Preserve historical run snapshots and original tracking rows. New occurrences
  retain their actual revision's exception ID, timestamps, and first/last seen
  metadata; predecessor continuity is exposed as separate provenance.

## Provisional rule API contract (A produces, C consumes)

Retain existing API routes and response fields. Add optional lineage/revision
metadata to rule snapshots without making old fixtures/documents unreadable.

For existing-rule PUT, accept optional top-level `save_decision`:
`modify_current` or `save_as_new`. Do not put this control inside executable
rule payloads, hash inputs, or authored definitions.

If a canonically changed edit retains zero normalized original conditions
(when there were original conditions), OR zero original expectations, and the
decision is absent, respond HTTP 409 with a structured error:

```json
{
  "code": "rule_save_decision_required",
  "message": "Choose whether to modify the current rule or save as new.",
  "original_rule_id": "R001",
  "original_identifier": "CBR1_...",
  "proposed_identifier": "CBR1_...",
  "extreme_changes": ["conditions_replaced", "expectations_replaced"]
}
```

Include only applicable reasons. No write occurs before this choice. Validate
the draft before the confirmation. Ordinary executable edits default to
`modify_current`; canonical no-ops and metadata edits do not prompt or initiate
recertification. Reordering equivalent clauses does not count as replacement.

Retry with an explicit choice and an original revision/concurrency token agreed
by A/C. If the source changed meanwhile, return a distinct stale-revision error;
do not apply an old confirmation to new source content.

Keep existing `previous_rule_id`/`resulting_rule_id` response compatibility. Add
an explicit saved-as-new outcome so C preserves the source selection and adds
the new rule rather than replacing the source's selected ID. Existing duplicate
creates reuse/hint behavior remains; if the target identity belongs to another
lineage, require explicit conflict handling instead of merging lineages.

## A → B lineage interface

Publish a narrow application service in a new rule-evolution module owned by A.
Agree its exact signature before B integrates it. Required capabilities:

- Resolve the target identifier within an unambiguous lineage/revision context.
- Return a bounded ordered predecessor chain with canonical identifiers,
  revision/event IDs, and the explicit relationship type.
- Exclude Copy/save-as-new edges from commentary inheritance.
- Report missing, conflicting, or cyclic lineage context explicitly.
- Preserve trustworthy existing `superseded_by` chains without inventing
  undocumented YAML/import relationships.

Prefer passing target lineage/revision/event context into B's capture call and
persisting it in run snapshots. Do not assume that a canonical identifier alone
uniquely identifies business lineage after deduplication, reversion, or reuse.
If execution lacks sufficient context, surface the problem rather than
silently selecting a lineage. Do not filter a valid predecessor edge out merely
because its rule-edit timestamp is after the source commentary's as-of date.

## Commentary matching and precedence (B)

Use explicit lineage edges plus the same lossless ordered key-column schema and
values. Never replace identifier substrings or match solely by local rule ID.
Changed key schemas cannot inherit automatically. No implicit book-key mapping
is in scope for this round.

Proposed deterministic source policy: for each eligible predecessor exception,
consider its latest occurrence no later than the target as-of date. Use the
candidate with the latest eligible occurrence date; for equal dates prefer the
closest predecessor revision. If candidates remain contradictory, return a
reviewable ambiguity instead of guessing. A latest intentional blank is a
tombstone: do not search past it to resurrect older text. Apply the documented
clearing policy across the chain, not only inside one table.

Preserve existing target commentary/acceptance first. A repeated capture,
restart, or import must not re-copy text or reset an already accepted target.
Pending carried text may propagate through multiple revisions but never becomes
accepted merely by being carried again. Preserve provenance through the chain.

## Provisional tracking API contract (B produces, C consumes)

Keep existing fields and add backward-compatible optional metadata:

```json
{
  "status": "RecertificationRequired",
  "recertification_required": true,
  "recertification_reason": "Recertification due to rule change",
  "carried_from_exception_id": "old literal ID",
  "carried_from_as_of_date": "2026-09-30",
  "carried_from_rule_identifier": "CBR1_...",
  "rule_evolution_event_id": "stable event ID",
  "recertified_at": null
}
```

The exact JSON location for these fields in saved-run violations/detail rows
must be agreed by B/C. They must survive serializer/schema/mapping and scoped
result/report projections, not just the tracking list endpoint.

Treat `RecertificationRequired` as reviewable under **New Exceptions Only**,
even when commentary is nonblank. Keep New/NotCommented/Commented backward
compatibility. Extend status ordering/filtering deliberately throughout the
application; do not collapse the new state into Commented by inspecting text.

Proposed explicit acceptance endpoint: POST `/api/exception-tracking/recertify/`
with `as_of_date`, selected `exception_ids`, and server-validated target revision
tokens. Return updated records/counts. Acceptance of unchanged text is supported;
the server rejects unknown/out-of-date IDs atomically and is retry-safe.

Proposed upload policy: XLSX commentary upload edits text but does not certify
inherited text implicitly. Users use **Recertify selected** to acknowledge it.
No bulk acceptance by downloading, rerunning, exporting, or uploading an
unchanged template. Do not accept blank text as a certified explanation.
An intentional clear must stay cleared and remain reviewable.

## Imports, startup, and migration defaults

Unchanged canonical definitions reuse their existing history context and create
no duplicate events on startup. New unmatched identities from unannotated YAML
are independent rules without commentary inheritance. Expose their unresolved
relationship visibly when appropriate. Explicit lineage metadata or a user
resolution is required to import them as revisions.

Never open an interactive prompt during unattended startup. Import ambiguity
must not create a guessed revision edge or partially mutate the catalog.
The integrator must confirm the chosen atomic failure/import behavior and its
user-facing message before A implements it.

Migrate existing stores additively. Backfill only documented predecessor links;
unknown legacy lineage is not fabricated. Old tracking tables, old workbooks,
old run documents, and old config files must still load safely. A migration
must not recertify every legacy comment merely because a new field was added.

## Ownership and working rules

Each worker works exclusively in its assigned worktree/branch. Never edit shared
root checkout files or another worker's files. Workers communicate contracts via
the integrator. If an ownership boundary needs changing, have the integrator
record the reassignment before touching the file.

Do not modify user databases, root CSVs, saved configs, screenshots, credentials,
or unrelated branches. Use synthetic fixtures and dedicated temporary settings.
Only A creates Django configuration migration files. Only B changes raw tracking
schema migration logic. Only C changes frontend source/shared types. Only the
integrator commits regenerated `frontend/dist/`.

Every delivery includes committed implementation, meaningful tests, and an
individual delivery note with hashes, exact checks, contracts, risks, and work
remaining. Do not claim UI acceptance. The integrator owns final UI readiness;
the user owns acceptance. No remote pushes, PRs, merges into main, or worktree
removal are authorized by this dispatch.
