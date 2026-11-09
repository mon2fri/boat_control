# Round 4 integration review — 2026-11-09

Branch: `work/20261109-round4-integration` in `/home/zwj808/PycharmProjects/boat_control-worktrees/round4/integration`.
Base: `7f8701b` (rounds 1–3 grouped-validation tip). Main checkout untouched.

## Merged

- B `c90fcb2` via merge `1e8eb86` — rule summary table (`rule_summary.py`, `workbook.py`).
- A `7a4c8a3` via merge `86dd969` — run/date template scope (tracking API/service/views/serializers, frontend endpoints/ExportControls).
- C `fc7173a` via merge `8ec3829` — empty-rule hints (reports `services.py`).
- Integrator fixes (uncommitted at review time, to be committed with this note): `api_services.py` date-union/notes forwarding, `test_exception_tracking_run_scope.py` cache-key + first-wins expectation.

No old round-1 branches merged. No shared-file edit conflicts (ownerships disjoint).

## Requirement → change → test

1. Report download = current-run enabled exceptions; tracking download = date-wide set.
   - `api_services.export_run_commentary` (membership from persisted `violations_by_rule` exception IDs, commentary/status from live date records), `views` run/date branch, `endpoints.downloadRunCommentaryTemplate`, `ExportControls` uses runId scope.
   - Tests: `test_exception_tracking_run_scope.py` (14 tests: two-runs/one-date overlap+disjoint, later recapture, disabled rule, repeated identity across dates, empty run, NEO on/off, report vs tracking requests, subset import, run-scoped exactness, summary passthrough, legacy fallback) + `test_exception_tracking_api.py` updates.
2. First-tab enabled-rule table (Rule Index/Name, Conditions, Condition Groupings, Expectations, Expectation Groupings, Rule Identifier).
   - `rule_summary.py` (normalize/enabled-filter/first-wins `merge_rule_snapshots`/row builder via `excel_rule_headers` + `rule_sort_key`), `workbook.py` (`rule_summaries`, `rule_snapshot_notes`, rows from row 7, B2/B3 preserved, `_protect_text` formula guard).
   - Tests: `test_exception_tracking_rule_table.py` (11 tests, openpyxl byte round-trip, numeric R2/R10 order, zero-exception included, disabled omitted, hostile text, upload round-trip).
3. Empty-rule hint in exported HTML/Excel.
   - `reports/services.py` `_EMPTY_RULE_HINT`, HTML `<p>` + Excel A8 hint, no empty detail table, heading/TOC/counts retained, NEO-emptied rules share path.
   - Tests: `test_reports_empty_rule_hint.py` (11) + `test_reports.py` copy update. CSV unchanged (flat log, no per-rule sections) — documented in C delivery.

## Resolved findings

- A/B union divergence: A used latest-wins silent collapse; B proposed first-wins + notes. Resolved to B's policy: `collect_date_rule_summaries(date, known_rule_ids)` merges runs in ascending `run_id` via `merge_rule_snapshots`, first snapshot wins, differences returned as notes rendered in "Snapshot Notes" row, snapshot-less known IDs render "Unavailable". `_build_workbook` now forwards both `rule_summaries` and `rule_snapshot_notes` when supported.
- A test used removed `_BUILD_SUPPORTS_RULE_SUMMARIES` cache key and asserted latest-wins. Fixed to `_BUILD_SUPPORTED_PARAMS` and first-wins.
- Export contradictory args: `ExportQuerySerializer` still rejects `as_of_date`+`run_id` together (400); import serializer permits both but service validates workbook date vs run/date explicitly. No silent broadening.
- Date import now accepts safe partials (omitted date records preserved, counted in `total`); run import requires exact membership (`missing_exception_ids`/`unexpected_exception_ids`/`date_mismatch`). Intentional per Worker A spec; existing `test_exception_tracking_api` updated.
- Inspection: no membership leakage (run IDs from snapshot, sorted intersect), no display-ID misuse, no NEO leakage (run export ignores NEO/filters/pagination/catalog), zero-exception rules kept (summaries source, not violations), parser positions unchanged, partial upload preserves omitted rows, formula injection guarded (`_protect_text`/`_sanitize_csv_value`), group hierarchy verbatim from `excel_rule_headers`, empty exports retain metadata without empty tables.

## Remaining limitations / pre-existing

- Backend: 810 passed, 5 failed in `tests/backend/test_runs.py` (R079 `sa_flag` unknown outcome column). Reproduced on `worker-b` base+B tree — pre-existing, unrelated to Round 4, not fixed.
- Frontend: 662 passed / 3 skipped (74 files). `npm run lint` repo-wide has 153 pre-existing errors; touched `endpoints.ts`/`ExportControls.tsx` clean, `ExportControls.test.tsx` has 2 pre-existing errors (also present stashed).
- `npm run build` passes; `git diff --check` clean. `frontend/dist/` build output reverted (not committed).

## Date-summary / legacy policy

- Run scope: that run's `result.validation.rule_summaries` verbatim (snapshot, not live catalog). Legacy/no-snapshot runs raise `run_has_no_tracking_snapshot` explicitly, never date-fallback. Zero-exception run yields empty valid template.
- Date scope: union via `merge_rule_snapshots` over ascending `run_id`; first wins, differences noted with both run labels + identifiers; `known_rule_ids` from date exception `rule_index` fills snapshot-less rows as "Unavailable". No new storage, no live-catalog reads. Import of old files works (parser reads B2/B3 + Exceptions sheet only).

## Requested-copy typo

Requirement asks `Nil exception was captured by thie rule.` (`thie`). Used verbatim in HTML + Excel via `_EMPTY_RULE_HINT`; replaces old `Nil exception detected under current rule.` without duplication. Flagged for user copy review — one-constant rename when confirmed.

## Manual UI checklist (pending, not executed)

- Run A with selected rules; create run B with overlapping/disjoint exceptions on same date. Download commentary from reopened report A — only A's captured exceptions, independent of New Exceptions Only; tracking-date download contains date-wide set.
- Open both template first tabs: rule columns, multi-line conditions/expectations, nested groupings, numeric order, canonical identity and enabled zero-exception rules. Legacy fallback clearly marked.
- Fill commentary in report subset, upload, verify unrelated same-date exception commentary intact; date-wide upload still works.
- Export HTML and Excel with mixed empty/populated rules and all-empty run. Empty rules retain metadata + nil hint, no empty detail tables; populated counts correct.
