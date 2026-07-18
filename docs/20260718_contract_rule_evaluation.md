# Contract — Rule Evaluation Semantics and Grouping Grammar

Version: 1
Date: 2026-07-18
Owner: Worker C
Status: **FROZEN** — Workers A and B must not independently change rule semantics or grouping format.

## 1. Rule meaning

A rule describes the **required valid state** for one column across a set of rows.

- **Logic** specifies what must be true for a row to be valid.
- **Conditions** narrow which rows the rule applies to (applicability filter).
- A row **violates** the rule when it is **applicable** (all conditions match) and the logic
  evaluates to **false**.

This matches natural user intent: "status must equal active" means rows where status is not active
are violations.

## 2. Evaluation model

### 2.1 Applicability

A row is **applicable** to a rule when ALL of the rule's conditions are satisfied (combined by
`condition_relation`):

- `condition_relation: "and"` — every condition must be true.
- `condition_relation: "or"` — at least one condition must be true.
- No conditions — the rule applies to every row.

### 2.2 Violation test

For each applicable row, evaluate the rule's `logic` clause. If the result is **false**, the row
is a **violation**. If the result is **true**, the row is **valid**.

```
is_violation = NOT evaluate(logic, row)
```

### 2.3 Combined expression with grouping

When a rule has conditions AND a `grouping_tree`, the final boolean is:

```
applicable = evaluate_grouping_tree(conditions, grouping_tree)
is_violation = applicable AND NOT(logic)
```

A row that is not applicable is neither valid nor violating — it is simply out of scope.

## 3. Logic clause formats

### 3.1 value_vs_column

Compare a column value against a literal:

```json
{
  "format": "value_vs_column",
  "column_name": "status",
  "operator": "eq",
  "target_value": "active"
}
```

Meaning: `row.status` must equal `"active"`. If `row.status != "active"`, the logic is false →
violation.

### 3.2 column_vs_column

Compare two columns against each other:

```json
{
  "format": "column_vs_column",
  "column_name": "score_a",
  "operator": "eq",
  "target_value": "score_b"
}
```

Meaning: `row.score_a` must equal `row.score_b`. If they differ, the logic is false → violation.

## 4. Operators

| Operator | String | Numeric | Date | Behavior |
|----------|--------|---------|------|----------|
| `eq` | Exact match | Equality | Chronological equality | `a == b` |
| `neq` | Not equal | Inequality | Inequality | `a != b` |
| `contains` | Substring | N/A → error | N/A → error | `b in a` |
| `ncontains` | Not substring | N/A → error | N/A → error | `b not in a` |
| `gt` | N/A → error | Greater than | After | `a > b` |
| `lt` | N/A → error | Less than | Before | `a < b` |
| `gte` | N/A → error | Greater or equal | After or equal | `a >= b` |
| `lte` | N/A → error | Less or equal | Before or equal | `a <= b` |

Operators applied to incompatible types return an error (not a silent skip).

## 5. Null, missing, and type coercion

| Scenario | Behavior |
|----------|----------|
| Column value is NULL/missing | Comparison returns false (NULL != anything). Row is a violation if logic requires a non-null match. |
| Numeric vs string comparison | Attempt numeric coercion of the string. If coercion fails, return an error. |
| String vs numeric target | Attempt numeric coercion of the string column. If coercion fails, return an error. |
| Empty string `""` | Treated as a regular string value, not as NULL. |
| Non-applicable row | Not counted as valid or violating. Excluded from all metrics. |

## 6. Condition operators

Conditions use the same operator set: `eq`, `neq`, `contains`, `ncontains`.

- Condition operators `gt`, `lt`, `gte`, `lte` are **not supported** in conditions (only in logic).
- Conditions evaluate to true/false for applicability testing.
- NULL/missing in condition columns: the condition evaluates to false (row is not applicable).

## 7. Grouping tree grammar

### 7.1 JSON schema

```json
{
  "type": "object",
  "oneOf": [
    {
      "description": "Leaf node — references a condition by its client-side conditionId",
      "properties": {
        "kind": { "const": "leaf" },
        "conditionId": { "type": "string" }
      },
      "required": ["kind", "conditionId"]
    },
    {
      "description": "AND node — all children must be true",
      "properties": {
        "kind": { "const": "and" },
        "children": { "type": "array", "items": { "$ref": "#" }, "minItems": 2 }
      },
      "required": ["kind", "children"]
    },
    {
      "description": "OR node — at least one child must be true",
      "properties": {
        "kind": { "const": "or" },
        "children": { "type": "array", "items": { "$ref": "#" }, "minItems": 2 }
      },
      "required": ["kind", "children"]
    }
  ]
}
```

### 7.2 Constraints

| Constraint | Rule |
|------------|------|
| Leaf conditionId | Must be a string referencing a valid condition's client-side ID |
| Minimum children | `and`/`or` nodes must have at least 2 children |
| Maximum depth | 10 levels |
| Maximum nodes | 100 total nodes |
| Cyclic references | Impossible (tree structure, not a graph) |
| Duplicate leaf conditionIds | Allowed (same condition referenced multiple times) |
| Missing leaf references | Validation error — conditionId must exist in conditions list |
| Unknown leaf conditionIds | Validation error |
| Conditions not in tree | Warning — unreferenced conditions are ignored |

