# Round 1 — Worker A delivery

Branch: `work/20261108-grouped-validation-round1-worker-a`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-a`
Date: 2026-11-08
Status: Round 1 backend contract regressions complete; ready for reviewer
cherry-pick. Not merged, not pushed, no live project data accessed or modified.

## Baseline

- Starting HEAD: `aa4ed06` (`docs: assign round one filter and rule enhancements
  by ownership`). Confirmed before any edit; the required round 1 setup snapshot
  is present, and the accepted integration fixes through `a552dbc` are included.
- No reset, clean, stash, rebase or move of another worktree/branch.
- Historical grouped-validation Worker A implementation/delivery records remain
  intact and were not rewritten by this round.

## Ordered commits

1. `9f08f6a` — `fix: preserve rule import validation errors for invalid grouping`
2. `dedaaa7` — `test: add round1 rule grouping contract regressions`
3. Documentation commit — this file and
   `docs/20261108_round1_worker_a_implementation.md`; exact hash is returned in
   the handover response.

Cherry-pick in the order above. The test commit depends on the fix commit because
it asserts the corrected import error message. No other worker or integration
commit is required.

## Changed files

- `backend/apps/configs/views.py` — rule import error reporting only; no export,
  serializer, runtime, model or migration change.
- `tests/backend/test_round1_rule_grouping_contract.py` — new isolated contract
  regressions.
- `docs/20261108_round1_worker_a_implementation.md` — implementation record.
- `reviews/20261108_round1_worker_a_delivery.md` — this delivery record.

## Requirement coverage (B4/E3)

| Requirement / risk | Evidence | Result |
| --- | --- | --- |
| R079 four outcomes and root OR over two AND groups survive save/load | Exact R079-shaped fixture materialized with `create_rule`, YAML save/load/resave, catalog POST/GET/PUT, and repository materialization | Passed; four clauses, relation OR and exact tree preserved |
| Unchanged save does not change canonical identity | Golden `CBR1_1FB1N7BHJ3WTCD3BB1KW` asserted on the draft, materialized rule, GET payload and unchanged PUT response | Passed; same identity, same rule ID, in-place revision |
| Import/export preserve the tree and identity | Rule-config export twice, import with exact `content`, binding and re-GET | Passed; identical export content, `reused == 1`, identity stable |
| Missing grouping is rejected, not silently AND | Four-clause draft with relation and tree removed, through `validate_rule`, API PUT and API import | Passed; 400/validation rejection, no implicit AND, no catalog mutation |
| Invalid grouping is rejected | Tree omitting `c2`/`c3`, tree referencing `c4`, malformed `xor` root | Passed; actionable errors, transactional rejection |
| Legacy single-outcome rules remain supported | Legacy `logic` create, unchanged PUT, export and import | Passed; legacy shape retained, same identity, `reused == 1` |
| Grouping removal is frontend edit state | Tree removed with explicit `logic_relation: "or"` retained | Passed; flat explicit OR, no tree, identity differs from grouped form |
| No speculative schema/migration work | No model, migration, serializer or contract file changed | Confirmed; existing API sufficient except import error reporting |

## Defect fixed

**Rule import masked grouping validation errors.**

- **Cause:** `_import_rule_content` called `calculate_rule_identifier` while
  formatting a validation failure. For drafts that fail grouping validation, the
  canonicalizer raises `RuleIdentityError`, so the caller saw
  `Invalid logic relation: None` or an identity/tree-parser message instead of the
  actionable `logic_relation is required...` / `Invalid logic_grouping_tree
  structure...` error and rule name.
- **Fix:** identity calculation for error context is now guarded by
  `except RuleIdentityError`; failures report `uncomputable identity` alongside
  the rule name and the full validation message. Import remains transactional.
- **Regression:** `test_import_rejects_missing_grouping_transactionally` and
  `test_import_reports_tree_validation_error_when_identity_is_uncomputable` in
  `tests/backend/test_round1_rule_grouping_contract.py`.
- **Not changed:** export serialization, runtime execution, identity algorithm,
  serializer fields, models or migrations.

## Checks and actual results (run by Worker A)

Environment: isolated `GROUPED_VALIDATION_HOME=/tmp/opencode/round1-worker-a`;
pytest databases are temporary. No user config/catalog/upload/result was read or
written.

```text
GROUPED_VALIDATION_HOME=/tmp/opencode/round1-worker-a PYTHONPATH=backend \
  uv run pytest --ds=boat_control.grouped_validation_settings -q \
  tests/backend/test_round1_rule_grouping_contract.py
13 passed in 1.02s

GROUPED_VALIDATION_HOME=/tmp/opencode/round1-worker-a PYTHONPATH=backend \
  uv run pytest --ds=boat_control.grouped_validation_settings -q \
  tests/backend/test_round1_rule_grouping_contract.py \
  tests/backend/test_rule_grouped_outcomes.py \
  tests/backend/test_rule_catalog_api.py \
  tests/backend/test_rule_identifiers.py \
  tests/backend/test_rule_repository.py \
  tests/backend/test_rule_migration.py \
  tests/backend/test_rules.py \
  tests/backend/test_grouped_validation.py \
  tests/backend/test_grouped_validation_integration.py
187 passed in 1.60s

GROUPED_VALIDATION_HOME=/tmp/opencode/round1-worker-a PYTHONPATH=backend \
  uv run pytest --ds=boat_control.grouped_validation_settings -q \
  tests/backend tests/contracts
783 passed in 6.32s

uv run ruff check backend/apps/configs/views.py \
  tests/backend/test_round1_rule_grouping_contract.py
All checks passed!

uv run mypy backend
Success: no issues found in 94 source files

git diff --check
clean
```

## Dependencies and coordination

- **B:** no dependency and no B file edited. No export change was needed; the
  new tests exercise the existing rule-config export endpoint. B still owns
  runtime/report/Excel export work, including B3.
- **C/D:** no dependency. Grouping removal, free-text filters, result grouping
  display and editor tooltips remain C/D-owned UI work. This delivery only proves
  the backend rejects an ungrouped multi-clause save instead of defaulting to AND.
- **Reviewer:** cherry-pick `9f08f6a`, then `dedaaa7`, then the documentation
  commit. No integration worktree or generated frontend bundle was touched.

## Remaining issues / limitations

1. Full numbered user UI acceptance is pending; this delivery makes no browser or
   UI claim.
2. B3 Excel export and cross-path compound-value behavior are outside Worker A.
3. The versioned contract schema/examples are reviewer-owned; no change was needed
   because the existing schema already accepts the grouped outcome fields.
4. No push, merge to main, deployment, cross-worktree edit, or user-data mutation
   was performed.
