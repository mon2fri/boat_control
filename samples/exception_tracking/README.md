# Exception tracking acceptance sample

This isolated sample uses the single rule in `rules.yaml` (STATUS must equal
`active`) and `ACCOUNT_ID` as the configured key column.

- First run, As-of Date `2026-09-30`: use `baseline.csv` and
  `candidate_2026-09-30.csv`. This yields exceptions for A and B.
- Enter commentary for A and leave B blank in the exported workbook.
- Second run, As-of Date `2026-10-30`: use `baseline.csv` and
  `candidate_2026-10-30.csv`. A is recurring/commented, B is recurring and
  uncommented, and C is new.

The backend generates the canonical rule identifier when it imports this rule.
Do not hard-code an expected identifier; exception IDs use the returned
identifier followed by `_A`, `_B`, or `_C`.

## Detailed result-table/template sample

The `detail/` subdirectory provides a two-rule sample for validating appended
commentary-template details and stable result-table IDs. In an isolated copy,
set `rule_config_path` to `samples/exception_tracking/detail` before running
`migrate_rules_to_db`, then upload `detail/baseline.csv` and
`detail/candidate.csv`. The rules exercise both value-vs-constant and
column-vs-column checks; `REGION` can be selected for aggregation and `SEGMENT`
and `SCORE` as extra columns. Expected template details include the ordered key,
Rule Index, region and extra-column values; rule IDs remain catalog-generated.
With the supplied files, R001 flags A and B while R002 flags A and C, producing
four detail rows (A has two distinct IDs because each ID includes its rule's
canonical identifier). Appended template fields should be `ACCOUNT_ID`,
`Rule Index`, `REGION`, `SEGMENT`, and `SCORE` after the original nine columns.
