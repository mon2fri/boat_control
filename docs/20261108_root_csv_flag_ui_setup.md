# Root CSV flag validation setup

Configured in the integration worktree using the running app API at
http://127.0.0.1:45303/. This instance uses standard checkout settings, not the
older isolated settings in the original UI guide. No application source changed.
Existing `s35` edits were preserved. Previous enabled rules were saved as
`ui-before-flag-tests`; the previous active YAML also has a separate backup.

## Start testing

1. Open http://127.0.0.1:45303/ and refresh to reload the catalog/config lists.
2. Upload `/home/zwj808/PycharmProjects/boat_control/baseline.csv` and
   `/home/zwj808/PycharmProjects/boat_control/candidate.csv` from the original
   checkout on main. Integration-root CSVs are older; use the paths above.
3. Load rows/columns config `ui-flags-all-rows` and use identifier `id`.
4. Load rule config `ui-flags-opposite-only` (also the default enabled selection).
5. Run and inspect per-rule exception details, exports and grouping previews.
   Uncheck New Exceptions Only when comparing full counts after commentary edits.
6. Load `ui-flags-active-systems` to test
   `(system = Bloomberg OR system = oomber) AND status = active`.
7. Load `ui-flags-all-checks` to expose all 11 test rules. Enable one rule at a
   time for simple count comparison; the table below is per rule, not distinct
   books across all rules.
8. For row-filter null semantics use `ui-flags-filter-eq`, `-neq`, `-contains`,
   or `-ncontains`: positive operators select 10 records, negatives select 30.
   Empty cva_flag cells are excluded by positives and included by negatives.
9. For condition null semantics select the appropriate `UI Condition` rule.
   Nonmatching conditions skip the rule; they are not failed outcomes.

Flag expectations use literal Yes/No (not Y/N). Empty CSV cells load as null;
ACDS is an invalid nonblank value. These root files do not distinguish quoted
empty strings from unquoted empty cells; existing dedicated integration samples
and regression tests cover that distinction.

## Expected evaluator results

These counts were independently computed from the current root CSVs through
actual `apply_filters`, materialized `rule_from_payload` and `_check_rule`.
They are evaluator expectations; full UI acceptance remains the user's check.
The source data includes new/missing baseline keys, so compare rule violation
counts, not attribute-change/new-book counts.

| Rule | All rows (40 selected) violations | Nested filter (12 selected) violations |
| --- | ---: | ---: |
| UI Flags - opposite Yes No | 34 | 8 |
| UI Flags - either Yes | 21 | 5 |
| UI Flags - both No | 37 | 10 |
| UI Null - cva eq Yes | 30 | 6 |
| UI Null - cva neq Yes | 10 | 6 |
| UI Null - cva contains Yes | 30 | 6 |
| UI Null - cva ncontains Yes | 10 | 6 |
| UI Condition - cva eq Yes then sa Yes | 7 | 5 |
| UI Condition - cva neq Yes then sa Yes | 21 | 5 |
| UI Condition - cva contains Yes then sa Yes | 7 | 5 |
| UI Condition - cva ncontains Yes then sa Yes | 21 | 5 |

Opposite flags: all rows have 6 passing / 34 failing records. Nested population
has 4 passing / 8 failing records; failing IDs are
`1, 10, 14, 22, 25, 29, 31, 41`.

Default grouped rule:

```text
(sa_flag = Yes AND cva_flag = No)
OR (sa_flag = No AND cva_flag = Yes)
```

## Persistence and restore

New configs are separately named under `config/rules/`, `config/rows_and_columns/`
and `config/filters/`. Catalog rules are saved in this app's local SQLite catalog.
The active `config/rules/rules.yaml` contains the default grouped rule so standard
startup synchronization preserves that selection. Loading another config through
UI changes enabled catalog rules; use the UI's active configuration save workflow
if you want that alternative selection to survive launcher synchronization.
To restore the former selection in this session, load `ui-before-flag-tests`.
For the exact prior startup YAML use `ui-before-flag-tests-active-backup.yaml`.
No history or existing rules were deleted. These setup changes are uncommitted.
