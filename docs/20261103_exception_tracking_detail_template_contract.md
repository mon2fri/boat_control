# Commentary template exception details — B/D contract

> **SUPERSEDED for appended data columns.** The newest
> `Exception Tracking Template optimization` requirement replaced automatic
> exception-table appending with the ordered
> `Extra Columns for Commentary Template` selection. Use
> `docs/20261103_exception_tracking_template_optimization_contract.md`.
> The stable Exception ID/fallback guidance below remains applicable.

Status: **SUPERSEDED FOR APPENDED COLUMNS; ID CONTRACT RETAINED AND INTEGRATED**

Branch: `work/20261103-exception-tracking-worker-b`

This document freezes the backend portion of the enhancement
"Commentary template exception details and table identity". The canonical
tracking/bookwork contract remains `docs/20261103_exception_tracking_api.md`;
this file adds the appended exception-detail columns and the shared Exception ID
rule.

## Exception ID field

The stable displayed row identifier is the backend's `exception_id`
(`<exception_rule_identifier>_<ordered key value>...`). It is the same value
used by the Exception Tracking API and commentary workbook.

For the Results exception table, Worker D should display the Exception ID from
each violation:

- Preferred wire field on a validation violation: `exception_id`.
- Worker C can populate it while capturing the run.
- Until Worker C's commit is integrated, and for older saved runs, the
  equivalent value is computed from the run's persisted fields:
  1. Take the violation `rule_identifier`, falling back to
     `result.rule_bindings[rule_id]`, then
     `result.validation.rule_summaries[rule_id].rule_identifier`.
  2. Take the configured key names in `result.key_columns` order.
  3. Read each value from the violation `key_columns` mapping in that order.
  4. Join `rule_identifier` and the exact text values with underscores.
- Do not display an incremental row number as the identifier.
- Do not use the local rule index (`R001`) as the Exception ID.
- The paginated violation-detail API currently provides the canonical
  `rule_identifier` and ordered `key_columns`; the frontend uses those to derive
  the same ID when `exception_id` itself is absent. If canonical identity or
  complete key values are missing, display `—` rather than guess.

The backend workbook always takes the Exception ID from the tracking record, so
the workbook and displayed table use the same value. Worker B also applies the
same fallback when matching older run rows for appended detail values.

## Ordered appended detail columns

The original workbook columns stay unchanged and in this order:

1. Exception ID
2. Exception Rule Identifier
3. Key Columns
4. Exception Timestamp
5. Exception Commentary
6. Exception As-of Date
7. Exception First Seen As-of Date
8. Exception Last Seen As-of Date
9. Status

After those, the backend appends the current Results exception-table columns
that are not already represented, in table order:

1. Each configured key column name, in `result.key_columns` order.
2. `Rule Index` (the run-local `Rxxx` value).
3. Each aggregation column using its display label
   (`result.aggregation_column_labels.get(column, column)`).
4. Each configured exception/extra column in `result.exception_columns` order;
   for older runs without that list, use the first-seen order of
   `violation.extra_values` keys.

If `result.extra_column_display.exception_tables` is explicitly `false`, omit
the configured exception/extra columns because they are not shown in the Results
Exception Table. If that legacy display flag is absent, keep the historical
default and include them.

Deduplication rules:

- Normalize a header by trimming and case-folding for comparison.
- Skip a candidate if its normalized name already exists in the original nine
  columns or in an earlier appended column.
- Therefore a key/aggregation/extra column named `Status`, `Exception ID`,
  `Exception Rule Identifier`, `Key Columns`, etc. is not appended twice.
- The table's `Exception ID` and canonical `Rule identifier` columns are not
  appended again because the original `Exception ID` and
  `Exception Rule Identifier` columns already carry them.
- The first occurrence of a duplicated name wins; later sources for that name
  do not create another column.

With the reference sample (`key_columns=["id","name"]`,
`aggregation_columns=["status","region"]` with labels `Status`/`Region`,
`exception_columns=["name","status","region","id","score"]`), the appended
headers are:

```text
id, name, Rule Index, Region, score
```

The duplicated `name`, `status`, `region` and `id` extra columns are skipped
because an earlier column already represents them. The aggregation `Status`
column is also skipped because the original template already has `Status`.

## Value mapping

For each exception row, appended values come from the same run result row:

| Appended source | Value |
| --- | --- |
| key column | `violation.key_columns[name]` |
| `Rule Index` | the rule's local id (`Rxxx`) |
| aggregation label | `violation.grouping_values[source_column]` |
| exception/extra column | `violation.extra_values[source_column]` |

Missing/`null` values become an empty cell. Values are written as literal text
with the existing formula-injection protection. If one Exception ID has
multiple violation rows, the first nonblank value for each appended column is
used. If several saved runs exist for the same As-of Date, the newest run wins
for matching detail values.

## Downloads from Results and Exception Tracking

Both downloads call the same date-scoped endpoint/service and therefore produce
the same workbook for the same As-of Date:

```text
GET /api/exception-tracking/export/?as_of_date=YYYY-MM-DD
GET /api/exception-tracking/export/?run_id=<run-id>
```

The backend resolves detail values by scanning saved run documents whose
top-level `as_of_date` equals the selected date, newest first. It matches each
tracking row by Exception ID. Old runs without `as_of_date` are ignored for
detail enrichment; old runs without `exception_id` use the fallback calculation.
If no saved run provides detail context for a date, the original nine columns
remain and no detail columns are appended.

## Import behavior

- The first nine columns remain required, in the existing order, and the
  As-of Date metadata and Exception IDs remain validated exactly as before.
- Every column after the ninth is informational. The importer ignores its
  header and values completely.
- Editing, blanking, adding, deleting, reordering or renaming trailing
  informational columns must not fail an otherwise valid import and must never
  update exception data.
- Unknown/duplicate/missing Exception IDs, mismatched As-of Dates, malformed
  workbooks, and resource-limit violations still fail atomically with no
  partial commentary update.
- Workbook version remains `exception_commentary/v1`; older workbooks with only
  the nine original columns remain valid.
