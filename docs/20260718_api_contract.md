# Boat Control API Contract

All endpoints use snake_case field names. Content-Type: `application/json` unless noted.

## Sessions

Upload returns opaque session IDs. All subsequent operations use session IDs instead of file paths.

### Upload

```
POST /api/files/upload/
Content-Type: multipart/form-data
```

**Request:**
- `file_a`: CSV file (required)
- `file_b`: CSV file (required)

**Response 200:**
```json
{
  "session_id": "a1b2c3d4e5f6",
  "file_a_name": "original_a.csv",
  "file_b_name": "original_b.csv",
  "inspection": {
    "columns_a": ["id", "name", "score"],
    "columns_b": ["id", "name", "value"],
    "common_columns": ["id", "name"],
    "only_in_a": ["score"],
    "only_in_b": ["value"]
  }
}
```

**Response 400:**
```json
{"error": "file_a must be a CSV file."}
```

### Inspect Headers (re-inspect existing session)

```
POST /api/files/inspect/
```

**Request:**
```json
{"session_id": "a1b2c3d4e5f6"}
```

**Response 200:** Same `inspection` shape as upload.

---

## Filter Preparation

### Prepare Filters

```
POST /api/files/filters/prepare/
```

**Request:**
```json
{
  "session_id": "a1b2c3d4e5f6",
  "common_columns": ["id", "name"]
}
```

**Response 200:**
```json
{
  "columns": ["id", "name"],
  "column_values": {
    "name": [
      {"value": "alice", "in_file_a": true, "in_file_b": true, "display": "alice"},
      {"value": "bob", "in_file_a": true, "in_file_b": false, "display": "bob*"}
    ]
  },
  "total_rows_a": 120000,
  "total_rows_b": 120000,
  "requires_confirmation": true
}
```

### Validate Filter

```
POST /api/files/filters/validate/
```

**Request:**
```json
{
  "column": "name",
  "operator": "eq",
  "filter_value": "alice",
  "common_columns": ["id", "name"]
}
```

**Response 200:**
```json
{"valid": true, "errors": []}
```

**Operators:** `eq`, `neq`, `contains`, `ncontains`

### Validate Target Columns

```
POST /api/files/targets/validate/
```

**Request:**
```json
{
  "target_columns": ["id", "name"],
  "common_columns": ["id", "name", "score"]
}
```

**Response 200:**
```json
{
  "valid_columns": ["id", "name"],
  "invalid_columns": [],
  "all_common_columns": ["id", "name", "score"]
}
```

---

## Rules

### List Rules

```
GET /api/rules/
```

**Response 200:**
```json
{
  "version": 1,
  "rules": [
    {
      "rule_id": "R001",
      "name": "Status Check",
      "description": "Validates status field",
      "conditions": [
        {
          "column_name": "type",
          "operator": "eq",
          "filter_value": "premium"
        }
      ],
      "condition_relation": "and",
      "grouping": null,
      "logic": {
        "format": "value_vs_column",
        "column_name": "status",
        "operator": "eq",
        "target_value": "active"
      }
    }
  ]
}
```

### Create Rule

```
POST /api/rules/
```

**Request:**
```json
{
  "name": "Status Check",
  "description": "Validates status field",
  "conditions": [
    {"column_name": "type", "operator": "eq", "filter_value": "premium"}
  ],
  "condition_relation": "and",
  "logic": {
    "format": "value_vs_column",
    "column_name": "status",
    "operator": "eq",
    "target_value": "active"
  }
}
```

**Response 201:**
```json
{"rule_id": "R001", "message": "Rule created."}
```

### Get Rule

```
GET /api/rules/<rule_id>/
```

**Response 200:** Full rule object.

### Update Rule

```
PUT /api/rules/<rule_id>/
```

**Request:** Same as create.

**Response 200:**
```json
{"rule_id": "R001", "message": "Rule updated."}
```

### Delete Rule

```
DELETE /api/rules/<rule_id>/
```

