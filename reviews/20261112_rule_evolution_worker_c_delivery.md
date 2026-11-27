# Worker C delivery — rule evolution + recertification UI (frontend)

Date: 2026-11-12
Branch: `feat/rule-evolution-worker-c` (base `4b7c5bf`, HEAD unchanged before work)
Worker: C — frontend end to end, `frontend/src/**` + frontend tests only.
No backend, lockfile, or `frontend/dist/` changes.

## A/B payload acknowledgement (both frozen, built exactly)

- Worker A (broadcast + `contract_decisions.md` §FROZEN A):
  `PUT /api/rules/<id>/` accepts `save_decision: modify_current|save_as_new` +
  `source_identifier` (concurrency token = identifier the draft was based on).
  409 `rule_save_decision_required{original_rule_id, original_identifier,
  proposed_identifier, extreme_changes[]}`; 409 `rule_save_stale{
  original_rule_id, original_identifier, current_identifier, lineage_id,
  revision_number}`; 409 `rule_identity_reuse_conflict{original_rule_id,
  original_identifier, proposed_identifier, existing_rule_id,
  existing_lineage_id}`; 400 `rule_save_decision_invalid`.
  Success modify → 200 `{previous_rule_id, resulting_rule_id,
  save_decision, lineage_id, evolution_event_id}`; save-as-new → 201 +
  `saved_as_new:true`; equivalent reuse adds `equivalent_rule:true` +
  `equivalent_rule_id`. Snapshots carry optional `lineage_id`/
  `revision_number`. History is `GET /api/rules/<id>/history/ →
  {rule_id, lineage_id, revision_number, events[]}` with before/after
  payloads, change summaries, save decisions, commentary policy.
- Worker B (broadcast + `contract_decisions.md` §FROZEN B, source
  `docs/20261112_rule_evolution_tracking_contract.md` on
  `feat/rule-evolution-worker-b`):
  list rows gain `status: RecertificationRequired`, `recertification_required`,
  `recertification_reason` (exact label ONLY here, never in commentary text),
  `carried_from_exception_id/_as_of_date/_rule_identifier`,
  `rule_evolution_event_id`, `recertified_at`, `revision_token` (`""` when
  never carried, else the creating event id, echoed back as
  `revision_tokens`). `POST /api/exception-tracking/recertify/` takes
  `{as_of_date, exception_ids, revision_tokens}` → 200 `{as_of_date,
  accepted[], already_accepted[], total, exceptions[]}`; atomic errors
  404 `unknown_exception_ids` (`details.unknown_ids`), 409
  `stale_revision_token` (`details.stale_ids`), 400
  `blank_commentary_not_certified` (`details.blank_ids`), 400
  `invalid_recertification_request`, 400 `invalid_as_of_date`. Nothing else
  certifies (download/rerun/export/upload/text edits never do). Workbook
  appends six provenance columns (server-built; import ignores them).
  Reports append a Recertification column (server-built; rendered DOM already
  carries the marker, so offline HTML keeps it). Ambiguity surfacing is log +
  `carry_warnings` only — surfaced below as a review banner where present.
- Assumption documented for the integrator: `revision_tokens` is sent as a
  parallel array aligned with `exception_ids` (client includes `""` for
  never-carried rows, matching "missing entries default to ''"). If B expects
  a keyed map instead, only `recertifyExceptions`' body builder needs to
  change; all callers pass `{exceptionId, revisionToken}` pairs already.

## What was implemented (all under `frontend/src/`)

- API wire/domain/mapping (`api/wire.ts`, `domain.ts`, `mapping.ts`,
  `endpoints.ts`, `client.ts`): frozen A+B schemas (all additive-tolerant
  via `catchall`/optional fields; old fixtures/documents still parse);
  `updateRule(index, draft, {saveDecision, sourceIdentifier})` sends
  top-level controls only (never inside the executable draft);
  `RuleSaveDecisionRequiredError` / `RuleSaveStaleError` /
  `RuleIdentityReuseConflictError` / `RecertifyError` extractors;
  `loadRuleHistory(ruleId)`; `recertifyExceptions(asOfDate, selections[])`
  with tokens; `apiErrorMessage` prefers frozen `message` fields over bare
  status codes. Domain gains `SaveDecision`, `RecertificationRequired`
  (+ `RECERTIFICATION_LABEL`), recertification provenance on
  `TrackedException`/`DetailRow`, `RuleHistory`, `RecertifySelection`.
  `normalizeReviewStatus` never invents statuses; the tracking fallback never
  infers Commented for pending rows.
- Save flow (`features/rules/SaveDecisionDialog.tsx`, `RulesPage.tsx`,
  `useRules.ts`): 409 opens an in-overlay prompt *inside* the native modal
  dialog (never a portal outside the top layer) with before/after clause
  context, old→new identifiers, extreme-change reasons, per-choice
  commentary consequences, and exactly Modify current / Save as new / Back
  to editing. No dismissal infers a choice (Escape/backdrop = back to
  editing, draft intact). Retries carry `save_decision` + `source_identifier`;
  stale collapses the prompt and surfaces the current identifier with the
  draft intact (old confirmation never applied); reuse conflicts stay on the
  prompt naming the existing rule/lineage with no merge; other failures stay
  on the prompt. Success closes the editor; modify-current replaces the
  selected ID, save-as-new preserves source selection and adds the new rule.
  Copy stays a POST-only new-rule workflow. Editor overlay semantics kept:
  success/explicit Cancel close; failed saves and cancellations keep the
  draft; Backdrop/Escape never dismiss the editor.
