# 2026-09-18 Canonical business rule identifier implementation plan

## Outcome

Add a stable, deterministic identifier for each validation rule's authored business definition.
The identifier must remain the same when a rule configuration is reordered and its operational
`Rxxx` number changes. It must change when the authored condition/grouping logic or required-state
logic changes.

Make the local Django SQLite database the authoritative catalog for every rule configured through
the UI or imported from a configuration, as well as for canonical rule identities. Treat YAML/JSON
rule configuration files as portable enabled-rule sets and an alternative editing/import method,
not live application storage. Continue to use `R001`, `R002`, and so on as local display and API
IDs. They are not durable cross-installation identities.

Every newly executed run must persist both:

- `rule_id`: the operational ID used in that run, such as `R003`; and
- `rule_identifier`: the stable canonical business-rule identifier.

This creates the durable rule reference needed by a later exception-tracking feature without
breaking the current rule APIs, UI, reports, or result grouping.

## Terminology

- **Operational rule ID (`rule_id`)**: the local `Rxxx` value assigned when a catalog entry is first
  created. Configuration import does not renumber existing catalog entries; newly imported rules
  receive the next unused value.
- **Canonical business rule identifier (`rule_identifier`)**: a content-derived ID based only on
  the fields that define the validation scope and required-state logic.
- **Canonical payload**: the versioned, deterministic JSON representation hashed to produce the
  identifier.
- **Rule registry**: the append-only SQLite table holding identifiers and their canonical payloads.
- **Catalog rule**: an editable SQLite rule record retained independently of any configuration.
- **Enabled rule**: a catalog rule currently ticked for validation and configuration export.
- **Rule configuration**: a portable file containing only the rules enabled when it was saved.
  Loading it imports missing catalog rules and applies its enabled set; editing the file alone does
  not mutate application state.

Use these names consistently in code and contracts. Do not call `rule_identifier` a mathematically
complete semantic-equivalence identifier.

## Equivalence contract

### Transformations that do not change the identifier

The canonicalizer must ignore representation-only ordering:

1. Condition array order and condition leaf IDs such as `c0` and `c1`.
2. Child order within an `AND` or `OR` branch.
3. Group order and group numbering in the legacy grouping representation.
4. Parenthesization of adjacent branches with the same operator. For example,
   `(A AND B) AND C` and `A AND (B AND C)` are canonicalized as one `AND(A, B, C)` branch.
5. Order of values within a multi-value condition or value-against-column logic clause, because
   the evaluator treats those values as an unordered ANY/NONE set.
6. Duplicate values within one multi-value field.

This contract makes the examples R001/R002 and R004/R005 in the requirement share identifiers.

### Distinctions that must be retained

The canonicalizer must preserve authored business logic and must not perform general Boolean or
predicate simplification. In particular, all of the following pairs must have different IDs:

```text
score > 10 AND score > 20
score > 20
```

```text
A AND (B OR C)
(A AND B) OR (A AND C)
```

```text
A OR (A AND B)
A
```

Do not apply distribution, absorption, implication, contradiction elimination, numeric threshold
reasoning, domain-value reasoning, or conversions between one multi-value predicate and several
single-value predicates. Preserve repeated condition nodes even if they appear redundant.

### Fields included in identity

Include every field that can change whether a row is in scope or whether it violates the rule:

- each condition's `column_name`, `operator`, and effective value set;
- the complete normalized AND/OR grouping structure;
- logic `format`, `column_name`, `operator`, and effective target value(s); and
- `comparison_mode`, including its effective default.

Use exact persisted strings. Do not trim, case-fold, Unicode-normalize, or coerce numeric-looking
values in the identifier code unless the evaluator is changed to perform the identical operation.

### Fields excluded from identity

Exclude fields that only affect presentation or configuration-local metadata:

- `rule_id`;
- rule name and description;
- condition IDs and group IDs;
- condition/group display order;
- `extra_columns`; and
- `hide_comparison`.

Changing an excluded field must not break exception continuity. If a future field changes rule
evaluation, it must be added to a new canonicalization version before that field is released.

## Identifier format and algorithm

Introduce a pure backend module, for example `apps.rules.identifiers`, with no database or file
access. It should provide:

```python
canonicalize_rule(rule_or_draft) -> dict[str, object]
serialize_canonical_rule(payload) -> str
calculate_rule_identifier(rule_or_draft) -> str
```

