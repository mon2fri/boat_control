# 2026-09-18 Canonical rule identifier — Worker D instruction

## Assignment

Own the React/TypeScript implementation for the persistent rule catalog, database-backed tick
state, configuration save/load, canonical identifiers, and 50-plus-enabled/10-rule pagination.
Consume the frozen Worker B backend and Worker C wire contracts; do not invent fallback contracts.

Read completely before editing:

- `requirements/20260918_validation_rule_identifier.md`
- `planning/20260918_canonical_business_rule_identifier_implementation_plan.md`
- `planning/20260918_rule_identifier_coordinator_reviewer_instruction.md`
- accepted Worker B API examples and Worker C contract fixtures.

Wait for the coordinator's Gate 2 wire freeze before finalizing API schemas. Work only in the
assigned branch/worktree.

## Mandatory completion loop

For every section: implement, test, document, self-review against the plan and shared fixtures, fix
all failures/usability regressions, revise documentation, and re-test until every item passes. Do
not leave required behavior behind feature flags, TODOs, mocked-only tests, or unbuilt source.
Record evidence in `reviews/20260918_rule_identifier_worker_d_delivery.md`.

## Owned implementation

Primary ownership:

- frontend wire/domain schemas and mappers after Worker C freezes fixtures;
- rule API endpoints/hooks/query keys and cache behavior;
- Rules page, sortable/list/editor/config interactions, enablement, and pagination components;
- focused frontend unit/integration/browser tests;
- frontend/user documentation; and
- `frontend/dist` rebuilt only after all source tests and production build pass.

Do not edit backend code or shared contract fixtures. Report mismatches to the coordinator and wait
for the backend/contract owner to resolve them.

## D1 — Wire/domain integration

- [ ] Add canonical `rule_identifier` and persisted `enabled` fields to rule wire/domain models.
- [ ] Add initial-page/continuation pagination metadata, store revision, cursor, totals, and pinned
  enabled records exactly as frozen.
- [ ] Add create/edit/import/bulk-enablement response shapes, including prior/resulting IDs for a
  business-logic edit.
- [ ] Add `rule_bindings` and optional legacy identifiers to run/result/detail mapping.
- [ ] Never send client-selected canonical identifiers in rule drafts.
- [ ] Validate all responses through Zod and shared contract fixtures; remove obsolete assumptions
  that rule list responses are an unpaginated array.

## D2 — Automatic save and persisted enablement

- [ ] Saving a new editor draft calls backend create immediately; on success add/update query cache,
  show the permanent local `Rxxx`, mark it ticked, and close the editor.
- [ ] Cancelling creates nothing.
- [ ] Presentation-only edit retains the same local/canonical IDs.
- [ ] Business-logic edit handles the backend's prior/resulting ID response, transfers the selected
  state without flicker, and preserves the old disabled catalog entry.
- [ ] Individual checkbox changes persist immediately with optimistic UI and rollback/error on
  failure.
- [ ] Bulk actions send explicit IDs atomically. Make **Select displayed** versus a true global
  enable/disable action unambiguous.
- [ ] Initialize selection from server `enabled` values. Remove the current effect that selects
  every rule merely because it was returned by `useRules()`.
- [ ] Refresh/restart restores ticks from the database.

## D3 — Configuration save/load

- [ ] Saving a config invokes the backend export/snapshot operation; do not construct rule config
  content from the currently rendered/paginated rules.
- [ ] Ensure enabled rules outside loaded catalog pages are included by design and test.
- [ ] Support saving a valid empty enabled configuration.
- [ ] Loading a config invokes the atomic import/apply operation, shows progress, prevents duplicate
  submission, and refreshes catalog plus enabled state only after success.
- [ ] On import failure, retain the prior ticks/catalog view and present the backend error.
- [ ] Display imported/reused/enabled counts or an equally clear success summary.
- [ ] Preserve current family-resolution warnings only if compatible with the frozen import path;
  never perform a client-side destructive replace loop.

## D4 — Catalog pagination and visibility

- [ ] Initial page renders the first 50 catalog rules plus all enabled rules, deduplicated.
- [ ] Keep enabled rules visible/pinned while navigating later catalog pages.
- [ ] A user click on **Next page** triggers exactly one continuation request for at most 10 new
  rules; do not prefetch/materialize the full catalog.
- [ ] Continue until `has_more` is false; disable/hide Next appropriately on the final page.
- [ ] Support Previous using cached pages without fetching all rules.
- [ ] Handle enabled records that naturally occur outside the first 50 without duplicate rows or
  checkbox conflicts.
- [ ] On stale-cursor/revision response, invalidate pages, reload the first page, retain committed
  enabled state, and show a non-destructive refresh message when appropriate.
- [ ] Keep editing, soft archival, drag/reorder semantics, loading states, keyboard operation, and
  responsive layouts functional with partial pages.
- [ ] Ensure any search is server-side and does not hide enabled rules.

## D5 — Run and historical-result behavior

- [ ] Send an explicit snapshot of enabled local IDs for execution according to the frozen API;
  preserve `[]` as zero rules.
- [ ] Retain canonical identifiers in mapped rule results/details even if not prominently displayed.
- [ ] Continue displaying run-local `Rxxx` and saved rule names in current report/result UI.
- [ ] Load legacy saved runs with missing identifiers without schema failure or guessed mapping.
- [ ] If the Rules page displays the canonical identifier, label it **Rule identifier**, show the
  complete 25-character value on demand/copy, and do not substitute it for the user-facing name.

## D6 — Tests, documentation, and build

- [ ] Unit-test Zod schemas/mappers against Worker C fixtures.
- [ ] Test automatic new-rule persistence, cancel, presentation edit, business-logic edit ID switch,
  optimistic checkbox success/failure, bulk atomic actions, refresh restoration, and empty enabled
  state.
- [ ] Test config save with an enabled rule not loaded in current pages and import success/failure.
- [ ] Test first 50 plus pinned enabled, repeated 10-rule Next pages, last page, Previous cache,
  deduplication, and stale cursor refresh.
- [ ] Add/extend the browser journey against the real backend for create → enable → save config →
  change selection → load config → restored selection → run → persisted result.
- [ ] Update frontend/user documentation and revise the delivery review after tests.
- [ ] Build `frontend/dist` only after source tests pass; inspect the final asset references.

## Required verification

```bash
npm --prefix frontend test -- --run
npm --prefix frontend run build
uv run pytest -q tests/contracts tests/integration
git diff --check
```

Run focused Rules page, rule hook, mapping, config manager, workflow context, and pagination tests
during development. Run the coordinator-approved browser journey when the integrated backend is
available.

## Handoff acceptance

Hand off only when D1–D6 are complete; source tests, build, contract tests, and real-backend journey
pass; `frontend/dist` matches the tested source; documentation matches the final UI; and the delivery
review lists commits, changed files, exact commands/results, screenshots only when useful, and zero
deferred required work.
