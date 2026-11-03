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

### Commentary Template (results page)

The result page downloads the same commentary XLSX workbook as the Exception
Tracking tab:

```text
GET /api/exception-tracking/export/?run_id=<run-id>
```

Worker B owns this endpoint and the shared workbook format. The saved run's
top-level `as_of_date` selects the workbook; runs created before exception
tracking return an actionable HTTP 400 (`run_has_no_as_of_date`) instead of
guessing a date. Worker C does not implement a second workbook or export route.
See `docs/20261103_exception_tracking_run_capture.md` and
`docs/20261103_exception_tracking_api.md`.

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
