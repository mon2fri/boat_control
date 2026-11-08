# Worker B delivery — grouped validation runtime

Date: 2026-11-08
Branch: `work/20261108-grouped-validation-worker-b`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-b`
Base/setup: `e972e3f` (requirement `6b4bc94`)

## Ordered commits for reviewer cherry-pick

1. `e0573d8` — `feat: implement grouped filters and rule outcome runtime`
   - source, regression tests and
     `docs/20261108_grouped_validation_worker_b_implementation.md`.
2. `3dccf93` — `docs: record grouped validation Worker B delivery`
   - original delivery record.
3. This documentation-correction commit (documentation only; exact branch HEAD
   hash is reported in the handover message).

The reviewer recorded B's original commits as accepted in integration as
`e0573d8` → `418c44b` and `3dccf93` → `5912229`. B did not cherry-pick integration
code into this branch for the documentation correction.

No worker merge commits, no cherry-picks from A/C/D into this correction, no main
merge and no push.

## Changed files

Source:

- `backend/apps/runs/grouped_logic.py` (new shared runtime adapter/predicate/tree)
- `backend/apps/runs/services.py`
- `backend/apps/runs/serializers.py`
- `backend/apps/runs/persistence.py`
- `backend/apps/runs/views.py`
- `backend/apps/runs/template_columns.py`
- `backend/apps/families/resolver.py`
- `backend/apps/saved_filters/services.py`
- `backend/apps/saved_filters/serializers.py`
- `backend/apps/saved_filters/views.py`
- `backend/apps/reports/services.py`
- `backend/apps/configs/views.py`

Tests:

- `tests/backend/test_grouped_validation.py` (new)
- `tests/backend/test_runs.py` (negative-operator null expectation superseded by
  the agreed requirement)

Documentation:

- `docs/20261108_grouped_validation_worker_b_implementation.md`
- `reviews/20261108_grouped_validation_worker_b_delivery.md`

No generated bundles, local databases, caches or dependency folders were
committed.

## Dependencies on Worker A

No A commit was cherry-picked into this branch. B's original runtime assumed the
normalized convenience fields directly:

- `rule.logic_clauses` — non-empty ordered clause list;
- `rule.logic_relation` — optional `and`/`or`;
- `rule.logic_grouping_tree` — optional **wire dictionary** tree.

That original assumption did not match A's real immutable model. A materializes
the tree as `GroupingBranch` / `GroupingLeaf` inside the explicit
`Rule.outcome_expression` (`LogicExpression`) accessor. The integration fix in
reviewer commit `0992b78` made normalization consume `outcome_expression`, accept
the immutable nodes, and delegate predicate/tree operations to A's
`apps.validation_logic` helpers. B's legacy `Rule.logic` fallback remains.

Canonical identity is A-owned. B never rewrites or recalculates historical rule
identifiers; run/tracking code consumes A's `rule_identifier` unchanged.

## Original B self-verification (pre-integration)

The results in the next section are B's own pre-integration runs, not integrated
results.

## Acceptance criteria covered

- Grouped filter truth table: nested `(F1 AND F2) OR F3`, legacy AND, relation OR,
  tree overriding flat relation, literal substring matching.
- Two-group outcome truth table `(SA=Y AND CVA=N) OR (SA=N AND CVA=Y)`: only Y/N
  and N/Y pass; Y/Y, N/N, values outside Y/N, null and blank fail.
- Simple OR/AND outcomes and nested `(A=Y OR B=Y) AND C=Active`.
- Null/blank semantics for `eq`, `neq`, `contains`, `ncontains` in Row Filters,
  Rule Conditions and Rule Outcomes, including multi-value and column-vs-column.
- Conditions gate applicability; non-matching conditions produce no violation.
- Missing condition/outcome/filter/target/extra schema columns are rejected
  before row execution.
- Invalid filter/outcome references, duplicates, omissions, malformed/empty
  branches, contradictory legacy/new logic and incomplete multi-outcome relation
  are rejected.
- Saved-filter create/update/list persistence of rows, multi-values, relation and
  tree; invalid saved/rows-and-columns/filter-config grouping rejected.
- Run request/store/load round trip of `filter_relation` and
  `filter_grouping_tree`; historical runs default them safely.
- HTML/Excel report context renders the grouped filter expression.
- Grouped violations keep all outcome columns/observed values and produce one
  business-rule violation / tracking occurrence per rule/key.
- Family filter expansion remaps positive leaves to OR and negative leaves to
  AND; zero-member families are rejected. Family rule conditions/outcomes use
  positive-any / negative-all.

### Original B commands and results

Run from this worktree with isolated pytest temp settings/databases, before the
integration fixes.

```text
uv run pytest -q tests/backend/test_grouped_validation.py
83 passed in 1.32s

uv run pytest -q tests/backend/test_grouped_validation.py tests/backend/test_configs_api.py
94 passed in ~8s

uv run pytest -q tests/backend/test_runs.py tests/backend/test_persistence.py tests/backend/test_reports.py tests/backend/test_family_resolver.py tests/backend/test_filter_services.py
161 passed in 1.27s

uv run pytest -q tests/backend tests/contracts
692 passed, 1 failed in 15.62s
```

The one full-suite failure is
`tests/backend/test_rule_identifier_release_review.py::test_migration_reconciles_later_file_edits`
(`KeyError: 'rule_id'` in the legacy YAML loader under `apps/rules`, which B does
not own). It was reproduced independently against an archive of untouched base
commit `6b4bc94`:

```text
1 failed in 0.41s
```

so it is a pre-existing baseline defect, not a B regression.

Other checks:

```text
uv run python backend/manage.py check
System check identified no issues (0 silenced).

