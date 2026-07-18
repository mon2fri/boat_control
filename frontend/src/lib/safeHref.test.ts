import { describe, expect, it } from "vitest";
import { isSafeHref, safeHref } from "./safeHref";

describe("isSafeHref", () => {
  it("allows relative paths, fragments, and safe schemes", () => {
    for (const ok of ["/api/x", "#overall", "./a", "../b", "https://example.com", "mailto:a@b.co"]) {
      expect(isSafeHref(ok)).toBe(true);
    }
  });

  it("blocks script-bearing and dangerous schemes", () => {
    for (const bad of [
      "javascript:alert(1)",
      "  javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "",
    ]) {
      expect(isSafeHref(bad)).toBe(false);
    }
  });

  it("falls back to an inert href for unsafe input", () => {
    expect(safeHref("javascript:alert(1)")).toBe("#");
    expect(safeHref("/api/ok")).toBe("/api/ok");
  });
});
