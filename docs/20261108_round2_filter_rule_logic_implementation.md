# Round 2 filter and rule configuration changes

Branch: `work/20261108-grouped-validation-integration`.
Baseline: `ed26def`. Requirement: `requirements/20261108_req_filter_rule_logic_enhancement.md`.
Round 2 text was copied from the original main checkout without changing its index.
Screenshots reviewed read-only from that checkout: `Screenshot1.png`, `Screenshot2.png`.

## Changes and causes

- **E1:** Rule configuration uses Expectation n instead of Outcome n in row
  badges, actions, grouping titles, previews, help and accessible names. Existing
  internal/wire outcome names and saved rule identity remain unchanged.
- **E2/E3:** Shared grouping leaves and creation-picker members now render the
  numbered Filter/Condition/Expectation badge using the same `condition-number`
  class as their source rows, followed by the predicate. Removed the unrelated
  generic red CONDITION pill. Numbered badges use blue text, tint and left border.
  Default condition labels now carry their position. Checkbox accessible names
  retain the complete numbered predicate even though visible text is structured.
- **E4:** The old filter grid had five columns for six children. Added the badge
  column, leaving column/operator/value/order/remove in the same grid row.
  Narrow views scroll the row horizontally rather than wrapping or hiding actions.
  Add filter is a header action beside the Row filters title. Filter rows remain
  individually reorderable/removable and existing grouping behavior is unchanged.
- **E5:** CollapsibleCard renders title, focusable help and header actions as
  sibling controls. Help immediately follows the title rather than the expanding
  toggle's right edge. Expand/collapse remains available from both the title and
  explicit control. Collapsed summaries wrap below the title to keep other cards
  within their columns; no nested interactive controls were added.

## Round 2 Bug 1 — stale backend process, not a missing export formatter

The running standard-settings server (PID 214455, started 20:09:33 with
`--noreload`) predated the round 1 exporter fix. Before restart, POST
`/api/reports/export/` for saved grouped run `a4f67fd390b6` returned HTTP 400:
`Cannot convert {'sa_flag': 'Yes', 'cva_flag': 'Yes'} to Excel`.
A fresh Python process using the current checkout exported that same saved
payload successfully, proving the code/process mismatch.

The stale trigger/server pair was stopped and the backend restarted directly
with standard settings on 45303. No migrate or rule synchronization command was
run, preserving enabled catalog rules and existing data. The exact same export
request then returned HTTP 200, a roughly 21.5 KB workbook with all seven sheets.
Reopening with openpyxl found 34 readable compound-value cells in R079. The
existing round 1 formatter needs no duplicate implementation or response change.
After pulling/cherry-picking backend fixes, restart a `--noreload` process.

## Validation

- Full frontend: `npm --prefix frontend test -- --maxWorkers=2` — 648 passed,
  3 skipped, 71 test files passed / 3 skipped.
- Targeted editor checks: 37 passed across FilterBuilder, GroupingTreeEditor,
  RuleEditor.outcomes and logicOutcomes. Existing tests were updated for the
  intentional numbered accessible labels and Expectation wording.
- New FilterBuilder regression checks header action placement, adjacent help,
  scrolling row container and matching source/group badges.
- Backend isolated export/report checks:
  `GROUPED_VALIDATION_HOME=/tmp/opencode/round2-backend-checks PYTHONPATH=backend
  uv run pytest --ds=boat_control.grouped_validation_settings -q
  tests/backend/test_report_export_compound_values.py tests/backend/test_reports.py`
  — 22 passed.
- TypeScript/production bundle: `npm --prefix frontend run build` — passed;
  existing Vite >500 KB advisory remains.
- Chrome used an isolated copy of configuration/catalog at
  `/tmp/opencode/round2-ui`, port 45305. No user catalog/config/history was
  changed by browser editing. Screenshots: `/tmp/round2-filter-layout.png` and
  `/tmp/round2-expectation-editor.png`. Browser checks and final disposition are
  recorded in the round 2 review.

## User retest

Use http://127.0.0.1:45303/ and Ctrl+Shift+R. Upload the original project-root
baseline/candidate CSVs. Load your filter configuration and inspect the new row,
header and grouping labels. Open R079 and verify Expectation 1–4 with root OR
and two AND groups. Run with a nonempty population, download Excel, and inspect
both flags in its R079 sheet. Empty/misconfigured family-filter populations are
separate from Excel serialization; use concrete columns when comparing counts.

All existing user configuration edits and test presets are left uncommitted and
excluded from the implementation commit. No main branch merge or push occurred.
