# Exception IDs in Results detail tables — compatibility contract

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

## Current template contract

The earlier automatic exception-detail-column behavior is superseded. The only
source-data columns appended to current commentary templates and shown in
Exception Tracking come from the ordered **Extra Columns for Commentary
Template** selection. The current workbook order, status filtering, hidden-column,
import-compatibility and date-scoped historical-column rules are documented in
[`20261103_exception_tracking_template_optimization_contract.md`](20261103_exception_tracking_template_optimization_contract.md).

The stable Exception ID contract above remains in force: use the backend ID when
supplied; otherwise the Results frontend derives the same literal value only from
a canonical rule identifier and complete configured key values.
