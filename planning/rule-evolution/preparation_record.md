# Rule-evolution preparation record

Date: 2026-11-12
Root checkout: `/home/zwj808/PycharmProjects/boat_control` on `feat/rule-evolution`

## Base commit

- `BASE_COMMIT=4b7c5bf72df3e65b55d118d7e9647173ed0b73f3`
- Message: `docs: add rule-evolution planning package and branch correction`
- Parent: `c3d190d` (merged main, PR #6 grouped-validation)
- Contents: `planning/rule-evolution/` (README, shared_contract, worker_a/b/c,
  integrator, ui_acceptance) + branch correction in
  `requirements/20261112_rule_revision_and_commentary_recertification.md`
- Root checkout left on `feat/rule-evolution`; not reset. Status clean at time
  of worktree creation (`git status --short --branch` showed only branch line).

## Worktrees (all from exact BASE_COMMIT)

| Checkout | Branch | Path | HEAD at creation |
| --- | --- | --- | --- |
| Integration | `feat/rule-evolution-integration` | `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/integration` | `4b7c5bf` |
| A | `feat/rule-evolution-worker-a` | `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-a` | `4b7c5bf` |
| B | `feat/rule-evolution-worker-b` | `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-b` | `4b7c5bf` |
| C | `feat/rule-evolution-worker-c` | `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-c` | `4b7c5bf` |

Created via `git worktree add -b <branch> <path> <BASE_COMMIT>`. No existing
paths/branches were reused; all four were newly created. No remote publishing.

## Initial status

- `git worktree list` confirms all four checkouts above.
- Integration checkout verified clean immediately after creation.
- Dependency provisioning (per-checkout `uv sync --frozen`, `npm ci`) deferred
  to workers/integration as needed; no shared virtualenvs/node_modules; no
  lockfile changes for provisioning.

## Next

- Integrator works only from the integration checkout after bootstrap.
- Dispatch exactly one worker per worker-a/b/c instruction with absolute
  worktree/branch/BASE_COMMIT + shared contract.
- Freeze interfaces in `planning/rule-evolution/contract_decisions.md`
  (integrator-only edits).
