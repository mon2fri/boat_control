# Worker D delivery — Exception Tracking Template optimization

Branch: `work/20261103-exception-tracking-worker-d`

## Scope delivered (frontend)

### Extra Columns for Commentary Template

- New collapsible card labelled **Extra Columns for Commentary Template** on
  page two, to the right of **Attribute Comparing Sections** and below
  **Extra Columns**.
- Ordered selection is independent of the existing Extra Column setting,
  attribute comparison sections and exception-table display choices.
- Empty selection appends no source/detail columns.
- Saved/loaded through Config for rows and columns as
  `commentaryTemplateColumns` (Worker C's frozen field).
- Run requests send the ordered `commentary_template_columns`.
- Legacy configs missing the field resolve to an empty selection; no stale
  session selection is retained.

### Exception Tracking table

- Default visible columns, in order: Exception ID, Exception Status,
  Commentary, Rule Index.
- All standard metadata and selected commentary-template columns are available
  through the accessible column chooser and hidden initially.
- Additional data columns come only from Worker B's `detail_columns` /
  `columns` metadata (the selected commentary-template setting); no inference
  from Extra Column or comparison sections.
- Paging defaults to 50 with 50/100/200/500 options.
- Sorting and filtering call Worker B's complete-dataset endpoint using
  `offset`, `limit`, `sort`, `order`, and `filter_<column>`; the API performs
  them before slicing. Filter options come from complete-dataset
  `available_filters`.
- Stable Exception ID and As-of selector behaviour are preserved.

### New Exceptions Only

- Checked-by-default toggle appears before running and on the result page.
- Checked scope includes New + NotCommented, excludes Commented from results and
  ordinary HTML/Excel exports; backend persistence remains all-exceptions.
- Existing results toggle through Worker C's saved-run
  `new_exceptions_only` query parameter without creating another run.
- Excel export receives the same scope flag; local HTML export renders the
  already-filtered result.
- Commentary templates are untouched and always include all exceptions.
- Empty scoped result explains how to reveal Commented exceptions.

## Contract alignment inspected

- Worker A: `docs/20261103_exception_tracking_template_storage_contract.md`
  (commit `5057fba`).
- Worker B: `docs/20261103_exception_tracking_template_optimization_contract.md`
  (commit `3a7f8e2`) and implementation `17da6ef`/`eb04b82`/`e32561e`.
- Worker C: `backend/apps/runs/template_columns.py`, run serializers/report
  views using `commentary_template_columns` and `new_exceptions_only`.

No backend files were modified.

## Tests / build

```bash
npm --prefix frontend test -- --run
# 54 files, 498 tests passed

npm --prefix frontend run build
# TypeScript + Vite build passed

npm --prefix frontend run build:inspect
# 5 tests passed

git diff --check
# clean
```

Focused coverage includes independent/ordered extra-column selection, config
roundtrip and legacy clearing, first-four column visibility/chooser, server
paging/sort/filter parameters, 50/100/200/500 page sizes, New Exceptions Only
default/scope request, saved-run scope reload, all-commented empty state, and
Excel export scope.

## Dependencies / evidence boundary

- Frontend tests are mocked/fixtures against the published A/B/C contracts.
- Worker A/B/C implementation commits were inspected in their worktrees but
  were not merged into this branch or the integration worktree during
  implementation.
- Reviewer must integrate A/B/C then D, rebuild `frontend/dist`, and verify in
  the browser that UI, imported workbook and both download entry points agree.
- No generated `frontend/dist`, live data, integration/main branch or backend
  files were modified or committed.