Canonicalization steps:

1. Convert every condition into a versioned canonical condition object.
2. Replace each grouping-tree leaf reference with that condition's canonical object. Never hash
   positional leaf references directly.
3. Convert a rule without a grouping tree into the equivalent explicit scope node using its
   `condition_relation`; represent one condition directly and no conditions as an explicit
   unconditional-scope node.
4. Convert legacy grouping to its actual runtime meaning: `OR` within each group and `AND` across
   groups.
5. Recursively flatten child branches having the same operator.
6. Sort each branch's canonical children by their canonical serialized form. Keep duplicate child
   nodes.
7. Normalize multi-value fields by exact-string deduplication followed by lexical sorting.
8. Add the normalized required-state logic clause.
9. Serialize with UTF-8, sorted object keys, fixed compact separators, and no environment-dependent
   formatting.
10. Hash the bytes with SHA-256, retain the full digest for collision verification, and encode the
    first 96 bits as fixed-width Crockford Base32 for the public identifier.

Use an explicit version prefix, for example:

```text
CBR1_<20 Crockford Base32 characters encoding 96 digest bits>
```

For example:

```text
CBR1_1K3M9Q2D8F4X6T1W5H0J
```

The complete public identifier is 25 characters. Base32 encoding must be uppercase, fixed-width,
and use the unambiguous Crockford alphabet. Parsing should accept only the canonical emitted form;
do not introduce case-folding or ambiguous-character substitution into stored identifiers.

The canonical payload must also contain a schema marker such as
`"canonical_business_rule/v1"`. Versioning is mandatory: changing canonicalization behavior in
place would silently break references from historical exceptions. A future algorithm must use a
new prefix and an explicit migration/alias strategy.

The 96-bit `CBR1_...` value is the identifier stored in references and exchanged through APIs. The
full SHA-256 digest and canonical payload remain in the registry for collision verification. A
collision on the shortened identifier must be detected and rejected rather than resolved with a
local suffix, because suffixes would make identifiers differ across installations.

## SQLite design and storage authority

Add Django models under the rules app and create normal Django migrations. SQLite becomes the only
source used by routine rule listing, detail, create, update, enable/disable, delete/archive,
ordering, and execution operations. Those operations must not reread an active YAML file.

Suggested models:

```text
ValidationRuleIdentity
  identifier          varchar(25), primary key
  algorithm_version   positive small integer
  full_digest         char(64)
  canonical_payload   text
  created_at          datetime

StoredValidationRule
  id                  bigint, primary key (internal only)
  rule_id             varchar, unique                 # stable local Rxxx
  catalog_position    positive bigint, unique         # stable pagination order
  identity            protected FK -> ValidationRuleIdentity, unique
  authored_payload    JSON                             # exact editable rule representation
  enabled             boolean, indexed
  enabled_position    positive integer, nullable      # order of ticked rules
  archived_at         datetime, nullable
  created_at          datetime
  updated_at          datetime

RuleStoreState
  singleton_key       fixed primary key
  initialized         boolean
  next_index          positive integer
  revision            positive bigint
```

`authored_payload` must retain the exact validated rule fields needed to reopen the editor,
including name, description, condition order and leaf IDs, grouping tree, logic, extra columns, and
hide-comparison behavior. The identity's canonical payload is not a replacement for this authored
record because canonicalization intentionally discards ordering and presentation metadata.

Requirements:

- `ValidationRuleIdentity` is an immutable, append-only definition registry.
- `StoredValidationRule` is the persistent local catalog. A catalog entry is found across imports
  by canonical identity, while its local `Rxxx` remains unchanged.
- Only one catalog entry exists for a canonical identity, including archived entries. Importing the
  same canonical rule enables/reuses (and, when necessary, unarchives) it instead of creating
  another local rule.
- Deleting a rule from the UI is a soft archive: disable it and set `archived_at`. It must not delete
  its identity or historical run/exception references. Importing that identity later unarchives
  and re-enables the catalog entry.
- Inserting an existing identifier with the same digest and canonical payload is idempotent.
- Finding the same identifier with a different full digest or canonical payload is treated as a
  shortened-hash collision or implementation defect and must fail loudly; never silently merge the
  rows or add an installation-local suffix.
- Create, edit, archive, enable/disable, reorder, and configuration import use
  `transaction.atomic()`, database uniqueness constraints, and appropriate locking/revision checks.