uv run python backend/manage.py makemigrations --check --dry-run
No changes detected

uv run ruff check backend/apps/runs backend/apps/families backend/apps/saved_filters backend/apps/reports backend/apps/configs tests/backend/test_grouped_validation.py tests/backend/test_runs.py
All checks passed.

uv run mypy backend/apps/runs backend/apps/families backend/apps/saved_filters backend/apps/reports backend/apps/configs
Only remaining error: pre-existing A-owned backend/apps/rules/repository.py:218 union-attr
(the configs union-attr found during development was fixed in B's touched file).

git diff --check
(clean, no output)
```

Repository-wide `ruff check backend tests` still reports pre-existing unrelated
lint issues in `backend/apps/rules/migrations/0002_rule_supersession.py` and
`tests/backend/test_rule_catalog_api.py`; B-scoped ruff is clean.

## Integration findings and reviewer-authored fixes

These are post-delivery facts from the integration branch. None of the
integrated commands below were run by B; they are attributed to the reviewer.

### Defect — B rejected A's real immutable outcome tree

**Finding:** Worker B could not execute a real materialized catalog rule with a
nested grouped outcome; execution failed with
`Invalid logic_grouping_tree structure`.

**Cause:** B's `normalize_rule_outcomes` read `rule.logic_clauses`,
`rule.logic_relation` and `rule.logic_grouping_tree` as convenience attributes and
sent the tree to a dictionary-only parser. A's real `rule_from_payload` returns
`Rule.logic_grouping_tree` as an immutable `GroupingBranch` / `GroupingLeaf` and
publishes the normalized form through `Rule.outcome_expression`. B did not consume
that explicit accessor.

**Why dictionary-only mocks missed it:** B's tests constructed
`SimpleNamespace` rule doubles with plain wire dictionaries for
`logic_clauses`/`logic_grouping_tree`. They exercised evaluator truth tables but
never ran A's payload → materialized `Rule` transition. The type changed at that
boundary, so dictionary-only mocks could pass while real runtime rejected the
tree. They therefore do not establish runtime compatibility with A's model.

**Reviewer fix:** commit `0992b78` (`fix: integrate grouped outcomes with
normalized rules`, reviewer-authored) makes normalization consume
`Rule.outcome_expression`, accept immutable tree nodes, and delegate
predicate/tree parse/validate/evaluate work to `apps.validation_logic` helpers.
Detailed invalid-reference errors are retained.

**Reviewer-authored regression:**
`tests/backend/test_grouped_validation_integration.py` materializes the real rule
via `rule_from_payload`, asserts the tree is not a dict, executes the exact
`(SA=Y AND CVA=N) OR (SA=N AND CVA=Y)` table with null and blank, and verifies
five violations plus complete `outcome_columns`/`outcome_values`. Reviewer-run
result: `132 passed` for that file plus B's grouped tests and A's validation-logic
tests. B did not duplicate or reimplement this fix or test.

### Other reviewer integration fixes

- **Fix 2 (`fa17108`, C/D scope):** frontend filter grouping was not connected to
  page save/load, run request construction or saved-run restoration. The reviewer
  wired the controlled editor, strict new-vs-legacy expression handling, safe
  invalid-save state, and added mapper/reducer/page tests plus a limited
  Chrome/Playwright filter-editor smoke.
- **Fix 3 (`fa17108`, cross-layer):** unresolved flat filters/clauses could be
  dropped or rebound, partial rule-config imports proceeded after warnings, and
  family tree leaves always expanded with AND. The reviewer added blocking
  restoration errors, missing-reference sentinels, import refusal, and
  positive-OR / negative-AND family expansion inside the containing expression.
  B's backend family helper already followed positive-any / negative-all; the
  integrated fix closes the page/config path.
- **Fix 4 (A scope):** A accepted relation/tree fields beside a single new
  `logic_clauses` entry and then discarded them. The reviewer added rejection and
  cross-layer coverage. This is not B code.
- **Config export conflict:** the cherry-pick conflicted in
  `backend/apps/configs/views.py`. Integration kept A's shared
  `rule_definition_payload` full-expression serializer plus B's filter/config
  validation and runtime changes; B's duplicate snapshot serializer was not
  retained. This is the accepted integrated form.

### Integrated verification attributed to the reviewer

The reviewer reported, under isolated settings:

```text
GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-checks PYTHONPATH=backend \
  uv run pytest --ds=boat_control.grouped_validation_settings -q \
  tests/backend tests/contracts tests/integration
774 passed in 5.67s
```

The reviewer also reported integrated Django `check`, migrations check,
`mypy backend`, changed-file Ruff, frontend tests (65 files / 599 tests), frontend
build, and `git diff --check` as passing. Repository-wide Ruff retained only the
known unchanged baseline findings. These results are reviewer-run and are not
claims made by B.

## Remaining issues / handover notes

- The reviewer's `0992b78` fix is integrated code, not cherry-picked into this
  branch; B's original predicate/tree copies are superseded by A's helpers in the
  integrated branch.
- Full user UI acceptance is still pending. The limited browser smoke covered only
  the filter-editor interaction, not complete visual acceptance.
- Whitespace-only values stay literal per the shared conservative default; user
  confirmation is still required.
- The original pre-existing rule-migration test failure and A-owned repository
  mypy error remained outside B's file ownership. The reviewer reported the
  integrated gates passing after assembly.
- B did not modify the integration worktree, integrate, merge main, push, spawn
  agents, or touch another worktree.
