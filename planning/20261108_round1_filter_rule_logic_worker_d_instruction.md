# Round 1 Worker D — Filter/rule/grouping editor bugs and cleanup

Read [shared ownership/baseline instructions](20261108_round1_filter_rule_logic_shared_instruction.md) and the
linked round 1 requirement first. They are mandatory, including isolated testing,
new accepted-baseline worktree preparation, and documentation for every fix.

## Assignment

Implement Bug 1 (free-text contains), Bug 4 (R079 full root/group preview), and
Enhancements 1–6. Own FilterRowEditor/FilterBuilder/RuleEditor/GroupingTreeEditor
and their component tests; use C's hierarchy helpers without changing C-owned files.
Label filters FILTER X consistently; show hierarchical filter hints; replace all
applicable all-in-AND/OR shortcuts with Remove all groups in filter/condition/outcome
sections; retain clauses and block invalid save/run until explicit grouping is set.
Hide explanatory Row Filters/Filter Groups/Outcome Groups hints behind accessible
hover/focus icons. Remove Use Single Outcome. Show disabled Remove group controls
for nested child groups with tooltip naming the actual parent. Preserve root-group
removal and valid edits. Screenshot reference is in the original main checkout at
`screenshots/Screenshot From 2026-11-08 21-20-43.png`; it shows root Group 3 OR with
Group 1/2 AND. The current request text and shared contract describe its semantics.
Test free-text `oomber` survives add/save/reload, loaded R079 shows root OR, all three
remove-all actions preserve clauses and block incomplete saves, hierarchy labels,
nested disabled controls/tooltips, keyboard hint access and legacy single outcomes.
Coordinate state/API changes with C. Do not modify OverallSummaryCards.tsx.

## Handover

Maintain `docs/20261108_round1_worker_d_implementation.md` and
`reviews/20261108_round1_worker_d_delivery.md`. Record starting HEAD, item coverage,
root causes, interfaces, test commands/results, dependencies, ordered commit hashes
and limitations. Commit only your scoped changes. Run git diff --check. Do not
implement in another worker's files or dispatch other agents.
