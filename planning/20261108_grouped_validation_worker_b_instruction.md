# Worker B — Backend grouped execution, filters and result context

Branch: `work/20261108-grouped-validation-worker-b`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-b`

Read the [shared contract](20261108_grouped_validation_shared_contract.md) and linked requirement first.
All shared ownership, safety, documentation and handover obligations apply.

## Assignment

Implement grouped overall filter execution and request plumbing; saved-filter and
rows/columns config persistence; grouped rule evaluation using A's normalized form;
null/blank semantics across filters, conditions and outcomes. Own family expansion
and correct grouping remapping. Audit run views, capture, history, reports and
tracking context for assumptions about one outcome. Ensure one violation per rule/key
and show all outcome columns/values without multiplying exception IDs. Preserve filter
application to baseline/comparison exactly as existing workflow intends; document it.
Use A's helpers once available rather than leaving divergent implementations.

Test truth tables including the two-group mutually exclusive Y/N example, null/blank
positive/negative operators in all three areas, literal substring matching, missing
columns, old configurations, named saved filters, run persistence/restoration, report
context and tracking identity. Own tests for these backend modules. Publish actual
execute/service signatures early. Do not modify A's rule modules; request changes.

## Required delivery

Commit source, meaningful regression tests, implementation documentation and your
delivery record. Document each fix as it is made. List exact ordered hashes for
reviewer cherry-pick, touched files, dependencies, acceptance criteria covered,
test commands/results and remaining issues. Run `git diff --check`. Stop after
handover; do not integrate, merge main, push, or start another worker.
