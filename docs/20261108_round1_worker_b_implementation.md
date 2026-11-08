# Round 1 Worker B — compound-value Excel export fix

Date: 2026-11-08
Branch: `work/20261108-grouped-validation-round1-worker-b`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-b`
Starting HEAD: `aa4ed06377a629e4b7393b357a6c9a10eafef1dd`.
Baseline confirmation: `aa4ed06` includes the accepted `a552dbc` R079 frontend
response fix (`git merge-base --is-ancestor a552dbc HEAD` succeeded).
Requirement: `requirements/20261108_req_filter_rule_logic_enhancement.md` Bug 3.
Ownership: backend runtime/report/export and this round's export regressions.

## Item coverage

| Item | Status | Notes |
| --- | --- | --- |
| B3 — S35 + `outcome_groups` Excel export error | Fixed | Compound `violating_value` maps are formatted as text before openpyxl; real XLSX regenerated and reopened. |
| Audit all Excel paths for dict/list values | Done | Every data cell in `export_excel` now goes through one formatter; exception-tracking workbook already stringifies detail values. |
| Preserve object-valued `violating_value` API | Done | No runtime/API schema change; only report rendering changed. |
| Preserve exception IDs and one exception per rule/key | Done | No validation/violation construction changed; exercised with a real grouped rule and isolated S35/R079 data. |
| Preserve legacy scalar export | Done | Scalar values keep their existing cell values and formula escaping. |
| Affected HTML behavior | Done | HTML now renders compound maps readably and escaped instead of a Python `dict` repr. |

## Root cause

Grouped-outcome rules store an object-valued `violating_value`, for example
`{"sa_flag": "Yes", "cva_flag": "Yes"}`. `export_excel` routed that value through
`_excel_value`, which only handled strings and returned every other type
unchanged. openpyxl then raised:

```text
ValueError: Cannot convert {'sa_flag': 'Yes', 'cva_flag': 'Yes'} to Excel
```

The per-rule worksheet was the failing path. The HTML export had a separate,
non-fatal defect: it rendered the same map with `str(dict)`, producing
`{'sa_flag': 'Yes', ...}`.

## Design and interfaces

`backend/apps/reports/services.py` now has one report-cell formatter:

- `_report_cell_value(value)` — the single normalization boundary. Scalars are
  returned untouched (including `None`, `""`, numbers, dates); mappings, lists and
  tuples are converted to text.
- `_format_compound_cell(value)` — for a mapping emits
  `column=value, column=value` in insertion order; for a list/tuple emits its
  items separated by `, `. All entries are retained.
- `_observed_item_text(value)` — compound values use the same display convention
  as the accepted frontend formatter: `(null)` for JSON null and `(blank)` for
  the empty string.
- `_excel_value(value)` — calls `_report_cell_value`, then applies the existing
  `_sanitize_csv_value` formula protection to strings.
- `_sanitize_csv_value(value)` and `_escape_html(value)` — both now use the same
  formatter. HTML escapes the formatted text, so column/value context is visible
  and values remain injection-safe.

No change was made to `ValidationViolation`, `violating_value` persistence,
`outcome_values` / `outcome_columns`, exception identity, or any `apps/rules`
schema. `a552dbc`'s frontend contract remains the accepted object-valued map.

## Excel path audit

`export_excel` currently writes these sheets:

| Sheet / path | Compound risk | Result |
| --- | --- | --- |
| Overall — aggregation values | CSV-scalar grouping values only | Routed through `_excel_value`; safe if a list/map ever appears. |
| Overall — exception rule summary | rule name/identifier scalars | Validated scalars; still routed through `_excel_value`. |
| Rule Summary | rule metadata and counts | `_append_row` uses `_excel_value`. |
| Attribute Changes | comparison scalars | `_append_row` uses `_excel_value`; formula escaping preserved. |
| New Books | key/grouping/extra scalars | `_append_row` uses `_excel_value`. |
| Attribute Comparing Sections | comparison scalars | `_append_row` uses `_excel_value`. |
| Per-rule sheet (the failure) | **object-valued `violating_value`** | Now formatted as `column=value, ...` text before openpyxl. |
| Exception Table | key/grouping/extra scalars | `_append_row` uses `_excel_value`. |
| Exception commentary workbook (`apps/exception_tracking/workbook.py`) | detail metadata | Already coerced with `_record_value` / `_detail_text` before openpyxl; no dict reaches openpyxl. No change needed. |

## Reproduction and real-XLSX verification

An isolated home was created at `/tmp/opencode/round1-worker-b` (not committed):

- `config/rows_and_columns/s35.yaml` copied from this worktree;
- grouped R079 catalog copied from the isolated user-repro catalog;
- `Test` family and filter configs copied;
- root `baseline.csv` / `candidate.csv` copied from the active checkout without
  editing them.

The S35 run used `id,name` keys, `status,region` aggregation, S35 comparison
sections, `name,status,score` commentary/exception columns and rule R079. The
backend persisted run output, exported Excel/HTML, and the workbook was reopened
with openpyxl.

Observed pre-fix reproduction:

```text
ValueError: Cannot convert {'sa_flag': 'Yes', 'cva_flag': 'Yes'} to Excel
```

Post-fix isolated reproduction (run `ffd32f64c5e2`, 34 R079 violations):

```text
sheets: Overall, Rule Summary, Attribute Changes, New Books,
        Attribute Comparing Sections, R079, Exception Table
