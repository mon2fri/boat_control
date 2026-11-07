# Exception Tracking template optimization — B/A/C/D contract

Status: **PUBLISHED FOR WORKERS A/C/D AND REVIEWER FREEZE**

Branch: `work/20261103-exception-tracking-worker-b`

This freezes the API/workbook side of the latest
`### Exception Tracking Template optimization` requirement. It supersedes the
earlier automatic exception-detail appending contract
(`docs/20261103_exception_tracking_detail_template_contract.md`).

## Template version and header order

New workbooks are `exception_commentary/v2`:

1. `Exception ID` — visible
2. `Exception Status` — visible
3. `Commentary` — visible
4. `Rule Index` — visible
5. `Exception Rule Identifier` — hidden by default
6. `Key Columns` — hidden by default
7. `Exception Timestamp` — hidden by default
8. `Exception As-of Date` — hidden by default
9. `Exception First Seen As-of Date` — hidden by default
10. `Exception Last Seen As-of Date` — hidden by default
11. Only the ordered `Extra Columns for Commentary Template` selection —
    hidden by default.

The first four Excel columns have no hidden dimension. Every column from 5
onward is written with an Excel hidden-column dimension; the values are fully
present and remain revealable/exportable.

### Compatibility

- Import accepts both `exception_commentary/v1` (the previous nine-column
  workbook) and `exception_commentary/v2`.
- v1 import continues to require its original nine headers in order and reads
  `Exception ID` at column 1 and `Exception Commentary` at column 5.
- v2 import requires the first four headers in order and reads `Exception ID`
  at column 1 and `Commentary` at column 3. All later columns are informational.
- Both versions preserve As-of Date, unknown/duplicate/missing ID validation,
  atomic updates, file/resource limits and formula protection.
- A v2 workbook with an empty extra-column selection has exactly the ten
  standard tracking columns and no data columns.

## Rule Index and stored context

`Rule Index` is historical run-local context (`Rxxx`), never exception identity.
It is persisted at capture time. Multiple runs for one As-of Date use a
deterministic precedence: the newest captured run value wins for the same
Exception ID; older records without a stored value stay empty. Never derive
Rule Index from the current catalog order.

Worker A's canonical read surface is:

```python
class ExceptionRecord:
    # existing fields...
    exception_rule_index: str
    exception_extra_values: Mapping[str, str]

class ExceptionTrackingRepository:
    # existing methods...
    def get_extra_columns(self, as_of_date: date | str | None = None) -> tuple[str, ...]: ...
    def get_extra_column_union(self) -> tuple[str, ...]: ...
    def list_as_of_dates(self) -> list[date]: ...
```

B uses `get_extra_columns(D)` for the exact ordered selection at As-of Date D,
then appends selections from later dates in chronological order, preserving each
later selection's order and skipping names already present. Earlier selections
that were deselected at D are not included. Thus if August selects
`[REGION, SEGMENT]` and September selects `[SEGMENT, PORTFOLIO]`, September's
columns are `[SEGMENT, PORTFOLIO]`, while August's are
`[REGION, SEGMENT, PORTFOLIO]`; August's `PORTFOLIO` cells are blank. The
tracking-list metadata uses this same date-aware schema. An explicit empty
selection on the latest date adds no source columns.

`list_as_of_dates()` supplies the chronological dates used to find later
selections. The all-time union and older metadata method names are compatibility
fallbacks only when date-scoped metadata is unavailable. Compatibility aliases
`rule_index`/`detail_values` remain accepted. `exception_extra_values` contains
persisted values by column name. Values for columns not in the computed schema
are never exported.

The tracking API exposes D-friendly fields `rule_index` and `detail_values` and
also mirrors A's canonical names as `exception_rule_index` and
`exception_extra_values`.

## Sole source of appended data columns

