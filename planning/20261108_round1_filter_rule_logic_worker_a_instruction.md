# Round 1 Worker A — Backend contract regression coverage

Read [shared ownership/baseline instructions](20261108_round1_filter_rule_logic_shared_instruction.md) and the
linked round 1 requirement first. They are mandatory, including isolated testing,
new accepted-baseline worktree preparation, and documentation for every fix.

## Assignment

Review persisted R079 outcome tree and rule catalog import/export/save behavior
against B4/E3. Add meaningful contract regressions under new owned
`tests/backend/test_round1_rule_grouping_contract.py`: four outcomes, root OR over
two AND branches, unchanged round trip retains canonical identity; malformed/missing
grouping is rejected while valid legacy single outcomes still work. Verify grouping
removal is frontend edit state, not a backend silent AND fallback. Publish evidence
that the existing API is sufficient, or document an actual backend defect before
making a minimal owned-rule-module fix. Do not invent schema/migration work to fill
this assignment. Do not duplicate existing tests without a distinct regression.
Run relevant rule/catalog/identity tests; explicitly distinguish UI checks owned by D.

## Handover

Maintain `docs/20261108_round1_worker_a_implementation.md` and
`reviews/20261108_round1_worker_a_delivery.md`. Record starting HEAD, item coverage,
root causes, interfaces, test commands/results, dependencies, ordered commit hashes
and limitations. Commit only your scoped changes. Run git diff --check. Do not
implement in another worker's files or dispatch other agents.
