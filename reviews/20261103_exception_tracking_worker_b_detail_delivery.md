# 2026-11-03 Exception detail template — Worker B delivery

## Status

`BACKEND IMPLEMENTATION COMPLETE — REVIEWER INTEGRATION REQUIRED`

Branch: `work/20261103-exception-tracking-worker-b`

This round implements the backend portion of "Commentary template exception
details and table identity", on top of Worker B's earlier exception-tracking
delivery.

## Commits

- `027b6c1` — docs: publish exception detail template contract for Worker D
- `37c81e5` — feat: append exception details to commentary templates
- `b28849c` — test: verify detail columns with real tracking storage

Earlier Worker B commits remain on the same branch.

## Changed files

- `backend/apps/exception_tracking/api_services.py`
- `backend/apps/exception_tracking/workbook.py`
- `docs/20261103_exception_tracking_api.md`
- `docs/20261103_exception_tracking_detail_template_contract.md`
- `tests/backend/test_exception_tracking_api.py`
- `tests/backend/test_exception_tracking_workbook.py`
- `tests/backend/test_exception_tracking_integration.py`

## Contract decisions

- Stable displayed identifier is the tracking `exception_id`. Results download
  and Exception Tracking download use the same IDs and workbook generator.
- Preferred run-result field is `exception_id` on each validation violation.
  Worker C can add it during capture. Older/current runs work through the
  documented fallback: canonical rule identifier plus configured key values in
  `result.key_columns` order, underscore-joined.
- Appended detail-column order follows the Results table:
  1. configured key columns,
  2. `Rule Index`,
  3. aggregation columns using display labels,
  4. configured exception/extra columns.
- Headers are deduplicated by trimmed, case-folded name. Original nine template
  columns and earlier appended columns win. Example with key `id,name`,
  aggregation `status,region`, extras `name,status,region,id,score`:
  `id, name, Rule Index, Region, score` (`Status` is already an original
  template column).
- Values come from `key_columns`, rule id, `grouping_values`, and
  `extra_values` respectively. Missing values become blank cells. Newest saved
  run for the As-of Date wins; older runs fill blanks; the first nonblank value
  for a duplicated Exception ID is kept.
- Both download entry points (`?as_of_date=` and `?run_id=`) resolve details from
  the same date-scoped saved-run context, so Results and Exception Tracking
  downloads agree when saved runs are available. A date without saved run
  context keeps the original nine columns.
- Workbook version remains `exception_commentary/v1`. Existing nine-column
  workbooks remain valid.
- Import requires the original nine columns in order and ignores every trailing
  column. Editing, clearing, adding, deleting, reordering, or renaming trailing
  informational values has no effect on validation or stored exception data.
- Unknown/duplicate/missing IDs, mismatched As-of Date, malformed headers,
  formulas in commentary, file size, and row limits remain enforced; updates
  remain atomic.

## Tests and results

Focused B suite, including the real Worker A repository boundary:

```text
uv run pytest -q tests/backend/test_exception_tracking_integration.py \
  tests/backend/test_exception_tracking_api.py \
  tests/backend/test_exception_tracking_workbook.py tests/backend/test_settings.py
53 passed
```

Full suite:

```text
uv run pytest -q tests/backend tests/contracts tests/integration
329 passed, 5 skipped, 1 failed
```

The one failure is the same pre-existing unrelated legacy rule migration test
(`KeyError: 'rule_id'`).

```text
uv run python backend/manage.py check
System check identified no issues (0 silenced).

uv run python backend/manage.py makemigrations --check --dry-run
No changes detected
```

Targeted B `ruff` checks pass. Targeted `mypy` reports only the existing
`backend/apps/rules/repository.py:218` baseline error.

## Integration dependencies

1. Worker C should persist `exception_id` on new run violations so the Results
   table and template do not need the fallback. The backend already supports
   both forms.
2. Worker D should display the wire `exception_id` when present, otherwise apply
   the fallback in the published contract, and use the same ordered/deduplicated
   detail headers.
3. The B/A integration test is skipped on the B-only branch and must be rerun
   after merging B with the accepted Worker A commits.
4. No integration/main merge was performed; no live tracking database was
   used.
