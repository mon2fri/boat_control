# Grouped validation — Worker A delivery

Branch: `work/20261108-grouped-validation-worker-a`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-a`
Date: 2026-11-08
Status: Original Worker A implementation was delivered and validated on this
branch. The reviewer later found one Worker A validation defect during
integration; this record now accounts for the reviewer-authored fix and integrated
evidence. Worker A source/tests are unchanged by this documentation correction.
Not merged, not pushed, no live project data accessed.

## Ordered commits for reviewer cherry-pick

1. `c388ce9` — `feat: add pure grouped validation helpers`
2. `057dbab` — `feat: support grouped rule outcomes across rules backend`
3. `f24acfa` — `docs: record grouped validation worker A implementation and delivery`
4. Post-integration documentation correction commit (this file and the
   implementation record) — exact hash is supplied in the task response because a
   commit cannot contain its own hash. This correction does not cherry-pick or
   duplicate any reviewer integration code.

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

Original documentation commit `f24acfa`:

- `docs/20261108_grouped_validation_worker_a_implementation.md`
- `reviews/20261108_grouped_validation_worker_a_delivery.md`

Post-integration documentation correction commit (this commit) modifies the same
two records only; it adds no source or test changes.

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

## Original Worker A tests and checks actually run (before integration)

All commands below were run by Worker A in this assigned worktree with isolated
pytest databases (`tests/conftest.py` redirects exception tracking to a temp path;
Django test database is temporary). They are original-delivery evidence only.
They do **not** include the reviewer's integrated run; integrated results are
attributed separately below.

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
  required `logic` on every rule at original Worker A delivery. That file is
  reviewer-owned; the reviewer updated it during integration (`fa17108`) for the
  optional grouped outcome fields.

## Post-integration findings and reviewer fixes

### 1. Original delivery and validation

Worker A originally delivered `c388ce9`, `057dbab` and `f24acfa`. The original
suites recorded above passed: 666 backend tests, 16 contract tests, 149 focused
rule/catalog/identity/helper tests, changed-file Ruff, targeted mypy and
`git diff --check`. This was valid evidence for the original branch, but it did
not exercise an integrated B runtime and did not include a contradictory
one-clause new-outcome payload. At original handover there were no known Worker A
defects.

### 2. Defects discovered during integration

**Medium — one-clause grouping fields were silently stripped.** The original
`validate_rule` accepted a `logic_clauses` list with one clause together with
`logic_relation` and/or `logic_grouping_tree`. `normalize_rule_draft` then
converted the single clause to legacy `logic` and removed all three new-form
fields. The truth result was unchanged for a valid single leaf, but the
representation was unsupported/contradictory and the configured grouping fields
were silently discarded instead of rejected. Worker A's original tests only
covered a new single form **without** relation/tree, so they missed this case.

**Integration-only B runtime incompatibility (not a Worker A model defect).**
Worker A materializes `Rule.logic_grouping_tree` as immutable
`GroupingBranch`/`GroupingLeaf` nodes, exposed through `Rule.outcome_expression`.
Worker B's original runtime normalizer assumed wire dictionaries, so its
dictionary-shaped tests passed but a real catalog rule with a nested outcome tree
failed during execution. The reviewer fixed B by consuming
`rule.outcome_expression` and delegating predicates/tree operations to A's
`apps.validation_logic` helpers.

### 3. Reviewer-authored fixes and regression evidence

- **One-clause defect:** reviewer integration changed
  `backend/apps/rules/services.py` so validation rejects relation/tree fields on
  the new single-outcome form. Corrected behavior reports
  `Single-outcome logic_clauses must not include relation or grouping fields.`
  A single clause without those fields still normalizes to legacy `logic`.
  Regression
  `test_single_outcome_clause_cannot_silently_discard_grouping_fields` in
  `tests/backend/test_grouped_validation_integration.py` asserts `valid is False`
  and the `Single-outcome` error. This is reviewer-authored code/test in
  integration fix commit `fa17108`; Worker A did not author or cherry-pick it.
- **Materialized outcome tree runtime:** reviewer integration fix `0992b78`
  consumes `rule.outcome_expression` and supports the immutable tree nodes. Its
  regression materializes the four-clause Y/N rule via `rule_from_payload` and
  verifies the exact truth table, null/blank behavior, one violation per failing
  row and complete outcome columns/values.
- **Contract/config integration:** reviewer integration `fa17108` updated the
  versioned contract schema/examples and resolved the A/B
  `backend/apps/configs/views.py` conflict by retaining A's full-expression rule
  serializer while preserving B's filter/config validation.

### 4. Reviewer integrated verification (not run by Worker A)

Worker A did not run these commands and does not claim their results. The
reviewer recorded them in
`reviews/20261108_grouped_validation_integration_review.md` and
`docs/20261108_grouped_validation_integration_fixes.md`:

```text
GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-checks PYTHONPATH=backend \
  uv run pytest --ds=boat_control.grouped_validation_settings -q \
  tests/backend tests/contracts tests/integration
774 passed in 5.67s

uv run pytest -q tests/backend/test_grouped_validation_integration.py \
  tests/backend/test_grouped_validation.py tests/backend/test_validation_logic.py
132 passed

uv run ruff check backend/apps/runs/grouped_logic.py \
  tests/backend/test_grouped_validation_integration.py
passed

uv run mypy backend
passed (94 source files)

npm --prefix frontend test -- --run
passed (65 files / 599 tests)

npm --prefix frontend run build
passed (existing bundle-size warning)

git diff --check
clean
```

Reviewer's independent sample evaluation selected 11 rows, passed 3 (`1,2,8`) and
raised 8 violations (`3,4,5,6,9,10,14,15`). The reviewer also noted unchanged
baseline full-repository Ruff findings in the rules migration and a rule-catalog
test; changed-file Ruff was clean.

### 5. Remaining limitations and pending user acceptance

1. The one-clause defect is fixed only in the integration branch by the reviewer.
   Worker A's original branch remains source-unchanged; this correction is
   documentation-only. A reviewer cherry-picking Worker A receives the original
   code plus this corrected record, not the integration fix commit unless the
   reviewer separately includes it.
2. Worker B's materialized-tree runtime integration is reviewer-fixed, not
   present in the original Worker A branch.
3. Full numbered visual/UI acceptance by the user remains pending. The reviewer's
   limited Chrome/Playwright smoke and component tests are not final user
   acceptance and are not claimed as such by Worker A.
4. No push, deployment, merge to main, or integration-worktree modification was
   performed for this correction.
