# Reviewer integration fixes — grouped validation

Date: 2026-11-08. Branch: `work/20261108-grouped-validation-integration`.

## Fix 1 — execute A-materialized nested outcome trees

- **Finding / cause:** Worker B's `normalize_rule_outcomes` read the convenience
  fields as wire dictionaries and called a dict-only parser. Worker A's
  `rule_from_payload` returns `logic_grouping_tree` inside
  `rule.outcome_expression` as immutable `GroupingBranch` / `GroupingLeaf`
  instances. A dictionary-shaped runtime mock passed B's tests, but an actual
  catalog rule with a nested outcome tree failed with “Invalid
  logic_grouping_tree structure” during execution.
- **Change:** Runtime normalization now consumes A's explicit
  `outcome_expression` accessor and accepts its immutable tree nodes. Runtime
  predicate evaluation and grouping parse/validate/evaluate operations delegate
  to A's `apps.validation_logic` pure helpers, avoiding divergent semantics and
  depth limits. Existing detailed invalid-reference errors are retained.
- **Regression test:** `tests/backend/test_grouped_validation_integration.py`
  materializes the required four-clause expression via `rule_from_payload` and
  executes the exact opposite-flags truth table, including null and blank. It
  verifies five violations, both passing cases, and complete outcome detail.
- **Verification:**
  `uv run pytest -q tests/backend/test_grouped_validation_integration.py tests/backend/test_grouped_validation.py tests/backend/test_validation_logic.py`
  — 132 passed; `uv run ruff check backend/apps/runs/grouped_logic.py tests/backend/test_grouped_validation_integration.py`
  — passed.
- **Integration-fix commit:** to be recorded after the fix and this report are
  committed.

## Manual worker follow-up prompt

> Please update Worker B's implementation and delivery records to document the
> integration defect: `Rule.logic_grouping_tree` in A's actual `Rule` model is a
> parsed immutable `GroupingNode`, not a wire dict. B's tests only constructed
> dict-shaped `SimpleNamespace` values and missed runtime rejection. Record the
> cause, the reviewer fix (consume `rule.outcome_expression`; use
> `apps.validation_logic` helpers), and the integrated `test_grouped_validation_integration.py`
> regression. Please also add equivalent real-`Rule` coverage in B follow-up work
> and correct delivery check results if needed. Do not edit the integration
> worktree or claim browser acceptance from component tests.