- When materializing a catalog row, recalculate the identifier from `authored_payload` and verify it
  matches the protected identity foreign key. Treat a mismatch as database corruption and fail
  visibly; do not silently rewrite either value.
- The store-state row preserves `next_index` even when no catalog rules are enabled. Its
  `initialized` flag distinguishes an intentionally empty database from an installation that still
  requires legacy-file migration.
- Keep both the full digest and canonical payload so equality and collision checks do not rely only
  on the 96-bit public identifier.

Add registry and repository services with an explicit separation of responsibilities:

```python
register_rule_identity(rule_or_draft) -> ValidationRuleIdentity
register_rule_identities(rules) -> dict[str, ValidationRuleIdentity]
list_catalog_rules(cursor=None, page_size=...) -> RulePage
create_catalog_rule(draft, enabled=True) -> Rule
update_catalog_rule(rule_id, draft) -> Rule
set_rule_enabled(rule_id, enabled) -> Rule
apply_rule_configuration(drafts) -> RuleImportResult
```

### Configuration files as import/export documents

An external configuration file never changes live rules merely because the file changed. The
change becomes active only when the user explicitly selects **Load/Import configuration** (or calls
the corresponding API). Every import must:

1. read the file without trusting `rule_id`, `rule_identifier`, or digest fields it contains;
2. parse and validate the complete collection before opening the import transaction;
3. calculate every canonical identifier from the imported business definitions;
4. reject duplicate canonical identifiers within one configuration rather than enabling the same
   catalog rule twice;
5. within one SQLite transaction:
   - register/verify every canonical identity;
   - find existing catalog entries by `rule_identifier`;
   - import missing rules as new catalog entries with the next unused `Rxxx`;
   - unarchive referenced catalog entries when necessary;
   - update the existing catalog entry's validated authored/presentation payload from the imported
     document without changing its local `Rxxx`;
   - enable exactly the rules present in the configuration, in configuration order;
   - disable every other non-archived catalog rule without deleting it; and
   - update `next_index` and increment the store revision; and
6. return enabled/imported/reused counts and the committed `Rxxx`-to-identifier bindings.

If an external edit changes an included business field, the next explicit import registers a new
identifier and imports a new catalog rule while retaining the prior catalog rule and registry row.
Reordering conditions or groups retains identifiers according to the equivalence contract. A rule
omitted from the imported file is disabled, not deleted or archived. Rule order in the configuration
becomes `enabled_position` and does not renumber local `Rxxx` values.

Malformed or invalid files must leave the catalog, enabled set, and store revision unchanged.
There must be no partially imported state. Because catalog rows and identities are in the same
database, import can be genuinely atomic instead of coordinating a YAML replacement with a
separate SQLite write.

Saving a rule configuration becomes an export from SQLite containing only currently enabled/ticked
catalog rules, ordered by `enabled_position`. Disabled and archived rules must not be written to
the configuration. Saving an empty enabled set produces a valid empty rule configuration. An
exported identifier may be included for diagnostics, but import must always recalculate and verify
it. Remote rule loading follows the same validate/canonicalize/transactional-import path.

Each exported entry must contain both its complete authored rule payload and its calculated
`rule_identifier`. A configuration containing identifiers alone would not be portable to another
installation and could not import a missing rule. Bump/version the rule-config schema for this
contract while retaining an importer for legacy rule configs that contain only authored payloads.

### Automatic catalog persistence and enablement

Clicking **Save** in the new-rule editor must immediately create the catalog row, register its
identity, allocate its permanent local `Rxxx`, and mark it enabled in one transaction. There is no
separate configuration-save step required to retain a rule. Cancelling the editor creates nothing.

Editing an existing catalog rule saves immediately to SQLite. An edit limited to excluded metadata
updates that catalog entry in place. If included business logic changes and therefore produces a new
identifier, preserve the previous catalog rule as disabled and switch enablement to a catalog entry
for the new identity: create it with the next `Rxxx` if missing, or reuse it if that identity already
exists. Return both the prior and resulting local IDs so the frontend can replace its selection
without a transient unticked state. This preserves every business-rule definition ever configured
without creating duplicate catalog entries for the same canonical identity.

Ticking or unticking a rule persists its `enabled` state immediately; the workflow context mirrors
server state rather than owning the only copy.

