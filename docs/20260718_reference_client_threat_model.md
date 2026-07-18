# Client Threat Model & Safe-Rendering Conventions

Boat Control processes two untrusted CSV files and user-authored rule/report names. The client's
job is to render that data without letting it execute code, and to keep the runtime fully offline.

## Assets

- The user's browser session and the local Django backend it talks to.
- CSV contents, column names, filter values, rule definitions, and report names — all untrusted.

## Trust boundaries

- **Network boundary**: `src/api/client.ts` is the only module that calls `fetch`. ESLint forbids
  `fetch` elsewhere. All requests are same-origin and relative (`/api/...`); absolute and
  protocol-relative URLs are rejected before any request is made.
- **Data boundary**: every response body is parsed with a Zod schema (`src/api/schemas.ts`) before
  it reaches the UI. Malformed payloads raise `ApiError` instead of flowing into components.

## Threats & mitigations

| Threat                                   | Mitigation                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| Stored XSS via CSV cells / column names  | All user data rendered as React text; no `dangerouslySetInnerHTML`.        |
| DOM injection via raw sinks              | ESLint errors on `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`. A source-scan test (`src/security.test.tsx`) fails the build if any appear. |
| Script execution via `eval`/`Function`   | ESLint errors on `eval` and dynamic `Function`; scanned in tests.          |
| Unsafe links (`javascript:`/`data:`)     | `src/lib/safeHref.ts` allows only relative paths, fragments, and http(s)/mailto/tel; used for any data-derived href. Export links are hard-coded same-origin. |
| Path traversal via report names          | `src/lib/reportName.ts` rejects path separators, `.`/`..`, reserved and control characters. The backend re-sanitizes authoritatively. |
| External resource loading at runtime     | No external fonts/styles/scripts; assets are bundled into `dist/`. Verified by scanning the built bundle. |
| CSRF on mutations                        | `X-CSRFToken` from the `csrftoken` cookie is sent on non-GET requests; `credentials: same-origin`. |
| Spreadsheet formula injection in exports | Handled by the backend exporter (out of client scope; noted for the contract). |

## Safe-rendering conventions

1. Render user data through JSX text bindings only. Never build markup strings.
2. Cross the network only through `src/api/endpoints.ts` (which wraps the validated client).
3. Validate any new response shape with a Zod schema; do not `as`-cast untrusted data.
4. Route any data-derived `href` through `safeHref`.
5. Keep dependencies bundled; do not add `<link>`/`<script>`/`@import` to external origins.

## Verification

- `npm run lint` enforces the sink/`fetch` rules.
- `npm test` runs the source-scan and stored-XSS tests in `src/security.test.tsx`.
- `npm run build` then `grep -roiE 'https?://[a-z0-9.-]+' dist/assets/` should surface only
  string literals inside third-party error messages, never a fetched resource.
