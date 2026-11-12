# Round 1 Worker B delivery — compound-value Excel export fix

Date: 2026-11-08
Branch: `work/20261108-grouped-validation-round1-worker-b`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-b`
Starting HEAD: `aa4ed06377a629e4b7393b357a6c9a10eafef1dd`.
Baseline includes accepted `a552dbc`; confirmed with
`git merge-base --is-ancestor a552dbc HEAD`.

## Scope delivered

Round 1 Bug 3: S35 + grouped `outcome_groups` Excel export failed with
`Cannot convert {'sa_flag': 'Yes', 'cva_flag': 'Yes'} to Excel`.

Backend report/export code and a focused export regression file are delivered.
No frontend, catalog/schema/identity, user config or user data change was made.

## Files changed

Source:

- `backend/apps/reports/services.py` — one report-cell formatter used by Excel,
  CSV text sanitization and HTML; compound maps now render as
  `column=value, ...` with `(null)` / `(blank)` markers.

Tests:

- `tests/backend/test_report_export_compound_values.py` — real grouped-rule
  execution, XLSX generation/reopen, one exception per rule/key, null/blank
  context, legacy scalar export, formula protection, HTML readability/escaping
  and export-endpoint regression.

Documentation:

- `docs/20261108_round1_worker_b_implementation.md`
- `reviews/20261108_round1_worker_b_delivery.md` (this file)

## Root cause and fix

`export_excel` passed `violation["violating_value"]` straight to openpyxl after
a string-only helper. Grouped outcomes intentionally store that field as a flat
map of observed columns, so openpyxl rejected the map. The same map rendered as
a Python dict repr in HTML.

The fix is deliberately report-only:

- `_report_cell_value` is the single cell-normalization boundary.
- `_format_compound_cell` preserves every map entry and column order.
- `_observed_item_text` distinguishes `None` (`(null)`) from `""` (`(blank)`),
  matching the accepted frontend display contract.
- `_excel_value` applies the existing formula protection after formatting.
- `_escape_html` and `_sanitize_csv_value` consume the same formatter.

`violating_value` remains object-valued in run documents and API responses;
exception identity and one-exception-per-rule/key behavior are unchanged.

## Acceptance coverage

- Reproduced the exact pre-fix error with isolated S35 + grouped R079 + root CSVs:
  `Cannot convert {'sa_flag': 'Yes', 'cva_flag': 'Yes'} to Excel`.
- Generated and reopened a real XLSX from an isolated backend run
  (`ffd32f64c5e2`, 34 R079 violations). Every row exported with complete
  `sa_flag` / `cva_flag` observed context; 34 unique `(id, name)` keys; no
  dict-valued cells after reopen.
- Null observations exported as `cva_flag=(null)` / `sa_flag=(null)`; blank
  observations covered by the automated regression as `(blank)`.
- Legacy scalar S35/R056/R057 workbooks still generate and reopen with unchanged
  scalar values and layouts.
- HTML export no longer contains a dict repr and escapes compound values.
- Excel path audit: all `export_excel` data cells go through `_excel_value`;
  the exception commentary workbook already stringifies detail metadata before
  openpyxl, so no dict reaches it.

## Exact checks and results

```text
GROUPED_VALIDATION_HOME=/tmp/opencode/round1-worker-b-pytest PYTHONPATH=backend \
  uv run pytest --ds=boat_control.grouped_validation_settings -q \
  tests/backend/test_report_export_compound_values.py
5 passed

GROUPED_VALIDATION_HOME=/tmp/opencode/round1-worker-b-pytest PYTHONPATH=backend \
  uv run pytest --ds=boat_control.grouped_validation_settings -q \
  tests/backend/test_reports.py tests/backend/test_report_new_exceptions.py \
  tests/backend/test_grouped_validation.py \
  tests/backend/test_grouped_validation_integration.py \
  tests/backend/test_validation_logic.py
156 passed

GROUPED_VALIDATION_HOME=/tmp/opencode/round1-worker-b-pytest PYTHONPATH=backend \
  uv run pytest --ds=boat_control.grouped_validation_settings -q \
  tests/backend tests/contracts tests/integration
779 passed in 5.68s

uv run ruff check backend/apps/reports/services.py \
  tests/backend/test_report_export_compound_values.py
All checks passed.

uv run mypy backend/apps/reports
Success: no issues found in 5 source files

uv run python backend/manage.py check --settings=boat_control.grouped_validation_settings
System check identified no issues (0 silenced).

uv run python backend/manage.py makemigrations --check --dry-run \
  --settings=boat_control.grouped_validation_settings
No changes detected

git diff --check
(clean)
```

User-file preservation: `baseline.csv`, `candidate.csv` and
`config/rows_and_columns/s35.yaml` SHA-256 checksums matched before and after the
isolated reproduction.

## Dependencies / coordination

- Depends on integrated baseline `aa4ed06` and accepted `a552dbc`.
- Does not edit Worker A-owned rule schema/identity, Worker C frontend API/state,
  or Worker D editor components/pages.
- No cross-owner file handover was needed.
- Isolated user-repro catalog/CSV copies were used; original configs, active
  catalog, uploads, history and commentary data were untouched.
- No push, main merge, deployment, reset/clean/stash, agent dispatch or
  cross-worktree edit occurred.

## Remaining issues / limitations

- Top-level scalar null remains an empty Excel cell, preserving legacy behavior;
  compound maps explicitly distinguish `(null)` from `(blank)`.
- No browser/UI acceptance claim is made. B's change is backend report rendering;
  the accepted `a552dbc` frontend contract was not modified.
- Unrelated repository-wide Ruff findings outside the changed files remain out of
  scope.
- The reviewer owns cherry-picking these commits onto integration, final
  integrated verification and real download/UI acceptance.

## Ordered commits

1. `699a0d8` — `fix: format compound report values for excel export`
   (source and focused regression tests).
2. Documentation records (this file and the implementation record; exact HEAD
   reported in the handover message).
