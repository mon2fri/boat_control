# Worker D — Frontend filter and rule editors

Branch: `work/20261108-grouped-validation-worker-d`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-d`

Read the [shared contract](20261108_grouped_validation_shared_contract.md) and linked requirement first.
All shared ownership, safety, documentation and handover obligations apply.

## Assignment

Add the rule-condition-style grouping interaction to Row Filters. Add multiple
value-against-column outcomes and AND/OR/custom nested grouping to Rule Logic.
Reuse existing grouping interaction; keep rule conditions and single column-against-
column mode usable. Coordinate with C for domain/state/transport changes; do not
edit API/state modules yourself. Own visual pages/components and their component
tests. Show full expressions with unambiguous grouping and accessible labels,
keyboard controls, add/remove actions and actionable invalid-reference feedback.
Do not invent an approval workflow or deferred business metadata UI.

Test the two AND groups joined by OR, simple AND/OR, removing referenced clauses,
mode switching without silent data loss, single/empty configuration behavior,
restored nested filters/outcomes, save/run validation and accessible interactions.
Update null/blank help text to match all four operators. Run focused component tests;
record build/type errors attributable to pending C dependencies honestly. Publish
component integration requirements for C early.

## Required delivery

Commit source, meaningful regression tests, implementation documentation and your
delivery record. Document each fix as it is made. List exact ordered hashes for
reviewer cherry-pick, touched files, dependencies, acceptance criteria covered,
test commands/results and remaining issues. Run `git diff --check`. Stop after
handover; do not integrate, merge main, push, or start another worker.
