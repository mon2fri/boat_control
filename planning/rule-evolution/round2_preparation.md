# Round-2 preparation record (integrator-owned)

Date: 2026-11-12. Round 2 of
`requirements/20261112_rule_revision_and_commentary_enhancement.md`
(read from the primary checkout; the file is user-staged there and is NOT
copied into any worktree — worker prompts embed its Round-2 text).

## Base

- `BASE=02afe4bb2899d0477d8cabc51069c59f6747e3d9`
  (`fix: cross-revision recurrence stays Not Commented via first-seen backfill`)
- Includes all Round-1 fixes: unchanged-rule same-ID head rule, pending-mark
  propagation, immediate-previous scope, first-seen backfill, tombstone test
  update, and the 7 Round-1 regression tests.
- Integration worktree holds the user's UNCOMMITTED config edits
  (`config/rows_and_columns/s35.yaml`, `config/rules/all_rules.yaml`,
  `config/rules/new_1112.yaml`); they are preserved untouched and are NOT
  part of any worker base or delivery.

## Worktrees (both from exact BASE, verified clean at creation)

| Worker | Branch | Path | Scope |
| --- | --- | --- | --- |
| D (backend) | `feat/rule-evolution-worker-d` | `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-d` | Template columns + upload decision tables + validation (Round-2 §1–§2); Wendy already done by integrator, must not regress |
| E (frontend) | `feat/rule-evolution-worker-e` | `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-e` | Purple R, single status label, Exception-ID-last + per-rule sequence, offline HTML (Round-2 §3, §5); template/upload UI copy |

Worker-d/e worktrees were briefly created at `ca597d5`, then removed and
recreated at `02afe4b` before any worker started (empty, no deliveries lost).

## Ownership (strict, no overlap)

- D: `backend/apps/exception_tracking/**`, `backend/apps/runs/**` (capture/
  persistence/serializers only as needed), `backend/apps/reports/**` (only
  as needed), backend tests, `reviews/20261112_rule_evolution_round2_worker_d_delivery.md`.
- E: `frontend/src/**`, frontend tests, `reviews/20261112_rule_evolution_round2_worker_e_delivery.md`.
- Neither: the other's paths, worker A/B/C branches, `frontend/dist/`
  (integrator builds), live databases, user configs, pushes/merges.

## Coordination

- D publishes early: template column layout, upload error codes/semantics,
  any wire change. Integrator broadcasts to E before E finalizes.
- E consumes D's broadcast; invents no backend shapes.
- Max agents: integrator + D + E (3 of 4).
