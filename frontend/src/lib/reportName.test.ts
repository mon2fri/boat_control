import { describe, expect, it } from "vitest";
import { defaultReportName, validateReportName } from "./reportName";

describe("validateReportName", () => {
  it("accepts a normal name", () => {
    expect(validateReportName("baseline_vs_candidate").valid).toBe(true);
  });

  it("rejects empty and whitespace-only names", () => {
    expect(validateReportName("   ").valid).toBe(false);
  });

  it("rejects path separators and traversal", () => {
    expect(validateReportName("../secret").valid).toBe(false);
    expect(validateReportName("a/b").valid).toBe(false);
    expect(validateReportName("a\\b").valid).toBe(false);
    expect(validateReportName("..").valid).toBe(false);
  });

  it("rejects reserved shell/file characters", () => {
    for (const bad of ["a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b"]) {
      expect(validateReportName(bad).valid).toBe(false);
    }
  });

  it("rejects control characters", () => {
    expect(validateReportName(`a${String.fromCharCode(9)}b`).valid).toBe(false); // tab
    expect(validateReportName(`a${String.fromCharCode(0)}b`).valid).toBe(false); // null
    expect(validateReportName(`a${String.fromCharCode(127)}b`).valid).toBe(false); // DEL
  });

  it("rejects overly long names", () => {
    expect(validateReportName("x".repeat(121)).valid).toBe(false);
  });
});

describe("defaultReportName", () => {
  it("joins file stems with _vs_ and strips extensions", () => {
    expect(defaultReportName("baseline.csv", "candidate.csv")).toBe("baseline_vs_candidate");
  });
});
