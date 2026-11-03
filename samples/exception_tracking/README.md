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
