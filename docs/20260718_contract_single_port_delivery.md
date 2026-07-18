# Contract — Single-Port Delivery Topology

Version: 1
Date: 2026-07-18
Owner: Worker C
Status: **FROZEN** — Workers A and B must not independently change the delivery topology.

## 1. Build handoff directory

`frontend/dist/` is the production build output directory.

- Vite builds to `frontend/dist/` with `outDir: "dist"` (already configured in `vite.config.ts`).
- All asset URLs are relative (`./`) or root-local (`/`), not absolute.
- The build contains no external scripts, styles, fonts, images, or source maps.
- Django serves this directory as the application root.

## 2. Django routing

### 2.1 Request routing table

| Request pattern | Django handler | Behavior |
|----------------|----------------|----------|
| `GET /api/**` | Django REST framework views | API responses |
| `GET /static/**` | Django static files | Hashed asset files from `frontend/dist/assets/` |
| `GET /` | SPA fallback | Returns `frontend/dist/index.html` |
| `GET /prepare` | SPA fallback | Returns `frontend/dist/index.html` |
| `GET /rules` | SPA fallback | Returns `frontend/dist/index.html` |
| `GET /results` | SPA fallback | Returns `frontend/dist/index.html` |
| `GET /results/:id` | SPA fallback | Returns `frontend/dist/index.html` |
| `GET /history` | SPA fallback | Returns `frontend/dist/index.html` |
| `GET /settings` | SPA fallback | Returns `frontend/dist/index.html` |
| `GET /api/health/` | Health endpoint | `{"status": "ok"}` |
| `GET /favicon.ico` | 404 or static | Not required |
| Any other `GET` | SPA fallback | Returns `frontend/dist/index.html` |

### 2.2 Routing rules

1. `/api/` prefix is **never** intercepted by the SPA fallback.
2. `/static/` prefix serves hashed assets from `frontend/dist/assets/`.
3. Known asset extensions (`.js`, `.css`, `.png`, `.svg`, `.woff2`) are served with correct MIME
   types and immutable cache headers.
4. `index.html` is served with `Cache-Control: no-cache` (revalidation).
5. All other GET requests that don't match `/api/` or known static files return `index.html`
   for SPA deep-link support.

### 2.3 Missing build error

If `frontend/dist/` does not exist or is empty, Django returns a clear 500 error:

```
Frontend build not found at frontend/dist/. Run: cd frontend && npm run build
```

## 3. Cache headers

| Resource | Cache-Control | Notes |
|----------|---------------|-------|
| `index.html` | `no-cache` | Always revalidated |
| Hashed assets (`/static/assets/*`) | `max-age=31536000, immutable` | Fingerprinted filenames |
| `/api/*` | `no-store` | API responses are never cached |

## 4. MIME types

| Extension | Content-Type |
|-----------|-------------|
| `.html` | `text/html` |
| `.js` | `application/javascript` |
| `.css` | `text/css` |
| `.json` | `application/json` |
| `.png` | `image/png` |
| `.svg` | `image/svg+xml` |
| `.woff2` | `font/woff2` |
| `.ico` | `image/x-icon` |

## 5. Normal launcher behavior

`./scripts/dev.sh` default behavior:

1. Check prerequisites (`uv`, `node`, `npm`).
2. Install Python dependencies (`uv sync`).
3. Install frontend dependencies (`cd frontend && npm install`).
4. Run Django migrations.
5. Build frontend if `frontend/dist/` is absent or stale (`cd frontend && npm run build`).
6. Start Django on `http://127.0.0.1:8000/` with `--noreload` (production mode).
7. The application is accessible at `http://127.0.0.1:8000/`.

Optional `--hot` mode (explicit flag only):

```bash
./scripts/dev.sh --hot
```

- Starts Django on `:8000` as above.
- Additionally starts Vite dev server on `:5173` with proxy to Django.
- Developer accesses React UI on `:5173` during development.

## 6. Playwright configuration

### 6.1 Server command

```
cd .. && DJANGO_SETTINGS_MODULE=boat_control.settings PYTHONPATH=backend \
  DATA_DIR=data/playwright python -m django runserver 127.0.0.1:8765 --noreload
```

### 6.2 URLs

| Setting | Value |
|---------|-------|
| Base URL | `http://127.0.0.1:8765` |
| Readiness URL | `http://127.0.0.1:8765/api/health/` |
| SPA routes | `http://127.0.0.1:8765/`, `/prepare`, `/rules`, `/results`, `/history`, `/settings` |

### 6.3 Isolated data

- `DATA_DIR=data/playwright/` isolates Playwright from developer data.
- Uploads, results, and session data are written to `data/playwright/`.
- `data/playwright/` is in `.gitignore`.

### 6.4 Browser dependency

- `@playwright/test` must be in `devDependencies` in `package.json`.
- Chromium browser binary installed via `npx playwright install chromium`.
- No other browsers required.

### 6.5 External network guard

Playwright's `page.route` rejects any request to a non-localhost origin:

```typescript
page.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    route.abort();
  } else {
    route.continue();
  }
});
```

## 7. Frontend build verification

After `npm run build`, verify no external references:

```bash
grep -roiE 'https?://[a-z0-9.-]+' frontend/dist/assets/ | sort -u
```

Only string literals inside third-party error messages (Zod, React Router) should appear. No
fetched resources.

## 8. Ownership

| Component | Owner |
|-----------|-------|
| Vite build configuration | Worker B — `frontend/vite.config.ts` |
| Production build output | Worker B — `npm run build` |
| Django static file serving | Worker A — URL configuration + middleware |
| SPA fallback routing | Worker A — URL configuration |
| `scripts/dev.sh` | Worker A — bash script |
| Playwright configuration | Worker B — `frontend/playwright.config.ts` |
| E2E journey tests | Worker B — `frontend/e2e/journey.spec.ts` |
