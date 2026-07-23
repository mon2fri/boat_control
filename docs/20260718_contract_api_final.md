# Contract — Final API

Version: 1
Date: 2026-07-18
Owner: Worker C
Status: **FROZEN** — this document is the single source of truth for all API endpoints.
Supersedes: `docs/20260718_api_contract.md`, `docs/20260718_files_api.md`,
`docs/20260718_filters_api.md`, `docs/20260718_rules_api.md`, `docs/20260718_runs_api.md`,
`docs/20260718_persistence_api.md`, `docs/20260718_exports_api.md`,
`docs/20260718_api_reference.md`, `docs/20260718_reference_api_contract.md`.

## Global conventions

| Convention | Value |
|------------|-------|
| Wire field naming | `snake_case` |
| Content-Type | `application/json` (except multipart upload) |
| Authentication | None (local-only) |
| CSRF | `X-CSRFToken` header from `csrftoken` cookie on non-GET requests |
| Error envelope | `{"error": "Human-readable message"}` |
| Session model | Opaque session IDs; no file paths exposed to clients |
| Rule IDs | Auto-incrementing `R001`, `R002`, etc. |
| Rule semantics | Required-state: logic describes valid state; false = violation |
| Pagination cursors | Offset-based with `offset` and `limit` parameters |
| Stable ordering | Explicit in each endpoint |
| Internal paths | Never returned in client responses |

---

## 1. Health

### `GET /api/health/`

Returns server status.

**Response 200:**
```json
{"status": "ok"}
```

---

## 2. File upload

### `POST /api/files/upload/`

Uploads two CSV files and returns session information.

