# 2026-09-18 Canonical rule identifier — Worker A instruction

## Assignment

Own the canonical identity algorithm and the SQLite catalog foundation. Deliver the stable,
well-tested backend primitives consumed by Workers B and C. Do not implement browser behavior or
the final rule/config API surface.

Read completely before editing:

- `requirements/20260918_validation_rule_identifier.md`
- `planning/20260918_canonical_business_rule_identifier_implementation_plan.md`
- `planning/20260918_rule_identifier_coordinator_reviewer_instruction.md`

Work only in the branch/worktree assigned by the coordinator.

## Mandatory completion loop

For every section below: implement it, add/adjust tests, document it, review your own diff against
the canonical plan, run the relevant checks, fix every failure, revise documentation, and repeat
until all acceptance items pass. Do not hand off partial work or defer a required test/documentation
item. Record progress and final evidence in
`reviews/20260918_rule_identifier_worker_a_delivery.md`.

## Owned implementation

Primary files/modules:

- new `backend/apps/rules/identifiers.py`;
- new `backend/apps/rules/models.py`;
- new Django migrations under `backend/apps/rules/migrations/`;
- new `backend/apps/rules/repository.py` (or coordinator-approved equivalent);
- focused new backend tests for identifiers, models, repository invariants, and pagination queries;
- focused technical documentation for the canonical format and SQLite schema.

Do not edit shared contract JSON, frontend files, run/report persistence, rule views/serializers, or
launch scripts. If an unavoidable interface change is needed, stop and send the proposed signature
and rationale to the coordinator before touching another owner's file.

## A1 — Canonical business-rule identity

- [ ] Implement a pure canonicalizer with no file/database access.
- [ ] Include condition predicates, normalized mixed AND/OR topology, logic clause, effective
  defaults, and comparison mode exactly as specified.
- [ ] Ignore condition/group sequence, leaf IDs, same-operator parenthesization, and multi-value
  ordering/duplicates.
- [ ] Preserve duplicate condition nodes and mixed-operator structure.
- [ ] Do not apply distribution, absorption, implication, contradiction elimination, threshold
  simplification, domain reasoning, or multi-value-to-multiple-predicate conversion.
- [ ] Exclude `Rxxx`, name, description, extra columns, hide-comparison, and display ordering.
- [ ] Serialize deterministic compact UTF-8 JSON with an explicit v1 schema marker.
- [ ] Hash with SHA-256; encode the first 96 bits as exactly 20 fixed-width uppercase Crockford
  Base32 characters; prefix with `CBR1_` for a 25-character public ID.
- [ ] Retain the full hexadecimal digest and canonical payload for registry verification.
- [ ] Reject identifier/full-digest/payload mismatches loudly.

Required tests include R001/R002 equality, R003 difference, R004/R005 equality, same-operator
reassociation, value order, exact string sensitivity, duplicate predicates, threshold redundancy,
distribution, absorption, column/format/operator/mode changes, deterministic repeated execution,
and exact identifier syntax/length.

## A2 — SQLite schema and invariants

- [ ] Add `ValidationRuleIdentity`, `StoredValidationRule`, and `RuleStoreState` models matching the
  canonical plan.
- [ ] Make identity definitions append-only and collision-verifiable.
- [ ] Enforce one catalog entry per canonical identity, stable unique local `Rxxx`, stable catalog
  position, enabled state/order, soft archive state, timestamps, and protected identity references.
- [ ] Add appropriate indexes and constraints, including enabled lookup and valid/non-conflicting
  enabled ordering.
- [ ] Preserve monotonic `next_index`; never reuse a deleted/archived `Rxxx`.
- [ ] Ensure the singleton state distinguishes uninitialized storage from an intentionally empty or
  entirely disabled catalog.
- [ ] Create deterministic migrations; `makemigrations --check --dry-run` must report no missing
  changes after your migration is applied.

## A3 — Repository foundation

- [ ] Implement idempotent identity registration under transaction and concurrency constraints.
- [ ] Implement catalog create/read/update-metadata, enable/disable, soft archive/unarchive, stable
  catalog ordering, revision incrementing, and immutable materialization into domain `Rule` values.
- [ ] On materialization, recompute identity from `authored_payload`; reject corruption instead of
  silently repairing a payload/foreign-key mismatch.
- [ ] Support business-logic edit semantics: excluded metadata updates in place; a changed identity
  creates/reuses a different catalog entry, disables/preserves the prior entry, transfers enabled
  order, and returns both local IDs.
- [ ] Provide atomic bulk enablement over explicit local IDs.
- [ ] Provide repository primitives for configuration import to find/reuse/unarchive rules by
  canonical identity without deleting omitted rules.
- [ ] Provide the initial-list query (first 50 non-archived catalog positions plus all enabled,
  deduplicated) and keyset cursor primitives for subsequent 10-new-rule pages.
- [ ] Bind cursors to store revision and reject stale/invalid cursors.
- [ ] Ensure page queries skip already pinned enabled rules and terminate reliably at the last page.

Repository code must not parse configuration files or implement HTTP responses. Expose typed,
documented service values for Worker B.

## A4 — Documentation and handoff contract

- [ ] Document canonical payload examples, included/excluded fields, ID encoding, collision checks,
  and algorithm-version rules.
- [ ] Document model relationships, constraints, catalog lifecycle, edit/version behavior,
  enablement, revision/cursor behavior, and transaction boundaries.
- [ ] Provide Worker B with exact repository signatures and error types.
- [ ] Provide Worker C with the immutable `Rule`/identifier fields needed during execution.
- [ ] Revise your delivery document after self-review so it describes actual committed behavior,
  not intended behavior.

## Required verification

Run at minimum:

```bash
uv run python backend/manage.py makemigrations --check --dry-run
uv run python backend/manage.py migrate --check
uv run python backend/manage.py check
uv run pytest -q tests/backend/test_rule_identifiers.py tests/backend/test_rule_repository.py
uv run ruff check backend/apps/rules tests/backend/test_rule_identifiers.py tests/backend/test_rule_repository.py
uv run mypy backend/apps/rules
git diff --check
```

Use actual test paths if the final focused files have different coordinator-approved names. Run
relevant existing `tests/backend/test_rules.py` cases as a regression check.

## Handoff acceptance

Do not report complete until:

- every checklist item above is implemented and documented;
- focused and existing rule tests pass;
- migrations are committed and no additional migration is detected;
- no files outside your ownership were changed without coordinator approval;
- your branch contains cohesive commits with no live database/config data; and
- the delivery review lists exact commands/results, commit hashes, changed files, and zero required
  follow-ups.
