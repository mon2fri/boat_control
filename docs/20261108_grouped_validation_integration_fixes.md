# Reviewer integration fixes — grouped validation

Date: 2026-11-08. Branch: `work/20261108-grouped-validation-integration`.

## Fix 1 — execute A-materialized nested outcome trees

- **Finding / cause:** Worker B's `normalize_rule_outcomes` read the convenience
  fields as wire dictionaries and called a dict-only parser. Worker A's
  `rule_from_payload` returns `logic_grouping_tree` inside
  `rule.outcome_expression` as immutable `GroupingBranch` / `GroupingLeaf`
  instances. A dictionary-shaped runtime mock passed B's tests, but an actual
  catalog rule with a nested outcome tree failed with “Invalid
  logic_grouping_tree structure” during execution.
- **Change:** Runtime normalization now consumes A's explicit
  `outcome_expression` accessor and accepts its immutable tree nodes. Runtime
  predicate evaluation and grouping parse/validate/evaluate operations delegate
  to A's `apps.validation_logic` pure helpers, avoiding divergent semantics and
  depth limits. Existing detailed invalid-reference errors are retained.
- **Regression test:** `tests/backend/test_grouped_validation_integration.py`
  materializes the required four-clause expression via `rule_from_payload` and
  executes the exact opposite-flags truth table, including null and blank. It
  verifies five violations, both passing cases, and complete outcome detail.
- **Verification:**
  `uv run pytest -q tests/backend/test_grouped_validation_integration.py tests/backend/test_grouped_validation.py tests/backend/test_validation_logic.py`
  — 132 passed; `uv run ruff check backend/apps/runs/grouped_logic.py tests/backend/test_grouped_validation_integration.py`
  — passed.
- **Integration-fix commit:** `0992b78` (`fix: integrate grouped outcomes with normalized rules`).

## Manual worker follow-up prompt

> Please update Worker B's implementation and delivery records to document the
> integration defect: `Rule.logic_grouping_tree` in A's actual `Rule` model is a
> parsed immutable `GroupingNode`, not a wire dict. B's tests only constructed
> dict-shaped `SimpleNamespace` values and missed runtime rejection. Record the
> cause, the reviewer fix (consume `rule.outcome_expression`; use
> `apps.validation_logic` helpers), and the integrated `test_grouped_validation_integration.py`
> regression. Please also add equivalent real-`Rule` coverage in B follow-up work
> and correct delivery check results if needed. Do not edit the integration
> worktree or claim browser acceptance from component tests.

## Fix 2 — connect filter grouping to workflow, save, run and restore

- **Finding / cause:** D's `FilterBuilder` remained uncontrolled in
  `PreparePage`. `PreparePage` and `UploadPage` saved only filter rows, config
  loading dispatched only `setFilters`, `ResultsPage.buildRunRequest` omitted
  grouping, and deep-link restoration did not use C's grouped restore action.
  C's transport validators also allowed a newly authored multi-filter request to
  fall back to legacy AND. A real UI click on `+ Add filter` exposed a further
  integration defect: the newly strict config serializer threw during render and
  React Router replaced the page with its error boundary.
- **Change:** Wired relation/tree/mode/errors into the controlled editor, config
  load/save and run request; restored saved-run state through
  `restoreRunConfiguration`. Added internal, non-wire
  `filterGroupingMode`/`filterGroupingRequired` state so dormant custom trees can
  survive a temporary flat-mode switch while only the selected expression is
  persisted. Legacy configs/runs without grouping still default to AND; new
  multi-filter expressions require an explicit relation/tree. Config serialization
  now returns an error state instead of throwing during render, and disables save
  while an expression is invalid.
- **Regression evidence:** Added request/config mapper, reducer, state restoration,
  and `ResultsPage.buildRunRequest` tests. A real Chrome/Playwright smoke uploaded
  both sample CSVs, selected `ID`, entered Prepare, added two filters, selected
  CUSTOM GROUPS, created a group, and observed validation errors without a page
  error. Exact browser tooling/results are in the integration review and UI guide.

## Fix 3 — block missing references and preserve family expansion semantics

- **Finding / cause:** Rows/columns config loading discarded an unresolved flat
  filter even when its removal could broaden an AND expression. Rule config
  condition remapping could map an omitted saved `c0` to a later condition also
  assigned runtime `c0`. Rule config import proceeded with partial drafts after
  warnings. Family expansion always used AND for a saved tree leaf, changing
  positive any-match semantics (for both conditions and outcomes).
- **Change:** Unresolved filters now attach blocking restoration errors. Missing
  rule columns/families produce blocking invalid-group warnings; `RulesPage`
  refuses partial import for those errors. Missing tree leaves receive explicit
  `__missing_cN__` sentinels. Family expansion uses OR for positive predicates
  and AND for negative predicates within the original expression; flat grouped
  expressions are wrapped in a custom tree when required to preserve precedence.
  Unsupported legacy single-outcome family expansion is rejected rather than
  selecting a first member silently.
