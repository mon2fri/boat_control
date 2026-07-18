# Browser-to-Django acceptance journey

Date: 2026-07-18
Owner: Worker B
Status: Complete for Worker B; depends on Worker A for Django serving the
production build and providing the listed endpoints.

This document is the Worker B handoff for the single-port delivery and
Playwright journey. The canonical version of the delivery contract
lives in `docs/20260718_contract_single_port_delivery.md`; this document
expands the Worker-B-owned portions and the per-step run instructions.

## 1. What the journey covers

`frontend/e2e/journey.spec.ts` exercises the production React build
against a running Django server for the full product surface:

1. **Upload** two CSVs and inspect headers.
2. **Prepare** with a key column selected before continuing.
3. **Rules** default selection (or no rules if the catalog is empty).
4. **Execute and save** through the run-results endpoint.
5. **History** navigation, then a deep-link refresh on the saved run's URL.
6. **Export** HTML and verify the download lands with the server-supplied
   filename.

It also asserts:

- No runtime request targets an external origin (offline-safe).
- Deep-link refreshes succeed because Django's SPA fallback returns
  the production `index.html`.
- All asset URLs in the served HTML are relative (`./assets/...`).
- The browser never touches the Vite dev-server port 5173.

---

## 2. Production build output

Vite is configured to emit a single self-contained directory that Django
serves as the application root:

| Property | Value |
|----------|-------|
| Output directory | `frontend/dist/` |
| HTML entry | `frontend/dist/index.html` |
| Hashed assets directory | `frontend/dist/assets/` |
| Asset URL form in `index.html` | `./assets/index-<hash>.{js,css}` (relative) |
| Source maps | Disabled (`sourcemap: false`) |
| Inline asset threshold | `0` (nothing is base64-inlined) |

The build is reproducible: `cd frontend && npm install && npm run build`
on a clean tree.

### Build verification

`npm run build:inspect` runs `tests/buildInspection.test.ts`, which:

1. Confirms `dist/index.html` references hashed JS/CSS via relative URLs
   (`./assets/...`) and **not** root-local URLs (`/assets/...`).
2. Confirms the produced bundle does not contain any external URL in a
   form the browser would fetch (`fetch(URL)`, `import(URL)`,
   `new URL(URL)`, `<script src=URL>`, `<link href=URL>`,
   `XHR.open(method, URL)`, `WebSocket(URL)`, `EventSource(URL)`,
   `axios(URL)`). URLs inside string literals used for error messages,
   Zod JSON-schema metadata, or React Router documentation links are
   explicitly allowed because the browser never dereferences them.
3. Confirms the Vite dev-server port `5173` is not embedded anywhere in
   the bundle or the index HTML — the production runtime must depend
   only on Django's port.

If any of these fail the inspection suite fails, which means the build
is unsuitable for single-port delivery.

---

## 3. What Django must serve

The exact contract Django needs to honour is captured in
`docs/20260718_contract_single_port_delivery.md`. Worker B's
expectations, summarised:

### 3.1 Approved SPA fallback routes

| Route | Fallback behaviour |
|-------|--------------------|
| `/` | `frontend/dist/index.html` |
| `/prepare` | `frontend/dist/index.html` |
| `/rules` | `frontend/dist/index.html` |
| `/results` | `frontend/dist/index.html` |
| `/results/:id` | `frontend/dist/index.html` |
| `/history` | `frontend/dist/index.html` |
| `/settings` | `frontend/dist/index.html` |

### 3.2 Never fallback

| Prefix / pattern | Why |
|------------------|-----|
| `/api/**` | API responses — must not be masked by `index.html` |
| `/static/**` | Hashed assets — must return the file with `immutable` cache header |
| `/api/health/` | Health endpoint used by Playwright readiness |
| Exports (`/api/reports/export/**`) | Binary response |
| `/favicon.ico` (served from `dist/`) | Static file |

### 3.3 Cache headers

| Resource | `Cache-Control` |
|----------|-----------------|
| `index.html` | `no-cache` (revalidation) |
| Hashed assets under `/static/assets/*` | `max-age=31536000, immutable` |
| `/api/**` | `no-store` |

### 3.4 Missing-build error

If `frontend/dist/` is absent or empty, Django must fail loudly with a
500 error containing:

```
Frontend build not found at frontend/dist/. Run: cd frontend && npm run build
```

so the user knows the exact remediation step.

---

## 4. Playwright configuration

`frontend/playwright.config.ts`:

- `testDir: "./e2e"`
- `baseURL: http://127.0.0.1:8765`
- `webServer.url: http://127.0.0.1:8765/api/health/` (the **implemented**
  health endpoint; not `/health/`).
- `webServer.command`: starts Django with
  `DATA_DIR=data/playwright PYTHONPATH=backend` so the journey runs in
  an isolated runtime directory that does not mutate developer data.

The `npm run test:e2e` script first invokes `npm run build`, so the
journey exercises the production bundle Django serves — the same files
end users will load.

### 4.1 One-time install

```bash
cd frontend
npm install                     # installs @playwright/test (pinned dev dep)
npx playwright install chromium # one-time browser binary install
```

Chromium is the only required browser. No Safari, Firefox, or WebKit
binaries need to be installed for the acceptance gate.

### 4.2 Repeatable run

```bash
cd frontend
npm run test:e2e
```

This builds the production bundle, then runs `playwright test`, which:

1. Boots Django on `127.0.0.1:8765` with isolated data.
2. Waits for `/api/health/` to return 200.
3. Runs the journey spec under `frontend/e2e/`.

---

## 5. Cross-boundary notes for Worker A

- Worker B's journey is pinned to Django on port `8765` (not the
  production port `8000`) so it can run alongside the developer
  launcher without colliding. Both ports serve the same SPA fallback
  contract.
- Worker B does **not** start a Vite dev server in the normal
  acceptance workflow. The optional `npm run dev` (Vite on `:5173`)
  remains available for fast HMR during development, but
  `./scripts/dev.sh` must not depend on it.
- The build inspection test refuses to start until `frontend/dist/`
  exists; the inspection is a Vitest test rather than a Vite plugin so
  it survives CI stages that run Vite and Vitest separately.
- The journey's external-origin guard throws (rather than silently
  aborting) so a leaked fetch becomes an immediate, named failure
  rather than a hang.
- Worker B does not own the Django settings, URL routing, static-file
  serving, or middleware. Those belong to Worker A per
  `docs/20260718_handoff_worker_matrix.md`.