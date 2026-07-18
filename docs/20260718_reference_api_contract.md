# API Contract (Frontend ↔ Backend)

> **Reconciliation pending.** The backend was implemented to a different contract than this one.
> See `reviews/20260718_review_frontend_handoff.md` for the concrete divergences and the recommended
> canonical contract before wiring the two halves together.

This is the client's expectation of the Django API. Worker B derived it from
`requirements/20260717_initial_requirement.md`; Worker A owns the implementation. Any change must
be reconciled here and in `frontend/src/api/schemas.ts` (the executable source of truth). Per the
folder plan, this reconciliation note lives in `docs/`, never in `planning/`.

All endpoints are same-origin under `/api`. Mutations send `X-CSRFToken` from the `csrftoken`
cookie. Responses are JSON and are Zod-validated on arrival.

## Files & headers

| Method | Path                                   | Body                              | Response            |
| ------ | -------------------------------------- | --------------------------------- | ------------------- |
| POST   | `/files/upload/`                       | multipart `file1`, `file2`        | `HeaderReport`      |
| GET    | `/files/presets/`                      | —                                 | `PresetSource[]`    |
| POST   | `/files/presets/load/`                 | `{ presetId, file1, file2 }`      | `HeaderReport`      |
| GET    | `/files/{sessionId}/values/?column=`   | —                                 | `ColumnValues`      |
| POST   | `/files/{sessionId}/validate-columns/` | `{ columns: string[] }`           | `{ valid, invalid }`|

`HeaderReport` = `{ sessionId, file1Name, file2Name, common[], file1Only[], file2Only[],
file1RowCount, file2RowCount }`. Comparison and validation operate on `common` columns only.

`ColumnValues.values[]` = `{ value, starred }`; `starred` marks a value present in only one file.
Starred values are not selectable as filter values.

## Filters

| Method | Path         | Body                         | Response          |
| ------ | ------------ | ---------------------------- | ----------------- |
| GET    | `/filters/`  | —                            | `SavedFilter[]`   |
| POST   | `/filters/`  | `{ name, rows[] }`           | `SavedFilter`     |

Filter row = `{ column, operator, value }`; operator ∈ `equals | not_equals | contains |
not_contains`.

## Rules

| Method | Path            | Body        | Response  |
| ------ | --------------- | ----------- | --------- |
| GET    | `/rules/`       | —           | `Rule[]`  |
| POST   | `/rules/`       | `RuleDraft` | `Rule`    |
| PUT    | `/rules/{index}`| `RuleDraft` | `Rule`    |
| DELETE | `/rules/{index}`| —           | `{ deleted }` |

A `Rule` has a server-assigned `index` (`R001`, `R002`, …), a `name`, optional `description`,
optional `conditions[]` joined by `conditionJoin` (`and`/`or`) with optional `conditionGrouping`,
and one mandatory `logic` clause in `value` (Value-against-Column) or `column`
(Column-against-Column) format.

## Runs & results

| Method | Path                          | Body                | Response      |
| ------ | ----------------------------- | ------------------- | ------------- |
| POST   | `/runs/`                      | `RunRequest`        | `RunResult`   |
| GET    | `/runs/`                      | —                   | `RunSummary[]` (≤10) |
| GET    | `/runs/{id}`                  | —                   | `RunResult`   |
| PATCH  | `/runs/{id}`                  | `{ reportName }`    | `RunResult`   |
| GET    | `/runs/{id}/export/?format=`  | `html` \| `csv`     | file download |

`RunRequest` = `{ sessionId, filters[], targetColumns[], ruleIndexes[], confirmFullSet }`. If no
filters are supplied and the combined row count exceeds the settings threshold (default 2000),
`confirmFullSet` must be `true`.

`RunResult.overall` carries the five required counts: `recordsLoaded`, `ruleViolationRowCount`,
`ruleViolationAttributeCount`, `changedRowCount`, `changedAttributeCount`. Per-rule stats and
detail tables live in `ruleResults[]`; change details in `changeDetails[]`.

## Settings

| Method | Path         | Body       | Response   |
| ------ | ------------ | ---------- | ---------- |
| GET    | `/settings/` | —          | `Settings` |
| PUT    | `/settings/` | `Settings` | `Settings` |

`Settings` = `{ presetSourcePath, remoteRuleConfigPath, fullSetConfirmThreshold }`.
