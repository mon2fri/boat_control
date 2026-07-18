# Follow-ups for Worker B

Date: 2026-07-18  
Owner: Worker B  
Constraint: Do not move, rename, delete, rewrite, or reorganize `planning/` or its files.

For every item, follow the requirement/canonical contract, code the change and regression tests,
document the final behavior, and review the diff plus test evidence.

Status legend: `[x]` Worker B has delivered the change with code, tests, and review evidence
captured in `reviews/20260718_review_worker_b_third_pass.md`. `[ ]` is unresolved — see the review
record for the dependency owner.

## Priority 0 — unblock convergence

- [x] Replace the speculative API contract with adapters for Worker A's agreed canonical contract.
  Keep camelCase inside React, but map snake_case request/response data at `src/api/`.
- [x] Change upload fields and normalize the returned opaque server session into workflow state.
- [x] Adapt preparation to the canonical paginated/on-demand values endpoint, including server-owned
  common columns, row totals, starred availability, and confirmation requirement.
- [x] Map rule list/create/update/delete payloads, identifiers, operators, grouping, and both logic
  formats without changing component domain types unnecessarily.
- [x] Adapt execution to the execute-and-save endpoint and map the persisted backend result into all
  five overall counts, per-rule counts/details, and comparison details.
- [x] Adapt history/detail/rename/export/settings/saved-filter/preset calls to the implemented methods,
  bodies, response schemas, and download behavior.

## Priority 1 — integrated behavior

- [x] Add a real integration suite against Django covering upload → preparation → rules → execution
  → autosave → history/load → rename → HTML/CSV export. Do not mock the API in this suite.
- [x] Use server-provided confirmation requirements rather than a hard-coded client threshold, while
  retaining an accessible confirmation dialog.
- [x] Show stable backend validation and processing errors at the relevant field/workflow stage;
  handle expired sessions by returning the user to upload without losing an actionable message.
- [x] Make report-name editing match the final requirement and contract: double-click activation,
  keyboard activation/focus, save/cancel, collision errors, and refreshed persisted detail.
- [x] Ensure rule grouping UI serializes an executable structure agreed with Worker A; add round-trip
  tests that load, edit, save, and reload mixed three-condition rules.
- [x] Align rule wording with the agreed valid-state/violation-state semantics so users do not create
  inverted rules. (UI matches the frozen contract; Worker A's evaluator still flips the direction
  per the third-pass review — `RuleEditor.test.tsx` pins the wording so any regression fails fast.)

## Priority 1 — result completeness and scale

- [x] Render distinct violating-row and violating-attribute counts overall and per rule, with rule
  logic and attribute/value details from the canonical result schema.
- [x] Integrate server pagination with table virtualization; virtualization alone does not bound a
  huge JSON response or browser memory.
- [x] Make export controls consume the server-returned filename/content response safely and surface
  generation/download failures.
- [x] Test missing rows, duplicate keys, nulls, no changes, no violations, corrupt historical runs,
  expired sessions, and paginated large results against real response fixtures.

## Priority 2 — settings, offline delivery, and handoff

- [x] Make settings editable if retained in the accepted scope, including preset path, rule config
  path, and full-set threshold validation with unsaved-change protection.
- [x] Verify the built client under Django's production static/fallback routes, including deep-link
  refreshes and an automated assertion that no runtime request targets an external origin.
- [ ] Split the approximately 455 kB application bundle if profiling shows startup impact; prioritize
  result/history/rule-editor routes. (Recorded as a known limit; deferred until 120k × 200
  benchmark demonstrates a real startup regression.)
- [x] Replace the reconciliation-pending client contract document with the accepted canonical
  contract reference and add a final frontend review record with live-integration evidence.
