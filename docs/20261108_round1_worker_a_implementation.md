# Round 1 — Worker A implementation

Branch: `work/20261108-grouped-validation-round1-worker-a`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-a`
Date: 2026-11-08
Starting HEAD: `aa4ed06` (`docs: assign round one filter and rule enhancements by
ownership`). The baseline includes the required `aa4ed06` setup snapshot and the
accepted integration fixes through `a552dbc`; no worker was reset or moved.

Scope: backend rule catalog/schema/identity contract regression coverage for round
1 items B4 and E3. No backend schema or migration change is introduced.

## Assignment coverage

| Item | Delivery |
| --- | --- |
| B4/E3 — persisted R079 outcome tree survives save/load | Exact R079-shaped fixture with four outcomes, `logic_relation: "or"`, and a root OR over two AND groups. Covered through pure materialization, YAML save/load/resave, catalog create/GET/unchanged PUT, and export/import. |
| B4/E3 — unchanged save retains canonical identity | Golden identity `CBR1_1FB1N7BHJ3WTCD3BB1KW` asserted before and after an unchanged catalog PUT. The PUT remains an in-place revision: same rule ID, same identity, no archive or replacement row. |
| B4/E3 — import/export preserve the tree and identity | Export content carries all four clauses, relation OR and the exact tree; a second export is byte-identical at the content level; import reuses the existing identity and binding. |
| Missing/invalid grouping is rejected | Missing relation/tree on a multi-clause draft, an omitted leaf, an out-of-range leaf, and a malformed tree are all rejected. A rejected update/import leaves catalog revision, row count, identity and persisted tree unchanged. |
| Legacy single-outcome supported | Legacy `logic` rules still save unchanged with the same identity and export/import with no grouped fields. |
| Grouping removal is frontend edit state | Backend has no implicit AND path. Removing both relation and tree is rejected; removing only the tree is accepted only when an explicit relation is retained and is then materialized as a flat explicit relation with no tree. |
| No speculative schema change | The existing `Rule` model, serializer, repository and endpoints are sufficient; no migrations, model fields or contract files were changed. |

## Reference fixture

`tests/backend/test_round1_rule_grouping_contract.py` defines an isolated
R079-shaped payload with the live rule's columns and values:

- four `value_vs_column` outcomes for `sa_flag`/`cva_flag`;
- `logic_relation: "or"`;
- tree `(c0 AND c1) OR (c2 AND c3)`;
- no conditions, with R079's display-only extra columns.

No live catalog, config, upload, or database is read. Its canonical identity is
`CBR1_1FB1N7BHJ3WTCD3BB1KW`, matching the accepted R079 integration evidence.

## Existing interfaces used (no schema change)

- `apps.rules.services.validate_rule` owns cross-form and grouping validation.
- `apps.rules.services.normalize_rule_draft` only normalizes a single outcome and
  has no implicit multi-clause AND default.
- `apps.rules.services.rule_definition_payload` serializes either the legacy
  `logic` form or the complete `logic_clauses` + `logic_relation` +
  `logic_grouping_tree` form.
- `apps.rules.repository.create_catalog_rule`, `update_catalog_rule`,
  `get_catalog_rule` and `apply_rule_configuration` keep identity and authored
  payload consistent.
- `/api/rules/`, `/api/rules/<id>/`, `/api/rules/configs/` and
  `/api/rules/configs/import/` provide the existing save/load/export/import
  surface.

The regressions are the first Worker A cases to combine the exact R079 shape with
an unchanged catalog PUT and a second identical export. Existing tests already
covered a generic four-clause YAML round trip, a 2-clause transactional invalid
import, and identity reordering; this file does not repeat those cases.

## Defect found and fixed

**Import error reporting masked the real grouping validation error.**

- **Symptom:** importing a four-clause rule with both `logic_relation` and
  `logic_grouping_tree` removed returned HTTP 400 with
  `Invalid logic relation: None` instead of the actionable
  `logic_relation is required when there are 2+ logic clauses`.
- **Root cause:** `_import_rule_content` validated the draft first, then called
  `calculate_rule_identifier` to enrich the error message before raising. For a
  draft that fails grouping validation, the canonicalizer raises
  `RuleIdentityError` (missing relation or malformed tree), which replaced the
  validation message and dropped the rule name/actionable context.
- **Fix:** `backend/apps/configs/views.py` now computes the identity inside a
  `try/except RuleIdentityError` only for error reporting. When identity cannot be
  computed it labels it `uncomputable identity`, preserves the rule name and the
  complete validation message, and still rejects the import transactionally.
- **Behavior after fix:** the same import returns 400 with
  `UI Flags - opposite Yes No(new, uncomputable identity: logic_relation is
  required when there are 2+ logic clauses.)` and leaves the catalog revision and
  rows untouched. A malformed tree now reports
  `Invalid logic_grouping_tree structure: ...` rather than the identity error.
- **Scope:** rule import error reporting only. No export, runtime, serializer,
  model, migration or identity algorithm change.

## Grouping removal is frontend edit state

`Remove all groups` is a D-owned editor action. This backend assignment verifies
the contract the editor must satisfy:

- A multi-clause draft with neither relation nor tree fails validation; the
  backend never injects `"and"`.
- A draft with the tree removed but an explicit `logic_relation` retained is a
  valid flat expression using that relation (OR in the regression), with no tree
  in the materialized rule or payload.
- A rejected removal/edit does not mutate the persisted catalog.

UI rendering, disabled remove buttons, tooltips, free-text filter input, and the
hierarchical result summary remain D/C-owned and were not changed here.

## Export coordination

No export code was changed. The contract test uses the existing rule-config export
endpoint to prove the persisted expression and identity survive the round trip.
B owns runtime/report/Excel export behavior (including B3); no B file was edited.

## Tests and checks actually run by Worker A

All commands ran in this worktree with an isolated
`GROUPED_VALIDATION_HOME=/tmp/opencode/round1-worker-a` and temporary pytest
databases. No live user configuration, catalog, uploads or results were touched.

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

## Ordered commits

1. `9f08f6a` — `fix: preserve rule import validation errors for invalid grouping`
2. `dedaaa7` — `test: add round1 rule grouping contract regressions`
3. Documentation commit (this file and the delivery record) — exact hash is
   supplied in the handover response because a commit cannot contain its own hash.

The fix commit precedes the test commit because the regression asserts the fixed
error message.

## Remaining limitations

- Full numbered user UI acceptance remains pending. Component/backend tests are
  not a substitute; D owns the editor behavior and C owns the result summary.
- B owns runtime/report/Excel export changes. This delivery does not claim B3 or
  cross-path export verification.
- No push, merge to main, other-worktree modification, deployment or user-data
  mutation was performed.
