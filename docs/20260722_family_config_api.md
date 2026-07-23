# Family Configuration API

## Overview

Column Families and Value Families are global saved configurations stored as
YAML files in a configurable directory (default `config/families`). They allow
users to group related columns or values under a single named reference.

## Schema

### ColumnFamily
```yaml
kind: column
name: Contact
columns:
  - email
  - phone
```

### ValueFamily
```yaml
kind: value
name: ActiveStates
owner:
  kind: column          # "column" or "column_family"
  name: status
values:
  - active
  - enabled
```

## Validation

- Names must match `^[A-Za-z][A-Za-z0-9_]*$`
- Names are unique within their family kind
- Column Families must have at least one column
- Value Families must have exactly one owner and at least one value
- All values are strings
- Duplicate members are silently removed; order is preserved

## Endpoints

### List families
`GET /api/families/`

Returns all valid families sorted by name. Invalid YAML files are skipped
without crashing.

### Get family
`GET /api/families/<name>/`

### Create family
`POST /api/families/`
- Returns 201 on success
- Returns 400 when name is duplicate or validation fails

### Update family
`PUT /api/families/<name>/`
- Requires `version` field for optimistic concurrency
- Returns 200 on success
- Returns 404 when family not found
- Returns 409 on version conflict

### Delete family
`DELETE /api/families/<name>/`
- Returns 204 on success
- Returns 404 when family not found

## Settings

A new setting `family_config_path` (default `config/families`) is available
in the `.config` file and the Settings page as **Column/Value Family Config
Path**.