### 7.3 Legacy `grouping` field

The legacy `grouping: ["1", "2", "3"]` field is **deprecated**. The backend must accept it during
a transition period by converting it to an equivalent `grouping_tree`:

- Convert each string to a `{"kind": "leaf", "conditionId": "cN"}` node.
- Wrap all leaf nodes in `{"kind": "and", "children": [...]}`.

After the transition, the `grouping` field is ignored when `grouping_tree` is present.

## 8. Truth tables

### 8.1 Example: conditions A(c0), B(c1), C(c2)

#### (A AND B) OR C

Tree:
```json
{
  "kind": "or",
  "children": [
    {"kind": "and", "children": [
      {"kind": "leaf", "conditionId": "c0"},
      {"kind": "leaf", "conditionId": "c1"}
    ]},
    {"kind": "leaf", "conditionId": "c2"}
  ]
}
```

| A | B | C | A∧B | (A∧B)∨C |
|---|---|---|-----|---------|
| T | T | T | T   | **T** |
| T | T | F | T   | **T** |
| T | F | T | F   | **T** |
| T | F | F | F   | **F** |
| F | T | T | F   | **T** |
| F | T | F | F   | **F** |
| F | F | T | F   | **T** |
| F | F | F | F   | **F** |

#### A AND (B OR C)

Tree:
```json
{
  "kind": "and",
  "children": [
    {"kind": "leaf", "conditionId": "c0"},
    {"kind": "or", "children": [
      {"kind": "leaf", "conditionId": "c1"},
      {"kind": "leaf", "conditionId": "c2"}
    ]}
  ]
}
```

| A | B | C | B∨C | A∧(B∨C) |
|---|---|---|-----|---------|
| T | T | T | T   | **T** |
| T | T | F | T   | **T** |
| T | F | T | T   | **T** |
| T | F | F | F   | **F** |
| F | T | T | T   | **F** |
| F | T | F | T   | **F** |
| F | F | T | T   | **F** |
| F | F | F | F   | **F** |

## 9. Complete evaluation examples

### Example 1: Simple rule, no conditions

Rule: "status must equal active"
```json
{
  "conditions": [],
  "condition_relation": null,
  "grouping_tree": null,
  "logic": {
    "format": "value_vs_column",
    "column_name": "status",
    "operator": "eq",
    "target_value": "active"
  }
}
```

- Every row is applicable (no conditions).
- Row with `status = "active"` → logic true → valid.
- Row with `status = "inactive"` → logic false → **violation**.

### Example 2: Conditional rule with grouping

Rule: "US rows must have a tax_id, OR all rows must have a name"
Conditions: (c0) `country eq US`, (c1) `region eq EU`, (c2) `department eq Sales`
Grouping: `(c0 AND c1) OR c2`

```json
{
  "conditions": [
    {"column_name": "country", "operator": "eq", "filter_value": "US"},
    {"column_name": "region", "operator": "eq", "filter_value": "EU"},
    {"column_name": "department", "operator": "eq", "filter_value": "Sales"}
  ],
  "condition_relation": "and",
  "grouping_tree": {
    "kind": "or",
    "children": [
      {"kind": "and", "children": [
        {"kind": "leaf", "conditionId": "c0"},
        {"kind": "leaf", "conditionId": "c1"}
      ]},
      {"kind": "leaf", "conditionId": "c2"}
    ]
  },
  "logic": {
    "format": "value_vs_column",
    "column_name": "tax_id",
    "operator": "neq",
    "target_value": ""
  }
}
```

A row is applicable when `(country=US AND region=EU) OR department=Sales`.
An applicable row violates when `tax_id` is empty.

## 10. Wire format

The grouping tree is serialized as `grouping_tree` in the wire format:

```json
{
  "grouping_tree": {
    "kind": "or",
    "children": [
      {"kind": "and", "children": [
        {"kind": "leaf", "conditionId": "c0"},
        {"kind": "leaf", "conditionId": "c1"}
      ]},
      {"kind": "leaf", "conditionId": "c2"}
    ]
  }
}
```

The legacy `grouping` field (`["1", "2", "3"]`) is deprecated and must be ignored when
`grouping_tree` is present.

## 11. Ownership

| Component | Owner |
|-----------|-------|
| Evaluator direction (NOT logic) | Worker A — `apps/runs/services.py` |
| YAML persistence of `grouping_tree` | Worker A — `apps/rules/services.py` |
| Wire schema for `grouping_tree` | Worker B — `frontend/src/api/wire.ts` (already implemented) |
| Editor UI for grouping tree | Worker B — `frontend/src/features/rules/GroupingTreeEditor.tsx` (already implemented) |
| Round-trip tests | Joint — backend and frontend tests |
| Cross-boundary truth-table test | Worker C — contract tests (C4) |