A validation run uses a transactionally read snapshot of the enabled rules (or an explicit enabled
ID snapshot supplied and validated by the client). Configuration export reads the same committed
enabled set, so the saved file and the visible ticks cannot diverge.

### Initial listing and incremental pagination

The rule catalog may grow indefinitely even though only a subset is enabled. The rules API must use
database pagination rather than returning the entire catalog:

- On the initial Rules-page load, return the first 50 non-archived catalog rules in
  `catalog_position` order **plus every enabled rule**, including enabled rules outside that first
  50. Deduplicate the combined response by local rule ID.
- Keep all enabled rules visible/pinned while browsing catalog pages so a selected rule never
  disappears merely because it is outside the current page.
- Return an opaque `next_cursor`, `has_more`, total catalog count, and store revision.
- Each click on **Next page** reads the next 10 previously unreturned, non-archived rules from
  SQLite. Skip enabled rules already supplied in the pinned enabled set, so a full intermediate
  page contains 10 newly displayed catalog rules rather than duplicates.
- Continue 10-rule database reads until the last page returns `has_more: false` and no next cursor.
- Use keyset/cursor pagination based on `catalog_position`, not an ever-growing client-side array or
  a database offset scan.
- Include the store revision in or alongside the cursor. If create/import/archive/reorder changes
  the catalog between page requests, reject the stale cursor and refresh from the initial page.
- Previous-page navigation may use already fetched query-cache pages; it must not fetch the complete
  catalog to reconstruct pagination.
- Search, if retained or added, must be server-side and must still return all enabled rules
  separately so enablement remains visible.

The frontend must initialize `selectedRuleIndexes` from the response's `enabled` flags. Remove the
current behavior that automatically ticks every rule returned by `useRules()`, since page loading is
not an enablement action.

### Existing-rule migration

Existing installations have active rules in YAML. Add an idempotent management command such as:

```text
python backend/manage.py migrate_rules_to_db
```

After database migrations, the command must lock/read `RuleStoreState` and:

- do nothing when `initialized` is already true, including when the catalog is intentionally empty
  or all catalog rules are disabled;
- otherwise parse and validate the legacy active rule file completely;
- calculate/register identities and insert catalog rows in one transaction, initially enabling all
  migrated rules in their legacy order;
- preserve existing `Rxxx` values, order, and `next_index` during this one-time migration;
- mark the store initialized only after a successful commit; and
- leave the legacy file untouched as a recovery/import artifact.

Run this command after `migrate` in both `scripts/dev.sh` and `trigger.py`. After initialization,
routine startup and rule execution read enabled catalog entries from SQLite only. The application
must not silently reimport a changed legacy file on restart.

Do not infer identifiers for old persisted run documents from their `Rxxx` values. Those documents
do not contain enough canonical rule structure, and `Rxxx` may since have been reassigned. Legacy
runs should expose a missing/null `rule_identifier`; they must never be linked to a current rule by
guessing.

## Backend integration

### Rule model and persistence service

1. Add `rule_identifier` to the in-memory `Rule` dataclass.
2. Replace YAML-backed `load_rules()`/`save_rules()` behavior with an ORM-backed catalog
   repository. Keep file parsing in a separate import/export service so storage and interchange
   cannot be confused.
3. During create, update, and collection import, calculate the identity from the validated authored
   payload and register it in the same database transaction as the catalog-row mutation.
4. Reordering rules must not recalculate to a different identifier.
5. Editing a rule's included business fields produces/reuses a different catalog entry and
   identifier. Preserve and disable the previous catalog entry for history.
6. Editing only excluded metadata retains the identifier.
7. The execution path loads an immutable in-memory snapshot of selected enabled database rows so a
   concurrent edit cannot mix rule revisions within one run.
8. Existing helpers that accept an explicit path may remain only as import/export parsers for tests
   and configuration management; they must not represent the live rule store.

### Rules API

Extend rule responses with read-only `rule_identifier`:

```json
{
  "rule_id": "R003",
  "rule_identifier": "CBR1_...",
  "name": "Valid status",
  "conditions": [],
  "logic": {}
}
```

Return it from list, detail, create, and update responses. Clients must not be allowed to choose or
overwrite it. Import responses should include a binding list or map when useful to callers,
for example `{ "R001": "CBR1_..." }`.

