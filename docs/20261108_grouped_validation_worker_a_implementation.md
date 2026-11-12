# Grouped validation — Worker A implementation

Branch: `work/20261108-grouped-validation-worker-a`
Date: 2026-11-08
Scope: backend rule schema, validation, catalog persistence, import/export,
canonical identity, and pure shared predicate/tree helpers.

> **Post-integration correction (2026-11-08).** This record distinguishes the
> original Worker A delivery from defects found by the reviewer during
> integration and the reviewer-authored fixes. The original code committed on
> this branch is unchanged by this documentation correction; no integration code
> was cherry-picked. Integrated results below are attributed to the reviewer, not
> to Worker A.

## Published interfaces (for Worker B)

Worker A publishes these interfaces before runtime integration. B should use the
normalized accessor instead of assuming `Rule.logic` is the whole expression.

### Rule outcome model — `apps.rules.services`

```python
@dataclass(frozen=True)
class LogicExpression:
    clauses: tuple[LogicClause, ...]
    relation: Literal["and", "or"] | None = None
    grouping_tree: GroupingNode | None = None
    representation: Literal["legacy", "clauses"] = "legacy"

    @property
    def is_single(self) -> bool: ...
    @property
    def flat_relation(self) -> Literal["and", "or"]: ...  # relation or "and"
```

`Rule` keeps the legacy `logic: LogicClause` field as its **first** clause for
source compatibility, and adds:

```python
logic_clauses: tuple[LogicClause, ...] = ()
logic_relation: Literal["and", "or"] | None = None
logic_grouping_tree: GroupingNode | None = None

@property
def outcome_clauses(self) -> tuple[LogicClause, ...]: ...
@property
def outcome_expression(self) -> LogicExpression: ...
```

Runtime rule evaluation must read `rule.outcome_expression`:

1. Evaluate each clause in `expression.clauses` against the record.
2. If `expression.grouping_tree` is not `None`, evaluate that tree against the
   per-clause results (`c0` is the first clause in `expression.clauses`).
3. Otherwise combine with `expression.relation`; a single clause has no
   relation and is used directly. `flat_relation` is a safety fallback only.

Shared serialization/parsing helpers:

```python
def rule_from_payload(
    rule_id: str,
    payload: dict[str, Any],
    *,
    rule_identifier: str | None = None,
) -> Rule: ...

def rule_definition_payload(
    rule: Rule,
    *,
    include_empty_target_values: bool = False,
) -> dict[str, Any]: ...

def serialize_logic_clause(
    clause: LogicClause,
    *,
    include_empty_target_values: bool = False,
) -> dict[str, Any]: ...

def normalize_rule_draft(rule_data: dict[str, Any]) -> dict[str, Any]: ...
```

`normalize_rule_draft` is applied only after validation; it converts a new-form
single outcome **without** relation/tree fields to the legacy `logic` form. The
integration fix rejects relation/tree fields on that form before normalization.

### Pure helpers — `apps.validation_logic`

No Django/database imports.

```python
def is_null_or_blank(value: Any) -> bool: ...

def matches_value(actual: Any, operator: str, expected: Any) -> bool:
    """Scalar or column-against-column match."""

def matches_values(actual: Any, operator: str, expected_values: Any) -> bool:
    """Value-against-column multi-value match."""

def parse_grouping_tree(
    data: Any,
    *,
    max_depth: int = 32,
    max_nodes: int = 1000,
) -> GroupingNode | None: ...

def serialize_grouping_tree(node: GroupingNode | None) -> Any: ...

def collect_leaf_ids(node: GroupingNode | None) -> set[str]: ...

def validate_grouping_tree(
    node: GroupingNode | None,
    *,
    item_count: int | None = None,
    expected_ids: Sequence[str] | None = None,
    identifier_prefix: str = "c",
    label: str = "grouping_tree",
    max_depth: int = 32,
    max_nodes: int = 1000,
) -> list[str]: ...

def evaluate_grouping_tree(
    node: GroupingNode | None,
    leaf_results: Mapping[str, bool] | Sequence[bool],
) -> bool: ...
```

Null/blank rules implemented in `matches_value`/`matches_values`:

| operator | null or empty-string operand |
| --- | --- |
| `eq` | false |
| `contains` | false |
| `neq` | true |
| `ncontains` | true |

Whitespace-only strings stay literal (no trimming/case folding). Substring
operators are literal Python substring matches, not regex. Numeric operators
return false for missing/non-numeric operands, preserving existing behavior.
For multi-value clauses, positive operators use `any`; negative operators use
`all` (none of the configured values may match). Column-against-column uses
`matches_value`, so the same null/blank rule applies when either operand is a
null/blank cell.

## Wire contract

Single outcome (legacy, unchanged):

```json
{
  "logic": {
    "format": "value_vs_column",
    "column_name": "STATUS",
    "operator": "eq",
    "target_value": "Active"
  }
}
```

