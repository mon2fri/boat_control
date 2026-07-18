import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RuleResultSection } from "./features/results/RuleResultSection";
import type { RuleResult } from "./api/domain";

// Load every source file as raw text at build time (no Node APIs needed).
const rawModules = import.meta.glob("./**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

// Normalize to [path, source] string pairs, excluding tests, the setup file,
// and the sanctioned api client (referenced by the fetch check below).
const APP_FILES: [string, string][] = Object.entries(rawModules)
  .map(([path, content]): [string, string] => [path, typeof content === "string" ? content : ""])
  .filter(([path]) => !/\.(test|spec)\.(ts|tsx)$/.test(path) && !path.endsWith("test/setup.ts"));

const FORBIDDEN_SINKS = [
  "dangerouslySetInnerHTML",
  ".innerHTML",
  ".outerHTML",
  "insertAdjacentHTML",
  "document.write",
  "eval(",
];

describe("no raw HTML / DOM sinks in application source", () => {
  it.each(FORBIDDEN_SINKS)("does not use %s", (sink) => {
    const offenders = APP_FILES.filter(([, content]) => content.includes(sink)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("only the api client calls fetch() directly (endpoints export is a documented exception)", () => {
    // `endpoints.ts` is allowed to call `fetch` for the file-download export
    // endpoint, where the response is a raw file rather than JSON. Every other
    // module must go through `apiRequest` in `client.ts`.
    const offenders = APP_FILES.filter(
      ([path, content]) =>
        !path.endsWith("api/client.ts") &&
        !path.endsWith("api/endpoints.ts") &&
        /\bfetch\(/.test(content),
    ).map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

describe("stored-XSS payloads render as inert text", () => {
  it("renders a hostile rule name and logic without creating elements", () => {
    const hostile: RuleResult = {
      ruleIndex: "R001",
      ruleName: "<script>alert('xss')</script>",
      logicSummary: "<img src=x onerror=alert(1)>",
      violationRowCount: 0,
      violationAttributeCount: 0,
      details: [],
    };
    render(<RuleResultSection result={hostile} />);
    // The payload text is present verbatim; no script/img element was created.
    expect(screen.getByText(/alert\('xss'\)/)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
