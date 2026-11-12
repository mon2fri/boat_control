# Integrator — supervise workers and prepare the UI testing branch

You are the rule-evolution integrator. Execute this dispatch when invoked:
prepare three dedicated worker worktrees, supervise their progress, review and
cherry-pick their commits into your integration branch, verify the combined
feature, and hand off a running isolated preview for the user's UI testing.

Read [README.md](README.md), [shared_contract.md](shared_contract.md), the full
requirements, all worker instructions, and [ui_acceptance.md](ui_acceptance.md).
At most four concurrent agents: you plus A/B/C. Do not spawn an additional
reviewer while all three workers are active. Completed workers can cross-review
through follow-up tasks; ownership transfers remain explicit.

## 1. Bootstrap safely

Start by inspecting `/home/zwj808/PycharmProjects/boat_control` on
`feat/rule-evolution`, its status/log, and `git worktree list`. Baseline feature
content should include merged main `c3d190d`. Do not reset the user's checkout.

If this planning package is still uncommitted, first review and commit ONLY
`planning/rule-evolution/` and the requirement branch correction in
`requirements/20261112_rule_revision_and_commentary_recertification.md` on the
feature branch. Do not sweep unrelated user changes into that commit. If the
root branch changed or has incompatible work, coordinate instead of discarding
it. Then choose and record a common immutable `BASE_COMMIT`.

Create the following worktrees from that exact commit using `git worktree add
-b <branch> <path> <BASE_COMMIT>`:

| Checkout | Branch | Path |
| --- | --- | --- |
| Integration | `feat/rule-evolution-integration` | `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/integration` |
| A | `feat/rule-evolution-worker-a` | `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-a` |
| B | `feat/rule-evolution-worker-b` | `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-b` |
| C | `feat/rule-evolution-worker-c` | `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-c` |

If paths/branches already exist, inspect and reuse only when they match the
intended clean base or recognized deliveries. Never reset, delete, or recreate
them blindly. Record commit, branches, paths, and initial status in
`planning/rule-evolution/preparation_record.md` in the integration checkout.
Do not publish these branches remotely during this task.

Work only from your integration checkout after bootstrap; target tool calls
explicitly there. Do not switch the user's primary checkout out from under
them. Install dependencies from existing lockfiles in each checkout as needed
(`uv sync --frozen`, `npm ci`); do not share mutable virtualenvs/node_modules or
change lockfiles just to provision worktrees.

## 2. Establish the contract and dispatch

Send exactly one worker each the assigned `worker_a.md`, `worker_b.md`, and
`worker_c.md`, its absolute worktree/branch, the exact `BASE_COMMIT`, and the
shared contract. Explicitly tell each worker that spawning does not change cwd.
Use supported agent tools; if unavailable, provide these launch instructions
and report that limitation instead of pretending workers ran.

Obtain early A/B interface sketches. Freeze actual request/response field names,
error codes, revision/concurrency token, history/acceptance endpoints, import
policy, status transitions, and provenance location in
`planning/rule-evolution/contract_decisions.md`. Identify confirmed requirements
versus provisional defaults and any user answers. Only the integrator edits this
file. Broadcast amendments to all affected workers promptly.

Workers can proceed in parallel on owned scaffolding/tests while dependent
interfaces are settled. If A's service needs to run in B's checkout early, accept
an explicit small committed contract PREREQUISITE from A, have B cherry-pick
that exact commit, and log it. Track inherited commits so integration does not
apply the same patch twice. Do not tell workers to pull uncommitted shared files.

## 3. Supervise rather than wait until the end

Check workers at natural milestones. Require short reports of files touched,
published contracts, blockers, test failures, and next steps. Resolve blockers
or reassign narrow file ownership explicitly. Do not edit their active files
in their worktrees. Do independent integration-fixture, review, and handoff work
in your own checkout while workers implement.

Challenge these failure modes early: identifier-only lineage ambiguity;
canonical-equivalent target reuse; erasing old IDs; tombstones ignored across
versions; pending text treated as Commented; stale confirmation replacing a
newer rule; hidden/inert nested modal confirmation; upload silently accepting
inherited comments; unannotated YAML inventing a revision; run-scope export
leakage. Have workers address findings before declaring delivery.