Keep all existing endpoints addressed by `Rxxx` for this phase. Changing edit/delete routes to the
canonical identifier would be a separate API redesign; local catalog operations should continue to
target the local record even though historical definitions and cross-installation references use
the canonical identifier.

Extend list responses with `enabled`, pagination metadata, and separate/identifiable pinned-enabled
records. Add a small enable/disable mutation endpoint (or a validated bulk equivalent) so checkbox
changes are committed immediately. Replace the old collection-replacement endpoint with an atomic
configuration-import endpoint that retains the catalog and applies the imported enabled set.

### Run evaluation and persistence

Add `rule_identifier` to `ValidationViolation` and to each `rule_summaries[rule_id]` entry. Keep
`violations_by_rule` and count maps keyed by the run's `Rxxx` value to avoid breaking current UI and
report behavior.

Also persist an explicit run-level binding snapshot:

```json
"rule_bindings": {
  "R001": "CBR1_...",
  "R002": "CBR1_..."
}
```

This snapshot makes the relationship unambiguous even for rules that produced zero violations.
It must reflect only the rules selected for that run.

Persist both identifiers inside each violation record so a later exception-tracking migration can
populate foreign keys without depending on mutable configuration state. Add backward-compatible
load defaults for legacy run documents that lack these fields.

### Reports and detail APIs

Continue displaying `Rxxx` and rule names as today. Pass `rule_identifier` through result/detail
contracts even if it is not initially displayed. Report grouping remains based on the run-local
`Rxxx` snapshot for backward compatibility.

## Frontend and contract changes

1. Add read-only `rule_identifier` fields to wire schemas.
2. Add `identifier` to the frontend `Rule` and rule-result domain objects.
3. Map and retain it through rules, execution results, persisted-run restoration, and paginated
   violation details.
4. Do not include the identifier in rule-draft requests.
5. Continue selecting and reordering enabled rules using `Rxxx`, but persist every checkbox change
   to the backend and restore ticks from backend `enabled` fields.
6. If shown on the Rules page, label it **Rule identifier** and expose the complete 25-character
   value for copying. UI display is optional for the first backend delivery, but API and persistence
   support are required.
7. Update the versioned contract schema and examples without removing existing `rule_id` fields.
8. Treat **Load configuration** as an explicit database import and **Save configuration** as an
   export of only the committed enabled database rules. Refresh the rule query and enabled state
   only after the import transaction succeeds.
9. Replace the current all-rules query/client pagination with the initial 50-plus-enabled response
   and 10-rule cursor pages loaded only when the user clicks **Next page**.
10. Do not build saved rule-config content from the currently rendered/paginated browser list. The
    save-config backend operation must query all enabled catalog rows from SQLite in enabled order;
    otherwise enabled rules outside the loaded pages would be silently omitted.
11. Apply checkbox changes optimistically for responsiveness, persist them immediately, and roll
    back/show an error if the mutation fails. Use a bulk enablement endpoint for multi-rule actions
    so they are atomic and do not issue one request per rule. The request must carry explicit local
    IDs and the UI must distinguish **Select displayed** from **Enable/disable all catalog rules**;
    pagination must never make a global action ambiguous.
12. Update query cache from successful create/edit/enable/import responses where practical, while
    invalidating the initial catalog query whenever its revision changes.

## Preparation for future exception tracking

The canonical rule identifier answers **which business rule produced the exception**. It does not,
by itself, identify the exception occurrence. The later tracking feature should use a composite
identity containing at least:

```text
tracking scope / dataset identity
+ rule_identifier
+ canonical record key (key-column names and values)
+ violating column or exception type
```

The tracking scope prevents a record with key `123` in one dataset from being merged with record
`123` in an unrelated dataset. The canonical record key must be based on configured key columns,
not row number, because row positions can change between runs.

The future exception table can safely use a protected foreign key to
`ValidationRuleIdentity.identifier`. A change to included business logic creates a new rule
identity and therefore a new exception lineage. Reordering/reloading the same rule merely changes
enabled order; importing it into another installation may assign a different `Rxxx`, but the
existing exception lineage continues through `rule_identifier`.

Names and descriptions should be stored as occurrence/run snapshots for display; they must not be
used as durable keys. Decide separately how an operator intentionally transfers open exceptions
when a genuine business-rule change creates a new identifier.

## Delivery phases

### Phase 1 — Freeze behavior with tests

