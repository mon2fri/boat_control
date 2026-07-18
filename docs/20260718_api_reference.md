# Boat Control Backend API Reference

## Overview

Boat Control is a local-first Django application for comparing CSV files, validating records against configurable rules, and exporting reports. All APIs are JSON-based and run locally without external dependencies.

## Base URL

```
http://127.0.0.1:8000/api/
```

## Endpoints

### Health Check

```
GET /api/health/
```

Returns `{"status": "ok"}` if the server is running.

---

### File Management

#### Upload Files

```
POST /api/files/upload/
Content-Type: multipart/form-data
```

**Parameters:**
- `file_a`: First CSV file
- `file_b`: Second CSV file

**Response:**
```json
{
  "file_a_path": "/path/to/uploads/...",
  "file_b_path": "/path/to/uploads/...",
  "inspection": {
    "common_columns": ["id", "name"],
    "only_in_a": ["extra_a"],
    "only_in_b": ["extra_b"]
  }
}
```

#### Inspect Headers

```
POST /api/files/inspect/
Content-Type: application/json
```

**Body:**
```json
{
  "file_a_path": "/path/to/file_a.csv",
  "file_b_path": "/path/to/file_b.csv"
}
```

---

### Filter Preparation

#### Prepare Filters

```
POST /api/files/filters/prepare/
Content-Type: application/json
```

**Body:**
```json
{
  "file_a_path": "/path/to/file_a.csv",
  "file_b_path": "/path/to/file_b.csv",
  "common_columns": ["id", "name"]
}
```

**Response includes:**
- `columns`: List of common columns
- `column_values`: Unique values per column (with `*` for one-file-only values)
- `requires_confirmation`: `true` if total rows >= 2000

#### Validate Filter

```
POST /api/files/filters/validate/
Content-Type: application/json
```

**Body:**
```json
{
  "column": "name",
  "operator": "eq",
  "filter_value": "alice",
  "common_columns": ["id", "name"]
}
```

**Operators:** `eq`, `neq`, `contains`, `ncontains`

#### Validate Target Columns

```
POST /api/files/targets/validate/
Content-Type: application/json
```

**Body:**
```json
{
  "target_columns": ["id", "name"],
  "common_columns": ["id", "name", "score"]
}
```

---

### Validation Rules

#### List Rules

```
GET /api/rules/
```

#### Create Rule

```
POST /api/rules/
Content-Type: application/json
```

**Body:**
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

**Logic formats:**
- `value_vs_column`: Compare column value against a fixed value
- `column_vs_column`: Compare one column against another

#### Get/Update/Delete Rule

```
GET    /api/rules/<rule_id>/
PUT    /api/rules/<rule_id>/
DELETE /api/rules/<rule_id>/
```

#### Load Remote Rules

```
POST /api/rules/remote/
Content-Type: application/json
```

**Body:**
```json
{"url": "https://example.com/rules.yaml"}
```

---

### Comparison Execution

#### Execute Comparison

```
POST /api/runs/execute/
Content-Type: application/json
```

**Body:**
```json
{
  "file_a_path": "/path/to/file_a.csv",
  "file_b_path": "/path/to/file_b.csv",
  "target_columns": ["score", "status"],
  "filters": [
    {"column": "status", "operator": "eq", "filter_value": "active"}
  ],
  "rule_ids": ["R001", "R002"]
}
```

**Response includes:**
- `comparison`: Row counts, changes, details
- `validation`: Violations by rule
- `common_columns`, `target_columns`, `filters_applied`

---

### Run Persistence

#### List Runs

```
GET /api/runs/
```

#### Get Run Details

```
GET /api/runs/<run_id>/
```

#### Rename Run

```
PUT /api/runs/<run_id>/rename/
Content-Type: application/json
```

**Body:**
```json
{"report_name": "New Report Name"}
```

---

### Export

#### Export Report

```
POST /api/reports/export/
Content-Type: application/json
```

**Body:**
```json
{
  "run_id": "abc123def456",
  "format": "html"
}
```

Or with inline data:
```json
{
  "result_data": {...},
  "report_name": "My Report",
  "format": "csv"
}
```

**Formats:** `html`, `csv`

---

## Configuration

### Settings File

Located at `config/settings/settings.yaml`

### Rules File

Located at `config/rules/rules.yaml`

### Data Directories

| Path | Purpose |
|------|---------|
| `data/uploads/` | Uploaded CSV files |
| `data/results/` | Run results and exports |
| `config/rules/` | Validation rules |
| `config/filters/` | Saved filters |

## Development

### Setup

```bash
uv sync
uv run python backend/manage.py migrate --settings=boat_control.settings
uv run python backend/manage.py runserver --settings=boat_control.settings
```

### Testing

```bash
uv run pytest tests/ -v --cov=backend
```

### Linting

```bash
uv run ruff check backend/ tests/
uv run ruff format --check backend/ tests/
MYPYPATH=backend uv run mypy backend/
```
