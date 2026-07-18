# Frontend Operations Guide

Build, deploy, test, accessibility, and troubleshooting reference for the Boat Control client.
See `20260718_reference_frontend_guide.md` for day-to-day development and
`20260718_reference_ui_workflows.md` for per-screen behavior.

## Build & deploy (offline runtime)

1. `cd frontend && npm install`
2. `npm run build` — type-checks and emits a self-contained bundle to `frontend/dist/`.
3. Django serves `dist/` as static files (Worker A, backend task 8). The app makes only same-origin
   `/api` requests at runtime; no external hosts are contacted.

To verify the bundle is offline-safe:

```bash
grep -roiE 'https?://[a-z0-9.-]+' dist/assets/ | sort -u
```

Expect only string literals inside third-party error messages (e.g. `json-schema.org`,
`react.dev`, `reactrouter.com`) — these are never fetched.

## Testing

| Command                        | Scope                                             |
| ------------------------------ | ------------------------------------------------- |
| `npm test`                     | Vitest unit, component, and integration suites     |
| `npm run lint`                 | ESLint incl. anti-XSS / no-`fetch` / no-DOM rules  |
| `npx tsc -b`                   | Strict type-check                                  |
| `npm run build`                | Production build (also type-checks)               |
| `npm audit --omit=dev`         | Runtime dependency vulnerability audit            |

Test layout: component/hook tests colocate with their source (`*.test.ts[x]`); the full
upload→prepare→rules→run→results journey is in `src/journey.test.tsx`; security guards are in
`src/security.test.tsx`.

## Accessibility

- Keyboard: the app shell provides a skip link and a focusable `<main>`. The searchable combobox
  supports Arrow/Enter/Escape; dialogs focus their confirm button and close on Escape.
- Semantics: pages use landmark roles and labelled headings; status/errors use `role="status"` and
  `role="alert"`; the result table of contents uses native in-page anchors.
- Data safety doubles as a11y correctness: user content is text, so screen readers announce it
  literally.
- Motion: the loading spinner respects `prefers-reduced-motion`.

## Troubleshooting

| Symptom                                   | Likely cause / fix                                             |
| ----------------------------------------- | -------------------------------------------------------------- |
| API calls 404 in dev                      | Backend not running on `127.0.0.1:8000`; start Django.         |
| "Response failed validation" errors       | Backend payload drifted from `src/api/schemas.ts`; reconcile.  |
| Mutations return 403                       | Missing/blocked `csrftoken` cookie; ensure Django sets it.     |
| "Refusing to call an external URL"        | A path passed to the api client was absolute; use `/api/...`.  |
| Lint fails on `fetch`/`innerHTML`         | Use `src/api/endpoints.ts` / render as text — sinks are banned.|
| Blank page, console error                 | Caught by the top-level `ErrorBoundary`; check the message.    |

## Definition of done (this handoff)

- `npm run lint` → 0 errors; `npx tsc -b` → clean; `npm test` → all passing;
  `npm run build` → succeeds; `npm audit --omit=dev` → 0 vulnerabilities.
- Contract reconciliation recorded in `reviews/20260718_review_frontend_handoff.md`.