- Add canonicalization fixtures for R001 through R005 from the requirement.
- Add explicit non-equivalence tests for threshold redundancy, distribution, absorption, mixed
  AND/OR structure, changed operators, changed columns, changed values, logic format, and
  comparison mode.
- Add equivalence tests for condition order, group order, same-operator reassociation, leaf-ID
  renumbering, and multi-value order.
- Add tests proving name, description, extra columns, and hide-comparison settings do not affect
  identity.

### Phase 2 — Canonicalizer and SQLite rule store

- Implement the pure, versioned canonicalization and hashing module.
- Add identity, catalog-rule, and store-state Django models and migrations.
- Implement idempotent registration and collision checking.
- Implement the transactional catalog repository and persisted enablement.
- Add the one-time legacy-file migration command and launcher integration.

### Phase 3 — Rule CRUD and configuration import/export

- Move rule loading, CRUD, enablement, ordering, and execution reads to SQLite.
- Attach identifiers to ORM-loaded `Rule` objects.
- Separate file parsing/export from the catalog repository.
- Recalculate and reconcile identifiers on every explicit rule-configuration import.
- Register/import missing catalog rules and apply the exact enabled set in one atomic database
  transaction without deleting the remaining catalog.
- Save new UI-authored rules immediately and enable them by default.
- Export only enabled rules.
- Add the initial 50-plus-enabled query and 10-rule cursor pagination.
- Return read-only identifiers from rule APIs.
- Verify repeated import reuses the same local catalog entries and that importing the same file into
  a different catalog produces the same canonical identifiers even if local `Rxxx` values differ.

### Phase 4 — Runs, persistence, and API contracts

- Add identifiers to validation dataclasses, summaries, violations, and run-level bindings.
- Persist and reload them with backward-compatible legacy defaults.
- Pass them through paginated details and frontend wire/domain mappings.
- Update contract schemas, examples, and API documentation.

### Phase 5 — Regression and release verification

- Run backend, contract, integration, and frontend tests.
- Build the frontend distribution after source tests pass.
- Test the one-time migration against a copy of a populated local `data/db.sqlite3` and legacy
  active rules file.
- Verify that initialization does not reimport the legacy file after the database is initialized,
  including when the catalog is intentionally empty or has no enabled rules.

### Worker allocation for the five phases

- **Worker A** owns Phase 1 canonicalization foundations and Phase 2 identity/catalog schema and
  repository foundations.
- **Worker B** owns Phase 3 backend catalog CRUD, persisted enablement, configuration import/export,
  pagination APIs, and legacy migration/launcher behavior.
- **Worker C** owns Phase 4 backend run propagation, persistence, reports, backward compatibility,
  and executable shared contracts.
- **Worker D** owns the Phase 3/4 frontend implementation for catalog state, config operations,
  pagination, wire mapping, and browser behavior.
- **All workers** perform their scoped Phase 5 tests, documentation, self-review, and revisions. The
  coordinator/reviewer owns integrated Phase 5 convergence and the final release gate.

Detailed assignments and completion rules are in:

- `planning/20260918_rule_identifier_worker_a_identity_store_instruction.md`
- `planning/20260918_rule_identifier_worker_b_catalog_api_instruction.md`
- `planning/20260918_rule_identifier_worker_c_run_contract_instruction.md`
- `planning/20260918_rule_identifier_worker_d_frontend_instruction.md`
- `planning/20260918_rule_identifier_coordinator_reviewer_instruction.md`

## Required tests

At minimum, cover:

- R001 and R002 produce the same identifier.
- R003 differs from R001/R002.
- R004 and R005 produce the same identifier.
- `score > 10 AND score > 20` differs from `score > 20`.
- distributive and absorption equivalents retain different identifiers.
- duplicate condition nodes remain represented and are not simplified away.
- exact case and whitespace changes in condition values change the identifier.
- reordering a current rule does not change its identifier.
- importing a configuration reuses existing catalog rules by identifier without changing their
  local `Rxxx`; missing rules receive the next unused `Rxxx`.
- externally editing a config file does not alter active database rules before explicit import.
- importing an externally edited business field creates a new catalog rule and identifier while
  retaining the prior catalog rule and registry row.
- importing externally reordered rules, conditions, or groups retains their identifiers.
- importing changes only to excluded presentation metadata retains the identifier.
- omitting a catalog rule from an imported collection disables it without deleting/archiving it or
  deleting its registry identity.
