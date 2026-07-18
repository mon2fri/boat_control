import { defineConfig } from "@playwright/test";

/**
 * Playwright config for the real browser-to-Django journey.
 *
 * The journey exercises the same Django-served production React build that
 * end users will load — not a separate Vite dev server. The webServer block:
 *   1. (Implicit) `npm run test:e2e` runs `npm run build` first so the
 *      frontend/dist/ directory exists.
 *   2. Applies Django migrations so the SQLite schema is current.
 *   3. Starts the Django server with `data/playwright/` as the isolated
 *      runtime data dir so the journey does not mutate developer data.
 *
 * Run from `frontend/`:
 *
 *   npm install                       # includes @playwright/test (pinned)
 *   npx playwright install chromium   # one-time browser binary install
 *   npm run test:e2e                  # builds + migrates + starts Django
 *                                     # + runs the journey
 *
 * Readiness URL is `/api/health/`, the implemented health endpoint. The
 * journey asserts that Django also serves the React `index.html` on `/` and
 * on every SPA route, with relative asset URLs so the app runs at any
 * reverse-proxy prefix.
 */
const PORT = 8765;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const READINESS_URL = `${BASE_URL}/api/health/`;

// `uv run` ensures the same virtualenv the developer uses for the backend
// is on PATH; `manage.py` is the only entry point that reliably resolves
// the `boat_control` package on every checkout (PYTHONPATH alone is not
// enough on some Python/Django combos).
const DJANGO_COMMAND =
  "cd .. && uv run python backend/manage.py migrate " +
  "--settings=boat_control.settings --noinput && " +
  "uv run python backend/manage.py runserver 127.0.0.1:" + PORT +
  " --settings=boat_control.settings --noreload";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: DJANGO_COMMAND,
    url: READINESS_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Tell Playwright to wait until Django returns 2xx, not just to connect.
    waitForURL: READINESS_URL,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATA_DIR: "data/playwright",
    },
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});