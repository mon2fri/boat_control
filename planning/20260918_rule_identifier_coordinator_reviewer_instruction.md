# 2026-09-18 Canonical rule identifier — coordinator/reviewer instruction

## Mission

Coordinate and review the complete delivery described by:

- `requirements/20260918_validation_rule_identifier.md`; and
- `planning/20260918_canonical_business_rule_identifier_implementation_plan.md`.

Use no more than four implementation workers. The coordinator owns repository isolation, branches,
worktrees, dependency gates, integration, cross-worker review, full verification, documentation
convergence, and the final release decision. A worker reporting completion is not sufficient: the
coordinator must independently verify every requirement and return deficient work for revision
until no required item remains open.

## Assigned workers

1. **Worker A — canonical identity and SQLite catalog foundation**
   - Instruction: `planning/20260918_rule_identifier_worker_a_identity_store_instruction.md`
2. **Worker B — backend catalog/configuration APIs and migration**
   - Instruction: `planning/20260918_rule_identifier_worker_b_catalog_api_instruction.md`
3. **Worker C — run propagation, persistence, contracts, and reports**
   - Instruction: `planning/20260918_rule_identifier_worker_c_run_contract_instruction.md`
4. **Worker D — frontend catalog, enablement, configuration, and pagination**
   - Instruction: `planning/20260918_rule_identifier_worker_d_frontend_instruction.md`

Do not create a fifth implementation worker. The coordinator may perform small integration fixes,
but must not silently absorb an incomplete worker assignment; return substantive omissions to the
owning worker.

## Mandatory coordinator loop

For every gate and worker handoff, repeat this loop until it passes:

1. **Inspect** the relevant requirements, plan, current code, worker diff, and test evidence.
2. **Review** correctness, compatibility, security, data migration, failure atomicity, and ownership.
3. **Test** independently with the gate commands and focused adversarial cases.
4. **Document** findings with file/line evidence in the coordinator review document.
5. **Revise** by returning concrete failed items to the owner; integrate only after corrections pass.
6. **Re-test** the revised branch. Never accept “known follow-up” for a required item.

The coordinator finishes only when implementation, tests, product/API documentation, migration
guidance, and the canonical implementation plan all describe the delivered behavior consistently.

## Branch and worktree setup

The coordinator alone creates and removes task worktrees and task branches. Workers must not work in
the user's original working tree or create their own alternative branch topology.

### 1. Protect the starting workspace

Before creating anything, run read-only inventory commands:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git worktree list
```

Record the baseline commit and all pre-existing modified/untracked paths in the coordinator review.
Treat every pre-existing change as user-owned. Do not stash, reset, clean, overwrite, or commit
unrelated user changes.

The instruction/plan documents must be present in the chosen baseline. If they are uncommitted,
create a narrow coordination commit containing only the requirement/planning instruction documents,
or obtain an agreed baseline from the user. Never include unrelated dirty files merely to make a
clean branch point.

### 2. Create the integration branch/worktree

Use an explicit baseline commit and dedicated paths outside the original repository directory. The
recommended topology is:

```text
branch: work/cbri-integration
worktree: ../boat_control-worktrees/integration

branch: work/cbri-worker-a
worktree: ../boat_control-worktrees/worker-a

branch: work/cbri-worker-b
worktree: ../boat_control-worktrees/worker-b

branch: work/cbri-worker-c
worktree: ../boat_control-worktrees/worker-c