- a stale or forged identifier written into a config file is ignored in favor of the value
  calculated from the actual rule definition.
- an invalid external file does not partially activate or register the imported rule collection.
- create, update, archive, enable/disable, reorder, and execution continue to work after the legacy
  rule file is renamed or changed, proving SQLite is authoritative.
- one-time migration preserves legacy `Rxxx`, order, and `next_index`, and enables every migrated
  rule.
- migration does not reimport a legacy file after initialization, including after deleting all
  active database rules.
- saving a new UI-authored rule persists it immediately and enables it without saving a config.
- cancelling a new-rule editor creates no catalog or identity row.
- checkbox changes persist immediately and survive refresh/restart.
- configuration export contains exactly the enabled rules in enabled order and excludes every
  disabled/archived rule.
- configuration export includes enabled rules that were never loaded into the browser's current
  catalog pages, proving export reads SQLite rather than rendered client state.
- an empty enabled set exports and reimports as a valid empty enabled configuration without deleting
  catalog rules.
- importing a configuration enables exactly its referenced rules, disables other catalog rules,
  imports missing rules, and commits all effects atomically.
- importing a canonical identity already present in the catalog does not duplicate it.
- a business-logic edit preserves/disables the prior catalog entry, creates or reuses the resulting
  identity's catalog entry, transfers enablement, and returns the resulting local `Rxxx`.
- an excluded-metadata-only edit updates the same catalog entry and retains its identifier and
  local `Rxxx`.
- the initial list reads no more than the first 50 catalog rules plus all enabled rules.
- an enabled rule outside the first 50 is returned and remains visible.
- every **Next page** request reads at most 10 new rules from SQLite, does not repeat pinned enabled
  rules, and eventually returns `has_more: false`.
- stale pagination cursors are rejected/refreshed after catalog revision changes.
- frontend initialization ticks only server-enabled rules and does not enable every listed rule.
- failed optimistic enablement rolls the checkbox back, and bulk enablement is atomic over explicit
  local rule IDs.
- a catalog-row payload/identity mismatch is detected and is never executed silently.
- changing included business logic changes the identifier.
- changing excluded presentation metadata does not change the identifier.
- registry registration is idempotent.
- rule archival leaves its catalog and registry rows intact.
- collision/payload mismatch is rejected.
- create/update/import responses return the calculated identifier and ignore/reject a supplied
  identifier.
- a new run persists `rule_bindings` and identifiers on violations and summaries.
- a selected rule with zero violations is still present in `rule_bindings`.
- legacy run documents without identifiers continue to load and are not guessed/mislinked.
- current HTML/Excel exports and paginated result endpoints remain functional.

## Acceptance criteria

1. The canonicalization examples in the requirement pass exactly as specified.
2. Structurally reordered rules retain identity, while business-expression rewrites and predicate
   simplifications do not collapse to the same identity.
3. SQLite is the authoritative persistent rule catalog; routine application operation does not
   depend on the legacy active rule file, and creating a rule in the UI saves it immediately.
4. Explicitly importing a saved configuration reuses existing rules by identifier, imports missing
   rules, and applies the configuration's enabled set without deleting other catalog rules or
   renumbering existing local `Rxxx` values.
5. Every new persisted run records the `Rxxx`-to-identifier binding, including zero-violation
   selected rules.
6. New violation records contain both operational and canonical identifiers.
7. Old run documents remain readable, with missing identity represented honestly rather than
   inferred from current configuration.
8. Existing editing, selection, ordering, validation, reports, and exports continue to work.
9. The identifier algorithm and canonical payload are versioned and documented.
10. Identities are append-only: editing, importing, or archiving a catalog rule never deletes the
    prior identifier needed by historical runs and exceptions.
11. Configuration files contain only enabled rules, function as validated import/export documents,
    and external edits have no effect until an explicit atomic import succeeds.
12. The first catalog view includes the first 50 rules and all enabled rules; each Next-page action
    loads 10 additional rules from SQLite until the last page.

## Verification commands

```bash
uv run python backend/manage.py makemigrations --check --dry-run
uv run python backend/manage.py migrate --check
uv run pytest -q tests/backend tests/contracts tests/integration
npm --prefix frontend test -- --run
npm --prefix frontend run build
git diff --check
```
