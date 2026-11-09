# Round 4 preparation and allocation

Prepared 2026-11-09. Implementation has not started. Source requirement: `requirements/20261108_req_filter_rule_logic_enhancement.md` in the main checkout; its uncommitted contents are preserved in `requirements_snapshot.md` for workers. Base: `484902fc88e2170ce242633aba702f51dca69ab5`, the latest grouped-validation integration tip, including rounds 1–3 and follow-up fixes. Main (`6b4bc94`) does not contain those implementations and is not a suitable code base for this round.

| Worker | Assignment | Main ownership |
| --- | --- | --- |
| A | Run/date template scope, download wiring, subset upload compatibility | Tracking API/services, run snapshot plumbing, frontend export endpoint/control |
| B | First-tab enabled-rule table | Tracking workbook, new rule summary helper |
| C | Empty-rule hints | Report export service and report tests |

Three workers may run concurrently. Integrator is the fourth agent. Do not spawn extra review agents while these three run; reuse completed workers for independent cross-review if helpful. Integrator owns cross-cutting resolution and final verification. A and B must agree on summary input shape and snapshot selection before integration; B supplies rendering/helper, A wires it. C reuses existing rule-header formatting without editing that shared helper. Merge B, A, C in that order unless dependencies justify otherwise.

All new worktrees start from the same preparation commit descended from the base. Paths: `/home/zwj808/PycharmProjects/boat_control-worktrees/round4/integration`, `/home/zwj808/PycharmProjects/boat_control-worktrees/round4/worker-a`, `/home/zwj808/PycharmProjects/boat_control-worktrees/round4/worker-b`, `/home/zwj808/PycharmProjects/boat_control-worktrees/round4/worker-c`. Branches: `work/20261109-round4-integration`, `work/20261109-round4-worker-a` etc. Instructions are tracked in each worktree. Use `integrator_prompt.md` to begin execution; this preparation does not summon implementation workers.

## Acceptance decisions and review risks

- Report scope means persisted current-run exceptions from enabled rules, independently of New Exceptions Only or screen filters. Date-wide tracking scope includes all known exceptions for the selected date. Test multiple runs sharing a date to catch leakage and membership loss.
- Template rule summary must be snapshot-based, include enabled rules with zero exceptions, preserve grouped formatting, and avoid using live mutable catalog logic. Tracking-date rule summaries need a deterministic union/fallback policy documented by A/B. Missing legacy metadata must not silently invent current logic.
- Keep template import compatible, including safe partial run templates. Do not change required ID validation to permit unknown/duplicate IDs.
- Requirement 3 has a typo. Workers are instructed to retain exact requested copy `Nil exception was captured by thie rule.` pending user copy review.
- No production data/config changes, pushes, merges into main, or human UI acceptance are part of this round's integrator execution. Stop with a runnable review branch and a concrete manual validation checklist.

## Stale checkout preservation

The five old grouped-validation worktrees were checked for tracked/untracked changes and were clean. Their branches remain recoverable; explicit archive branch refs and a filesystem archive of source/runtime artifacts (excluding reproducible dependency/cache directories) are recorded in `preparation_record.json`. Old ignored databases, results and uploads are archived before removal. The main checkout and its index/user edits are preserved. New worktrees intentionally contain no copied live runtime databases or dependencies. Consult the record for archive location and commit IDs.
