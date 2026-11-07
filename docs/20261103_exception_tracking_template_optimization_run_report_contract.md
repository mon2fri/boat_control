# Template optimization — run/config/report contract (Worker C)

Status: **PUBLISHED FOR WORKERS A/B/D AND REVIEWER FREEZE**

Branch: `work/20261103-exception-tracking-worker-c`

This document freezes the Worker C side of the latest
`### Exception Tracking Template optimization` requirement and the
`### Commentary template extra-column selection and configuration` clarification.
It supersedes automatic appending of all exception-table/detail columns. Only the
ordered **Extra Columns for Commentary Template** selection supplies appended
data columns.

## Field ownership and names (C/D agreement)

| Surface | Field | Shape |
| --- | --- | --- |
| Rows-and-columns config content | `commentaryTemplateColumns` | ordered `ColumnRef[]`; missing/`null` normalizes to `[]` |
| Run request | `commentary_template_columns` | ordered `string[]` of concrete column names; default `[]` |
| Run request | `new_exceptions_only` | boolean; default `true` (checked) |
| Run result | `commentary_template_columns` | ordered `string[]` snapshot |
| Run result | `new_exceptions_only` | effective stored display scope |
| Violation | `detail_values` | ordered object of selected column name to literal text |
| Violation | `exception_id` | stable exception ID when tracking status is available |
| Violation | `exception_status` | `New`, `NotCommented`, `Commented`, or `null` |
| Run detail query | `new_exceptions_only` | optional `true`/`false`; overrides stored scope for the view |
| Report export request | `new_exceptions_only` | optional boolean; overrides stored scope |

`commentaryTemplateColumns` is deliberately distinct from the existing
`extraColumns`/`exceptionColumns` setting, rule `extra_columns`, comparison-section
`extraColumns`, key columns and aggregation columns. The backend never infers the
new selection from any of them.

Config `ColumnRef` entries may be a bare string or
`{kind: "column"|"column_family", name}`. The backend preserves their ordered
shape for the frontend to resolve.

## Rows-and-columns config persistence

- `POST /api/rows-and-columns/configs/` and
  `PUT /api/rows-and-columns/configs/<name>/` normalize
  `commentaryTemplateColumns` before writing.
- `GET /api/rows-and-columns/configs/<name>/` always returns the field. An older
  YAML file without it returns `[]`, which explicitly clears any stale frontend
  selection; the file is not rewritten on read.
- Invalid values return HTTP 400: non-list, empty names, duplicate names
  (case-insensitive after whitespace normalization), unsupported reference
  kinds, or names reserved by the standard tracking/template headers (including
  `Status`, `Exception Status`, `Commentary`, `Rule Index` and the timestamp/date
  headers).
- Other config fields, including `extraColumns`, are preserved unchanged.

Example:

```json
{
  "keyColumns": [{"kind": "column", "name": "id"}],
  "extraColumns": [{"kind": "column", "name": "status"}],
  "commentaryTemplateColumns": [
    {"kind": "column", "name": "SEGMENT"},
    "SCORE"
  ]
}
```

## Run request and capture

```json
{
  "session_id": "abc123def456",
  "as_of_date": "2026-10-30",
  "comparison_columns": ["id", "status", "SEGMENT", "SCORE"],
  "target_columns": ["status"],
  "key_columns": ["id"],
  "rule_ids": ["R001"],
  "commentary_template_columns": ["SEGMENT", "SCORE"],
  "new_exceptions_only": true
}
```

Validation:

- Selection entries must be nonblank, unique case-insensitively, non-reserved,
  and present in at least one uploaded file.
- A selection column present on only one side is supported. The comparison-file
  value wins when present; otherwise the baseline value is used; otherwise the
  persisted value is an empty string. No value is fabricated.
- Selection order is preserved in the run result and sent to Worker A as
  `extra_columns`.
- Empty selection adds no data columns and remains compatible with a Worker A
  store that predates the extra-column capture contract. A non-empty selection
  fails closed until Worker A exposes the contract.

Capture payload to Worker A (canonical names from A's addendum):

```python
{
    "exception_rule_identifier": "CBR1_...",
    "key_columns": (("id", "ABC"),),
    "exception_timestamp": datetime(..., tzinfo=UTC),
    "exception_rule_index": "R001",
    "exception_extra_values": {"SEGMENT": "Retail", "SCORE": "42"},
}
```

`capture_exceptions(..., extra_columns=("SEGMENT", "SCORE"))` carries the ordered
selection, including an explicit empty selection when supported. Rule Index is
the historical run-local `Rxxx`, never exception identity; Worker A preserves an
existing nonblank value on same-date reruns.

## New Exceptions Only

- Default is **checked** (`true`) when the request/export omits the field and for
  historical runs whose result lacks the field.
- Checked includes `New` and `NotCommented`; it excludes `Commented`.
- Unchecked includes all exceptions.
- Filtering is derived from authoritative tracking status for the run's As-of
  Date. On read/export, statuses are refreshed from Worker A when possible;
  persisted statuses are the fallback.
- Unknown statuses (legacy run without a date, missing tracking database, or no
  matching record) are retained for visibility rather than silently hidden.
- All exceptions are captured and persisted before filtering. The saved run
  document retains every exception and its status.
- Counts (`total_violations`, distinct rows/attributes, per-rule counts and
  group statistics) are recomputed from the visible exceptions. Rule summaries
  remain available so an empty filtered result still renders a valid report.
- `GET /api/runs/<run_id>/`, `GET /api/runs/<run_id>/details/` and the HTML/Excel
  export endpoints accept the scope override. The execute response honors the
  request value.
- Commentary templates are owned by Worker B and always contain all exceptions,
  ordered New, NotCommented, then Commented. Worker C's display filter never
  reaches Worker B's workbook.

## Compatibility

- Historical runs without `commentary_template_columns` load as `[]`.
- Historical runs without `new_exceptions_only` load as `true`; unknown statuses
  keep their exceptions visible.
- Historical violations without `detail_values`, `exception_id` or
  `exception_status` load with empty/null defaults.
- Run index metadata includes `new_exceptions_only` (old entries default to
  `true`) so saved-run restoration can show the original scope.
- Run capture before filtering preserves the earlier atomicity rules: capture
  and enrichment happen before the run JSON is published; failures return HTTP
  500 with `tracking_failed` and no run is saved.

## Dependencies

- Worker A: `capture_exceptions(..., extra_columns=...)`, occurrence
  `exception_rule_index`/`exception_extra_values`, record status/ID/key pairs.
- Worker B: tracking API/workbook consumes A's ordered selection and ignores the
  New Exceptions Only display filter for templates.
- Worker D: maps the config/request fields above and implements the page
  controls; C owns the backend config validation/report/run propagation.
