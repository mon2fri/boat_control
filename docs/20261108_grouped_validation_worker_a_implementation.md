# Grouped validation — Worker A implementation

Branch: `work/20261108-grouped-validation-worker-a`
Date: 2026-11-08
Scope: backend rule schema, validation, catalog persistence, import/export,
canonical identity, and pure shared predicate/tree helpers.

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
single outcome to the legacy `logic` form.

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
- A single-clause new form is normalized to legacy `logic` after validation.
  This keeps storage and catalog responses in the legacy shape and guarantees
  the same canonical identity as the equivalent legacy rule.
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
- A one-clause new form canonicalizes through the legacy path and therefore has
  the legacy identifier.
- Identity accepts authored mappings, stored payloads and `Rule`/dataclass
  objects (including parsed grouping nodes).

## Audited `rule.logic` consumers

| Consumer | Current status | Required integration |
| --- | --- | --- |
| `apps/rules/views.py` | Updated to shared outcome serializer. | None. |
| `apps/configs/views.py` | Updated rule export to shared serializer; import normalizes single outcomes. | None. |
| `apps/rules/management/commands/migrate_rules_to_db.py` | Updated to shared serializer. | None. |
| `apps/runs/services.py` | Still reads `rule.logic` for legacy execution. | B must consume `rule.outcome_expression` for multi outcomes, null semantics and violation context. |
| `apps/runs/services.py` column validation | Still checks only `rule.logic`. | B must validate every outcome clause column and column-comparison target. |
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

## Test/check evidence

Commands and results are recorded in the delivery record
`reviews/20261108_grouped_validation_worker_a_delivery.md`.