Only the ordered names returned as Extra Columns for Commentary Template are
appended. B does not infer data columns from `exception_columns`, rule
`extra_columns`, attribute-comparison sections, key columns, aggregation
columns or any other exception-table field. If the selection is empty, there are
no appended data columns.

Standard tracking metadata is always present. Selected column values are read
from A's persisted `detail_values`, not from current source files or run
documents.

## Workbook row order

Commentary templates always contain every exception for the date:

1. `New` and `NotCommented` (uncommented group)
2. `Commented`

Rows within each group are ordered by `Exception ID` ascending. Commentary is
always prefilled from the tracking store. Both download entry points
(`?as_of_date=` and `?run_id=`) use this same all-row workbook and order.

## Tracking list API

`GET /api/exception-tracking/?as_of_date=YYYY-MM-DD`

Paging and sorting operate on the **complete filtered dataset** before the page
is sliced.

| Parameter | Default | Rules |
| --- | --- | --- |
| `offset` | `0` | integer >= 0 |
| `limit` | `50` | one of `50`, `100`, `200`, `500` |
| `sort` | unset | column key; unset uses the uncommented group (New + NotCommented) then Commented, each by Exception ID |
| `order` | `asc` | `asc` or `desc`; status order uses New/NotCommented < Commented |
| `filter_<column-key>` | unset | comma-separated values; OR within a key, AND across keys |

Column keys:

- `exception_id`
- `status`
- `commentary`
- `rule_index`
- `exception_rule_identifier`
- `key_columns`
- `exception_timestamp`
- `exception_as_of_date`
- `exception_first_seen_as_of_date`
- `exception_last_seen_as_of_date`
- `detail:<selected column name>` for an appended data column

Every sort uses `exception_id` ascending as the deterministic final tie-break.

Response:

```json
{
  "as_of_date": "2026-10-30",
  "total": 123,
  "unfiltered_total": 200,
  "offset": 0,
  "limit": 50,
  "has_more": true,
  "sort": null,
  "order": "asc",
  "columns": [
    {
      "key": "exception_id",
      "label": "Exception ID",
      "visible": true,
      "sortable": true,
      "filterable": true,
      "source": "standard"
    },
    {
      "key": "status",
      "label": "Exception Status",
      "visible": true,
      "sortable": true,
      "filterable": true,
      "source": "standard"
    },
    {
      "key": "commentary",
      "label": "Commentary",
      "visible": true,
      "sortable": true,
      "filterable": true,
      "source": "standard"
    },
    {
      "key": "rule_index",
      "label": "Rule Index",
      "visible": true,
      "sortable": true,
      "filterable": true,
      "source": "standard"
    },
    {
      "key": "detail:Region",
      "label": "Region",
      "visible": false,
      "sortable": true,
      "filterable": true,
      "source": "detail"
    }
  ],
  "detail_columns": ["Region"],
  "exceptions": [
    {
      "exception_id": "CBR1_..._ID",
      "status": "New",
      "exception_commentary": "",
      "rule_index": "R001",
      "exception_rule_identifier": "CBR1_...",
      "key_columns": "{\"id\":\"ID\"}",
      "exception_timestamp": "2026-10-30T08:15:00+00:00",
      "exception_as_of_date": "2026-10-30",
      "exception_first_seen_as_of_date": "2026-10-30",
      "exception_last_seen_as_of_date": "2026-10-30",
      "detail_values": {"Region": "EMEA"}
    }
  ],
  "available_filters": {
    "status": ["New", "Commented", "NotCommented"],
    "detail:Region": ["EMEA", "APAC"]
  }
}
```

`available_filters` is computed from the complete unfiltered date dataset, so
filter choices do not disappear as pages/filters change.

## Import informational behavior

For v2, everything after the first four columns is informational. Editing,
blanking, adding, deleting or reordering those cells/columns never changes
business validation or exception data. For v1, everything after its nine
original columns is informational. Only ID, As-of Date and the version-specific
Commentary column participate in import.
