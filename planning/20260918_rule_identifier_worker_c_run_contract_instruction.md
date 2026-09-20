# 2026-09-18 Canonical rule identifier — Worker C instruction

## Assignment

Own propagation of stable rule identifiers through validation execution, saved runs, paginated
details, reports, backward compatibility, and the shared machine-readable API contract. Consume the
accepted Worker A/B interfaces; do not redesign catalog/import behavior.

Read completely before editing:

- `requirements/20260918_validation_rule_identifier.md`
- `planning/20260918_canonical_business_rule_identifier_implementation_plan.md`
- `planning/20260918_rule_identifier_coordinator_reviewer_instruction.md`
- accepted Worker A and Worker B delivery/API examples.

Wait for the coordinator's Gate 2 contract freeze before finalizing shared artifacts. Work only in
the assigned branch/worktree.

## Mandatory completion loop

For every section: implement, add tests, update documentation/contracts, self-review against every
required field and legacy path, fix all findings, revise artifacts, and re-run tests until complete.
Do not defer required propagation as future exception-tracking work. Record evidence in
`reviews/20260918_rule_identifier_worker_c_delivery.md`.

## Owned implementation

Primary ownership:

- `backend/apps/runs/services.py`, serializers, views, detail views, and persistence;
- identifier pass-through in `backend/apps/reports/` without report-layout redesign;
- `tests/contracts/v1/contract_schema.json`, `examples.json`, and backend contract tests;
- run/persistence/report tests and integration workflow tests;
- canonical backend API, run persistence, and compatibility documentation.

Do not edit frontend source or Worker A/B repository/API implementation without coordinator approval.
Publish the final wire examples for Worker D.

## C1 — Execution snapshot and validation results

- [ ] Load selected/enabled rules from the database-backed catalog interface frozen by Worker B.
- [ ] Ensure one run evaluates an immutable rule snapshot; concurrent edits must not mix revisions.
- [ ] Add `rule_identifier` to the internal `Rule`, `ValidationViolation`, rule-summary, and related
  validation result structures where needed.
- [ ] Retain `rule_id` for run-local display/grouping while carrying the canonical identifier
  alongside it.
- [ ] Create a run-level `rule_bindings` map from every selected `Rxxx` to canonical identifier,
  including selected rules with zero violations.
- [ ] Preserve explicit empty selection: zero selected/enabled rules must not mean all rules.

## C2 — Saved-run persistence and compatibility

- [ ] Persist `rule_bindings` inside every new run result.
- [ ] Persist both `rule_id` and `rule_identifier` on every violation and the identifier in every
  rule summary.
- [ ] Store enough name/description/logic snapshot information to render historical results after a
  catalog rule is edited, disabled, or archived.
- [ ] Add backward-compatible load defaults for old run JSON lacking canonical identifiers.
- [ ] Never infer an old run's canonical identity from its `Rxxx` or the current catalog.
- [ ] Represent genuinely unavailable legacy identity as absent/null according to the frozen wire
  schema.
- [ ] Ensure rename, retention, deletion, and upload cleanup remain unchanged.

## C3 — Detail APIs, reports, and exports

- [ ] Pass `rule_identifier` through violation detail endpoints and filters where relevant.
- [ ] Keep current result/report grouping and visible labels based on the run-local `Rxxx` and saved
  rule name for compatibility.
- [ ] Ensure HTML and Excel exports operate from persisted snapshots, not the current catalog.
- [ ] Do not silently drop identifiers when materializing paginated details.
- [ ] Verify reports for legacy runs without identifiers still render.
- [ ] Avoid introducing canonical identifiers into filenames, anchors, or sheet names unless the
  product plan explicitly requires it.

## C4 — Shared executable contracts

- [ ] Update versioned rule response schemas for `rule_identifier`, `enabled`, catalog pagination,
  import/export results, and mutation results exactly as frozen by Worker B.
- [ ] Update run request/result/document/detail schemas for `rule_bindings` and optional legacy
  identifier fields.
- [ ] Add examples for initial 50-plus-enabled listing, a 10-rule continuation page, last page,
  stale-cursor error, import reuse/new-rule bindings, zero enabled rules, zero-violation selected
  rules, and legacy saved runs.
- [ ] Make backend contract tests reject missing new fields on new responses while accepting the
  intentionally optional fields on legacy documents.
- [ ] Provide Worker D with exact snake_case wire shapes and fixtures; do not leave frontend to infer
  them from prose.

## C5 — Future exception-tracking boundary

- [ ] Document that `rule_identifier` identifies the canonical business rule, not one exception
  occurrence.
- [ ] Document the future composite occurrence key: tracking scope/dataset, canonical record key,
  rule identifier, and violating column/type.
- [ ] Confirm catalog edits/imports preserve identifiers needed by saved runs and later foreign keys.
- [ ] Do not implement the future exception workflow in this delivery.

## C6 — Tests and documentation

- [ ] Test selected rules with and without violations, multiple local IDs across fixture histories,
  business-logic edits, disabled/archived catalog entries, and stable run snapshots.
- [ ] Test round-trip persisted new runs and load of legacy documents with no identifier fields.
- [ ] Test detail pagination, report rendering, and exports for new and legacy runs.
- [ ] Update API/persistence/report documents and examples; remove statements that imply `Rxxx` is a
  durable rule identity.
- [ ] Reconcile the implementation plan with actual accepted wire-field optionality and document
  any coordinator-approved compatibility decisions.
- [ ] Revise the delivery document after self-review and cross-check it against the machine-readable
  contract.

## Required verification

```bash
uv run pytest -q tests/backend/test_runs.py tests/backend/test_persistence.py
uv run pytest -q tests/backend/test_run_views.py tests/backend/test_run_detail_views.py
uv run pytest -q tests/backend/test_reports.py tests/contracts tests/integration
uv run ruff check backend/apps/runs backend/apps/reports tests/backend tests/contracts tests/integration
uv run mypy backend/apps/runs backend/apps/reports
git diff --check
```

Run the integrated rule tests needed to prove zero-selection and database-backed rule loading. Use
isolated result/database directories and never rewrite the user's saved runs.

## Handoff acceptance

Hand off only after C1–C6 are complete, contract examples match actual responses, new and legacy run
tests pass, report/export regressions pass, and the delivery review lists commit hashes, changed
files, exact command results, compatibility decisions, Worker D fixture handoff, and no required
follow-up.
