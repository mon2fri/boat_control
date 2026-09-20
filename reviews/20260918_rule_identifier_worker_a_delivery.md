# Worker A Delivery

Status: COMPLETE

The worker branch is `work/cbri-worker-a` in the isolated worktree
`C:\Users\zwj80\Documents\codings\boat_control-worktrees\worker-a`. The implementation commit is
`a287880` (`feat: add canonical rule identity catalog foundation`) and `b4163cf`
(`feat: add transactional rule catalog repository`), followed by documentation commit `0286dae`.
No live database, frontend,
HTTP, run, report, contract, or launcher files are included.

## Changed Files

- `backend/apps/rules/identifiers.py`: pure v1 canonicalizer, compact JSON serializer, SHA-256,
  Crockford Base32 encoding, identity details, and verification errors.
- `backend/apps/rules/models.py`: identity registry, catalog row, and singleton store state models.
- `backend/apps/rules/migrations/0001_rule_catalog.py`: deterministic SQLite schema migration.
- `backend/apps/rules/repository.py`: transactional identity/catalog repository, snapshots, edit/version
  semantics, archive/enablement/reorder, configuration primitive, collision/corruption errors, and
  revision-bound keyset pagination.
- `backend/apps/rules/services.py`: additive nullable `Rule.rule_identifier` field for downstream
  immutable execution snapshots.
- `tests/backend/test_rule_identifiers.py`: equivalence, distinction, exact-string, version/format,
  and deterministic canonicalizer coverage.
- `tests/backend/test_rule_repository.py`: isolated Django database coverage for identity reuse,
  edits, corruption, pagination, enablement, and reorder behavior.
- `docs/20260918_rule_identifier_catalog.md`: technical algorithm, schema, lifecycle, signatures,
  and consumer handoff documentation.

## Consumer Signatures

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

`RuleSnapshot.rule` is the immutable domain `Rule` and carries `rule_identifier`. Errors are
`IdentityCollisionError`, `CatalogCorruptionError`, `StaleCursorError`, `InvalidCursorError`, and
the base `CatalogError`.

## Verification Evidence

- `uv run pytest -q tests/backend/test_rule_identifiers.py tests/backend/test_rule_repository.py tests/backend/test_rules.py`: **52 passed**.
- `uv run python backend/manage.py check`: passed.
- `uv run python backend/manage.py makemigrations --check --dry-run`: no changes detected.
- `uv run python backend/manage.py migrate --check`: passed.
- `uv run ruff check backend/apps/rules/identifiers.py backend/apps/rules/models.py backend/apps/rules/repository.py backend/apps/rules/migrations/0001_rule_catalog.py tests/backend/test_rule_identifiers.py tests/backend/test_rule_repository.py`: passed.
- `uv run mypy backend/apps/rules`: passed, 10 source files.
- `git diff --check`: passed.

The broader `uv run pytest -q tests/backend tests/contracts tests/integration` run reached 266
passing tests. Two pre-existing report-layout assertions failed in `tests/backend/test_reports.py`,
and the initial new reorder test exposed and then fixed a unique-order update bug; the final focused
suite includes that fix. Full-tree Ruff also reports existing line-length violations in reports/runs
files outside this assignment. Those unrelated files were not changed.

## Risks and Boundaries

- Worker B must connect HTTP/config parsing and validation to these repository primitives; this worker
  intentionally does not edit views, serializers, contracts, launchers, or file import/export code.
- SQLite uniqueness and row locks provide the intended transaction boundary; SQLite write contention
  remains an operational concern under concurrent writers.
- The canonicalizer is conservative structural equivalence, not general Boolean semantic equivalence,
  by design.
- The worktree still contains unrelated test-generated `config/rules/rules.yaml` and ignored
  `data/prepare_cache` changes. They were not staged, committed, or modified by this delivery.
