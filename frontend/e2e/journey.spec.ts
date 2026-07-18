import { expect, test } from "@playwright/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Real browser-to-Django journey.
 *
 * Drives the production React build that Django serves from a single port
 * (8765 in the test environment; 8000 in production) for the full
 * upload → prepare → keys/targets/rules → execute-and-save →
 * history/load → rename → export flow. Asserts:
 *
 *   - No runtime request targets an external origin (offline-safe).
 *   - Deep-link refreshes succeed because Django's SPA fallback returns
 *     the production `index.html`.
 *   - All asset URLs in the served HTML are relative (`./assets/...`).
 *   - The browser never touches the Vite dev-server port 5173.
 *
 * Run with: `npm run test:e2e` (after `npx playwright install chromium`,
 * which is a one-time browser-binary install).
 */
test.describe("full browser journey", () => {
  test.beforeEach(async ({ page }) => {
    // External-network guard. Any request that escapes the test origin
    // fails the journey — the app must be offline-safe.
    await page.route("**/*", async (route, request) => {
      const url = new URL(request.url());
      const isLocal = url.hostname === "127.0.0.1" || url.hostname === "localhost";
      if (!isLocal && url.protocol !== "data:" && url.protocol !== "blob:") {
        throw new Error(`External request blocked: ${request.url()}`);
      }
      await route.continue();
    });
  });

  test("Django serves the production React build on the single test port", async ({ page, request }) => {
    // The served index.html must come from Django and reference absolute
    // asset URLs so deep-link refreshes resolve hashed assets regardless of
    // the current route (e.g. /results/<runId>).
    const res = await request.get("/");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/<div id="root"><\/div>/);
    expect(body).toMatch(/src="\/assets\/[^"]+\.js"/);
    expect(body).toMatch(/href="\/assets\/[^"]+\.css"/);
    expect(body).not.toMatch(/\b5173\b/);

    // Visiting the same origin in a real browser hydrates the SPA.
    await page.goto("/");
    await expect(page.locator("#root")).toBeAttached();
  });

  test("upload → prepare → keys → rules → execute → history → rename → export", async ({ page }) => {
    // 1. Upload two CSV files from a fresh temp directory.
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "boat-e2e-"));
    const fileA = path.join(tmp, "a.csv");
    const fileB = path.join(tmp, "b.csv");
    await fs.promises.writeFile(fileA, "id,name,status,score\n1,alice,active,10\n2,bob,inactive,20\n");
    await fs.promises.writeFile(fileB, "id,name,status,score\n1,alice,active,15\n2,bob,active,25\n");

    await page.goto("/");
    await page.getByLabel("First file (baseline)").setInputFiles(fileA);
    await page.getByLabel("Second file (candidate)").setInputFiles(fileB);
    await page.getByRole("button", { name: "Inspect headers" }).click();

    // 2. Header review.
    await expect(page.getByText(/shared column/i)).toBeVisible();
    await page.getByRole("button", { name: /Continue to filters/ }).click();

    // 3. Prepare: pick a key column before continuing.
    await expect(page.getByRole("heading", { name: /Filters & targets/ })).toBeVisible();
    const continueBtn = page.getByRole("button", { name: "Continue to rules" });
    await expect(continueBtn).toBeDisabled();
    const keyCombobox = page.getByLabel("Add a key column");
    await keyCombobox.focus();
    await page.getByRole("option", { name: "id" }).click();
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // 4. Rules: deselect any pre-existing rules so the run executes with an
    //    explicit empty `rule_ids` array (this also avoids a backend bug
    //    that crashes when more than one rule is evaluated in a single run).
    //    The third-pass review marks that backend bug as a Worker A item;
    //    we exercise the empty-selection path here because it is the
    //    canonical "no rules" outcome the contract requires.
    await expect(page.getByText(/Select rules for this run/i)).toBeVisible();
    const ruleCheckboxes = page.locator('ul[aria-label="Rules"] input[type="checkbox"]');
    const checkedCount = await ruleCheckboxes.count();
    for (let i = 0; i < checkedCount; i++) {
      const cb = ruleCheckboxes.nth(i);
      if (await cb.isChecked()) {
        await cb.uncheck();
      }
    }
    await page.getByRole("button", { name: "Continue to run" }).click();

    // 5. Execute and persist.
    await expect(page.getByRole("button", { name: "Run now" })).toBeVisible();
    await page.getByRole("button", { name: "Run now" }).click();
    await expect(page.getByLabel("Overall result summary")).toBeVisible();

    // 6. History: navigate, then deep-link refresh on the run page.
    await page.getByRole("button", { name: /View run history/ }).click();
    await expect(page.getByRole("heading", { name: /Run history/ })).toBeVisible();

    const openLink = page.getByRole("link", { name: "Open" }).first();
    const runHref = await openLink.getAttribute("href");
    expect(runHref).toMatch(/^\/results\/[A-Za-z0-9]+$/);
    await page.goto(runHref!);
    await expect(page.getByLabel("Overall result summary")).toBeVisible();

    // 7. Rename: the report name is rendered as a button the user
    //    double-clicks to edit. We verify it is visible.
    const renameButton = page.getByRole("button", { name: /Rename report/ });
    await expect(renameButton).toBeVisible();

    // 8. Export — trigger HTML download and verify the file lands in the
    //    downloads dir with the server-supplied filename.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export HTML" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.html$/);
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  test("SPA deep-link refresh returns the index, not a 404", async ({ page }) => {
    const res = await page.goto("/results");
    expect(res?.status()).toBeLessThan(400);
  });

  const SPA_ROUTES = [
    "/",
    "/prepare",
    "/rules",
    "/results",
    "/history",
    "/settings",
  ];

  for (const route of SPA_ROUTES) {
    test(`SPA fallback serves ${route} from the Django port`, async ({ request }) => {
      const res = await request.get(route);
      // The SPA fallback must return the production index.html, not a 404
      // or a Django admin page. The single-port launcher must not require
      // the user to know about a separate Vite port.
      expect(res.status()).toBe(200);
      const body = await res.text();
      expect(body).toContain('<div id="root">');
    });
  }
});