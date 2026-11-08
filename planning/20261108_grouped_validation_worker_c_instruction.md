# Worker C — Frontend domain, API mapping and persisted workflow

Branch: `work/20261108-grouped-validation-worker-c`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-c`

Read the [shared contract](20261108_grouped_validation_shared_contract.md) and linked requirement first.
All shared ownership, safety, documentation and handover obligations apply.

## Assignment

Implement domain/wire types, serialization/deserialization, runtime-to-indexed tree
mapping, configuration save/load/import/export and workflow state restoration for
filter groups and multiple outcomes. Wire execute requests and run/history mapping.
Own non-visual hooks including useRules/useRunExecution and their tests; coordinate
with D on component props and workflow actions in your documentation before edits.
Keep legacy single-outcome payloads compatible and prevent loaded data from silently
losing grouping, especially when columns/families are missing or expanded. Invalid
restored groups must block execution or show an actionable repair state, not become
an unrestricted run. Provide any reusable pure grouping utilities D needs without
changing D's components without explicit ownership handover.

Test config and API round trips for nested groups, legacy payloads, runtime ID
remapping/reorder, removal/reset, run restoration, complete outcome payloads,
family references, identity response handling and invalid configurations. Use fixtures
matching the shared contract while A/B work; reconcile with real integrated responses.

## Required delivery

Commit source, meaningful regression tests, implementation documentation and your
delivery record. Document each fix as it is made. List exact ordered hashes for
reviewer cherry-pick, touched files, dependencies, acceptance criteria covered,
test commands/results and remaining issues. Run `git diff --check`. Stop after
handover; do not integrate, merge main, push, or start another worker.