Multiple outcomes:

```json
{
  "logic_clauses": [
    {"format": "value_vs_column", "column_name": "A", "operator": "eq", "target_value": "Y"},
    {"format": "value_vs_column", "column_name": "B", "operator": "eq", "target_value": "N"}
  ],
  "logic_relation": "and"
}
```

Optional `logic_grouping_tree` uses the existing tree shape:

```json
{"kind": "or", "children": [
  {"kind": "and", "children": [
    {"kind": "leaf", "conditionId": "c0"},
    {"kind": "leaf", "conditionId": "c1"}
  ]},
  {"kind": "and", "children": [
    {"kind": "leaf", "conditionId": "c2"},
    {"kind": "leaf", "conditionId": "c3"}
  ]}
]}
```

Each `logic_grouping_tree` leaf `cN` refers to `logic_clauses[N]` in the same
ordered list. `logic_clauses` entries are `value_vs_column` only; column-against-
column remains a legacy single-outcome form.

## Design decisions

- Legacy `logic` is retained verbatim for single-outcome rules. New writers use
  `logic` for one outcome and `logic_clauses` for multiple outcomes; a draft
  containing both forms is rejected as contradictory.
- A single-clause new form without grouping fields is normalized to legacy
  `logic` after validation. This keeps storage and catalog responses in the
  legacy shape and guarantees the same canonical identity as the equivalent
  legacy rule. Relation/tree fields are not allowed on that new single form:
  the integration fix rejects them before normalization so they can never be
  silently discarded (see the post-integration section).
- Multi-outcome validation requires `logic_relation` or a valid grouping tree.
  Trees override the flat relation only when valid. Every configured clause must
  appear exactly once; unknown, duplicate, omitted and empty-branch references
  reject the rule. Tree depth (32) and node count (1000) are bounded.
- No database migration is needed: the complete authored payload, including new
  fields, is stored in the existing `authored_payload` JSON and protected by the
  same identity lifecycle.
- Catalog responses and rule-config export use one shared serializer, so
  grouped outcome fields and condition/outcome grouping trees are not stripped.
  Business edits continue to use the existing identity/archive/replacement
  lifecycle.
- YAML loading keeps legacy IDs where present and falls back to positional
  `R001...` IDs when a legacy file omits `rule_id`.

## Canonical identity

- Legacy single-outcome rules keep `canonical_business_rule/v1`, the same
  canonical payload shape and all historical identifiers.
- Multi-outcome rules use
  `canonical_business_rule/v1+outcomes`. The outcome expression is included in
  full; `and`/`or` children are flattened only for the same operator and sorted
  by their canonical serialization, so reordered sibling clauses/groups are
  equivalent. Clause values retain the existing exact-string, sorted/deduplicated
  treatment. Grouping changes, relation changes and value changes produce new
  identifiers.
- A valid one-clause new form without grouping fields canonicalizes through the
  legacy path and therefore has the legacy identifier. Relation/tree fields on
  that form are rejected by the integration validation fix rather than ignored.
- Identity accepts authored mappings, stored payloads and `Rule`/dataclass
  objects (including parsed grouping nodes).

## Audited `rule.logic` consumers

| Consumer | Current status | Required integration |
| --- | --- | --- |
| `apps/rules/views.py` | Updated to shared outcome serializer. | None. |
| `apps/configs/views.py` | Updated rule export to shared serializer; import normalizes single outcomes. | None. |
| `apps/rules/management/commands/migrate_rules_to_db.py` | Updated to shared serializer. | None. |
| `apps/runs/services.py` | Still reads `rule.logic` in the original Worker A branch. Reviewer integration (`0992b78`) now consumes `rule.outcome_expression` and the pure helpers. | B/integration owns runtime; the reviewer verified the materialized-`Rule` path. |
| `apps/runs/services.py` column validation | Still checks only `rule.logic` in the original branch. | Reviewer integration validates each outcome clause and preserves the complete detail context. |
| `apps/reports/services.py`, `apps/runs/tracking_context.py` | Consume persisted run description strings, not `Rule.logic` directly. | B should ensure grouped descriptions include all clauses. |

## Requirement coverage (A-owned portions)

| Requirement | Coverage |
| --- | --- |
| 2, 9, 11 | Multi outcome forms, grouping, persistence/import/export, identity. |
| 4 | Legacy rules load and canonicalize unchanged. |
| 6, 7 | Pure null/blank helpers for filters, conditions and outcomes, including multi-value and column comparison. |
| 10 | Malformed/removed/omitted/duplicate tree references reject validation. |
| 12 | Legacy column-against-column remains available; multi `column_vs_column` rejected. |
| 13 | Two AND groups joined by OR is representable with the outcome tree. |
| 3, 5, 8 | Runtime pass/fail and applicability are B-owned; A supplies the executable expression and helpers. |

## Defects and fixes

### Migration YAML without `rule_id`

