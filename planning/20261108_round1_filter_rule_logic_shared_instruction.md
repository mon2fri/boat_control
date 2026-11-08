# Round 1 — ownership, baseline and delivery contract

Authoritative round 1 request: [requirement](../requirements/20261108_req_filter_rule_logic_enhancement.md).
This snapshot copies the current working text from the original checkout on main;
it was not committed on main at setup time. Original index and edits were untouched.
Base implementation: integration commit `a552dbc` (includes R079 response fix).
These are instructions only; no round 1 implementation has been dispatched.

## Baseline and worktrees

Do not implement against the old worker branches without the accepted integration
fixes. Recommended manual preparation is a NEW per-worker round 1 branch/worktree
from the committed round 1 setup snapshot on integration. The reviewer/user should
create these before dispatch; this setup does not reset or move existing worker
branches. Existing worker worktrees may contain independent work. Do not blindly
cherry-pick integration into them, replay accepted deliveries, or change other trees.
Workers must report their actual starting HEAD. No spawning/delegation; user dispatches.

## Ownership and requirement mapping

| Worker | Ownership | Round 1 items |
| --- | --- | --- |
| A | Backend rule catalog/schema/identity contract regression tests | Verify B4 and E3 preserve saved outcome trees and identity; no speculative schema change |
| B | Backend runtime/reports/export and their tests | B3 Excel dict conversion; compound values across export paths |
| C | Frontend API/state/nonvisual hooks/groupingTree.ts; specifically OverallSummaryCards.tsx and its tests for this round | B2 applied-filter grouping in Overall Results; shared hierarchy formatting support for E1/B4 |
| D | Filter/rule/grouping editor components, pages and component tests | B1, B4, E1–E6 |

B1–B4 refer to the numbered Bugs; E1–E6 refer to Enhancements. C's limited ownership
of OverallSummaryCards.tsx is an explicit round 1 allocation; D must not edit it.
D owns GroupingTreeEditor.tsx and both editor UIs. C owns groupingTree.ts helpers;
D requests helper changes or uses its existing exports. A must not edit B's exports.
Exactly one owner per file. Record any ownership handover before editing.

## Behavioral decisions

- Free-text contains values must work independently of enumerated CSV suggestions.
  Preserve existing literal matching and null semantics; do not introduce regex.
- Show the entire grouping expression, including the root OR/AND, when loading or
  editing R079. A correct persisted tree must not be rewritten just to fix labels.
- Hierarchical hints use `overall: group 1 OR group 2` and child group lines with
  FILTER/CONDITION/OUTCOME labels appropriate to the section.
- Replace editor shortcut buttons that put all clauses into AND/OR with a
  `Remove all groups` action for filters, conditions and outcomes. Clear custom
  grouping only in that section; retain its clauses and values. With multiple
  clauses, do not silently switch to AND or permit ungrouped save/run. User can
  explicitly select flat AND/OR or rebuild valid custom groups afterward.
- Root grouping is visible. A nested group displays a disabled Remove group action
  with the tooltip `This group is part of group 3, please remove group 3 first to
  remove this group.` Substitute the actual immediate parent's displayed number.
  Use a focusable wrapper/help mechanism because disabled native controls cannot
  reliably receive hover/focus. Keep existing edit semantics unless required.
- Hover hints also work by keyboard focus and have accessible labels. Keep essential
  errors visible; hide explanatory hints, not validation failures.
- Remove Use Single Outcome action; retain supported legacy single-outcome rules
  and a safe way to remove individual clauses without silent data loss.
- Excel accepts CSV scalars only as cell values. Format compound maps explicitly,
  preserving all column/value context and null/blank distinctions; never pass a dict
  directly to openpyxl. Keep backend object-valued violation contract compatible
  with a552dbc; do not undo its frontend fix. Preserve export formula protections.

## Mandatory delivery and fix documentation

Each worker maintains `docs/20261108_round1_worker_<letter>_implementation.md` and
`reviews/20261108_round1_worker_<letter>_delivery.md` DURING implementation and every
fix. Include item coverage, design/interfaces, root cause, changes, regression
commands and actual results, dependencies, remaining issues, and ordered hashes.
Keep historical delivery records intact. No claim of browser verification based
only on component tests. Run git diff --check. Commit scoped source/tests/docs;
reviewer owns generated frontend/dist. Do not commit user configs/data or dependencies.

Use isolated copies of S35, outcome_groups and root CSVs; original/integration user
configs, active catalog, uploads, history and commentary must not be mutated by tests.
No push, merge main, reset/clean/stash user work, deployment or cross-worktree edits.

## Reviewer handoff

Inspect each delivery and docs independently before cherry-picking explicit commits
onto integration. Integrate A/B independently, C helpers/summary before D UI where
needed. Record original/result hashes and conflict resolutions. Run targeted backend
export/catalog tests, frontend mapping/component tests, then integrated suites and
production build. Commit generated bundle; keep user config changes excluded.
Verify real XLSX download for S35 + outcome_groups and browser root-group rendering,
free-text filters, hierarchical result summary, remove-all repair state, tooltips and
legacy save/load. Check accepted R079 and S35 fixes remain intact. Maintain a round 1
review/fix record with evidence and user UI instructions. Do not merge main; report
READY FOR USER UI VALIDATION only with all required delivery docs and checks.
