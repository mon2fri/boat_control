# Worker B implementation — grouped filters, outcomes and null/blank runtime

Date: 2026-11-08
Branch: `work/20261108-grouped-validation-worker-b`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-b`
Base: `e972e3f` (setup commit; requirement `6b4bc94`)

## Scope

Worker B owns grouped overall-filter execution/persistence, grouped rule-outcome
evaluation against Worker A's normalized rule form, null/blank semantics in all
three configuration areas, family expansion/remapping, and the run/history/
report/tracking context that assumed one outcome per rule.

Worker A owns `backend/apps/rules/**`, the rule schema/catalog/identity, and the
new pure shared predicate/tree helpers. This worktree does **not** modify A's rule
modules and does not cherry-pick another worker's commits.

## Published runtime interfaces

New pure runtime module: `backend/apps/runs/grouped_logic.py`.

```python
parse_grouping_tree(raw: Any) -> GroupingNode | None
serialize_grouping_tree(node: GroupingNode | None) -> Any
validate_grouping_tree(node, clause_count, *, label="Clause", prefix="c") -> list[str]
validate_filter_grouping(filters, relation=None, tree=None) -> list[str]
normalize_rule_outcomes(rule: Any) -> NormalizedOutcomes
evaluate_outcomes(row, outcomes, baseline_row=None) -> OutcomeEvaluation
match_value(raw_value, operator, values) -> bool
match_column(raw_left, raw_right, operator) -> bool
match_condition_value(row, column, operator, values, baseline_row=None) -> bool
```

Grouping uses the shared wire tree `{"kind":"leaf","conditionId":"c0"}` or
`{"kind":"and"|"or","children":[...]}`. Persisted leaves remain indexed within
their own ordered clause list.

Run/API additions:

```python
execute_comparison(..., filters, filter_relation=None, filter_grouping_tree=None, ...)
apply_filters(df_a, df_b, filters, filter_relation=None, filter_grouping_tree=None)
```

`ExecutionResult` now carries optional `filter_relation` and
`filter_grouping_tree`. `ValidationViolation` additionally carries
`outcome_columns`, `outcome_values` and `outcome_results`. All fields have
defaults, so existing constructors, stored runs and serializers remain valid.

Saved-filter service/API additions:

```python
create_filter(name, rows, filter_relation=None, filter_grouping_tree=None)
update_filter(filter_id, name, rows, filter_relation=None, filter_grouping_tree=None)
```

Saved-filter rows accept the existing `filter_value` plus optional
`filter_values`; the grouping fields are persisted beside `rows`.

## Behavior

### Overall Row Filters

- Filters are evaluated as one predicate over the comparison file only. The
  baseline is still joined afterwards from the filtered comparison keys, which
  preserves the existing Phase-2 workflow.
- A valid `filter_grouping_tree` overrides `filter_relation`. Without a tree,
  `filter_relation` combines whole filters (`and`/`or`). Without either field,
  legacy AND is retained.
- Trees must reference every filter exactly once. Unknown, duplicate, omitted,
  empty-branch, malformed, unsafe-depth and oversized trees are rejected before
  data execution or configuration save.
- Substring matching is literal (Polars `str.contains(..., literal=True)`), so
  configured values are never interpreted as regular expressions.
- Empty filters impose no restriction. A non-empty filter must have a column,
  a valid operator and at least one value.

### Rule outcomes

- Legacy single-outcome rules continue to read `rule.logic`.
- Grouped rules read `rule.logic_clauses` (A's normalized form) with
  `rule.logic_relation` and/or `rule.logic_grouping_tree`.
- If a legacy `logic` value is also present, it must describe one of the
  configured clauses; a contradictory value raises instead of silently choosing
  one representation.
- Multiple outcomes require an explicit relation or a valid tree and support
  value-against-column clauses only. A valid tree overrides the flat relation.
- Conditions decide applicability; the grouped outcome expression decides
  pass/fail. One row/rule produces at most one `ValidationViolation`, even when
  several outcome clauses fail.
- Grouped violation detail records every outcome column and observed value (in
  `outcome_columns`/`outcome_values` and `extra_values`) and the failed clause
  columns in `violating_column`. It does not invent one failing column for a
  compound expression.
- `rule_summaries[rule_id]["logic"]` renders the complete grouped expression with
  `Outcome N:` clause labels, so reports and exports show grouping.

### Null / blank semantics

Centralized in `match_value`, `match_column`, `match_condition_value` and the
filter expressions:

| Operator | Null/empty input satisfies the clause? |
| --- | --- |
| `eq` | No |
| `contains` | No |
| `neq` | Yes |
| `ncontains` | Yes |

This applies to single- and multi-value clauses in Row Filters, Rule Conditions
and Rule Outcomes, including column-vs-column comparisons. Whitespace-only
strings remain literal; no trimming or case normalization is introduced.
Numeric operators keep their existing behavior and never match a null/blank
input. A missing schema column is not treated as a null cell: execution raises an
actionable `ValueError` for missing filter, condition, outcome, target or extra
columns before reading rows.

### Family expansion

`apps.families.resolver.expand_filter_grouping` expands `family:` row-filter
references to available concrete member filters and remaps tree leaves:

- a positive filter family becomes an `or` branch (row retained if any member
  matches);
- a negative filter family becomes an `and` branch (every member must satisfy
  the negative test);
- direct filters and family trees without references pass through unchanged;
- a family with zero available members is rejected with a clear error instead of
  silently dropping the expression.

Rule conditions and outcomes also evaluate `family:` leaves across their
available members, preserving positive-any / negative-all semantics. Leaf count
does not change for a rule-family leaf, so the existing condition/outcome tree
mapping stays valid.

### Persistence, history, reports and tracking

- Run requests accept `filter_relation` and `filter_grouping_tree`; saved run
  metadata stores them and `load_run` defaults historical documents to `None`.
- Historical violations default to empty outcome fields on load.
- HTML/Excel reports render the grouped filter expression (for example
  `(F1 AND F2) OR F3`) when grouping is present; legacy reports keep the old
  AND-style filter text.
- Rule detail tables/export use the union of violation `extra_values`, which for
  grouped outcomes includes every outcome column/value.
- Tracking capture still keys on canonical rule identifier + configured key
  values. Grouped outcomes collapse to one violation per row/rule, so they
  produce one tracking occurrence per rule/key rather than one per failed clause.

## Compatibility

- Legacy filters with no grouping fields retain AND.
- Legacy single-outcome rules keep `rule.logic` and existing summary/description
  output.
- Existing saved-filter YAML without `filter_values`, relation or tree loads with
  the legacy scalar value and no grouping.
- Existing rows/columns and filter configurations are preserved; the new fields
  pass through unchanged.
- Legacy run documents gain null/empty defaults on load and remain readable.
- No canonical-rule identity code or historical identifier/commentary is touched
  by B. New identity behavior is A's responsibility.

## Worker A dependency

B expects A's normalized rule object to expose:

- `logic_clauses`: non-empty ordered list of logic-clause-shaped objects/dicts;
- `logic_relation`: optional `and`/`or`;
- `logic_grouping_tree`: optional wire grouping tree.

Until A lands, `normalize_rule_outcomes` uses `getattr` and falls back to the
legacy `Rule.logic`; legacy tests and catalog rows continue to execute. When A
publishes pure predicate/tree helpers in `apps/validation_logic/**`, the runtime
equivalents in `apps/runs/grouped_logic.py` should be reconciled to A's helpers
by the reviewer rather than keeping divergent semantics. B does not infer
additional fields or silently default a missing multi-outcome relation.

## Defects found and fixed during implementation

1. **Negative filters dropped null/blank rows.** The old Polars expressions used
   bare `~is_in` / `~str.contains`, which propagate null and therefore excluded
   null/blank cells. Fixed by explicitly treating null/empty as satisfying
   `neq`/`ncontains`.
2. **Substring filters were regex-capable.** `str.contains(value)` treated
   user-entered values as patterns. Fixed with `literal=True` and added a literal
   metacharacter regression.
3. **Rule logic rejected every null before considering the operator.** The old
   evaluator returned a violation for null regardless of `neq`/`ncontains`.
   Replaced with centralized operator-aware predicates; missing schema columns
   still fail validation before execution.
4. **Grouped execution validated only legacy `rule.logic`.** Conditions and
   grouped outcome columns outside the selected schema were silently skipped.
   Execution now validates every condition and outcome clause and reports the
   rule/column.
5. **Saved filters had no grouping persistence.** Added relation/tree and
   multi-value row persistence plus structural validation. Filter and
   rows/columns config saves validate their grouping trees as well.
6. **Run/report context lost grouping.** Added run fields, historical defaults,
   report expression rendering and outcome context fields. Grouped violations
   remain singular per rule/key.

## Acceptance coverage

- Requirement 1/2: nested grouped filter execution and legacy AND load behavior.
- Requirement 3/4/5: OR, AND, nested outcome truth tables.
- Requirement 6/7: null/blank positive and negative operators in filters,
  conditions and outcomes, including multi-value and column comparison.
- Requirement 8: condition scope gates rule applicability.
- Requirement 9/10: saved/config/run round trips; invalid/removed references are
  rejected rather than silently broadened.
- Requirement 12/13: column-vs-column compatibility plus the two-group Y/N
  truth table. Only Y/N and N/Y pass; equal flags and values outside Y/N fail.
- Requirement 11 and legacy identifier stability: A-owned; B consumes A's
  canonical identifier unchanged.

## Verification (actual)

See the delivery record for the final command list/results. Key targeted run:

```text
uv run pytest -q tests/backend/test_grouped_validation.py
83 passed

uv run pytest -q tests/backend/test_grouped_validation.py tests/backend/test_configs_api.py
94 passed

uv run pytest -q tests/backend tests/contracts
692 passed, 1 failed (pre-existing baseline failure)
```

The single failure is
`tests/backend/test_rule_identifier_release_review.py::test_migration_reconciles_later_file_edits`
(`KeyError: 'rule_id'` in A's legacy YAML loader). It also fails on the untouched
base commit `6b4bc94`; B did not change rule/migration code.

## Unresolved questions / limitations

- Whitespace-only values remain literal per the shared conservative default; the
  user still needs to confirm that business decision.
- B's predicate/tree helpers should be replaced by A's shared pure helpers when A
  publishes them; interfaces above are the dependency contract.
- Multi-outcome identity/format is A-owned; B only consumes the canonical
  identifier.
- Frontend transport/state and visual editors are C/D work; B's tests use the
  shared wire shape and isolated backend data.
