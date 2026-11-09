# Round 4 Worker B delivery — commentary-template enabled-rule table

Date: 2026-11-09. Branch: `work/20261109-round4-worker-b`.
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/round4/worker-b`.

## Scope

Round 4 enhancement 2 only: a readable enabled-rule table on the first tab of
the downloaded commentary template, after metadata/instructions. Columns: Rule
index/name, Conditions, Condition Groupings, Expectations, Expectation
Groupings, Rule Identifier. No changes to tracking api_services/views,
frontend, `reports/services.py`, or `reports/rule_headers.py`.

## Files changed

- `backend/apps/exception_tracking/workbook.py` (modified): `build_commentary_workbook`
  gains keyword-only optional `rule_summaries` (default `None`) and
  `rule_snapshot_notes` (default `()`), and writes the additive table on the
  Template sheet starting at row 7 (title), header row 8 (or 9 with notes),
  data rows after. Template sheet name, parser positions B2/B3, template
  version, Exceptions headers, editable commentary rules and
  formula-injection protection are unchanged.
- `backend/apps/exception_tracking/rule_summary.py` (new): snapshot
  normalization, enabled filtering, deterministic date-wide union, and row
  building. Imports only `apps.reports.rule_headers` (`excel_rule_headers`,
  `rule_sort_key`); that module is untouched.
- `tests/backend/test_exception_tracking_rule_table.py` (new): 11 tests.

## API contract (for Worker A / integrator)

`build_commentary_workbook(records, as_of_date, *, ..., rule_summaries=None,
rule_snapshot_notes=())`.

- `rule_summaries`: mapping `rule index ("R001") -> that run's persisted
  validation summary mapping`, exactly as stored under
  `result["validation"]["rule_summaries"]` by `apps.runs.persistence`.
  Persisted keys used: `condition_clauses`, `expectation_clauses`,
  `condition_groupings`, `expectation_groupings`, `name`, `rule_identifier`
  (legacy fallback keys `condition`, `condition_grouping`, `logic` flow
  through `excel_rule_headers` untouched). Worker A owns selecting/passing
  scope-specific snapshots; this helper only normalizes. Rows are derived
  from these snapshots, never from violations, so enabled zero-exception
  rules appear.
- Cell text equals `excel_rule_headers(summary)` verbatim (conditions,
  condition groupings, expectations, expectation groupings); first column is
  `"R001 - Name"` (bare index when the name is missing/identical); rows sort
  by `rule_sort_key` (numeric: R2 < R10 < R100); missing identifier renders
  `"Unavailable"`; empty grouping strings are preserved (faithful to Excel
  for ungrouped clauses). The exported Excel per-rule tab additionally
  humanizes the expectations cell; for all modern persisted snapshots the
  humanizer is a no-op (clauses already read `equals`/`does not equal`), so
  outputs agree — documented deliberately rather than importing the private
  reports helper into tracking.
- Disabled exclusion: entries with explicit `enabled is False` (or
  `disabled is True`) are dropped. Persisted snapshots carry no such marker
  today, and every persisted snapshot was enabled at its run time, so this is
  forward-compatible rather than load-bearing.
- `rule_snapshot_notes`: optional sequence of strings rendered as a wrapped
  "Snapshot Notes" row above the header (absent when empty).
- Snapshot selection / union policy (proposal, needs integrator + Worker A
  sign-off): report-template downloads pass that run's snapshots unchanged.
  Date-wide tracking downloads pass one merged mapping built by
  `merge_rule_snapshots([(run_label, summaries), ...])` with runs in
  ascending `run_id` order: union of every distinct rule index, first
  snapshot wins per index, and a note is returned per differing snapshot of
  the same rule quoting both run labels and both canonical identifiers
  (rendered via `rule_snapshot_names`). No new historical storage; no
  consultation of the mutable current catalog.
- Missing-metadata representation: `rule_summaries=None`/empty renders one
  explicit placeholder row (`"No enabled rule snapshots available for this
  run."` + `"Unavailable"` cells); a present-but-empty snapshot (`{}`)
  renders an `"Unavailable"` row under its index; `merge_rule_snapshots`
  accepts `known_rule_ids` (e.g. indexes seen on that date's exceptions) so
  snapshot-less rules still appear explicitly. The parser ignores the new
  rows (it reads only B2/B3 + the Exceptions sheet), so old and new files
  keep importing with byte-identical commentary behavior.

## Tests run (repo root of this worktree)

- `uv run pytest tests/backend/test_exception_tracking_rule_table.py -q` →
  11 passed (grouped/ungrouped conditions, nested expectation groups,
  verbatim `excel_rule_headers` parity incl. a real `validate_rows`
  persisted snapshot, numeric R2/R10/R100 ordering, zero-exception enabled
  rule, disabled omission, absent legacy metadata, hostile-text literal
  storage, wrapping/dimensions, notes + generated-workbook upload
  round-trip reopened with openpyxl, merge union/notes/`known_rule_ids`).
- `uv run pytest tests/backend/test_exception_tracking_workbook.py
  tests/backend/test_round3_reports.py tests/backend/test_reports.py
  tests/backend/test_report_export_compound_values.py -q` → 51 passed.
- `uv run pytest tests/backend/test_exception_tracking_api.py
  tests/backend/test_exception_tracking_integration.py
  tests/backend/test_exception_tracking_run_capture_integration.py -q` →
  42 passed.
- `uv run pytest tests/backend -q` → 781 passed, 5 failed; the 5 failures
  (all in `tests/backend/test_runs.py`, e.g. `Rule 'R079' references unknown
  outcome column 'sa_flag'`) reproduce identically with my changes stashed
  (pristine base), so they are pre-existing and unrelated.
- `uv run ruff check` + `uv run ruff format` on the three touched files →
  clean.

## Unresolved risks / open items

1. Union policy (first-wins + notes vs. one row per distinct canonical
   identifier) is a proposal until Worker A/integrator confirm what the
   date-wide download passes. The workbook tolerates either mapping.
2. The 5 pre-existing `test_runs.py` failures should be triaged by the
   integrator (they fail on the base commit too).
3. Expectations cell is verbatim `excel_rule_headers`, not the additionally
   humanized Excel-tab text; equivalent for modern snapshots (see above) but
   the integrator should confirm Worker C's empty-rule hint work does not
   assume otherwise.
