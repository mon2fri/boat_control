# Worker A — Backend rule schema, catalog and identity

Branch: `work/20261108-grouped-validation-worker-a`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-a`

Read the [shared contract](20261108_grouped_validation_shared_contract.md) and linked requirement first.
All shared ownership, safety, documentation and handover obligations apply.

## Assignment

Implement new outcome forms throughout rule serializers, dataclasses, validation,
CRUD/catalog storage, YAML/JSON import/export, repository lifecycle and canonical
identity. Audit all consumers of `rule.logic`; expose an explicit normalized accessor
so B does not infer semantics from incidental defaults. Retain legacy identity hashes.
Implement shared pure tree validation and string/null predicate helpers in your owned
new package, with published signatures and no runtime database dependencies. B owns
runtime integration; coordinate interfaces through docs. Ensure catalog response
serializers do not strip fields, and business edits use existing lifecycle policy.

Verify legacy golden identities, reordered AND/OR equivalence, changed outcomes,
round trips/restarts, malformed and omitted references, single-column comparison
compatibility, duplicate catalog handling and transactional invalid imports. Run
rule/catalog/identity backend tests and focused tests for new helpers.

## Required delivery

Commit source, meaningful regression tests, implementation documentation and your
delivery record. Document each fix as it is made. List exact ordered hashes for
reviewer cherry-pick, touched files, dependencies, acceptance criteria covered,
test commands/results and remaining issues. Run `git diff --check`. Stop after
handover; do not integrate, merge main, push, or start another worker.