**Response 200:**
```json
{"rule_id": "R001", "message": "Rule deleted."}
```

---

## Execution (Execute and Save)

```
POST /api/runs/execute/
```

**Request:**
```json
{
  "session_id": "a1b2c3d4e5f6",
  "target_columns": ["score", "status"],
  "key_columns": ["id"],
  "filters": [
    {"column": "status", "operator": "eq", "filter_value": "active"}
  ],
  "rule_ids": ["R001", "R002"]
}
```

**Response 200:**
```json
{
  "run_id": "abc123def456",
  "report_name": "file_a_vs_file_b",
  "created_at": "2026-07-18T12:00:00+00:00",
  "comparison": {
    "total_rows_a": 120000,
    "total_rows_b": 120000,
    "matched_rows": 119500,
    "rows_with_changes": 1500,
    "total_attribute_changes": 3200,
    "row_details": [
      {
        "row_index": 42,
        "key_columns": {"id": "12345"},
        "attribute_changes": [
          {"column": "score", "file_a_value": "10", "file_b_value": "15"}
        ],
        "change_count": 1
      }
    ]
  },
  "validation": {
    "total_violations": 50,
    "distinct_violating_rows": 45,
    "violating_attributes": 60,
    "violations_by_rule": {
      "R001": {
        "violations": [
          {
            "row_index": 10,
            "rule_id": "R001",
            "rule_name": "Active Check",
            "key_columns": {"id": "100"},
            "violating_column": "status",
            "violating_value": "inactive",
            "details": "Expected 'active', got 'inactive'"
          }
        ],
        "distinct_rows": 40,
        "attribute_count": 45
      }
    }
  },
  "common_columns": ["id", "name", "status", "score"],
  "target_columns": ["score", "status"],
  "key_columns": ["id"],
  "filters_applied": [
    {"column": "status", "operator": "eq", "filter_value": "active"}
  ]
}
```

---

## History

### List Runs

```
GET /api/runs/
```

**Response 200:**
```json
[
  {
    "run_id": "abc123def456",
    "report_name": "file_a_vs_file_b",
    "file_a_name": "file_a.csv",
    "file_b_name": "file_b.csv",
    "created_at": "2026-07-18T12:00:00+00:00"
  }
]
```

### Get Run Detail

```
GET /api/runs/<run_id>/
```

**Response 200:** Full execution result (same shape as execute response).

### Rename Run

```
PUT /api/runs/<run_id>/rename/
```

**Request:**
```json
{"report_name": "New Report Name"}
```

**Response 200:**
```json
{
  "run_id": "abc123def456",
  "report_name": "New Report Name",
  "created_at": "2026-07-18T12:00:00+00:00"
}
```

---

## Export

```
POST /api/reports/export/
```

**Request:**
```json
{
  "run_id": "abc123def456",
  "format": "html"
}
```

**Response 200:** File download with `Content-Disposition: attachment`.

**Formats:** `html`, `excel`

---

## Error Responses

All errors return:
```json
{"error": "Human-readable message"}
```

| Status | Meaning |
|--------|---------|
| 400 | Invalid request / validation error |
| 404 | Resource not found |
| 405 | Method not allowed |
| 500 | Internal server error |

---

## Rule Logic Semantics

Rule logic describes a **violation condition**. When the logic evaluates to `true`, the row is reported as violating the rule. This applies to both the `logic` section and any `conditions`.

## Operators

| Operator | String | Numeric |
|----------|--------|---------|
| `eq` | Exact match | Equality |
| `neq` | Not equal | Inequality |
| `contains` | Substring match | N/A (error) |
| `ncontains` | Not contains | N/A (error) |
| `gt` | N/A (error) | Greater than |
| `lt` | N/A (error) | Less than |
| `gte` | N/A (error) | Greater or equal |
| `lte` | N/A (error) | Less or equal |

Operators that don't match the column type return an error rather than silently ignoring.
