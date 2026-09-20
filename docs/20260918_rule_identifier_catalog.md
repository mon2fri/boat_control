# Canonical Rule Identity and Catalog Foundation

## Identity

`apps.rules.identifiers` is pure and accepts an authored rule mapping. It emits a versioned
canonical payload with schema marker `canonical_business_rule/v1`. Identity includes condition
column/operator/effective values, normalized scope topology, logic format/column/operator/effective
values, and `comparison_mode` (defaulting to `comparison_vs_baseline`). Values are exact strings,
deduplicated and lexically sorted. Same-operator branches are flattened and children sorted; no
Boolean or numeric simplification is performed.

Rule ID, name, description, condition/group IDs and order, `extra_columns`, and `hide_comparison`
are excluded. The compact sorted-key JSON is SHA-256 hashed. The first 96 bits are encoded with
uppercase Crockford Base32 as exactly 20 characters and prefixed with `CBR1_` (25 characters total).
The registry retains the full digest and payload. A mismatch is a hard collision/corruption error.

## SQLite Catalog

`ValidationRuleIdentity` is append-only. `StoredValidationRule` is the local catalog: `rule_id`
and `catalog_position` are monotonic local values, `identity` is protected and one-to-one,
`authored_payload` retains editor data, and deletion is represented by `archived_at`. `RuleStoreState`
is a singleton preserving `next_index`, initialization, and a revision counter.

Repository mutations use `transaction.atomic()`, lock the state/affected rows, and increment revision.
Identity registration is idempotent. Catalog materialization recalculates the identity and refuses to
return a snapshot when payload, digest, or foreign key disagree.

Business-logic edits preserve the old disabled row and create/reuse a new identity/catalog row.
Presentation-only edits update the same row. `set_rules_enabled` applies an explicit ordered set in
one transaction.

## Pagination and Consumer Signatures

Worker B should use:

```python
register_rule_identity(rule_or_draft) -> ValidationRuleIdentity
register_rule_identities(rules) -> dict[str, ValidationRuleIdentity]
create_catalog_rule(draft, enabled=True) -> RuleSnapshot
get_catalog_rule(rule_id) -> RuleSnapshot
update_catalog_rule(rule_id, draft) -> RuleEditResult
set_rule_enabled(rule_id, enabled) -> RuleSnapshot
set_rules_enabled(rule_ids) -> tuple[RuleSnapshot, ...]
reorder_enabled_rules(rule_ids) -> tuple[RuleSnapshot, ...]
archive_catalog_rule(rule_id) -> RuleSnapshot
list_catalog_rules(cursor=None, page_size=10) -> RulePage
apply_rule_configuration(drafts) -> RuleImportResult
```

The first page combines the first 50 non-archived positions with all enabled rows. Later pages use
an opaque revision-bound keyset cursor and return at most 10 non-pinned rows. A changed revision
raises `StaleCursorError`. `RuleSnapshot.rule` is immutable and contains `rule_identifier` for run
consumers; `CatalogCorruptionError`, `IdentityCollisionError`, and `CatalogError` are hard failures.
