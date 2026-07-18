# Frontend Handoff & API Contract Reconciliation

Date: 2026-07-18
Author: Worker B (frontend)

## Summary

The React client is feature-complete against `requirements/20260717_initial_requirement.md` and the
ownership split in `planning/20260718_plan_folder_structure.md`. It builds offline and passes lint,
type-check, unit/integration tests (61), a clean production build, and `npm audit` (0
vulnerabilities). No files in `planning/` were modified.

**Action required before wiring the two halves together:** the frontend and backend were built in
parallel to **different** API contracts. This must be reconciled to one canonical contract. The
divergences are enumerated below. The client's contract is codified in `frontend/src/api/schemas.ts`
and `docs/20260718_reference_api_contract.md`; the backend's is in `docs/api_reference.md` +
`docs/{files,rules,runs,exports}_api.md`.

## Divergences (client expectation → backend implementation)

| Area | Client (Worker B) | Backend (Worker A) |
| --- | --- | --- |
| Upload fields | `file1`, `file2` | `file_a`, `file_b` |
| Upload response | `{sessionId, common, file1Only, file2Only, file1RowCount, file2RowCount, ...}` | `{file_a_path, file_b_path, inspection:{common_columns, only_in_a, only_in_b, columns_a/b, file_a_name/b_name}}` |
| Session model | opaque `sessionId` threaded through calls | two server file **paths** passed on each call |
| Column values | `GET /files/{sessionId}/values/?column=` (per column) | `POST /files/filters/prepare/` returns all `column_values` + `requires_confirmation` |
| Target validation | `POST /files/{sessionId}/validate-columns/` | `POST /files/targets/validate/` `{target_columns, common_columns}` |
| Operators | `equals, not_equals, contains, not_contains` (+ `greater_than`, `less_than`) | `eq, neq, contains, ncontains` (+ `gt, lt, gte, lte`) |
| Rule fields | `column`, `value`, `conditionJoin`, `conditionGrouping`, `logic.format: value/column`, `logic.target` | `column_name`, `filter_value`, `condition_relation`, `grouping[]`, `logic.format: value_vs_column/column_vs_column`, `logic.target_value` |
| Rules list response | bare `Rule[]` | `{version, rules:[...]}` |
| Rule create response | full `Rule` | `{rule_id, message}` |
| Rule id path param | `/rules/{index}/` | `/rules/{rule_id}/` (same values, `Rxxx`) |
| Run execute | `POST /runs/` → flat `RunResult` (`overall`, `ruleResults`, `changeDetails`) | `POST /runs/execute/` → nested `{comparison, validation, common_columns, target_columns, filters_applied}` |
| Run identity | execute returns `{id, reportName, createdAt}` | execute returns **no** id/name; persistence is separate |
| Rename | `PATCH /runs/{id}/` `{reportName}` | `PUT /runs/{id}/rename/` `{report_name}` |
| Export | `GET /runs/{id}/export/?format=` (download link) | `POST /reports/export/` `{run_id|result_data, format}` |
| Settings / saved filters / presets | `GET|PUT /settings/`, `GET|POST /filters/`, `GET /files/presets/` | not implemented (no endpoints) |

## Recommended resolution

Adopt a single canonical wire contract, then let the **frontend adapt at its API boundary**
(`src/api/endpoints.ts` + `src/api/schemas.ts`) so components keep their camelCase domain model.
Concretely:

1. **Naming**: agree on snake_case on the wire (backend already ships it); the client maps to
   camelCase in `endpoints.ts`. Operators: standardize on the backend's `eq/neq/contains/ncontains`
   set and map labels in the client.
2. **Session**: replace the client's `sessionId` with the `{file_a_path, file_b_path}` pair carried
   in workflow state; pass both on `values`, `targets/validate`, and `runs/execute`.
3. **Column values**: switch the client to call `/files/filters/prepare/` once and index
   `column_values` by column (drop the per-column endpoint), and use `requires_confirmation` from
   that response instead of computing the 2,000-row threshold client-side.
4. **Run result**: add a client mapper `nested backend result → RunResult`
   (`comparison.rows_with_changes` → `overall.changedRowCount`, `validation.violation_count_by_rule`
   → per-rule counts, etc.). Confirm the response shapes of `GET /runs/` and `GET /runs/{id}/`
   (undocumented) so history/load can be mapped.
5. **Export**: change client to `POST /reports/export/`; since it is a download, either have the
   backend also expose a GET variant or have the client POST and stream the blob to a download.
6. **Missing endpoints**: decide owner for `settings`, saved `filters`, and `presets`
   (client references them; backend has none yet).

## Why the client was not rewritten in this pass

Four backend response bodies the client would need to map against — `GET /files/filters/prepare/`
(full shape), `GET /runs/` (list item shape), `GET /runs/{id}/` (detail shape), and the persisted
run's id/name/createdAt — are not specified in the backend docs. Rewriting the client to guess these
would produce silently-wrong mappings. The safe next step is a short joint agreement on the six
points above; the client changes are then mechanical and confined to `src/api/`.

## Endpoint inventory (backend, implemented)

files: `upload/`, `inspect/`, `filters/prepare/`, `filters/validate/`, `targets/validate/`,
`targets/input/` · rules: `` (list/create), `<rule_id>/` (get/put/delete), `remote/` ·
runs: `execute/`, `` (list), `<run_id>/`, `<run_id>/rename/` · reports: `export/`
