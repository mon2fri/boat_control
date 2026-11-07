# Commentary tracking manual test

Use the integration worktree app with an isolated tracking database. These fixtures do not change application settings or rules automatically. Dates are calendar month ends: 2026-08-31 and 2026-09-30.

## Configure once

Set key columns to `id` only. Enable only one rule for this test: `status` must equal the literal `active` on comparison rows (value-vs-column, operator eq). If the UI offers comparison mode, use comparison_vs_comparison to evaluate comparison values. Preserve exactly the same rule across both runs; changing the rule can change its canonical identifier. Disable other rules/filters and avoid aggregations. Do not use name, status, region or score as key columns. IDs below mean key values; actual exception IDs include the canonical rule identifier prefix.

## August

Upload 2026-08-31/baseline.csv as baseline and 2026-08-31/comparasion.csv as comparison. Set As-of Date to 2026-08-31 and execute. Expect exceptions for IDs 1, 2 and 3, initially New. Download commentary XLSX. Add `August reviewed - carry forward` to ID 1 and `August only - resolved next month` to ID 3. Leave ID 2 commentary blank. Upload the workbook and verify IDs 1/3 are Commented and ID 2 remains New. Download again to verify commentary is prefilled.

## September

Upload the September pair, retain the same key/rule and set As-of Date to 2026-09-30. Expect IDs 1, 2 and 4. ID 1 should carry its August commentary and be Commented; ID 2 should be NotCommented; ID 4 should be New. IDs 1/2 have first-seen date August 31 and last-seen date September 30. ID 4 has both dates September 30. ID 3 is absent in September and remains available in August history with last-seen August 31. ID 5 passes both months.

Download from both Results and Exception Tracking for September and verify matching IDs and prefilled commentary. Comment ID 2 in the September template, upload, and verify Commented after refresh/restart. Revisit August to confirm history is preserved (commentary propagation to earlier snapshots follows the implementation's documented policy). Rerun September and verify no duplicates or lost commentary. Upload an edited workbook containing an unknown exception ID and verify validation failure with no partial updates.

Files intentionally use the requested filename `comparasion.csv`; select them as the comparison input in the UI. Each pair has five rows, identical schemas and unique non-null IDs. The only changed field is status.