**Request:** `multipart/form-data`
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
{"error": "Both file_a and file_b are required."}
```
or
```json
{"error": "file_a must be a CSV file."}
```
or
```json
{"error": "file_a exceeds 500 MB limit."}
```

**Constraints:**
- Maximum file size: 500 MB per file
- Accepted extension: `.csv`
- Maximum columns: 500
- Session TTL: 24 hours
- Files sanitized with UUID prefix, stored under `UPLOADS_DIR`

---

## 3. Header re-inspection

### `POST /api/files/inspect/`

Re-inspects headers for an existing session.

**Request:**
```json
{"session_id": "a1b2c3d4e5f6"}
```

**Response 200:**
```json
{
  "session_id": "a1b2c3d4e5f6",
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
{"error": "session_id is required."}
```

**Response 404:**
```json
{"error": "Session not found or expired."}
```

---

## 4. Filter preparation

### `POST /api/files/filters/prepare/`

Prepares filter options for session columns.

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
  "session_id": "a1b2c3d4e5f6",
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

**Notes:**
- `requires_confirmation` is true when `total_rows_a + total_rows_b >= 2000`
- Values marked with `*` in `display` are present in only one file
- Common columns are derived from the server session, not the client request

---

## 5. Filter validation

### `POST /api/files/filters/validate/`

Validates a single filter row.

**Request:**
```json
{
  "session_id": "a1b2c3d4e5f6",
  "column": "name",
  "operator": "eq",
  "filter_value": "alice"
}
```

**Response 200:**
```json
{"valid": true, "errors": []}
```

**Operators:** `eq`, `neq`, `contains`, `ncontains`

**Notes:**
- Common columns are derived from session, not client-provided
- Cannot filter on values marked with `*`

---

## 6. Target column validation

### `POST /api/files/targets/validate/`

Validates selected target columns.

**Request:**
```json
{
  "session_id": "a1b2c3d4e5f6",
  "target_columns": ["id", "name"]
}
```

**Response 200:**
```json
{
  "session_id": "a1b2c3d4e5f6",
  "valid_columns": ["id", "name"],
  "invalid_columns": [],
  "all_common_columns": ["id", "name", "score"]
}
```

If `target_columns` is null or empty, all common columns are returned as valid.

---

## 7. Target column input parsing

### `POST /api/files/targets/input/`

Parses comma-separated target column input.

**Request:**
```json
{
  "session_id": "a1b2c3d4e5f6",
  "input_str": "id, name, bad_col"
}
```

**Response 200:**
```json
{
  "session_id": "a1b2c3d4e5f6",
  "parsed_columns": ["id", "name", "bad_col"],
  "valid_columns": ["id", "name"],
  "invalid_columns": ["bad_col"]
}
```

---

## 8. Column values (paginated, on-demand)

### `GET /api/files/<session_id>/values/`

Returns distinct values for a specific column with pagination.

**Query parameters:**
- `column` (required): Column name
- `search` (optional): Substring filter
- `offset` (optional, default 0): Pagination offset
- `limit` (optional, default 100, max 500): Page size

**Response 200:**
```json
{
  "session_id": "a1b2c3d4e5f6",
  "column": "name",
  "values": [
    {"value": "alice", "in_file_a": true, "in_file_b": true, "display": "alice"},
    {"value": "bob", "in_file_a": true, "in_file_b": false, "display": "bob*"}
  ],
  "total": 150,
  "offset": 0,
  "has_more": true
}
```

---

## 9. Rules

### `GET /api/rules/`

Lists all rules.

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
      "grouping_tree": null,
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

### `POST /api/rules/`

Creates a new rule.

**Request:**
```json
{
  "name": "Status Check",
  "description": "Validates status field",
  "conditions": [
    {"column_name": "type", "operator": "eq", "filter_value": "premium"}
  ],
  "condition_relation": "and",
  "grouping_tree": {
    "kind": "or",
    "children": [
      {"kind": "leaf", "index": 1},
      {"kind": "leaf", "index": 2}
    ]
  },
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

**Validation:**
- `name` is required
- `logic` is required with `format`, `column_name`, `operator`, `target_value`
- `condition_relation` is required when 2+ conditions
- `grouping_tree` must follow the recursive grammar (see contract_rule_evaluation.md)
- Condition operators: `eq`, `neq`, `contains`, `ncontains`

### `GET /api/rules/<rule_id>/`

Returns a specific rule.

**Response 200:**
```json
{
  "rule_id": "R001",
  "name": "Status Check",
  "description": "Validates status field",
  "conditions": [
    {"column_name": "type", "operator": "eq", "filter_value": "premium"}
  ],
  "condition_relation": "and",
  "grouping_tree": null,
  "logic": {
    "format": "value_vs_column",
    "column_name": "status",
    "operator": "eq",
    "target_value": "active"
  }
}
```

### `PUT /api/rules/<rule_id>/`

Updates a rule.

**Request:** Same as create.

**Response 200:**
```json
{"rule_id": "R001", "message": "Rule updated."}
```

### `DELETE /api/rules/<rule_id>/`

Deletes a rule.

**Response 200:**
```json
{"rule_id": "R001", "message": "Rule deleted."}
```

### `POST /api/rules/remote/`

Loads rules from a local file path (not arbitrary URLs).

**Request:**
```json
{"url": "/path/to/allowed/rules.yaml"}
```

**Response 200:**
```json
{
  "message": "Loaded 5 rules from remote.",
  "version": 1
}
```

**Security:** Only paths within `CONFIG_DIR` or `DATA_DIR` are allowed.

---

## 10. Settings

### `GET /api/settings/`

Returns application settings.

**Response 200:**
```json
{
  "preset_source_paths": [],
  "rules_config_path": "config/rules/rules.yaml",
  "full_set_threshold": 2000
}
```

### `PUT /api/settings/`

Updates application settings.

**Request:**
```json
{
  "preset_source_paths": ["/path/to/presets"],
  "rules_config_path": "config/rules/rules.yaml",
  "full_set_threshold": 2000
}
```

**Response 200:**
```json
{"message": "Settings updated."}
```

**Validation:**
- `full_set_threshold` must be a positive integer
- Paths must be within allowed roots

---

## 11. Saved filters

### `GET /api/filters/`

Lists all saved filters.

**Response 200:**
```json
{
  "filters": [
    {
      "filter_id": "f001",
      "name": "Active US Users",
      "filters": [
        {"column": "status", "operator": "eq", "filter_value": "active"},
        {"column": "country", "operator": "eq", "filter_value": "US"}
      ],
      "created_at": "2026-07-18T12:00:00Z"
    }
  ]
}
```

### `POST /api/filters/`

Creates a saved filter.

**Request:**
```json
{
  "name": "Active US Users",
  "filters": [
    {"column": "status", "operator": "eq", "filter_value": "active"},
    {"column": "country", "operator": "eq", "filter_value": "US"}
  ]
}
```

**Response 201:**
```json
{"filter_id": "f001", "message": "Filter saved."}
```

### `PUT /api/filters/<filter_id>/`

Updates a saved filter.

### `DELETE /api/filters/<filter_id>/`

Deletes a saved filter.

---

## 12. Preset sources

### `GET /api/files/presets/`

Lists configured preset sources.

**Response 200:**
```json
{
  "presets": [
    {
      "preset_id": "p001",
      "name": "Production Data",
      "path": "/data/presets/production",
      "file_a_name": "baseline.csv",
      "file_b_name": "candidate.csv"
    }
  ]
}
```

### `POST /api/files/presets/load/`

Loads files from a preset source.

**Request:**
```json
{"preset_id": "p001"}
```

**Response 200:** Same as file upload response (creates a session).

**Security:** Paths must be within allowed roots with safe descendant checks.

---

## 13. Execute and save

### `POST /api/runs/execute/`

Executes comparison and validation, auto-saves the result.

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

**Notes:**
- `key_columns` is required and must not be empty
- `rule_ids: []` means no rules (not "all rules")
- `target_columns: null` or `[]` means all common columns
- `filters: []` means no filtering

**Response 200:**
```json
{
  "run_id": "abc123def456",
  "report_name": "file_a_vs_file_b",
  "created_at": "2026-07-18T12:00:00+00:00",
  "result": {
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
      "distinct_violating_attributes": 60,
      "violations_by_rule": {
        "R001": [
          {
            "row_index": 10,
            "rule_id": "R001",
            "rule_name": "Status Check",
            "key_columns": {"id": "100"},
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status must equal \"active\"",
            "details": "did not match required state"
          }
        ]
      },
      "violation_count_by_rule": {"R001": 30, "R002": 20},
      "violating_rows_by_rule": {"R001": 25, "R002": 20},
      "violating_attributes_by_rule": {"R001": 35, "R002": 25}
    },
    "common_columns": ["id", "name", "status", "score"],
    "target_columns": ["score", "status"],
    "key_columns": ["id"],
    "filters_applied": [
      {"column": "status", "operator": "eq", "filter_value": "active"}
    ]
  }
}
```

**Response 400:**
```json
{"error": "session_id is required."}
```

---

## 14. History

### `GET /api/runs/`

Lists saved runs in reverse chronological order.

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

**Notes:**
- No `file_path` in response (internal paths removed)
- Maximum 10 entries (retention limit)

---

## 15. Run detail

### `GET /api/runs/<run_id>/`

Returns the full run document.

**Response 200:** Same shape as execute response.

---

## 16. Paginated details

### `GET /api/runs/<run_id>/details/`

Returns paginated comparison or violation details.

**Query parameters:**
- `section` (required): `changes` or `violations`
- `rule_id` (optional, required for violations section): Rule ID to filter by
- `offset` (optional, default 0): Pagination offset
- `limit` (optional, default 100, max 1000): Page size

**Response 200 (changes):**
```json
{
  "section": "changes",
  "details": [
    {
      "row_index": 42,
      "key_columns": {"id": "12345"},
      "attribute_changes": [
        {"column": "score", "file_a_value": "10", "file_b_value": "15"}
      ],
      "change_count": 1
    }
  ],
  "total": 1500,
  "offset": 0,
  "has_more": true
}
```

**Response 200 (violations):**
```json
{
  "section": "violations",
  "rule_id": "R001",
  "details": [
    {
      "row_index": 10,
      "rule_id": "R001",
      "rule_name": "Status Check",
      "key_columns": {"id": "100"},
      "violating_column": "status",
      "violating_value": "inactive",
      "rule_logic": "status must equal \"active\"",
      "details": "did not match required state"
    }
  ],
  "total": 30,
  "offset": 0,
  "has_more": false
}
```

---

## 17. Rename

### `PUT /api/runs/<run_id>/rename/`

Renames a run's report name.

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

**Notes:**
- Updates the JSON body, index metadata, and filename
- Report name sanitized: non-alphanumeric replaced with `_`, max 200 chars
- Empty names default to `unnamed_run`

---

## 18. Export

### `POST /api/reports/export/`

Exports a run to HTML or CSV.

**Request:**
```json
{
  "run_id": "abc123def456",
  "format": "html"
}
```

**Response 200:** File download.
- `Content-Type`: `text/html` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `Content-Disposition`: `attachment; filename="<report_name>.<ext>"`

**Formats:** `html`, `excel`

**Notes:**
- Complete exports (no silent truncation)
- HTML: escaped, self-contained, no external resources
- CSV: formula injection prevention via leading `'`
- UTF-8 filename in Content-Disposition

---

## 19. Error responses

All errors follow the envelope:
```json
{"error": "Human-readable message"}
```

| Status | Meaning |
|--------|---------|
| 400 | Invalid request / validation error |
| 404 | Resource not found (session expired, run not found) |
| 405 | Method not allowed |
| 500 | Internal server error |

---

## 20. Superseded documents

The following documents are historical and have been superseded by this contract:

| Document | Reason |
|----------|--------|
| `docs/20260718_api_contract.md` | Stale execute response shape, missing endpoints |
| `docs/20260718_files_api.md` | Shows `file_a_path`/`file_b_path` shapes |
| `docs/20260718_filters_api.md` | Shows client-provided `common_columns` |
| `docs/20260718_rules_api.md` | Missing `grouping_tree` |
| `docs/20260718_runs_api.md` | Shows `file_a_path` in execute request |
| `docs/20260718_persistence_api.md` | Shows `file_path` in history |
| `docs/20260718_exports_api.md` | Documents truncation limits |
| `docs/20260718_api_reference.md` | Stale shapes throughout |
| `docs/20260718_reference_api_contract.md` | Already a pointer document |
| `docs/20260718_rule_semantics.md` | Pending Worker A confirmation |