rule rows: 34
unique (id, name) keys: 34
row 1:  id=1  sa_flag=Yes  cva_flag=Yes  ->  sa_flag=Yes, cva_flag=Yes
row 3:  id=3  sa_flag=Yes  cva_flag=null ->  sa_flag=Yes, cva_flag=(null)
row 6:  id=6  sa_flag=No   cva_flag=No   ->  sa_flag=No, cva_flag=No
dict-valued cells found after reopen: 0
HTML dict repr occurrences: 0
```

The isolated run's compound maps included 34 distinct rule/key pairs and null
observations such as `{"sa_flag": null, "cva_flag": null}`; these exported as
`sa_flag=(null), cva_flag=(null)`. The generated workbook was reopened from disk
and every per-rule row had exactly one exception.

Legacy scalar verification used the isolated S35/R056/R057 run responses. Excel
generation and reopen succeeded; `R056` / `R057` retained their scalar
`In Comparison` values (`status` / `score` values) and workbook layouts. HTML
generation also succeeded for those scalar runs.

## Regression coverage

New file: `tests/backend/test_report_export_compound_values.py`.

- Real grouped rule materialized with `rule_from_payload` and executed with
  `validate_rows`; asserts one exception per rule/key for four failing IDs and
  the exact object-valued `violating_value` maps, including null and blank.
- Reopens real generated XLSX bytes with `openpyxl`; asserts full compound text,
  `(null)` / `(blank)` distinctions, one row per key, and no dict-valued cells in
  any sheet.
- Legacy scalar export remains unchanged, including scalar formula protection
  (`=SUM(A1:A2)` → `'=SUM(A1:A2)`).
- Compound text beginning with a formula character is still protected, and the
  cell remains a text cell.
- HTML output renders compound values readably and escapes script payloads; no
  Python dict repr.
- The `/api/reports/export/` endpoint returns a real XLSX (HTTP 200) for compound
  values and the reopened workbook retains every observed value.

## Exact checks and results

Run from this worktree with isolated pytest storage:

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

GROUPED_VALIDATION_HOME=/tmp/opencode/round1-worker-b-pytest PYTHONPATH=backend \
  uv run python backend/manage.py check \
  --settings=boat_control.grouped_validation_settings
System check identified no issues (0 silenced).

... manage.py makemigrations --check --dry-run ...
No changes detected

git diff --check
(clean)
```

Original user/config preservation checksums matched before and after the isolated
reproduction for `baseline.csv`, `candidate.csv` and
`config/rows_and_columns/s35.yaml`.

## Dependencies

- Baseline `aa4ed06` includes accepted `a552dbc`; no frontend source was changed.
- No Worker A/C/D files were edited. No catalog/schema/identity behavior changed.
- The isolated catalog was copied from existing review fixtures; no active user
  catalog, uploads, saved runs, configs or commentary templates were mutated.
- No push, main merge, worktree reset/clean/stash, deployment or cross-worktree
  edit was performed.

## Remaining issues / limitations

- Excel still represents a top-level scalar `null` as an empty cell, matching
  legacy behavior. Inside compound observed maps, `(null)` and `(blank)` are
  explicit. This preserves legacy exports while retaining grouped context.
- The accepted object-valued `violating_value` API remains map-based; any future
  consumer must keep using the agreed scalar-or-flat-map contract.
- B did not run browser/UI acceptance. Frontend behavior is unchanged and relies
  on `a552dbc`.
- Unrelated repository-wide Ruff findings outside the changed files are not part
  of this delivery.

## Ordered commits

1. `699a0d8` — `fix: format compound report values for excel export`
   (source and focused regression tests).
2. This implementation record and the delivery record (documentation only;
   exact HEAD reported in the handover message).
