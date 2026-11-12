# Rule revisions and commentary recertification

Date: 12 November 2026
Branch: `feat/rule-evolution` (from merged `main`, `c3d190d`)
Status: Requirements draft; not implemented

## 1. Objective

Preserve useful commentary when a business rule is refined, while making it
clear that commentary accepted for an earlier definition requires a fresh
review. Allow users to classify an extensive edit as either a revision of the
same business rule or a separate new rule. Retain an auditable record of rule
definition changes in the application/configuration database.

**Confirmed:** the configuration-database table records rule evolution/revision
history, including the old-to-new canonical identifier links needed for
commentary carry-forward. This request does not require a separate table logging
each execution of a rule.

## 2. Confirmed user requirements

1. When a changed rule continues the same business rule, carry existing
   commentary forward and mark it with the exact text:
   **`Recertification due to rule change`**.
2. For the extensive-edit case discussed below, saving must ask the user
   whether to **save as new** or **modify current**.
3. Record rule evolution in a table in the application/configuration database,
   not in the exception-tracking database.
4. Following the user's later branch decision, develop this feature from merged
   `main` on `feat/rule-evolution`. Grouped validation was merged through PR #6.
5. Trace the transition from each old canonical identifier to its successor
   identifier so commentary can cross changed exception IDs for the same book.
6. Carry-forward must work across as-of dates: commentary recorded on
   30 September remains eligible for the matching exception on 30 October after
   an intervening rule revision on 15 October. Mark the carried commentary
   `Recertification due to rule change`.

The remaining sections turn these requirements into a proposed implementation
contract. Decisions not explicitly confirmed by the user are identified in
section 11 rather than treated as previously approved behavior.

## 3. Existing behavior and constraints

- The application catalog is stored in Django's SQLite database, normally
  `data/db.sqlite3`. Exception tracking uses a separate configurable database,
  normally `data/exception_tracking.db`.
- `ValidationRuleIdentity` stores a calculated `CBR1_...` identifier and its
  canonical payload. Executable logic determines this identifier; the display
  name, description, and local `Rxxx` identifier do not determine it.
- `StoredValidationRule` stores catalog entries and their authored definitions.
  An edit changing canonical identity archives the old entry and records
  `superseded_by` when it replaces it through the editor.
- Exception identity includes the canonical rule identifier and book keys.
  A revised identifier therefore produces different exception IDs, and the
  existing same-ID commentary carry-forward cannot bridge those versions.
- The current catalog deduplicates equivalent executable rules. This feature
  must not bypass canonical identity checks to force a duplicate.
- Historical run snapshots and existing commentary must remain accurate.
  Updating a rule must not rewrite old runs as if they used the new definition.

## 4. Business identity versus executable identity

Distinguish three concepts:

| Concept | Purpose |
| --- | --- |
| Business-rule lineage | Stable identity connecting revisions of the same business check |
| Rule revision | A particular executable definition within that lineage |
| Canonical identifier | Calculated identity of the executable logic, using the current algorithm |

A revision changes the executable identifier when its canonical logic changes,
but retains the business-rule lineage. A separate new rule starts a new lineage.
Neither action may assign a misleading identifier to changed logic.

Names and descriptions remain editable metadata. Metadata-only edits, or edits
that leave the canonical definition unchanged, must not cause commentary
recertification.

## 5. Save behavior and extensive-edit confirmation

### 5.1 Ordinary revisions

Saving an executable change through **Edit** normally means **modify current**:

1. Create/register the new calculated identity.
2. Retain the old definition as historical information.
3. Link the new revision to its predecessor within the same business lineage.
4. Record the save decision and before/after definitions in the configuration
   database's evolution table.
5. Make matching predecessor commentary eligible for carry-forward with the
   recertification marker.

Failed validation or persistence must leave the editor open and must not create
partial revision/history records.

### 5.2 Extensive-edit detection

The proposed trigger is either of the following:

- The previous revision had conditions, and none of its original conditions
  remains in the new definition, including removal of all conditions.
- The previous revision had expectations, and none of its original
  expectations remains in the new definition.

Compare normalized executable clauses, not editor row IDs, display order,
names, or descriptions. Reordering equivalent clauses must not trigger this
confirmation. Empty conditions before and after editing are not wholesale
removal. Grouping changes alone do not count as replacing all clauses, although
they can change executable identity and require recertification.

An invalid draft containing no required expectation must fail validation; the
confirmation must not permit saving an invalid rule.

