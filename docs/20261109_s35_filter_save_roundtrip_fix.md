# S35 filter save round-trip defect — cause and fix

Date: 2026-11-09. Branch: `work/20261109-round4-integration`.
Follows `docs/20261109_s35_empty_population_analysis.md`, which documented the
load-side defect (family filter refs resolve to the first member only).

## Symptom

S35 group 1 showed `name == active OR name == inactive`. Changing both filters
to the concrete `status` column and saving succeeded with no error, but
reloading S35 showed `name == active OR name == inactive` again.

## Root cause (two coupled halves)

1. Save side, `frontend/src/api/configContent.ts::mapWorkflowToRowsColumnsConfig`
   (fixed here). Each filter column went through `columnToRef`, which collapsed
   any column belonging to exactly one family into a family reference. `status`
   belongs to family `Test` (`config/families/Test.yaml`: `[name, status]`), so
   saving wrote `{kind: column_family, name: Test}` and discarded the concrete
   `status` choice. The filter dropdown only offers concrete comparison columns
   (`PreparePage` passes `comparisonColumns`), and loaded filters are always
   concrete too, so the collapse never preserved intent — it only destroyed it.
2. Load side, `resolveConfigFilterRow` (pre-existing, unchanged). It assigns only
   `resolved[0]`, so the saved family ref resolved back to the first member
   `name`. This half was already recorded as a known defect with deferred
   family-expansion semantics; see the empty-population analysis linked above.

Reproduction (temporary vitest, since removed): saving filters
`system contains oomber AND (status == active OR status == inactive)` produced
`[{column: system}, {family Test}, {family Test}]`, which reloaded as columns
`["system", "name", "name"]`.

## Fix

- `mapWorkflowToRowsColumnsConfig` saves each filter as an explicit
  `{kind: "column", name}` ref — the same convention `keyColumns`,
  `aggregationColumns`, `extraColumns`, and `commentaryTemplateColumns` already
  use. Removed the now-unused `columnToRef` helper so it cannot be reused.
- Added a regression test in `configContent.grouped.test.ts`: a concrete
  family-member filter round-trips through save then load with its column,
  values, and grouping intact.
- Rebuilt `frontend/dist` so static previews carry the fix.

No change to load-side family semantics: configs already on disk with family
refs (including S35 as currently saved) still load to the first member until
re-saved. After this fix, re-applying the `status` choice and saving once
persists explicit refs and reloads correctly.

## Verification

- `src/api/configContent.grouped.test.ts` + `src/api/configContent.test.ts`:
  34 passed. `src/api` + `src/features/filters`: 176 passed, 2 skipped.
- `tsc --noEmit` clean for `configContent.ts`; `eslint` on touched files shows
  only pre-existing issues (identical count at HEAD).
- `git status` clean apart from the committed files; `git diff --check` clean.

## Note on validation artifacts in this worktree

During diagnosis, `config/rows_and_columns/s35.yaml` edits and an untracked
`config/rules/1109.yaml` were found in this worktree and first mistaken for
test artifacts (no backend or frontend test writes to `config/` — verified by
re-running the suites against a clean checkout). They were the user's live
validation edits. `1109.yaml` was deleted before this was understood and cannot
be restored from git; the S35 resets were content-identical (only `_version`
differed). Validation edits under `config/` in this worktree are user data and
must be left alone.