- History (`features/rules/RuleHistoryPanel.tsx`, `useRuleHistory.ts`,
  `SortableRuleList.tsx` History button, both RulesPage branches): renders
  revision/time, old/new identifiers, decision, before/after definition and
  grouping from persisted events (tolerant snapshot renderer + raw-JSON
  fallback); never reconstructed from the catalog.
- Tracking (`pages/ExceptionTrackingPage.tsx`, `features/tracking/
  useTracking.ts`): per-row selection with frozen tokens, explicit
  Recertify selected (unchanged text accepted), atomic-failure messages
  naming affected IDs with selection kept, pending badge with the exact
  label rendered separately from commentary (status cell + optional
  server-driven columns + provenance columns), pending/selected counts,
  upload-never-recertifies guidance, `carry_warnings` review banner.
- Results (`features/results/RecertificationBadge.tsx`, `DetailTable.tsx`,
  `ExceptionTable.tsx`): pending marker (with source revision/date
  provenance in the title) beside Exception IDs from persisted run data;
  accepted rows untouched; Overall card uncluttered; New-Exceptions-Only
  copy states pending items stay visible; offline HTML export keeps the
  marker because it clones the rendered DOM (covered by test).
- Retained: grouping-eye previews, offline HTML behavior/script, numbered
  badge colors (+ new recertification style), commentary filename
  conventions, uncluttered Overall card.

## Evidence (all in-worktree, `frontend/`)

- `npx tsc -b` — clean.
- `npx vitest run` — 83 files passed, 3 skipped; 734 passed, 3 skipped,
  0 failed. New suites: `api/ruleEvolution.test.ts` (A+B wire/mapping/
  endpoint/decision-error contract), `features/rules/
  SaveDecisionDialog.test.tsx`, `RuleHistoryPanel.test.tsx`, `pages/
  RulesPage.ruleEvolution.test.tsx` (both embedded + standalone: prompt,
  back-to-editing, modify/save-as-new retries, stale, reuse conflict,
  copy, history), `pages/ExceptionTrackingPage.recertification.test.tsx`
  (badge separation, nonblank-stays-pending, selection + token body,
  accepted/already-accepted, atomic-failure IDs + selection kept,
  carry-warnings banner, upload guidance), `features/results/
  ruleEvolutionResults.test.tsx` (mapping, both tables, Overall
  untouched, offline-HTML retention). Existing suites updated only where
  the feature changes rendering: tracking selection column + 16 fallback
  columns, scope copy mentioning pending review.
- `npm run build -- --outDir /tmp/boat-rule-evolution-worker-c-dist` —
  success (`frontend/dist/` untouched, verified absent from git status).
- Real browser (system Chrome via Playwright, vite dev + intercepted
  frozen-A payloads): 11/11 — native-dialog top layer, 3-button prompt,
  initial focus on Back to editing, prompt visible/hit-testable in top
  layer, Escape → prompt closes/editor+draft kept, retry body carries
  `save_decision` + `source_identifier`, success closes editor, PUT
  sequence correct (initial + post-Escape re-save + decision retry),
  zero page errors. Harness was scratch (not committed); rerun with
  `boat-worker-c-modal-check.mjs` against any vite-served worktree.
- `npx eslint` on touched files: no new findings (remaining errors are
  pre-existing base lines: `no-unsafe-*` casts in `useRules.ts`,
  `set-state-in-effect`/`no-base-to-string` in untouched `RulesPage.tsx`
  regions — verified outside this change's diff hunks).

## Blocked integration / next steps for the integrator

- B's `available_filters.status` / `filter_status` / sorting and the
  results/report scope behavior are server-driven; the client renders
  whatever the server sends and keeps pending rows visible by never
  collapsing them into Commented. No client change needed once B serves
  them; verify end to end on the integrated tree.
- Workbook six-column append and report Recertification column are
  server-rendered; client import ignores the new columns and rendered
  HTML already carries the marker. Confirm on integrated exports.
- `carry_warnings` beyond the list/import banners (currently rendered
  when the server sends them) has no deeper C affordance — tracked as
  the known limitation per the B contract.
- History placement: per-row History button opening a dialog (no
  app/navigation redesign, both embedded + standalone RulesPage).
  Integrator may relocate; the panel is self-contained.
- Fixtures used throughout assume the frozen shapes above (notably the
  parallel `revision_tokens` array); final acceptance needs the real
  A+B backends on the integrated tree.

## Commits (on `feat/rule-evolution-worker-c`, no push)

- `1378cc6` Worker C: frozen A/B contracts in frontend wire/domain/mapping/endpoints
- `3c0cdb3` Worker C: extensive-edit decision prompt, retry flow, and rule history UI
- `b3ead59` Worker C: recertification selection/action, pending markers, carry warnings
- Delivery note: `reviews/20261112_rule_evolution_worker_c_delivery.md` (this file)
