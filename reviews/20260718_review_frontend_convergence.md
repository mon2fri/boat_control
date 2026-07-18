# Frontend Convergence Follow-up Review

Date: 2026-07-18  
Owner: Worker B follow-up

## Completed follow-up work

- The React API boundary continues to use the canonical snake_case Django
  contract while the component domain remains camelCase.
- Result schemas now accept the scalar values Django emits from CSV data
  (string, number, boolean, or null) and normalize displayed values to the
  domain's `string | null` form. This fixes execute and persisted-run loading
  for numeric CSV columns.
- Opaque-session expiry now clears the in-progress workflow, redirects to the
  upload stage, and presents an actionable re-upload message. Preparation,
  target parsing, and execution all recognize the backend's session-expiry
  error envelope.
- Report names can be activated with a keyboard through a native button as
  well as by double-clicking; existing save, cancel, server collision/error,
  and persisted-detail refresh behavior remains in place.
- The Django integration assertion was updated to enforce the opaque upload
  session contract and re-inspection call rather than the superseded exposed
  filesystem-path response.

## Evidence

- `npm test -- --run`: 18 files, 70 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed (TypeScript check and production Vite build).
- `UV_CACHE_DIR=/tmp/boat_control_uv_cache uv run pytest -q`: 72 passed.
- `git diff --check`: passed.

## Remaining cross-owner constraints

The accepted API contract in `docs/20260718_api_contract.md` specifies
per-rule attribute/value details, distinct violation metrics, server-side
pagination, editable settings, saved filters, and presets. Those need backend
endpoints and result fields before the client can complete their UI adapters;
they remain outside this frontend-only follow-up rather than being guessed in
the client.
