# Excel Export and Complete HTML Detail Export

Date: 2026-07-23

## Summary

The result page now offers:

- **Export HTML**, generated from the rendered result-page element.
- **Export Excel**, generated as a structured `.xlsx` workbook.

CSV export has been removed from the supported export API and user interface.

## Export API

Endpoint:

```text
POST /api/reports/export/
```

Excel request:

```json
{
  "run_id": "<run-id>",
  "format": "excel"
}
```

Excel response:

```text
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="<report-name>.xlsx"
```

Supported formats are now:

- `html`
- `excel`

## Excel workbook layout

### Sheet 1: Overall

The `Overall` worksheet contains:

1. Report name.
2. Overall result metrics.
3. Filtering information.
4. Overall-summary aggregation-card tables, arranged horizontally.
5. Exception Rule Summary:
   - Rule name.
   - Exception records.

Aggregation tables use **Exception records** rather than “Unique Count” or
“Attribute Count.”

### Sheet 2: Attribute Changes

The `Attribute Changes` worksheet contains:

- A list of all effective comparing columns.
- The complete attribute-change detail table.

The detail table includes:

- Key columns, or `Row` when no key columns exist.
- `Column`.
- `In Baseline`.
- `In Comparison`.

The removed `Rationale` column is not exported.

### Sheet 3 onward: one worksheet per rule

Each rule receives its own worksheet. The worksheet name is the rule index,
for example `R001`.

Fixed cell layout:

| Cell | Content |
|---|---|
| A1 | `Rxxx - Rule name` |
| A2 | `Condition:` |
| B2 | Condition content; blank when none |
| A3 | `Grouping:` |
| B3 | Grouping content; blank when none |
| A4 | `Expectation:` |
| B4 | Expectation content |
| A5 | Blank |
| A6 | Blank |
| Row 7 | Detail-table headers |
| Row 8 onward | Complete rule-detail rows |

Rule detail tables preserve rule display settings:

- Extra columns appear immediately after key columns.
- Extra-column values are included for every row.
- When **Hide comparison columns** is enabled, `Column`, `In Baseline`, and
  `In Comparison` are omitted.
- `Rationale` is omitted.

## Row limits

### HTML

HTML export no longer has the previous 200-row or virtualized-window limit.
Before cloning the rendered result page, detail tables temporarily:

1. Disable virtualization.
2. Materialize the complete stored row set.
3. Apply active detail filters to the complete row set.
4. Generate the HTML snapshot.
5. Restore normal virtualized rendering.

There is no application-defined HTML row cap. Available browser memory is the
practical limit for very large HTML exports.

### Excel

Excel has a hard limit of **1,048,576 rows per worksheet**.

The exporter checks this limit for Attribute Changes and every rule worksheet.
If a worksheet would exceed the limit, the request fails with an explicit
error. Rows are never silently truncated.

## Security

- Cell values beginning with `=`, `+`, `-`, `@`, tab, or carriage return are
  prefixed with an apostrophe to prevent spreadsheet formula injection.
- Worksheet names are sanitized for Excel-invalid characters and made unique.
- Worksheet names are limited to Excel’s 31-character maximum.
- HTML continues to serialize a cloned DOM without using raw HTML sinks.

## Dependency

Excel generation uses:

```text
openpyxl >= 3.1, < 4.0
```

The dependency is declared in `pyproject.toml` and locked in `uv.lock`.

## Validation

The implementation was validated with:

- Backend Excel workbook structure tests.
- Exact worksheet and cell-position assertions.
- Extra-column and hidden-comparison rule tests.
- Spreadsheet formula-injection tests.
- Export endpoint and integration tests.
- API contract tests.
- Complete frontend test suite.
- Backend lint checks.
- Production frontend build.

Validation results at implementation time:

- 37 backend, integration, and contract tests passed.
- 255 frontend tests passed.
- Ruff checks passed.
