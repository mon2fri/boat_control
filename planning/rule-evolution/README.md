# Rule evolution implementation dispatch

Prepare three implementation workers plus one integrator, at most four agents
running concurrently. These documents are instructions; their presence does
not mean workers have started or that the feature is implemented.

Base: `feat/rule-evolution`, currently based on merged `main` at `c3d190d`.
Include and commit this planning package before selecting the common worker base.
Do not use the retired grouped-validation branch as the implementation base.

Read in this order:

1. [Requirements](../../requirements/20261112_rule_revision_and_commentary_recertification.md).
2. [Shared contract](shared_contract.md).
3. Your assigned instruction below.

| Role | Instruction | Branch | Dedicated worktree |
| --- | --- | --- | --- |
| A: rule catalog/history | [worker_a.md](worker_a.md) | `feat/rule-evolution-worker-a` | `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-a` |
| B: commentary lifecycle | [worker_b.md](worker_b.md) | `feat/rule-evolution-worker-b` | `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-b` |
| C: UI/API client | [worker_c.md](worker_c.md) | `feat/rule-evolution-worker-c` | `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-c` |
| Integrator | [integrator.md](integrator.md) | `feat/rule-evolution-integration` | `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/integration` |

The integrator creates/verifies these worktrees, settles the contract, supervises
workers, reviews deliveries, cherry-picks commits, fixes integration issues, and
starts an isolated integration preview. The user performs UI acceptance using
the [checklist](ui_acceptance.md). No worker merges into main or pushes branches.

Worker ownership:

- A owns Django configuration/catalog models, migrations, rule-save/import APIs,
  and the lineage resolver interface consumed by B.
- B owns tracking storage, cross-revision carry, recertification APIs, scope
  projection, workbook/report output, and run provenance snapshots.
- C owns frontend source and frontend tests, including all shared wire/domain
  types. A/B publish backend payload contracts rather than editing C's files.
- The integrator owns contract amendments, integrated tests/seed scripts,
  final generated frontend assets, combined review, and preview handoff.

Initial planning has provisional defaults; see the shared contract. The
integrator must record the actual agreed interfaces before dependent work starts.
Do not allow three workers to independently invent incompatible status fields.

To start the workflow in a new agent session, invoke [integrator.md](integrator.md).
It contains the worktree setup and worker dispatch instructions.
