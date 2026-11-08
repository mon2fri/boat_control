# Worker B delivery — grouped validation runtime

Date: 2026-11-08
Branch: `work/20261108-grouped-validation-worker-b`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-b`
Base/setup: `e972e3f` (requirement `6b4bc94`)

## Ordered commits for reviewer cherry-pick

1. `e0573d8` — `feat: implement grouped filters and rule outcome runtime`
   - source, regression tests and
     `docs/20261108_grouped_validation_worker_b_implementation.md`.
2. This delivery-record commit (documentation only; hash at branch HEAD after the
   final documentation update).

No worker merge commits, no cherry-picks from A/C/D, no main merge and no push.

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

No A commits were received or cherry-picked. B implements the shared-contract
reader against these expected A fields:

- `rule.logic_clauses` — non-empty ordered clause list (objects or dicts);
- `rule.logic_relation` — optional `and`/`or`;
- `rule.logic_grouping_tree` — optional wire tree.

Legacy `rule.logic` remains the fallback until A lands. A contradictory legacy
`logic` plus `logic_clauses` raises instead of silently selecting one form.
`normalize_rule_outcomes`, `validate_grouping_tree` and the predicate helpers in
`apps/runs/grouped_logic.py` are B's runtime implementations; when A publishes
the pure helpers under `apps/validation_logic/**`, the reviewer should reconcile
these imports/implementations to A's canonical helpers rather than keep two
semantic copies.

Canonical identity is A-owned. B never rewrites or recalculates historical rule
identifiers; run/tracking code consumes A's `rule_identifier` unchanged.

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

## Actual verification commands and results

Run from this worktree with isolated pytest temp settings/databases.

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

## Remaining issues / handover notes

- A's schema/helpers are still pending. Reviewer must re-run the integrated
  outcome tests against A's actual `logic_clauses`/relation/tree dataclasses.
- Whitespace-only values stay literal per the shared conservative default; user
  confirmation is still required.
- C must send `filter_relation`/`filter_grouping_tree`, `filter_values`, and the
  grouped outcome fields, and consume the new run/violation fields.
- The pre-existing rule-migration test and A-owned repository mypy error remain
  outside B's file ownership.
- B did not integrate, merge main, push, spawn agents, or touch another worktree.
