import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Offline-first build: assets are bundled and emitted locally under dist/.
// The dev proxy forwards API traffic to the local Django backend so the
// browser never talks to an external host directly.
//
// `base: "/"` makes the emitted index.html reference assets as
// `/assets/index-<hash>.js` so deep-link routes like `/results/<runId>`
// resolve their hashed assets regardless of the current URL prefix.
// Django serves both the SPA and the `/assets/...` directory from the same
// root, so this is the simplest path that makes refresh-on-deep-link work.
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    // Emit predictable, self-contained assets for Django to serve.
    assetsInlineLimit: 0,
    sourcemap: false,
    // Keep asset filenames stable and hash-based; Django's static handler
    // serves them directly with immutable cache headers.
    assetsDir: "assets",
    emptyOutDir: true,
  },
  server: {
    // 5173 is the optional hot-reload dev server only. The normal single-port
    // launcher (`./scripts/dev.sh`) does NOT use this port — Django serves the
    // production bundle on :8000.
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: false,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
  },
});
