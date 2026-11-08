# Grouped validation — Worker A delivery

Branch: `work/20261108-grouped-validation-worker-a`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-a`
Date: 2026-11-08
Status: implementation complete; handed off for reviewer cherry-pick. Not merged,
not pushed, no live project data accessed.

## Ordered commits for reviewer cherry-pick

1. `c388ce9` — `feat: add pure grouped validation helpers`
2. `057dbab` — `feat: support grouped rule outcomes across rules backend`
3. Documentation commit (this file and the implementation record) — final
   handover hash is supplied in the task response because a commit cannot contain
   its own hash.

Base/setup commit: `e972e3f` (all workers started here; requirement commit
`6b4bc94` is on main).

## Dependency hashes

No worker or reviewer dependency commits were required or consumed. The branch
is based directly on `e972e3f`; there are no cherry-picks from B/C/D or main.

## Changed files

Commit `c388ce9` (pure helpers and focused tests):

- `backend/apps/validation_logic/__init__.py`
- `backend/apps/validation_logic/predicates.py`
- `backend/apps/validation_logic/trees.py`
- `tests/backend/test_validation_logic.py`

Commit `057dbab` (rule schema, validation, catalog, import/export, identity, tests):

- `backend/apps/rules/services.py`
- `backend/apps/rules/identifiers.py`
- `backend/apps/rules/repository.py`
- `backend/apps/rules/serializers.py`
- `backend/apps/rules/views.py`
- `backend/apps/rules/management/commands/migrate_rules_to_db.py`
- `backend/apps/configs/views.py` (rule import/export only; required by Worker A
  assignment because the existing rule-config endpoints live in this module)
- `tests/backend/test_rule_grouped_outcomes.py`

Documentation commit:

- `docs/20261108_grouped_validation_worker_a_implementation.md`
- `reviews/20261108_grouped_validation_worker_a_delivery.md`

## Published interfaces

See the implementation record for full signatures. Summary:

- `Rule.outcome_expression -> LogicExpression` with all `clauses`, optional
  `relation`, optional `grouping_tree` and `is_single`/`flat_relation`.
- `rule_from_payload`, `rule_definition_payload`, `serialize_logic_clause`,
  `normalize_rule_draft` in `apps.rules.services`.
- `is_null_or_blank`, `matches_value`, `matches_values`, `parse_grouping_tree`,
  `serialize_grouping_tree`, `collect_leaf_ids`, `validate_grouping_tree`,
  `evaluate_grouping_tree` in the Django-free `apps.validation_logic` package.

## Acceptance criteria covered by Worker A

- AC4/9: Existing single-outcome rules load, validate, export and retain their
  legacy canonical identity. Legacy YAML without new fields round-trips.
- AC6/7: Pure predicate helpers implement the agreed null/blank table for
  `eq`/`contains`/`neq`/`ncontains`, single/multi-value and column comparison,
  with literal substring matching and unchanged numeric operators.
- AC9/10/11: Multi-outcome clauses and their grouping persist through catalog
  storage, YAML save/load, config export/import and catalog responses; malformed,
  duplicate, unknown or omitted references reject validation; changed outcomes
  produce a new canonical identity and use the existing archive/replacement
  lifecycle.
- AC12: Single column-against-column rules remain usable; multi-outcome
  `column_vs_column` is explicitly rejected.
- AC13: Two AND groups joined by OR is representable and canonically stable under
  sibling reordering.
- AC3/5/8 runtime evaluation and B-owned filter/report behavior are intentionally
  out of this worker's ownership; A supplies the normalized executable model and
  helpers.

## Tests and checks actually run

All commands were run in the assigned worktree with isolated pytest databases
(`tests/conftest.py` redirects exception tracking to a temp path; Django test
database is temporary).

```text
uv run pytest tests/backend -q
666 passed in 15.88s

uv run pytest tests/contracts -q
16 passed in 2.25s

uv run pytest tests/backend/test_rules.py \
  tests/backend/test_rule_identifiers.py \
  tests/backend/test_rule_repository.py \
  tests/backend/test_rule_catalog_api.py \
  tests/backend/test_rule_migration.py \
  tests/backend/test_rule_identifier_release_review.py \
  tests/backend/test_configs_api.py \
  tests/backend/test_validation_logic.py \
  tests/backend/test_rule_grouped_outcomes.py -q
149 passed in 15.81s

uv run ruff check <changed source and test files>
All checks passed!

uv run mypy backend/apps/rules backend/apps/validation_logic backend/apps/configs/views.py
Success: no issues found in 18 source files

git diff --check
(no output; clean)
```

Additional focused evidence inside the suites:

- Hard-coded legacy golden identifiers for four representative legacy shapes.
- Reordered flat AND/OR children and remapped nested tree children retain the
  same multi-outcome identifier.
- Changed values, relation and grouping all change the identifier.
- New single form == legacy identity and normalizes to legacy storage.
- YAML round trip for legacy and multi outcomes; catalog/API create-read/export-
  import round trip; transactional invalid import leaves revision/catalog intact.
- Duplicate grouped rule returns the equivalent-rule hint without overwriting
  metadata; business outcome edit archives the previous rule.
- Malformed kinds, empty branches, duplicate/unknown/omitted references and
  excessive depth are rejected.
- Null/blank and literal-substring predicate tables for all four text operators.

## Compatibility notes

- No database migration is added. New fields are stored inside the existing
  authored JSON payload; existing catalog rows and identifiers remain valid.
- Legacy single-outcome canonical payload and hashes are unchanged. Multi-outcome
  identities use `canonical_business_rule/v1+outcomes` and include the complete
  outcome expression.
- Legacy `Rule.logic` remains populated as the first clause so unchanged
  consumers compile and legacy execution still works until B integrates
  `rule.outcome_expression`.
- The shared contract JSON schema in `tests/contracts/v1/contract_schema.json`
  still requires `logic` on every rule. That file is reviewer-owned; multi-outcome
  responses intentionally use `logic_clauses` instead. Reviewer should update the
  versioned contract schema when integrating A+B+C.

## Remaining issues / handover requests

1. Worker B must replace `rule.logic` runtime reads in `apps/runs/services.py`
   with `rule.outcome_expression`, validate every outcome clause column, combine
   clause results with the tree/relation, and use `apps.validation_logic`
   predicates for null/blank semantics. This is explicitly B-owned.
2. Worker B should ensure violation descriptions/reports include every outcome
   clause and observed value for one violation per record/rule.
3. Reviewer owns the versioned contract schema/fixtures update for the optional
   multi-outcome fields.
4. `backend/apps/configs/views.py` was touched only for rule import/export, as
   required by the A assignment. Its other config behavior is unchanged; if B also
   edits this file, keep both changes during integration.
5. No known Worker A defects remain. The full backend and contract suites pass in
   this worktree.
