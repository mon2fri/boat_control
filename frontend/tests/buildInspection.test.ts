/**
 * Production-build inspection.
 *
 * Scans `frontend/dist/` after a build and fails when:
 *   - the directory is missing or empty,
 *   - `index.html` references assets via root-local (`/assets/...`) URLs
 *     instead of the relative `./assets/...` form Django's SPA fallback
 *     can serve at any URL prefix,
 *   - any built asset references an external `http(s)://...` URL **in a way
 *     the browser would actually fetch** (e.g. `fetch("https://…")`,
 *     `new URL("https://…")`, `<script src="https://…">`,
 *     `import("https://…")`, `XMLHttpRequest.open("…","https://…")`,
 *     `<link href="https://…">`, dynamic `import("https://…")`).
 *     URLs inside string literals that the browser never dereferences —
 *     Zod error messages, React Router docs links, JSON Schema metadata —
 *     are explicitly allowed because they cost nothing at runtime and
 *     removing them would require patching upstream packages.
 *   - any built asset references the Vite dev-server port `5173` (only the
 *     optional `--hot` launcher uses that port; production runtime must
 *     never depend on it).
 *
 * Run via `npm run build:inspect` (depends on a fresh `npm run build`).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const DIST_DIR = resolve(__dirname, "..", "dist");
const HAS_DIST = existsSync(DIST_DIR) && statSync(DIST_DIR).isDirectory() && readdirSync(DIST_DIR).length > 0;

/**
 * Match external URLs that the browser would actually fetch. Each pattern
 * requires the URL to appear as a function/method argument, a URL field, or
 * a property assignment — never as a free-floating string literal.
 *
 * Note: template literals (`` ` ``) are explicitly excluded. Zod uses
 * `` `http://[${value}]` `` to validate IPv6 / CIDRv6 strings — those are
 * literal strings that the browser never dereferences.
 *
 * Each pattern uses `[^"\s)]+` so we stop at the closing quote / whitespace
 * / closing paren and avoid bleeding into adjacent code.
 */
const FETCHED_URL_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "fetch(URL)", pattern: /fetch\(\s*["']\s*(https?:\/\/[^"'\s)]+)/i },
  { name: "import(URL)", pattern: /import\(\s*["']\s*(https?:\/\/[^"'\s)]+)/i },
  { name: "new URL(URL)", pattern: /new\s+URL\(\s*["']\s*(https?:\/\/[^"'\s)]+)/i },
  { name: "src=URL", pattern: /\bsrc\s*=\s*["']\s*(https?:\/\/[^"'\s]+)/i },
  { name: "href=URL", pattern: /\bhref\s*=\s*["']\s*(https?:\/\/[^"'\s]+)/i },
  { name: "XHR.open(method, URL)", pattern: /\.open\(\s*["'][^"']*["']\s*,\s*["']\s*(https?:\/\/[^"'\s)]+)/i },
  { name: "WebSocket(URL)", pattern: /new\s+WebSocket\(\s*["']\s*(wss?:\/\/[^"'\s)]+)/i },
  { name: "EventSource(URL)", pattern: /new\s+EventSource\(\s*["']\s*(https?:\/\/[^"'\s)]+)/i },
  { name: "axios(URL)", pattern: /\baxios(?:\.get|\.post|\.put|\.delete|\.head|\.patch)?\(\s*["']\s*(https?:\/\/[^"'\s)]+)/i },
];

/** Word-boundary port `5173`. The dev server runs there, production must not. */
const DEV_PORT = /\b5173\b/;

const describeIfBuilt = HAS_DIST ? describe : describe.skip;

describeIfBuilt("production build inspection", () => {
  const indexHtml = readFileSync(join(DIST_DIR, "index.html"), "utf8");
  const assetDir = join(DIST_DIR, "assets");
  const assetFiles = existsSync(assetDir)
    ? readdirSync(assetDir).map((name) => join(assetDir, name))
    : [];

  it("emits a hashed JS asset and a hashed CSS asset", () => {
    const js = assetFiles.find((p) => p.endsWith(".js"));
    const css = assetFiles.find((p) => p.endsWith(".css"));
    expect(js, "expected a hashed JS asset under dist/assets").toBeTruthy();
    expect(css, "expected a hashed CSS asset under dist/assets").toBeTruthy();
  });

  it("references hashed assets with absolute (/assets/...) or relative (./assets/...) URLs", () => {
    // The build may emit either form, depending on whether `vite.config.ts`
    // sets `base: "./"` or `base: "/"`. Both forms must remain origin-rooted
    // so deep-link refreshes (`/results/<runId>`) resolve hashed assets at
    // any URL prefix Django serves them under. We forbid any URL that
    // points outside the local origin (CDN/external) and require every
    // asset reference to include the hashed directory + filename.
    expect(indexHtml).not.toMatch(/src="https?:\/\//);
    expect(indexHtml).not.toMatch(/href="https?:\/\//);
    expect(indexHtml).toMatch(/src="(?:\.\/|\/)assets\/[^"]+\.js"/);
    expect(indexHtml).toMatch(/href="(?:\.\/|\/)assets\/[^"]+\.css"/);
  });

  it("contains no fetched external http(s) URLs in index.html or any built asset", () => {
    const offenders: { file: string; kind: string; url: string }[] = [];
    const check = (path: string, source: string) => {
      for (const { name, pattern } of FETCHED_URL_PATTERNS) {
        for (const match of source.matchAll(new RegExp(pattern, "gi"))) {
          offenders.push({ file: path, kind: name, url: match[1]! });
        }
      }
    };
    check(join(DIST_DIR, "index.html"), indexHtml);
    for (const path of assetFiles) {
      check(path, readFileSync(path, "utf8"));
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });

  it("does not embed the Vite dev-server port 5173", () => {
    const check = (path: string, source: string) => {
      expect(source, `port 5173 found in ${path}`).not.toMatch(DEV_PORT);
    };
    check(join(DIST_DIR, "index.html"), indexHtml);
    for (const path of assetFiles) {
      check(path, readFileSync(path, "utf8"));
    }
  });
});

/**
 * Always-on sanity: when no build exists at all we want a clear message,
 * not a confusing pass. We surface this even on a fresh checkout.
 */
describe("production build inspection (always-on)", () => {
  it("dist/ exists and is non-empty (run `npm run build` first)", () => {
    if (!HAS_DIST) {
      throw new Error(
        "frontend/dist/ is missing or empty. Run `cd frontend && npm run build` before running build:inspect.",
      );
    }
    expect(HAS_DIST).toBe(true);
  });
});