- Reported by: full backend suite (`test_migration_reconciles_later_file_edits`).
- Cause: legacy `load_rules` indexed `r["rule_id"]`; the release-review test writes
  a later legacy file containing a rule without `rule_id`.
- Fix: preserve an explicit `rule_id` when present, otherwise assign positional
  `R001...` IDs during YAML load. Existing IDs are never rewritten.
- Regression evidence: full backend suite now passes.

### Identity calculation on materialized `Rule` objects

- Reported by: new round-trip tests calling `calculate_rule_identifier(rule)`.
- Cause: the canonicalizer assumed mappings and skipped `Condition`/`LogicClause`
  dataclasses; parsed `GroupingLeaf` uses `condition_id`, not wire `conditionId`.
- Fix: canonicalization now normalizes dataclass objects and accepts both leaf
  shapes. Legacy payload output and golden hashes are unchanged.
- Regression evidence: golden identity tests and YAML/API round-trip tests pass.

## Post-integration findings and fixes

### 1. Original delivery and its validation

Worker A delivered commits `c388ce9`, `057dbab` and `f24acfa`. They were
independently validated in this worktree with the original focused/backend and
contract suites recorded in the delivery record. That validation covered legacy
golden identities, multi-outcome identity/order stability, YAML and catalog
round trips, malformed/omitted references, transactional invalid import,
duplicate catalog handling and pure helper truth tables. Those tests did not
exercise a one-clause `logic_clauses` payload carrying grouping fields, and they
used Worker A's own model-level expectations rather than an integrated B runtime.

### 2. Defects discovered during integration

**Medium — one-clause `logic_clauses` silently lost grouping fields.** Worker A's
original `validate_rule` accepted `logic_clauses` with one entry together with
`logic_relation` and/or `logic_grouping_tree`. The subsequent
`normalize_rule_draft` converted that form to legacy `logic`, dropping
`logic_clauses`, `logic_relation` and `logic_grouping_tree`. Truth semantics did
not change for a valid single leaf, but an unsupported/contradictory
representation was accepted and its grouping fields were silently stripped.

**Integration-only runtime incompatibility.** A materializes
`Rule.logic_grouping_tree` as immutable `GroupingBranch`/`GroupingLeaf` nodes and
publishes `Rule.outcome_expression`. Worker B's original runtime normalization
parsed only wire dictionaries, so a real catalog rule with a nested outcome tree
was rejected during execution even though B's dictionary-shaped test double
passed. This was a B runtime integration defect; A's model/interface was the
correct published contract. The reviewer fixed it by consuming
`rule.outcome_expression` and delegating predicates/tree operations to
`apps.validation_logic`.

### 3. Reviewer-authored fixes and regression evidence

- Fix for the one-clause defect: reviewer integration changed
  `backend/apps/rules/services.py` validation to reject a new single-outcome form
  when relation/tree fields are present. Corrected behavior is the validation
  error `Single-outcome logic_clauses must not include relation or grouping
  fields.` Normalization is still allowed for a single clause **without** those
  fields. Regression
  `test_single_outcome_clause_cannot_silently_discard_grouping_fields` in
  `tests/backend/test_grouped_validation_integration.py` asserts `valid is False`
  and an error containing `Single-outcome`. This is reviewer-authored code/test,
  not a Worker A change; it is in integration fix commit `fa17108`.
- Fix for materialized outcome trees: reviewer integration commit `0992b78`
  consumes `rule.outcome_expression`, accepts the immutable nodes, and delegates
  to the A pure helpers. Its real-model regression executes the four-clause Y/N
  truth table, including null/blank, and verifies one violation per failing row
  with complete outcome detail. Focused reviewer result: 132 passed across
  `test_grouped_validation_integration.py`, `test_grouped_validation.py` and
  `test_validation_logic.py`; changed-file Ruff passed.
- Contract integration: reviewer integration (`fa17108`) updated the versioned
  contract schema/examples for the optional grouped outcome fields. Worker A did
  not modify those reviewer-owned files.

### 4. Remaining limitations and pending acceptance

- This documentation correction changes no Worker A source, tests or validation
  claim. The original three commits remain the reviewable Worker A code delivery;
  this correction is a separate documentation commit.
- Worker B runtime integration is now reviewer-fixed in integration, but final
  acceptance still requires the user's full numbered visual/UI acceptance. The
  reviewer's limited browser smoke and component tests do not substitute for it.
- Full repository Ruff still has unchanged baseline findings in the rules
  migration and a rule-catalog test; changed-file Ruff is clean in the reviewer's
  records.
- No push, deployment, merge to main, or modification of the integration worktree
  was performed for this correction.

## Test/check evidence

The original Worker A commands/results and the reviewer's integrated
commands/results are separated in the delivery record
`reviews/20261108_grouped_validation_worker_a_delivery.md`. Integrated results are
the reviewer's; Worker A did not run them during this documentation correction.