This trigger is a technical signal for asking a business question. It is not
an automatic declaration that two definitions have different business meanings.
For example, changing the value of a single expectation replaces the only
original expectation and would trigger the proposed confirmation.

### 5.3 Confirmation choices

Show a concise before/after summary and these explicit actions:

| Action | Result |
| --- | --- |
| **Modify current** | Save a new revision in the existing lineage; allow commentary carry-forward with recertification |
| **Save as new** | Create a separate business rule; do not automatically inherit commentary or replace the source rule |
| **Back to editing** | Save nothing and retain the draft |

The message must explain the commentary consequence of each choice. No choice
may be inferred by closing the confirmation or losing focus. The editor closes
only after a successful save or an explicit editor Cancel.

For **Save as new**, preserve the original rule and its historical records.
If an equivalent canonical definition already exists, follow the catalog's
existing deduplication behavior and inform the user; do not silently merge
unrelated business lineages or transfer their commentary.

**Copy** remains a new-rule workflow by default, rather than an implicit
revision or commentary migration.

## 6. Commentary carry-forward

### 6.1 Matching

Carry commentary across an explicitly recorded predecessor/revision link using
the same book identity. A matching candidate must have:

- the source revision in the target rule's recorded lineage;
- matching key-column names and values, checked through the lossless key
  representation rather than concatenated exception-ID text; and
- an eligible commentary occurrence no later than the target as-of date.

Never match by rule name, local `Rxxx` index alone, or merely similar logic.
Never copy a different book's commentary because its identifier text resembles
the target. Changed book-key definitions require an explicit mapping or review;
they must not be guessed.

The old-to-new canonical identifier transition is a required, queryable part of
the configuration history, not merely a textual change note. For an eligible
target exception, resolve its rule's predecessor identifiers through that
history and look up commentary under the predecessor exception identities using
the same book keys. Matching must not require the old and new exception IDs to
be identical, or require an exception occurrence on the rule-edit date.

Follow recorded predecessor links transitively when several revisions occur
between two runs. Only **modify current** links authorize this traversal;
**save as new** and Copy do not authorize crossing into another lineage.

Only target exceptions actually detected by the new revision are eligible.
Changing a rule must not manufacture exception rows for books that no longer
violate it.

### 6.2 Carried text and marker

For an eligible match:

1. Retain the source commentary text without adding the marker into the text.
2. Set structured recertification state and display the exact label
   **`Recertification due to rule change`**.
3. Retain provenance: source rule revision/identifier, source exception ID,
   source as-of date, and the relevant configuration evolution event ID.
4. Preserve the old occurrence and its commentary unchanged.

Use a separate status/reason field so exports and later uploads cannot
accidentally treat the marker as the user's commentary.

An existing target comment must not be overwritten merely because the rule is
captured again or an import/restart retries the operation. Carry-forward must
be idempotent. An explicitly cleared latest source commentary must remain
cleared; searching further back must not resurrect an older nonblank value.

Where no eligible predecessor commentary exists, keep the normal new or
uncommented behavior. Do not imply that commentary has been carried when none
was available. Ambiguous predecessor matches require an explicit warning or
review rather than an arbitrary winner.

### 6.3 Review and recertification — proposed behavior

Pending recertification must be distinguishable from an ordinary accepted
comment. In particular, nonblank inherited text must not automatically make the
exception disappear under **New Exceptions Only**.

Provide an explicit way to accept the carried text for the target revision,
including acceptance with unchanged text. Record the accepted revision and
acceptance time. Do not treat downloading a template as acceptance.

The exact recertification action and whether an upload of an unchanged carried
comment constitutes acceptance remain open decisions in section 11.

For v1 → v2 → v3, the original commentary and provenance must remain traceable.
Further executable changes require recertification for the latest revision even
if the previous revision was already accepted. Pending commentary may remain
available as context, but must not become accepted merely by traversing another
revision link.

### 6.4 Confirmed cross-date example

The following identifiers are illustrative shorthand; actual exception IDs
continue to use the application's canonical rule identifier and lossless book
keys, not substring replacement.

| Date | Event | Required outcome |
| --- | --- | --- |
| 30 September | Rule 1 v1 runs with identifier `abcd`. Book `xxxx` has exception `xxxxabcd`, and the user enters commentary. | Store that commentary against the September occurrence. |
| 15 October | The user updates Rule 1 as a revision. Its identifier becomes `bcdf`. | Record the v1 → v2 / `abcd` → `bcdf` transition in the configuration DB. No run or tracking occurrence is required on this date. |
| 30 October | Rule 1 v2 runs and the same book still violates it, producing exception `xxxxbcdf`. | Resolve v1 through the revision history, match the book keys, and carry the eligible September commentary into the October occurrence. Display `Recertification due to rule change`. |

