# Exception Tracking template optimization acceptance data

Generate reproducible CSV fixtures in a scratch directory:

```bash
python samples/exception_tracking/template_optimization/generate_data.py \
  "$UI_ROOT/template-optimization-data"
```

Use the application's existing `samples/exception_tracking/rules.yaml` rule
(`STATUS` must equal `active`) and upload each pair for the corresponding
As-of Date:

- August 31, 2026: `baseline_2026-08-31.csv` and
  `candidate_2026-08-31.csv` (65 new exceptions).
- September 30, 2026: `baseline_2026-09-30.csv` and
  `candidate_2026-09-30.csv` (45 recurring uncommented, 20 recurring commented
  after the August import, and 25 new exceptions; 90 total).

On the second page, select `ACCOUNT_ID` as the key, `BALANCE` in the existing
**Extra Columns** card, and `PORTFOLIO` in **Attribute Comparing Sections**.
For **Extra Columns for Commentary Template**, use the ordered selection
`REGION`, `SEGMENT` for August, then `SEGMENT`, `PORTFOLIO` for September.
These deliberately different settings verify that only the commentary-template
selection provides appended data values. After the September selection, an
August template includes `PORTFOLIO` as a later-added column with blank values;
the September template does not include the previously selected-only `REGION`.

Commentary can be entered for the first 20 August IDs in the downloaded XLSX.
On September 30, New Exceptions Only should show 70 rows (25 New and 45
NotCommented), while the unchecked view and both commentary-template downloads
contain all 90. The tracking table uses 50 rows by default, with 50/100/200/500
options.