## 4. Review and cherry-pick

Require each worker's implementation/tests/delivery note to be committed and
its checkout free of unexplained changes. Inspect every diff and actual checks.
Do not accept contracts mocked away in all integration tests.

On `feat/rule-evolution-integration`, cherry-pick reviewed commits in dependency
order: A, then B, then C, preserving each worker's commit order. Use explicit
hashes and `git cherry-pick -x <hash>`; do not merge whole worker branches or
cherry-pick already inherited prerequisites again. Keep a source→integration
hash ledger in the review. If a pick conflicts, understand both sides and resolve
on the combined contract; do not blindly choose ours/theirs.

Commit integration-only fixes separately. Ask workers to review affected fixes
when useful. Do not rewrite their delivered branches to hide review findings.

## 5. Verify the combined implementation

Use a temporary `GROUPED_VALIDATION_HOME` and
`--ds=boat_control.grouped_validation_settings` for backend tests. This setting
isolates BOTH configuration/catalog and tracking paths. The checkout's normal
settings can load user rules referencing columns absent from synthetic fixtures.
Do not misclassify those fixture leaks as feature failures or mutate live rules
to make tests pass.

Required combined evidence:

- Real configuration migrations and tracking-schema upgrades from old stores.
- The exact September 30 / October 15 / October 30 sequence through catalog
  edits and actual run capture, including changed literal exception IDs.
- Multi-hop revisions, no-op/metadata edits, both extensive-edit choices,
  duplicate identities, stale tokens, retries, target commentary, clears,
  future dates, key mismatches, same-date snapshots, and unrelated rules.
- Pending/accepted states through tracking, New Exceptions Only results,
  saved-run reload, counts, XLSX upload/export, HTML and Excel reporting.
- The history table exists in configuration DB, with full snapshots/edges;
  commentary provenance exists in tracking DB and old rows are preserved.
- Frontend suite, focused browser checks for modal decisions and recertify,
  TypeScript, appropriate lint, and `git diff --check`.

Run backend and frontend suites after integration. Fix introduced failures;
record reproducible pre-existing issues honestly. After checks, build the final
frontend once with `npm run build` and commit tracked `frontend/dist/` changes.
Build the backend package with `uv build --out-dir release`; release artifacts
remain ignored. Do not claim a build is a running UI preview.

## 6. Prepare an isolated runnable preview

Own a script such as `scripts/seed_rule_evolution_preview.py` accepting an
explicit preview home. Use the real migrations/catalog/capture services to seed
synthetic books, September commentary, a recorded October revision, and the
October occurrence. Add a separate rule for testing save-as-new. Avoid fixture
rows inserted directly into private tables to bypass the implemented behavior.

Do not overwrite an existing preview home. Provide a fresh location such as
`/tmp/boat-control-rule-evolution-preview-<timestamp>` with isolated `.config`,
catalog, rule/filter configs, tracking DB, uploads/results, and tiny CSVs. No
copying or mutation of the user's live databases is allowed.

Start Django from the INTEGRATION worktree using its built frontend:

```bash
GROUPED_VALIDATION_HOME=<preview-home> .venv/bin/python backend/manage.py runserver 127.0.0.1:45304 --settings=boat_control.grouped_validation_settings --noreload
```

Verify the port is free; choose/report another port if needed rather than
killing an unrelated process. Verify `/api/health/`, the actual browser page,
and persistence paths. Keep the owned server available for the user's testing
when the environment supports it, and report how to stop/restart it. An
unreachable server must not be reported as a running preview.

## 7. Handoff and stop

Write and commit `reviews/20261112_rule_evolution_integration_review.md` with:
requirements-to-code/test coverage; decisions; worker and cherry-pick hashes;
migrations/upgrades; all checks and failures; unresolved risks; preview paths,
URL, seed contents/start commands; and the user acceptance checklist/results
marked **pending user execution**.

Finish with a clean integration worktree, a reproducible preview, and a concise
handoff. Keep worker worktrees/branches for traceability. Do not push, create a
PR, merge into main, certify the user's UI acceptance, or start another feature.
The user will test `feat/rule-evolution-integration` before authorizing release.
