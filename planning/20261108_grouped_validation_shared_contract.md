# Grouped validation — shared implementation contract

Date: 2026-11-08
Requirement: [agreed requirements](../requirements/20261108_requirement_filter_and_rule_logic_grouping.md).
Implementation is dispatched manually by the user. Do not spawn agents or dispatch other workers.

## Branches and worktrees

Feature/setup branch: `work/20261108-grouped-validation` in the original checkout.
Integration/reviewer: `work/20261108-grouped-validation-integration` at `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/integration`.
Workers A–D: `work/20261108-grouped-validation-worker-a` through `-worker-d`, at
`/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/worker-a` through `worker-d`. All start at the same setup commit, descended
from main requirement commit `6b4bc94`. No ingestion-prewarm changes are included.
The original untracked screenshots remain in the original checkout; the committed
requirement is authoritative and sufficient for worker implementation.

## Shared wire contract (initial implementation agreement)

Reuse the existing tree shape: `{"kind":"leaf","conditionId":"c0"}` or
`{"kind":"and"|"or","children":[...]}`. Persisted leaf references are indexed
`c0`, `c1`, etc. within their own ordered clause list; frontend runtime IDs must
be mapped at serialization/restoration boundaries, never persisted accidentally.

- Overall filters: retain `filters`; add optional `filter_relation` (`and`/`or`)
  and `filter_grouping_tree`. Named saved filters use their existing `rows` list
  plus the same two grouping fields. Absent grouping preserves legacy AND.
- Rule outcomes: retain legacy `logic` for single-outcome rules. Add optional
  `logic_clauses` (nonempty list of existing logic-clause-shaped objects),
  `logic_relation` (`and`/`or`), and `logic_grouping_tree`. Multi-outcome form
  contains value-against-column clauses only; legacy column-against-column remains
  single-outcome. Do not allow conflicting legacy and new representations to
  silently select one. New writers use legacy form for a single outcome and the
  new form for multiple outcomes; readers handle both. Reject contradictory input.
- Trees override flat relation only when valid. Every configured clause must occur
  exactly once; reject unknown/duplicate/omitted references, empty branches,
  malformed kinds and unsafe depth/size. Multiple clauses require an explicit
  relation or valid tree in newly authored configurations. Legacy filters without
  either retain AND. Single clauses need no relation/tree.
- Null and empty string: eq/contains false; neq/ncontains true, across filters,
  conditions, and logic, including multi-value and column-comparison paths.
  Whitespace-only strings stay literal (no new trimming or case normalization).
  This is the conservative implementation default for the open whitespace question;
  document it for user verification. Numeric operators remain unchanged. Missing
  schema columns must not be silently treated as null cells or skip checks:
  surface actionable validation errors before execution.
- Preserve literal substring semantics consistently: user values are not regex.
  Conditions decide applicability; grouped outcomes decide pass/fail. Null rejection
  must not override the negative-operator requirement.
- One business-rule violation per record/rule, even when multiple outcomes fail.
  Keep exception IDs stable at the rule/key level, and include all outcome columns
  and useful observed values in detail/report context. Do not invent a single
  misleading failing column for a compound expression.
- Existing canonical IDs for legacy single-outcome rules must stay unchanged.
  New identities include the complete outcome expression; preserve existing
  canonical treatment of unordered AND/OR children and values. A owns the canonical
  projection. Do not rewrite historical IDs/commentary or create a migration that
  reidentifies legacy rules. Record any necessary new identity format explicitly.
- Preserve grouping through named configuration APIs, family reference expansion,
  run requests, stored run metadata, history restoration, exports and rule lifecycle.
  If family expansion changes clause count, remap trees correctly or reject with a
  clear error; never silently drop an expression.

This contract is a coordination starting point, not permission to disregard the
requirement. A and B publish actual Python interfaces in their implementation docs
and C aligns transport. Any necessary adjustment must be recorded in the shared
contract by the reviewer, with affected workers notified through manual handover.
Workers must not independently choose incompatible payload shapes.

## Ownership and parallel work

A owns `backend/apps/rules/**`, rule catalog/identity tests, and new pure shared
predicate/tree modules under `backend/apps/validation_logic/**`. A supplies pure
validation/normalization helpers for B; B may prototype against this contract.
B owns other backend runtime/filter/config/report/tracking modules and their tests,
including `backend/apps/runs/**`, `backend/apps/families/**`, saved filters and files.
C owns `frontend/src/api/**`, `frontend/src/state/**`, non-visual configuration/run
hooks, frontend domain types, and shared grouping helpers/editor if refactoring is
needed. D owns visual pages/components and their component tests, including rule and
filter editors. C owns non-visual `features/rules/useRules.ts`, groupingTree.ts,
features/results/useRunExecution.ts and associated tests; D owns GroupingTreeEditor.tsx
unless C/D explicitly record a handover before changing it. D can reuse it through
an adapter without refactoring it. Reviewer owns root tooling/config, cross-layer
integration tests, sample fixtures and generated frontend/dist output.

Exactly one owner per file. Request cross-owner changes in a delivery note; do not
edit the other worktree or cherry-pick another worker's branch independently.
Workers can implement concurrently using fixtures; final acceptance requires real
integrated APIs. Reviewer supplies accepted dependency commits if needed and records
which commits each worker received to prevent duplicate cherry-picks.

## Mandatory documentation during implementation and fixes

Each worker maintains `docs/20261108_grouped_validation_worker_<letter>_implementation.md`
and `reviews/20261108_grouped_validation_worker_<letter>_delivery.md` in their own
branch. Update documentation as implementation proceeds, not only at final delivery.
Record design/contracts, affected behavior, compatibility, requirement/acceptance
coverage, commands and actual results, and unresolved questions. Every fix commit
must update the relevant implementation documentation and delivery record with the
reported defect, cause, fix, and regression evidence. Do not claim unrun checks pass.
Final handover includes ordered commit hashes, changed files, dependency hashes,
API/identity decisions, limitations, and `git diff --check` result. Docs are required
review artifacts, including for follow-up fixes.

Use only your assigned worktree. Do not reset/stash/clean user work, modify main,
push, merge main, deploy, or access original-checkout live data. Tests and app runs
must use isolated databases, configuration, uploads, reports and tracking files.
Do not symlink writable data/config between worktrees. No approval registry or
business metadata enhancement is in scope. Commit scoped source/tests/docs; workers
must not commit generated bundles or local databases, caches, dependency folders.