- **Regression evidence:** Added tests for flat/legacy unresolved filters,
  condition-index collisions, positive family expansion, missing flat outcomes,
  and save/run refusal for incomplete filter expressions. Full frontend and
  backend checks below include these cases.

## Fix 4 — reject grouping fields on one new outcome

- **Finding / cause:** A accepted `logic_relation`/`logic_grouping_tree` beside
  one `logic_clauses` entry, after which single-outcome normalization discarded
  those fields. The result did not change truth semantics, but it silently
  accepted an unsupported/contradictory representation.
- **Change:** Rule validation now rejects relation/tree fields on the new single-
  outcome form. Added a cross-layer regression.

## Shared-contract reconciliation

The wire names/tree shape and backward-compatibility rules are unchanged. The
review clarified runtime use of A's parsed `Rule.outcome_expression`, added
frontend-only active-mode/explicitness state, and fixed family expansion/missing
reference behavior. These clarifications are recorded in
`planning/20261108_grouped_validation_shared_contract.md`.

## Manual worker documentation follow-up prompts

Worker worktrees remain untouched. The following corrections are required in
the responsible implementation **and delivery** records before the worker
documentation gate is complete:

> **Worker A:** Please document and regression-test that a one-clause
> `logic_clauses` payload with `logic_relation` or `logic_grouping_tree` is
> rejected, because `normalize_rule_draft` otherwise strips those fields. The
> integration fix is in `backend/apps/rules/services.py` and
> `tests/backend/test_grouped_validation_integration.py`; include its cause,
> behavior and test result in both Worker A records.

> **Worker C:** Please update both Worker C records with the integration gaps
> found after combining C and D: page-level config load/save did not call
> `setFilterConfiguration`, `buildRunRequest` did not carry grouping, saved-run
> deep links did not use `restoreRunConfiguration`, invalid newly authored
> multi-filter expressions fell back to legacy AND, and unresolved flat filters
> could be dropped. The reviewer integration changes wire these paths and add
> strict new-vs-legacy handling; see `PreparePage.tsx`, `UploadPage.tsx`,
> `ResultsPage.tsx`, `WorkflowContext.tsx`, `mapping.ts`, and their regression
> tests. Document the cause/fix and integrated results.

> **Worker D:** Please update both Worker D records: the filter editor was not
> connected to workflow state because `FilterBuilder` was mounted uncontrolled,
> so its relation/tree did not survive config save/load or run submission. A
> strict config mapper also initially threw while rendering an incomplete row;
> the reviewer added a safe invalid-save state and disabled saving. Record the
> page integration gap, the reviewer fix/test, and that the real-browser smoke
> only covers the filter editor path (not full user acceptance).

> **Worker B:** Please update both Worker B records with Fix 1 above and the
> integrated Y/N compound case using A's materialized `Rule` object. Do not claim
> dictionary-only test doubles establish runtime compatibility.

## Integrated verification after fixes

The required backend run used isolated `GROUPED_VALIDATION_HOME` storage and
passed `774 passed in 5.67s`:

```text
GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-checks PYTHONPATH=backend \
  uv run pytest --ds=boat_control.grouped_validation_settings -q \
  tests/backend tests/contracts tests/integration
774 passed in 5.67s
```

Additional final results: Django `check` passed; `makemigrations --check
--dry-run` reported no changes; `mypy backend` passed for 94 source files;
changed-file Ruff passed; frontend suite passed 65 files / 599 tests; frontend
production build passed (with the existing >500 kB bundle warning); and
`git diff --check` passed. Full `ruff check backend tests` still reports only
unchanged baseline findings in the rules migration and rule-catalog test. The
complete command/result ledger is in
`reviews/20261108_grouped_validation_integration_review.md`.

The reproducible sample was independently evaluated through `apply_filters` and
an A-materialized grouped `Rule`: 11 selected (`1,2,3,4,5,6,8,9,10,14,15`),
3 passing (`1,2,8`), and 8 violations (`3,4,5,6,9,10,14,15`). The CSV reader
loaded row 6 as `None` and row 15 as `""`; row 14 whitespace remained literal.

The production build updates the tracked `frontend/dist` bundle as required by
the repository convention. Its generated template literals contain intentional
trailing spaces; `.gitattributes` scopes `git diff --check`'s EOL-whitespace
exception to `frontend/dist/**` only. Source/tests retain the normal whitespace
check.

The bounded cross-layer/UI/contract/sample fix commit is `fa17108`
(`fix: complete grouped validation UI integration`). Worker docs remain
uncorrected pending manual dispatch; see the prompts above.
