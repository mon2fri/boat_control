# 2026-09-18 Canonical rule identifier — Worker B instruction

## Assignment

Own the backend rule-catalog APIs, configuration import/export behavior, legacy migration command,
and operational launcher integration. Consume Worker A's frozen identity/model/repository contract;
do not duplicate or fork its canonicalization logic.

Read completely before editing:

- `requirements/20260918_validation_rule_identifier.md`
- `planning/20260918_canonical_business_rule_identifier_implementation_plan.md`
- `planning/20260918_rule_identifier_coordinator_reviewer_instruction.md`
- Worker A's accepted delivery/repository documentation.

Begin implementation only when the coordinator marks Gate 1 ready. Work only in the assigned
branch/worktree.

## Mandatory completion loop

For every section: implement, test, document, self-review, fix, revise the documents, and re-test
until every required item passes. Do not hand off partial behavior, skipped edge cases, provisional
API shapes, or documentation describing behavior the code does not implement. Record evidence in
`reviews/20260918_rule_identifier_worker_b_delivery.md`.

## Owned implementation

Primary ownership:

- `backend/apps/rules/services.py`, `serializers.py`, `views.py`, and `urls.py`;
- rule-specific integration in `backend/apps/configs/`;
- management command `migrate_rules_to_db` and its tests;
- `scripts/dev.sh` and `trigger.py` migration-command integration;
- backend rule/config API tests and migration tests;
- backend rules/config operations documentation.

Do not edit frontend files, run/report persistence, or shared machine-readable contract files unless
the coordinator explicitly transfers ownership. Give Worker C exact request/response examples for
contract publication.

## B1 — Move live rule operations to SQLite

- [ ] Replace live YAML-backed rule list/detail/create/update/delete/reorder behavior with Worker A's
  catalog repository.
- [ ] Keep file parsing in a clearly separate import/export service.
- [ ] New-rule Save must atomically register identity, allocate the next never-reused local `Rxxx`,
  persist authored content, enable it, and return `rule_id` plus `rule_identifier`.
- [ ] Presentation-only edits retain the catalog entry, local ID, and canonical identifier.
- [ ] Business-logic edits preserve/disable the prior catalog rule and create/reuse the resulting
  identity's catalog entry; return prior and resulting local IDs so the UI can switch cleanly.
- [ ] Delete must soft-archive/disable rather than erase catalog or identity history.
- [ ] Execution-facing rule loads must use committed enabled SQLite rows, never the legacy file.
- [ ] Reject client attempts to choose/overwrite a canonical identifier.

## B2 — Persisted checkbox enablement

- [ ] Include `enabled` and enabled order in rule responses.
- [ ] Add single-rule and atomic bulk enable/disable operations over explicit local IDs.
- [ ] Validate unknown, archived, duplicate, and conflicting IDs with stable error responses.
- [ ] Increment store revision for mutations that invalidate listing cursors.
- [ ] Ensure an empty enabled set is valid and means run/export zero rules—not all rules.
- [ ] Preserve deterministic enabled ordering through toggles, bulk changes, editing, and import.

## B3 — Configuration save/export

- [ ] Save rule configs by querying all enabled non-archived catalog rules from SQLite, not from a
  browser-supplied partial list.
- [ ] Export exactly the enabled rules in enabled order; omit disabled/archived catalog rules.
- [ ] Include the complete authored payload and calculated identifier for every exported rule.
- [ ] Produce a valid versioned empty configuration when no rule is enabled.
- [ ] Retain legacy-config reading compatibility without retaining YAML as live storage.
- [ ] Preserve path/name safety, atomic file writing, version conflicts, and existing config removal.

## B4 — Configuration load/import

- [ ] Parse and validate the complete config before mutating SQLite.
- [ ] Ignore/recalculate supplied `Rxxx`, canonical IDs, and digests; reject a mismatching diagnostic
  identifier rather than trusting it.
- [ ] Reject duplicate canonical identities within one imported enabled set.
- [ ] In one database transaction, register identities, reuse/unarchive matching catalog rules,
  import missing rules with new local IDs, apply imported presentation payloads, enable exactly the
  config entries in config order, disable other catalog rules, and increment revision.
- [ ] Do not archive/delete omitted catalog rules or historical identities.
- [ ] Return imported/reused/enabled/disabled counts and complete local-ID/identifier bindings.
- [ ] Ensure any parse, validation, collision, constraint, or database failure leaves catalog and
  enablement unchanged.
- [ ] Apply the same path for local and remote rule configs.

## B5 — Listing and database pagination API

- [ ] Initial list response contains the first 50 non-archived catalog rules in stable catalog order
  plus every enabled rule outside that slice, deduplicated.
- [ ] Return enabled/pinned records clearly, total catalog count, store revision, opaque next cursor,
  and `has_more`.
- [ ] Every Next-page request uses Worker A's keyset query to read at most 10 new catalog rules from
  SQLite and skips enabled rules already present in the pinned set.
- [ ] Continue until the last page returns no cursor and `has_more: false`.
- [ ] Reject malformed/stale cursors and make the client refresh from page one.
- [ ] Do not implement offset scans or materialize the full catalog to paginate.
- [ ] Keep response ordering deterministic across restarts when the revision is unchanged.

## B6 — One-time legacy migration and launch operation

- [ ] Implement `migrate_rules_to_db` after Worker A's migrations.
- [ ] If uninitialized, fully validate legacy rules, preserve existing local IDs/order/`next_index`,
  register identities, insert catalog entries, enable all migrated rules, and mark initialized in
  one transaction.
- [ ] If initialized, do nothing even when the catalog is empty or all rules are disabled.
- [ ] Leave the legacy file untouched and never silently reimport it on restart.
- [ ] Invoke the command after `migrate` in both development and deployed launchers.
- [ ] Fail startup clearly on a genuine migration/import failure; never mark partially initialized.
- [ ] Document backup, rollback/recovery, and the new meaning of rule-config paths.

## B7 — Tests and documentation

- [ ] Cover CRUD/edit-version/archive behavior, identifier read-only enforcement, enablement, exact
  empty semantics, bulk atomicity, import/export, rollback, diagnostic-ID mismatch, and collisions.
- [ ] Cover first-50-plus-enabled and every 10-rule page through the end, including enabled rules
  beyond 50 and stale cursors.
- [ ] Prove config export includes enabled rules never fetched by a browser page.
- [ ] Prove live rule operations still work after the legacy file is renamed/changed.
- [ ] Prove migration is idempotent and does not repopulate an intentionally empty/disabled store.
- [ ] Update backend rules/config API and operations documentation; remove contradictory live-YAML
  statements from documents you own.
- [ ] Revise the delivery document after tests and self-review.

## Required verification

```bash
uv run python backend/manage.py check
uv run pytest -q tests/backend/test_rules.py tests/backend/test_configs.py tests/backend/test_configs_api.py
uv run pytest -q tests/backend -k 'rule or config or migration'
uv run ruff check backend/apps/rules backend/apps/configs tests/backend
uv run mypy backend/apps/rules backend/apps/configs
git diff --check
```

Also run the focused Worker A identity/repository tests against the integrated foundation. Use
temporary rules/config/database paths; do not alter the user's live config or SQLite data.

## Handoff acceptance

Hand off only when all B1–B7 items pass, documentation matches code, the branch contains no
unrelated changes or runtime data, and the delivery review lists commits, changed files, exact test
results, API examples for Workers C/D, migration evidence, and zero deferred required work.
