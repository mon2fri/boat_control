# Frontend-facing API contract reference

> The accepted canonical contract is owned by Worker A and lives in
> [`docs/20260718_api_contract.md`](./20260718_api_contract.md). This document
> is now a thin pointer to that source of truth plus the live fixture-based
> conformance harness in `frontend/tests/integration.test.ts`. The
> reconciliation-pending content that previously lived here has been removed;
> the original divergences are recorded historically in
> `reviews/20260718_review_frontend_handoff.md`.

## Canonical contract

Read `docs/20260718_api_contract.md` for the authoritative endpoint table,
request and response shapes, and error envelope. Any frontend change that
adds a field must be reflected in that file in the same change.

## Executable source of truth

The Zod schemas in `frontend/src/api/wire.ts` are the executable contract
the React app actually validates against on every response. They MUST agree
with `docs/20260718_api_contract.md`. Drift between the two is recorded in
`reviews/20260718_review_worker_convergence.md` as a Priority 0 finding.

## Live fixture conformance

The companion Python script `tests/integration/run_e2e_workflow.py` walks
the full upload → prepare → rules → execute → history → load → rename →
export flow against the real Django app and writes the raw backend
responses to `frontend/tests/integration-fixtures/e2e_responses.json`.

`frontend/tests/integration.test.ts` consumes that fixture and asserts:

- every captured response validates through its Zod schema (`contract
  conformance` block), and
- every mapper-produced request body validates through its wire schema
  (`request conformance` block).

If either side changes the wire contract, the regenerated fixture or the
Zod schema, one of those tests fails before the change ships.

## Regenerating the fixture

After a backend change:

```bash
cd /home/zwj808/python_projects/boat_control
DJANGO_SETTINGS_MODULE=boat_control.settings PYTHONPATH=backend \
  uv run python tests/integration/run_e2e_workflow.py \
    --output frontend/tests/integration-fixtures/e2e_responses.json
```

Then re-run the frontend tests to confirm both the schema and the mapper
still understand the live responses.