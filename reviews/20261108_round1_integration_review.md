# Round 1 filter/rule-logic integration review

Branch: `work/20261108-grouped-validation-integration`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/integration`
Requirement: `requirements/20261108_req_filter_rule_logic_enhancement.md`
Baseline for the round: `aa4ed06` (`docs: assign round one filter and rule enhancements by ownership`)

## Disposition

**READY FOR USER UI VALIDATION.** All four round 1 worker deliveries were reviewed
commit by commit and integrated in dependency order, with no cherry-pick
conflicts. Every numbered round 1 item was verified independently — backend
export reopened as a real XLSX, frontend contract/editor regressions, and
headless Chrome against the rebuilt production bundle. One pre-existing
baseline defect that blocks the user's own `ui-flags-filter-eq/-neq` configs
was found and fixed by the reviewer with a regression test. Full manual user
acceptance remains pending and is not claimed as complete.

Two pre-existing baseline behaviours are **not** fixed here and are documented
as known limitations: a column-family filter resolves to only the first member
of the family (finding 3), and the "Outcome groups"/"Filter groups" hierarchy
lines use lower-case leaf labels while the row labels are upper-case
(finding 4, cosmetic).

## Delivery discovery and cherry-pick audit

Each round 1 branch was compared against `aa4ed06` with `git log`,
`git diff --name-status` and full patch review. No worker branch contained a
previously integrated commit or a dependency commit that had to be skipped;
all ten accepted commits applied cleanly, so **no conflict resolutions were
required** and no duplicate was created.

| Worker | Original commit | Integration commit | Subject |
| --- | --- | --- | --- |
| A | `9f08f6a3b6d0ea803ef436cfb6e192630255d809` | `ae16586` | fix: preserve rule import validation errors for invalid grouping |
| A | `dedaaa7c4c30d13dacbf73933a16f4f2154e9b64` | `6bbf791` | test: add round1 rule grouping contract regressions |
| A | `b9ab55dfc0537a0954681a2310d075502dfbc919` | `51dced1` | docs: record round1 worker A grouping contract work |
| B | `699a0d89e503751537b9fb6ce52f739266f53a1f` | `8917365` | fix: format compound report values for excel export |
| B | `113f055df8ede81722cb1c3d4d0423abb580ecd9` | `5239125` | docs: record round one compound export delivery |
| C | `82c9379c0c3e644713dbd8aa8efd8b6707cb33f2` | `cd31d09` | feat(frontend): support section labels in grouping hierarchy formatting |
| C | `8ec444ba3045c5998f1add2d216975f32fd3d858` | `33e20e5` | fix(frontend): show persisted applied-filter grouping in overall results |
| C | `f9fd4c494aef9c75ed5d9224dbc9ff5f09b53d33` | `40730cc` | docs: record round 1 overall results grouping delivery |
| D | `777890d10d9313f4a539c02a51971926aae6fe3b` | `e4804fe` | feat(frontend): implement round one filter and grouping editor fixes |
| D | `95d5cc7133a4bcd54857241b5467fead71b7614f` | `a686092` | test(frontend): cover round one filter and grouping editor behaviour |
| D | `ac17b61873560a07894266a48cbcf6540771ea0e` | `af0400c` | docs: record round 1 Worker D implementation and delivery |

Integration order: A (independent) → B (independent) → C shared helper →
C summary → D editor UI. C's helper commit was integrated before D because D's
editor consumes `formatGroupTreeHierarchy`; C's change is backward compatible
(the new third argument is optional), so D required no source adaptation.

### Ownership compliance

- C owns `frontend/src/features/rules/groupingTree.ts`,
  `frontend/src/features/results/OverallSummaryCards.tsx` and the frontend
  API/state layer; D edited none of them.
- D owns the filter/rule/grouping editors, `CollapsibleCard.tsx` and the new
  `SectionHint.tsx`; C edited none of them.
- B owns `backend/apps/reports/services.py`; A owns rule catalog/identity
  behaviour and touched only `backend/apps/configs/views.py` (import error
  reporting). Neither worker edited the other's files.
- No worker committed `frontend/dist`, user configuration, uploads, databases
  or history. `git diff --name-status aa4ed06..work/...-worker-*` contained no
  `config/`, `data/` or `frontend/dist` path for any worker.

### Documentation gate

All four workers shipped both required records, and each implementation record
states the starting HEAD, item coverage, root cause, interfaces, exact
commands and results, dependencies, ordered hashes and limitations. Worker
records were read in full; worker claims were re-verified rather than accepted
(see the validation ledger). The records attribute reviewer work separately and
do not claim browser acceptance from component tests.

## Requirement coverage — independent evidence

| Requirement | Evidence | Result |
| --- | --- | --- |
| **B1** Row Filters "contains" accepts and preserves free text | Chrome: typed `Bloomberg` into the `system contains` value picker → chip `☑Bloomberg` accepted; **Save to new config** wrote `filter_values: [oomber, Bloomberg]` into the saved YAML. Component regression: `FilterBuilder.test.tsx` "keeps a free-text contains value through add, save and reload". | Pass |
| **B2** Overall Results shows the full applied filter grouping from saved-run data | Isolated saved run (`/tmp/opencode/round1-review/app/s35_r079_run.json`, tree `and(c0, or(c1,c2))`) → `summarizeAppliedFilters` returned `overall: FILTER 1 AND group 1` / `group 1: FILTER 2 OR FILTER 3`. Chrome on the rebuilt bundle rendered the same two lines on the Results page and again after a `/results/<run-id>` deep-link reload. | Pass |
| **B3** S35 + outcome_groups/R079 downloads a valid Excel workbook | Pre-fix module (extracted from `8917365^`) reproduced the reported error exactly: `ValueError: Cannot convert {'sa_flag': 'Yes', 'cva_flag': 'Yes'} to Excel`. Post-fix `/api/reports/export/` returned HTTP 200; the reopened workbook has 7 sheets, 14 R079 rows, **0 dict-valued cells**, and observed flags preserved (`sa_flag=Yes, cva_flag=Yes`, `sa_flag=(null), cva_flag=Yes`). Browser download reopened identically. Formula protection and legacy scalar exports verified by `tests/backend/test_report_export_compound_values.py`. | Pass |
| **B4** Loaded R079 displays its complete hierarchy including the overall root OR | Chrome, R079 editor: tree test ids `tree-Group 3`, `tree-Group 1`, `tree-Group 2`; outcome preview `overall: group 1 OR group 2` / `group 1: outcome 1 AND outcome 2` / `group 2: outcome 3 AND outcome 4`. | Pass |
| **E1** Filter hints use hierarchical formatting | Chrome hint block: `overall: filter 1 AND group 1` / `group 1: filter 2 OR filter 3`; `filterGrouping.test.ts` covers nested and flat forms. | Pass |
| **E2** FILTER X labels | Chrome: rows render `FILTER 1`, `FILTER 2`, `FILTER 3`; `FilterRowEditor.test.tsx` asserts the visible label. | Pass |
| **E3** "Remove all groups" per section, clauses preserved, invalid save/run blocked | Chrome (filters): rows stayed at 3, grouping select cleared, blocking message shown, **0** execute requests issued, alert `Row filter grouping must choose AND, OR, or a custom grouping expression when multiple clauses are configured.` Chrome (outcomes): 4 outcome groups preserved, `Save rule` produced no PUT and showed `Choose AND, OR, or CUSTOM GROUPS to combine multiple expected outcomes`. Component regression for conditions in `RuleEditor.test.tsx`. | Pass |
| **E4** Explanatory hints behind accessible hover/focus icons | Chrome: `.section-hint-icon` has `role="img"`, `aria-label="Row filters help"`, `tabindex="0"`, tooltip visible on keyboard focus. Component regression asserts focus and tooltip text for Row filters and Filter groups. | Pass |
| **E5** "Use Single Outcome" removed, legacy single outcomes usable | Chrome: 0 `Use single outcome` buttons on the R079 editor; the legacy `Catch-All Rule by ID` rule opened, saved unchanged (HTTP 200) with the legacy `logic` payload and no grouped fields. | Pass |
| **E6** Nested groups show disabled Remove group with the parent named | Chrome: `Remove Group 1` / `Remove Group 2` disabled, `Remove Group 3` enabled, tooltips read exactly `This group is part of group 3, please remove group 3 first to remove this group.` with `tabindex="0"` on the wrapper. | Pass |
| Legacy canonical IDs, configuration round trips | Worker A contract file asserts the golden identity `CBR1_1FB1N7BHJ3WTCD3BB1KW` is unchanged across an unchanged catalog PUT, and that import/export preserves tree + identity. Legacy single-outcome identity preserved (browser PUT above). | Pass |
| Previously accepted R079 save/response and S35 run-response fixes | `frontend/src/api/r079GroupedRunResponse.test.ts`, `frontend/src/api/s35LegacyRunResponse.test.ts` and the reviewer smoke tests still pass in the full suite; R079 save/reload verified again in Chrome. | Pass |

## Findings

### Finding 1 (baseline, fixed by reviewer) — a saved config operator in wire spelling produced an unusable run

- **Severity:** high for the user's own retest path.
- **Cause:** `frontend/src/api/configContent.ts` `resolveConfigFilterRow` copied the
  persisted operator straight into the domain model
  (`row.operator as FilterRow["operator"]`), while rule conditions were
  normalised through `CONFIG_TO_DOMAIN_OPERATOR`. A config that persists the
  wire spelling (`eq`, `neq`, `ncontains`) therefore produced a filter row whose
  operator was not a domain operator; `mapFilterOperatorToWire` then returned
  `undefined`, the wire request omitted `operator`, the run-request schema
  rejected the payload and the UI showed only **“The run failed unexpectedly”**.
  The user's `config/rows_and_columns/ui-flags-filter-eq.yaml` and
  `ui-flags-filter-neq.yaml` persist exactly those spellings.
- **Evidence:** reproduced in Chrome on the user's own `ui-flags-filter-eq`
  config (run failed, 0 execute requests) and reproduced deterministically in
  `resolveRowsColumnsConfig` → `mapRunRequestToWire` → `wireRunRequestSchema`
  (`filters[0].operator` → `expected string, received undefined`).
- **Fix:** reviewer-authored, one line, in `resolveConfigFilterRow`; regression
  in `frontend/src/api/configContent.filterOperator.test.ts` (7 tests). Details
  in `docs/20261108_round1_integration_fixes.md`.
- **Status:** fixed. The same Chrome flow now runs and emits
  `{"column":"cva_flag","operator":"eq","filter_values":["Yes"]}`.
- **Not a round 1 regression:** `frontend/src/api/mapping.ts`,
  `configContent.ts`, `wire.ts` and `lib/grouping.ts` are byte-identical between
  `aa4ed06` and the round 1 HEAD.

### Finding 2 (baseline, not fixed) — a column-family filter resolves to its first member only

- **Severity:** medium; affects the user's current `s35` and
  `ui-flags-active-systems` configurations.
- **Cause:** `resolveConfigFilterRow` uses `colResult.resolved[0]`. For the
  `Test` family (`name`, `status`) the saved filter `Test equals active`
  becomes `name equals active`.
- **Evidence:** the Chrome run request for the user's `s35` config contained
  `{"column":"name","operator":"eq","filter_values":["active"]}`, so rows 2–3 of
  that configuration select nothing and the R079 run returned 0 violations.
- **Impact:** the user's `s35` retest will show an empty population for two of
  its three filters. This is pre-existing behaviour, not introduced by round 1.
- **Disposition:** reported with a targeted follow-up prompt; not fixed here
  because the correct semantics (expand a family into one row per member and
  remap the grouping tree) change run semantics and are outside the round 1
  requirement. The UI guide documents the workaround.

### Finding 3 (baseline, cosmetic) — hierarchy leaf labels are lower-case

- The editor hierarchy lines use `filter 1` / `condition 1` / `outcome 1`
  (matching the pre-existing outcome hierarchy wording and the requirement's
  own example), while the visible row labels are `FILTER 1` / `Condition 1` /
  `Outcome 1`, and the new Overall Results summary uses `FILTER 1`. Recorded
  for consistency review; not a defect.

### Finding 4 (worker observation, no defect) — Worker B's export audit

Worker B audited every `export_excel` data cell and confirmed the exception
commentary workbook already coerces detail metadata before openpyxl, so no
second dict path exists. The reviewer's own reopen of the generated workbook
found 0 dict-valued cells across all 7 sheets, which corroborates the audit.

## Exact validation record

All reviewer commands ran in the integration worktree. Backend gates used the
isolated settings module with
`GROUPED_VALIDATION_HOME=/tmp/opencode/round1-review/backend` and
`PYTHONPATH=backend`; Django test databases and exception tracking were
temporary. The user's active catalog, configs, uploads, history and commentary
were never read or written by these commands.

| Command | Result |
| --- | --- |
| `GROUPED_VALIDATION_HOME=/tmp/opencode/round1-review/backend PYTHONPATH=backend uv run pytest --ds=boat_control.grouped_validation_settings -q tests/backend/test_round1_rule_grouping_contract.py tests/backend/test_report_export_compound_values.py` | **18 passed** (A 13 + B 5) |
| `npm --prefix frontend test -- --run <11 round 1 focused files>` | **108 passed** (11 files) |
| `GROUPED_VALIDATION_HOME=... uv run pytest --ds=boat_control.grouped_validation_settings -q tests/backend tests/contracts tests/integration` | **792 passed** |
| `npm --prefix frontend test -- --run` | **647 passed, 3 skipped** (74 files; 71 passed / 3 skipped) |
| `npx --prefix frontend tsc -b frontend/tsconfig.app.json --pretty false` | Passed (no output) |
| `npm --prefix frontend run build` | Passed. `dist/assets/index-Blsa1AJ5.js` (734.90 kB), `dist/assets/index-fNqmScvO.css` (48.00 kB); existing Vite >500 kB chunk warning only. |
| `uv run ruff check backend/apps/configs/views.py backend/apps/reports/services.py tests/backend/test_round1_rule_grouping_contract.py tests/backend/test_report_export_compound_values.py` | All checks passed |
| `uv run mypy backend` | Success: no issues found in 94 source files |
| `git diff --check` | Clean (see the commit that closes this review) |

Environmental/baseline notes, recorded separately from introduced defects:
the repository-wide Ruff baseline findings in unchanged files were not
re-litigated; the chunk-size warning is pre-existing; the `new_exceptions_only`
scope filters previously stored exceptions, so repeated runs in one isolated
home can show 0 violations — an expected application behaviour, not a
round 1 regression.

## Browser evidence

Headless Chrome (`/usr/bin/google-chrome`, Playwright) against an **isolated**
server on `127.0.0.1:45307` with
`GROUPED_VALIDATION_HOME=/tmp/opencode/round1-review/app2`. The user's own
`trigger.py` server on `127.0.0.1:45303` was **not** stopped or restarted; it
serves the rebuilt bundle from disk (`index-Blsa1AJ5.js`, HTTP 200) and needs
only a hard refresh.

Verified in the browser against the rebuilt bundle:

- assets `200 /assets/index-Blsa1AJ5.js` and `200 /assets/index-fNqmScvO.css`;
- B1 free-text value accepted and persisted into a saved config;
- E2 `FILTER 1/2/3` row labels; E1 hierarchical hint; E4 focusable hint icon
  with tooltip on keyboard focus;
- E5 no “Use single outcome”; legacy single-outcome rule loads and saves
  unchanged (HTTP 200);
- B4 R079 editor shows `Group 3` (OR) above `Group 1`/`Group 2` and the
  `overall: group 1 OR group 2` preview; E6 nested disabled Remove group with
  the exact parent-named tooltip;
- E3 outcome remove-all keeps 4 clauses, blocks the save (no PUT) and shows the
  explicit-AND/OR message; filter remove-all keeps 3 rows and blocks the run
  (0 execute requests) with the grouping error alert;
- B2 the run request carries the persisted nested tree and the Overall Results
  shows `overall: FILTER 1 AND group 1` / `group 1: FILTER 2 OR FILTER 3`,
  also after a `/results/<run-id>` reload;
- B3 the browser Excel download reopened with 7 sheets, 14 R079 rows and 0
  dict-valued cells, observed flags preserved.

No browser page errors were reported in any flow.

This is component/browser evidence for the listed items only. It is **not** a
substitute for the numbered manual user acceptance in
`docs/20261108_round1_ui_verification.md`.

## Preserved user work

`git status` before integration showed the user's modified
`config/rows_and_columns/s35.yaml` and `config/rules/rules.yaml`, the new
`config/filters/1c12cde0dd5c.yaml`, `config/rows_and_columns/filter_logic_grouping.yaml`,
`config/rows_and_columns/ui-flags-*.yaml`, `config/rules/catch-all-rules.yaml`,
`config/rules/outcome_groups.yaml`, `config/rules/ui-*.yaml` and
`docs/20261108_root_csv_flag_ui_setup.md`. None of them is touched by any
accepted worker commit or by the reviewer fix; they remain uncommitted and
excluded from every commit on this branch. SHA-256 checksums of all of those
files plus the six `data/uploads/*.csv` files were captured before the work and
re-verified afterwards — every file matched (see the UI guide for the table).
No worker worktree, branch, user database, upload, history or commentary was
modified; no push, deployment, main merge or worktree/branch deletion was
performed.

## Remaining issues

1. **Manual user acceptance is pending.** The numbered steps in
   `docs/20261108_round1_ui_verification.md` must be executed by the user.
2. **Finding 2 (baseline)** — a column-family filter resolves to its first
   member only, so the user's `s35` rows 2–3 select nothing. Workaround
   documented in the UI guide; follow-up prompt in the fix record.
3. **Finding 3 (baseline, cosmetic)** — hierarchy leaf label case differs
   between the editor and the results summary.
4. Repository-wide Ruff baseline findings in unchanged files remain.

## Final state

- Disposition: **READY FOR USER UI VALIDATION**.
- Branch/worktree: `work/20261108-grouped-validation-integration` at
  `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/integration`.
- Integration HEAD: reported in the final handoff message.
- Review: `reviews/20261108_round1_integration_review.md`.
- Fix record: `docs/20261108_round1_integration_fixes.md`.
- UI guide: `docs/20261108_round1_ui_verification.md`.
