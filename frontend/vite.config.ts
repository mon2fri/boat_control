import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Offline-first build: assets are bundled and emitted locally under dist/.
// The dev proxy forwards API traffic to the local Django backend so the
// browser never talks to an external host directly.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // Emit predictable, self-contained assets for Django to serve.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: {
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
