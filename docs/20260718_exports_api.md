# Export API

## Endpoint

### `POST /api/reports/export/`

Exports comparison and validation results to HTML or CSV format.

**Request:**
```json
{
  "run_id": "abc123def456",
  "format": "html"
}
```

Or with inline result data:
```json
{
  "result_data": {
    "comparison": {...},
    "validation": {...}
  },
  "report_name": "My Report",
  "format": "excel"
}
```

**Response:** File download with appropriate content type.

## Export Formats

### HTML Export

- Self-contained HTML with inline CSS
- No external resource dependencies
- Safe HTML escaping for all user content
- Includes summary, attribute changes, and validation violations
- Reads the persisted run snapshot, including canonical rule identifiers when present
- Preserves local `Rxxx` grouping and historical rule summaries for legacy runs

### CSV Export

- Standard CSV format with formula injection prevention
- Values starting with `=`, `+`, `-`, `@`, `\t`, `\r` prefixed with `'`
- Includes summary metrics, changes, and violations
- Reads the persisted run snapshot, including canonical rule identifiers when present
- Preserves local `Rxxx` grouping and historical rule summaries for legacy runs

## Security

### HTML Escaping

- All user-derived content escaped using `html.escape()`
- Prevents XSS attacks through stored data
- No raw HTML injection

### CSV Formula Injection

- Dangerous prefixes detected and neutralized
- Prevents spreadsheet formula execution
- Protects against `=CMD()`, `+CMD()`, `-CMD()`, `@CMD()` attacks

## Content Disposition

- HTML: `attachment; filename="{report_name}.html"`
- CSV: `attachment; filename="{report_name}.csv"`
