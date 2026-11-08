# Manual dispatch prompts — grouped validation

All worktrees are provisioned from the committed setup snapshot. No workers have
been dispatched. Run each prompt in its specified directory. Workers can start in
parallel using the shared contract; reviewer integrates in dependency order. To check
setup, run `git worktree list` from the original repository. Main stays unchanged.

## Worker A

Working directory: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-a`

```text
Implement your assigned grouped-validation work in this worktree only.
Read planning/20261108_grouped_validation_worker_a_instruction.md,
planning/20261108_grouped_validation_shared_contract.md and the linked requirements first.
Respect file ownership and the shared payload contract. Work in parallel against
that contract; document dependencies for manual coordination. Maintain your required
implementation and delivery documents throughout implementation and every fix.
Commit scoped changes and meaningful tests. Deliver ordered commit hashes, coverage,
actual validation results, dependencies and remaining issues. Do not spawn agents,
merge other worker branches, push, or merge main.
```

## Worker B

Working directory: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-b`

```text
Implement your assigned grouped-validation work in this worktree only.
Read planning/20261108_grouped_validation_worker_b_instruction.md,
planning/20261108_grouped_validation_shared_contract.md and the linked requirements first.
Respect file ownership and the shared payload contract. Work in parallel against
that contract; document dependencies for manual coordination. Maintain your required
implementation and delivery documents throughout implementation and every fix.
Commit scoped changes and meaningful tests. Deliver ordered commit hashes, coverage,
actual validation results, dependencies and remaining issues. Do not spawn agents,
merge other worker branches, push, or merge main.
```

## Worker C

Working directory: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-c`

```text
Implement your assigned grouped-validation work in this worktree only.
Read planning/20261108_grouped_validation_worker_c_instruction.md,
planning/20261108_grouped_validation_shared_contract.md and the linked requirements first.
Respect file ownership and the shared payload contract. Work in parallel against
that contract; document dependencies for manual coordination. Maintain your required
implementation and delivery documents throughout implementation and every fix.
Commit scoped changes and meaningful tests. Deliver ordered commit hashes, coverage,
actual validation results, dependencies and remaining issues. Do not spawn agents,
merge other worker branches, push, or merge main.
```

## Worker D

Working directory: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-d`

```text
Implement your assigned grouped-validation work in this worktree only.
Read planning/20261108_grouped_validation_worker_d_instruction.md,
planning/20261108_grouped_validation_shared_contract.md and the linked requirements first.
Respect file ownership and the shared payload contract. Work in parallel against
that contract; document dependencies for manual coordination. Maintain your required
implementation and delivery documents throughout implementation and every fix.
Commit scoped changes and meaningful tests. Deliver ordered commit hashes, coverage,
actual validation results, dependencies and remaining issues. Do not spawn agents,
merge other worker branches, push, or merge main.
```

## Reviewer

Working directory: `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/integration`

```text
Act as reviewer/integrator for grouped validation in this worktree only.
Read planning/20261108_grouped_validation_reviewer_instruction.md, the shared contract,
all four worker instructions and the requirement. Inspect available worker delivery
records/commits. Independently review and test each delivery before accepting it;
cherry-pick explicit accepted commits in dependency order into this integration
branch. Document findings, fixes, review evidence and cherry-pick provenance as you
go. Require updated worker implementation/delivery docs for every revision. Prepare
isolated sample inputs, integrated validation and reproducible web UI verification
instructions. Report READY FOR USER UI VALIDATION only with evidence; otherwise
report blockers. Leave integration available for my web UI check. Do not dispatch
agents, push, deploy, or merge main. If a delivery is unavailable, report exactly
which worker/commit is pending rather than inventing or silently replacing its work.
```

## Follow-up worker fix prompt

```text
In your assigned worker worktree, address the reviewer findings below within your
ownership. Update your implementation documentation and delivery record for every
fix, including cause, changes and regression evidence. Commit fixes separately and
provide their ordered hashes and exact tests/results. Do not rewrite already
integrated history or modify the reviewer worktree.

Reviewer findings: <paste findings>
Accepted dependency commits, if needed: <paste reviewer-provided hashes, or none>
```
