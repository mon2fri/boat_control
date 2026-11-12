# Round 4 worker B: Commentary template rule summary

Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/round4/worker-b`

Branch: `work/20261109-round4-worker-b`

## Working agreement

Implement only Round 4 in `planning/round4/requirements_snapshot.md`; earlier rounds are regression context. Read `planning/round4/README.md` first. Work only in your assigned worktree/branch. Do not change main, user CSVs, config, screenshots, live databases, lockfiles without necessity, or another worker's files. Use synthetic isolated data for tests. Do not start a shared server or perform human UI acceptance. Commit your code, meaningful regression tests, and `reviews/20261109_round4_worker_b_delivery.md`; report commit hashes, files, tests actually run, unresolved risks, and API contracts. Do not mark unrun checks as passed. Coordinate shared contracts with the integrator early; do not edit another owner's files silently.

Use `uv run pytest <focused tests>` at repository root; frontend checks run from `frontend` with `npm test -- <paths>`, `npm run lint`, and `npm run build` as appropriate. Dependencies are not copied into new worktrees; install from lockfiles if needed. Preserve existing grouping, canonical rule identifiers, numeric rule ordering, formula protection, commentary import compatibility, and additional commentary columns.

## Assignment

Own Round 4 enhancement 2: add a readable enabled-rule table to the first commentary-template tab, after existing metadata/instructions. Columns: Rule index/name, Conditions, Condition Groupings, Expectations, Expectation Groupings, Rule Identifier. Each condition/expectation/group occupies a line in its cell, with wrapping and useful dimensions. Match exported Excel semantics using existing `backend/apps/reports/rule_headers.py::excel_rule_headers` and numeric rule sorting. Include enabled zero-exception rules; exclude disabled rules. Preserve nested group hierarchy, explicit operators, canonical identity, and safe literal Excel values.

Ownership: `backend/apps/exception_tracking/workbook.py`, a NEW `backend/apps/exception_tracking/rule_summary.py` if needed for preparing summary rows, and workbook/summary tests. Do not edit tracking api_services/views, frontend, reports/services.py or existing reports/rule_headers.py. Agree a keyword-only optional workbook input with A (recommended `rule_summaries`) and publish its exact shape early. A owns selecting/passing persisted scope-specific summaries. Your helper may normalize persisted run validation summaries; keep file ownership separate. Do not derive rows only from violations because enabled rules may have zero exceptions.

Report download summaries describe that run's enabled rule snapshots, not today's catalog. For date-wide tracking downloads, agree with A on a deterministic union of available persisted snapshots for that date, covering all date-known exceptions, keeping distinct canonical rules and documenting differing snapshots of the same rule. Do not silently claim unavailable historic rule logic; represent missing metadata explicitly and keep export usable. No new historical storage model unless proven necessary and agreed with integrator.

Keep TEMPLATE sheet name and parser metadata positions B2/B3, template version behavior, EXCEPTIONS columns, editable commentary rules and formula-injection protection backward compatible. Additive first-tab content must not break imports of existing or new files. Test grouped/ungrouped conditions, nested expectations, numeric R2/R10 ordering, zero-exception enabled rule, disabled omission, absent legacy metadata, hostile text, and generated workbook upload round trip. Reopen bytes with openpyxl to assert actual sheet content and wrapping; avoid tests that only mock workbook construction.
