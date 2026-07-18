# Frontend Developer Guide

Boat Control's client is a React 19 + TypeScript single-page app built with Vite. It talks only
to the local Django backend over same-origin `/api` requests and bundles every asset locally so
the runtime works fully offline.

## Prerequisites

- Node.js 20+ (developed against Node 24)
- The Django backend running locally on `http://127.0.0.1:8000` (see the backend docs)

## Install

```bash
cd frontend
npm install
```

## Common commands

| Command          | Purpose                                                      |
| ---------------- | ----------------------------------------------------------- |
| `npm run dev`    | Start Vite dev server on port 5173; proxies `/api` to Django |
| `npm run build`  | Type-check (`tsc -b`) then produce the offline bundle in `dist/` |
| `npm run lint`   | Run ESLint, including the anti-XSS / offline rules          |
| `npm test`       | Run the Vitest unit/component suite                          |

## Project layout

```text
src/
├── api/            # client.ts (fetch boundary), schemas.ts (Zod), endpoints.ts (typed calls)
├── components/     # Reusable UI: AppShell, ErrorBoundary, SearchableSelect, RequireSession
├── pages/          # One module per route
├── state/          # WorkflowContext — cross-page session/selection state
├── test/           # Vitest setup
├── router.tsx      # Route table
├── main.tsx        # App bootstrap (providers + router)
└── index.css       # Global styles (no external fonts)
```

## Conventions

- **Network access goes through `src/api/client.ts` only.** ESLint forbids calling `fetch`
  elsewhere. Every response is validated with a Zod schema before it reaches the UI.
- **No raw HTML sinks.** `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, and
  dynamic `Function` construction are ESLint errors. Render all user-derived content as React text.
- **Server state** lives in TanStack Query (`useQuery`/`useMutation`); **workflow selections**
  (upload session, filters, targets, chosen rules, current result) live in `WorkflowContext`.
- **Accessibility first.** Provide labels, roles, and keyboard support; the app shell exposes a
  skip link and a focusable `<main>`.
- **TypeScript is strict** (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`). Prefer
  explicit `| undefined` on optional pass-through props.

## Offline verification

After `npm run build`, the `dist/` bundle references no external hosts. The only external URLs
present are string literals inside third-party error messages (e.g. Zod, React Router dev
warnings); they are never fetched. Confirm with:

```bash
grep -roiE 'https?://[a-z0-9.-]+' dist/assets/ | sort -u
```