The September exception ID and commentary remain unchanged. The October
exception retains its new ID and stores provenance pointing to the September
exception, source date, source rule identifier, and configuration revision event.
Carrying commentary must not rename or merge either exception occurrence.

Rule-change time and exception as-of date are distinct. The event timestamp
records the October edit, while the source and target as-of dates govern which
commentary occurrence is eligible. An absent occurrence on 15 October must not
break the link between the September and October occurrences.

## 7. Rule evolution history in the configuration database

Add an append-only Django-managed table, proposed name
**`rules_rule_evolution_history`**, in the same database as the rule catalog.
It records authored rule changes and save decisions, not every book evaluation
or exception occurrence.

Suggested fields:

| Field | Purpose |
| --- | --- |
| `event_id` | Stable identifier referenced by audit/provenance records |
| `lineage_id` | Business-rule lineage to which the saved definition belongs |
| `revision_number` | Executable revision number within the lineage |
| `previous_event_id` | Previous accepted definition/history event, where applicable |
| `source_catalog_rule_id`, `target_catalog_rule_id` | Catalog entries involved in the operation |
| `source_identifier`, `target_identifier` | Before/after canonical identifiers |
| `change_type` | Creation, metadata edit, executable revision, or save-as-new |
| `save_decision` | Modify current, save as new, or the applicable ordinary save decision |
| `before_payload`, `after_payload` | Complete authored snapshots including conditions, expectations, and grouping |
| `change_summary` | Normalized differences, including the extensive-edit trigger where applicable |
| `commentary_policy` | Revision carry-forward requiring recertification, or no cross-rule inheritance |
| `source` | UI edit, copy, YAML import, startup synchronization, or another supported entry point |
| `created_at` | Timestamp of the committed change |
| `changed_by` | Actor identity when available; nullable for the current local application |

The exact schema may use related lineage/revision tables, but it must preserve
the information above. Metadata-only edits are history events without a new
executable revision. Do not increment executable revision numbers on a no-op
save or an idempotent startup synchronization.

The identifier transition must support indexed predecessor lookup by target
identifier and lineage. Retain both endpoints and their snapshots even when the
old catalog entry is archived. Persisting this history only in the
exception-tracking database would not satisfy the requirement.

Create the catalog mutation, predecessor link, and evolution event atomically
within the configuration database. Keep old snapshots available after archive
or deletion operations. Conflicting concurrent saves must not create two
indistinguishable revisions or silently overwrite their predecessor.

Do not create a cross-database foreign key into exception tracking. Commentary
records can retain the stable event ID as provenance. Their capture/import must
remain transactional within the tracking database and retry-safe; a rule save
does not require rewriting historical tracking records immediately.

## 8. YAML, imports, startup, and migration

UI changes, YAML application, and startup synchronization must follow one
consistent lineage/history policy.

YAML editing currently recalculates canonical identities when rules are
synchronized, but does not provide the same explicit replacement choice as an
interactive edit. Therefore:

- A metadata-only or unchanged canonical definition can reuse its existing
  lineage without initiating recertification.
- Cross-identifier lineage must come from explicit revision metadata or a
  recorded user resolution, not from a guessed name or `Rxxx` match.
- Imports needing an ambiguous lineage decision must not silently carry
  commentary or merge histories. The exact startup/import resolution workflow
  remains to be decided before implementation.
- Repeated application of unchanged configuration must not duplicate history
  rows, create additional revisions, or re-mark accepted comments.
- Export/import should preserve supported lineage metadata once its format is
  agreed. Existing configuration files must remain readable.

Migration must preserve existing identities, rule catalog entries, commentary,
and historical runs. Existing trustworthy predecessor links may be recorded as
migrated history; undocumented relationships must remain unknown rather than
being inferred. Tables without prior recertification fields must continue to
load, with their existing commentary behavior preserved until an explicit
cross-revision carry operation occurs.

## 9. UI and reporting

- Show the recertification marker separately from commentary in exception
  tracking and applicable results views.
- Expose the source rule revision and commentary date so users can understand
  why the text was carried.
- Include pending-recertification information in commentary XLSX templates and
  applicable HTML/Excel exception reports; retain import identity integrity.
