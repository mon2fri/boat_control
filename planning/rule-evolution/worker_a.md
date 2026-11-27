# Worker A — configuration rule evolution and save decisions

Read `README.md`, `shared_contract.md`, and the requirements first.

Branch: `feat/rule-evolution-worker-a`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-a`

Before editing, verify your current directory, branch, and common base supplied
by the integrator. Use this path as the explicit working directory for every
shell/edit operation; inherited agent cwd may still be the main checkout.
Do not create/reset a worktree yourself if the expected one is absent or dirty;
tell the integrator what you found.

## Assignment

Own the configuration database's lineage/revision history and rule-save flows.
Implement append-only before/after history with queryable identifier transitions,
separate stable business lineage and executable revision, decision/source/time
metadata, and additive Django migration/backfill.

Implement extensive-edit detection and the structured 409 confirmation contract.
Modify-current records a revision edge; save-as-new preserves the source and
creates no inheritable predecessor edge. Metadata/canonical no-ops do not
initiate recertification. Handle equivalent identities, stale confirmations,
reversion, existing target identities, and enabled selections explicitly.

Apply a consistent documented policy to UI saves, Copy/create, named config
imports, startup synchronization, archive/reinstate, and YAML. Identity reuse
must not silently merge lineages. Do not weaken hash validation or canonical
deduplication. Audit the existing config conflict handling before adding fields.

Publish your A→B service and A→C JSON contract early. Send the integrator an
interface skeleton and representative response/error payloads before the full
implementation. Expose a read-only history endpoint for C's history view.
Keep canonical identifier calculation unchanged unless a separately demonstrated
bug requires an integrator-approved fix.

## Ownership

- `backend/apps/rules/` including models, repository, serializers, views, URLs,
  new evolution service, and Django migrations.
- Rule import/config history touchpoints in `backend/apps/configs/views.py` and
  `backend/apps/rules/management/commands/migrate_rules_to_db.py`.
- New focused catalog/evolution tests and your delivery note.

Do not edit tracking storage, run capture, workbook/report rendering, frontend
files, or another worker's migration. B owns run-context integration; provide
the accessor it needs. Coordinate shared tests through the integrator.

## Required evidence

Test ordinary edits, metadata changes, reordering-equivalent no-ops, wholesale
condition/expectation replacement, both save decisions, canceled/invalid saves,
duplicate identity reuse/conflict, stale tokens, rollback, repeated YAML/startup,
legacy backfill, and a v1→v2→v3 chain with no intermediate runs. Prove the history
tables are in configuration storage and preserve old payloads/identifiers.

Run targeted checks in isolated settings. Do not seed the user's catalog.
Commit code/tests in reviewable chunks, then commit
`reviews/20261112_rule_evolution_worker_a_delivery.md`. Send hashes, API/service
contract, migration behavior, actual commands/results, and any unresolved issues
to the integrator. Do not push or merge into integration yourself.