branch: work/cbri-worker-d
worktree: ../boat_control-worktrees/worker-d
```

Create the integration branch first, then create each worker branch from the exact integration
baseline. Use `git worktree add ... -b ... <baseline>` after validating that neither the target path
nor branch already exists. Do not use force flags. If a branch/path exists, inspect it and resolve
ownership rather than deleting it.

Place worker-specific environment artifacts inside each worktree where practical. Do not share a
mutable SQLite database, test result directory, frontend development server, or generated config
directory between workers. Tests must use temporary/overridden paths and isolated databases.

### 3. Give each worker a bounded handoff

For every worker, provide:

- its absolute worktree path and branch name;
- its instruction document;
- the baseline/integration commit hash;
- current dependency-gate status;
- files exclusively owned by that worker;
- shared files it must not edit without coordinator approval; and
- the required commit/handoff format.

Workers commit only their scoped changes to their own branches. Each handoff must include commit
hashes, changed-file inventory, migrations, exact test commands/results, documentation changed,
remaining risks, and confirmation that `git diff --check` passes.

### 4. Integrate safely

Integrate worker commits into `work/cbri-integration` using non-destructive cherry-picks in the gate
order below. Resolve conflicts in the integration worktree, preserve both owners' intended behavior,
and send material conflict resolutions back to the relevant workers for review. Never use
`git reset --hard`, force checkout, force push, or broad cleanup.

After each integration batch, run its focused gate tests before accepting the next dependent batch.
Do not delete worker branches/worktrees until final verification passes and their commit hashes are
recorded. Worktree cleanup, when authorized, must use `git worktree remove` on the exact known task
path and must not discard uncommitted worker changes.

## File ownership and shared-file policy

Primary ownership:

- Worker A: new identifier/catalog model, migration, canonicalizer, and repository foundation files.
- Worker B: backend rule/config endpoints, serializers, legacy migration command, launch integration,
  and backend rules/config tests.
- Worker C: run/result/report propagation, machine-readable shared contracts, contract tests, and
  backend API documentation.
- Worker D: frontend API/domain/mapping/hooks/components/pages/tests and rebuilt frontend output.
- Coordinator: planning instructions, ownership matrix, convergence reviews, conflict resolutions,
  and final documentation consistency.

The following are shared integration hotspots and require coordinator sequencing:

- `backend/apps/rules/services.py`
- `tests/contracts/v1/contract_schema.json`
- `tests/contracts/v1/examples.json`
- `frontend/src/api/wire.ts`
- `frontend/src/api/mapping.ts`
- `docs/20260718_rules_api.md`
- `docs/20260718_contract_api_final.md`
- launcher files and generated `frontend/dist/`

Only the assigned owner edits a hotspot during its gate. Another worker submits the required shape
in its handoff rather than editing the same file concurrently. The coordinator may reassign a file
in writing before work starts, but there must be exactly one active owner at a time.

## Dependency and integration gates

### Gate 0 — Baseline and contract acknowledgement

Before implementation:

- Confirm all workers read the requirement, canonical plan, coordinator instruction, and their own
  instruction completely.
- Freeze the canonical identifier format (`CBR1_` plus 20 Crockford Base32 characters), included and
  excluded identity fields, conservative equivalence rules, catalog/enablement semantics, import
  behavior, and pagination behavior.
- Publish `reviews/20260918_rule_identifier_coordinator_review.md` with baseline status and the
  ownership matrix.

### Gate 1 — Worker A foundation

Integrate Worker A first. Independently verify:

- canonical R001–R005 outcomes;
- preservation of business-logic distinctions;
- 96-bit encoding and collision verification;
- immutable identity rows and persistent catalog schema;
- atomic repository invariants, soft history preservation, revision handling, and cursor support;
- migrations from an empty database; and
- focused tests, Ruff, mypy for touched code, Django checks, and diff hygiene.

Workers B–D may inspect the proposed interfaces during Gate 1 but must not independently invent
conflicting model or wire contracts.

### Gate 2 — Worker B backend behavior

After Gate 1, integrate Worker B. Independently verify:

- UI-created rules save immediately and enable by default;
- enable/disable and bulk enablement persist atomically;
- config save exports only enabled rules directly from SQLite;
- config load reuses existing identities, imports missing rules, applies the exact enabled set, and
  never deletes omitted catalog rules;
- the first response returns the first 50 catalog rules plus all enabled rules;
- each valid Next-page cursor reads at most 10 new rules until `has_more` is false;
- stale cursors, invalid configs, collisions, and partial failures are safe;
- the one-time legacy migration and launcher wiring are idempotent; and
- SQLite remains authoritative after legacy files change.

Freeze the backend response examples needed by Workers C and D after this gate.

### Gate 3 — Workers C and D cross-boundary delivery

Once Gate 2 contracts are frozen, Workers C and D may finish in parallel in separate worktrees.
Integrate Worker C before Worker D when contract artifacts overlap. Independently verify:

- every new run stores `rule_id`, `rule_identifier`, and zero-violation rule bindings;
- old run documents remain readable without guessed identities;
- reports and detail APIs retain compatibility;
- frontend tick state comes from the database and optimistic failures roll back;
- config save cannot omit enabled rules outside loaded browser pages;
- pinned enabled rules and 50/10 page behavior work in the UI; and
- frontend schemas/mappers match the integrated backend contract exactly.

### Gate 4 — Full convergence and release

Run the full suite from the integration worktree:

```bash
uv run python backend/manage.py makemigrations --check --dry-run
uv run python backend/manage.py migrate --check
uv run python backend/manage.py check
uv run ruff check backend tests
uv run mypy backend
uv run pytest -q tests/backend tests/contracts tests/integration
npm --prefix frontend test -- --run
npm --prefix frontend run build
git diff --check
```

Also perform focused migration tests on copies/fixtures—not the user's live data—for:

- a legacy populated rule file and empty database;
- an initialized database with no enabled rules;
- repeated startup migration;
- external config edits followed by explicit import;
- more than 50 catalog rules with enabled rules beyond the first page;
- repeated 10-rule page navigation through the last page; and
- an old persisted run without canonical identifiers.

If any required command cannot run, record the exact environmental blocker and run the strongest
available substitute. A product defect is not an environmental blocker and must be fixed.

## Coordinator review checklist

- [ ] All four worker scopes are complete with no unowned requirement.
- [ ] No worker modified user-owned unrelated files.
- [ ] Model and migration state matches committed code; no missing migration is generated.
- [ ] Canonicalization is deterministic across process restarts and independent installations.
- [ ] All configured rule definitions remain in SQLite; business-logic edits preserve prior entries.
- [ ] `Rxxx` remains local and canonical identifiers remain stable across config import/order changes.
- [ ] Saved configs contain exactly enabled rules and enough authored content to import missing rules.
- [ ] Import is atomic and never deletes omitted catalog/history records.
- [ ] Initial list and Next-page database reads follow the exact 50-plus-enabled/10 rule contract.
- [ ] Run persistence contains stable rule bindings, including zero-violation rules.
- [ ] Backward compatibility, reports, exports, and browser journeys pass.
- [ ] Relevant API, operations, migration, and implementation documents match behavior.
- [ ] `frontend/dist` is rebuilt only after source tests and production build pass.
- [ ] Final integration diff contains no debug code, accidental generated files, secrets, live data,
  or unrelated cleanup.

## Required final artifacts

The coordinator must finish and publish:

1. `reviews/20260918_rule_identifier_coordinator_review.md` containing:
   - baseline and branch/worktree topology;
   - worker commit hashes and integration order;
   - requirement-by-requirement disposition;
   - review findings and revision rounds;
   - migration and backward-compatibility evidence;
   - exact final test/build results; and
   - final status `READY` or `NOT READY`.
2. A revised canonical implementation plan reflecting any approved implementation decisions.
3. Updated user/developer/API documentation with no contradictory YAML-as-live-storage guidance.
4. A clean integration branch ready for the user's chosen merge process.

Mark `READY` only when every checklist item is satisfied and no required work is deferred.
