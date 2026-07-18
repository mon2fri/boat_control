# Filter and Target Column Preparation API

## Endpoints

### `POST /api/files/filters/prepare/`

Prepares filter options by extracting unique values from common columns across both files.

**Request:**
```json
{
  "file_a_path": "/path/to/uploads/abc123_file_a.csv",
  "file_b_path": "/path/to/uploads/def456_file_b.csv",
  "common_columns": ["id", "name", "score"]
}
```

**Response (200):**
```json
{
  "columns": ["id", "name", "score"],
  "column_values": {
    "name": [
      {"value": "alice", "in_file_a": true, "in_file_b": true, "display": "alice"},
      {"value": "bob", "in_file_a": true, "in_file_b": false, "display": "bob*"}
    ]
  },
  "total_rows_a": 3,
  "total_rows_b": 2,
  "requires_confirmation": false
}
```

**Notes:**
- Values marked with `*` in `display` are present in only one file
- Users cannot filter on values marked with `*`
- `requires_confirmation` is `true` when total rows >= 2000

### `POST /api/files/filters/validate/`

Validates a single filter row before execution.

**Request:**
```json
{
  "column": "name",
  "operator": "eq",
  "filter_value": "alice",
  "common_columns": ["id", "name", "score"]
}
```

**Response (200):**
```json
{
  "valid": true,
  "errors": []
}
```

**Operators:**
| Operator | Description |
|----------|-------------|
| `eq` | Equals to |
| `neq` | Not equal to |
| `contains` | Contains substring |
| `ncontains` | Does not contain substring |

### `POST /api/files/targets/validate/`

Validates selected target columns against common columns.

**Request:**
```json
{
  "target_columns": ["id", "name"],
  "common_columns": ["id", "name", "score"]
}
```

**Response (200):**
```json
{
  "valid_columns": ["id", "name"],
  "invalid_columns": [],
  "all_common_columns": ["id", "name", "score"]
}
```

If `target_columns` is `null` or empty, all common columns are returned as valid.

### `POST /api/files/targets/input/`

Parses comma-separated target column input and validates against common columns.

**Request:**
```json
{
  "input_str": "id, name, bad_col",
  "common_columns": ["id", "name", "score"]
}
```

**Response (200):**
```json
{
  "parsed_columns": ["id", "name", "bad_col"],
  "valid_columns": ["id", "name"],
  "invalid_columns": ["bad_col"]
}
```

## Confirmation Threshold

When `requires_confirmation` is `true` in the filter preparation response, the frontend should prompt the user to confirm running on the full dataset before proceeding with comparison/validation.