- Keep pending items accessible when **New Exceptions Only** is enabled,
  subject to confirmation of the proposed status behavior.
- Allow users to inspect before/after rule snapshots and the recorded Save
  decision from the evolution history. The exact placement of this history view
  is an implementation design decision.

## 10. Acceptance scenarios

1. **Metadata edit:** rename a rule or change its description. The canonical
   identifier stays the same; history records the metadata edit and commentary
   does not acquire the recertification marker.
2. **Executable revision:** change a rule while choosing modify current. A
   matching book exception carries its previous commentary and shows
   `Recertification due to rule change` with source provenance.
3. **Extensive conditions edit:** remove or replace every original condition.
   Save asks whether to modify current or save as new; neither occurs before
   the user's choice.
4. **Extensive expectations edit:** replace every original expectation. The
   same choice is required, including when the previous rule had one
   expectation.
5. **Separate new rule:** choose save as new. The source rule remains intact,
   a separate lineage is recorded, and commentary is not automatically copied.
6. **Grouping-only change:** change executable AND/OR structure while retaining
   clauses. Treat this as a revision with recertification, without confusing
   reordering-equivalent logic with an executable change.
7. **Different book or keys:** no valid predecessor book match exists. Do not
   carry unrelated commentary; changed key schemas require explicit handling.
8. **Cleared or future commentary:** the latest eligible comment was cleared,
   or the only comment is after the target date. Do not resurrect/copy it.
9. **Existing target comment:** repeat capture or restart. Do not overwrite it
   or duplicate the carry-forward/history operation.
10. **Pending review:** inherited text remains distinguishable from accepted
    commentary and is not silently hidden from the review population.
11. **Acceptance then another revision:** accept text for v2, then revise to v3.
    Retain provenance and require recertification for v3.
12. **History storage:** inspect the database after creation, revision, and
    save-as-new. The configuration DB contains the evolution events; the
    exception-tracking DB does not become the authoritative rule-history store.
13. **Rollback:** reject/cancel a confirmation or simulate a failed save. No
    partial catalog revision, lineage, history event, or commentary migration
    is committed.
14. **Import and startup:** reapply unchanged YAML without duplicate revisions;
    require explicit handling for an ambiguous cross-identifier relationship.
15. **Compatibility:** open old runs, tracking data, and configuration files
    without rewriting their historical rule definitions or losing commentary.
16. **Confirmed September-to-October carry:** create commentary on a
    30 September v1 exception, revise the rule on 15 October without running it,
    and capture the same book on 30 October under v2. The new exception ID carries
    the September text and the exact recertification marker; both occurrences
    retain their own IDs, dates, and historical definitions.
17. **Multiple intervening revisions:** repeat the preceding scenario with
    v1 → v2 → v3 before the October run. Resolve the recorded predecessor chain
    without requiring a tracking occurrence for every intervening revision.

## 11. Clarifications and proposed defaults

| Question | Proposed default / interpretation |
| --- | --- |
| Does “rule evaluation” mean rule evolution/history? | Confirmed: revision history with queryable old-to-new identifier transitions in the configuration DB. Per-execution logging is not part of this request. |
| What constitutes the extensive edit? | Either previous conditions or previous expectations have zero normalized clauses retained, not necessarily both. This is a confirmation trigger, not an automatic business classification. |
| Should pending recertification appear under New Exceptions Only? | Yes, so inherited text cannot hide an item requiring review. |
| How does the user recertify unchanged commentary? | Prefer an explicit Accept/Recertify action. Define XLSX upload semantics before implementation. |
| Which as-of dates participate in carry-forward? | Cross-date carry is confirmed, including September commentary carried to October after an intervening rule revision. Use eligible same/earlier as-of dates, never future commentary, and preserve intentional clearing. |
| What if a valid v2 target comment already exists? | Preserve it; do not overwrite it from v1. A direct user edit made under v2 should be distinguishable from unaccepted inherited text. |
| What happens to enabled selection after Save as new? | Preserve the source rule; follow the existing create-rule selection behavior for the new entry unless the user chooses otherwise. |
| How should unattended YAML/startup handle an ambiguous revision? | Require explicit lineage metadata or an interactive resolution. Never infer commentary transfer solely from display IDs or names. The operational fallback must be agreed. |

These open points should be resolved before implementing schema migrations and
status transitions. This document does not implement carry-forward,
recertification, save classification, or the evolution table.
