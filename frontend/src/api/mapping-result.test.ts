/**
 * Result-mapping tests covering server-provided vs. derived counts.
 * These tests prove the mapper prefers explicit server-provided counts and
 * fields over locally-derived ones, so once Worker A's evaluator lands the
 * new fields the UI renders the same numbers without code changes.
 */
import { describe, expect, it } from "vitest";
import { mapRunDocumentToResult } from "./mapping";
import type { WireRunDocument } from "./wire";

function doc(overrides: Partial<WireRunDocument["result"]["validation"]> = {}): WireRunDocument {
  return {
    run_id: "run-1",
    report_name: "a_vs_b",
    file_a_name: "a.csv",
    file_b_name: "b.csv",
    created_at: "2026-07-18T00:00:00Z",
    result: {
      comparison: {
        total_rows_a: 10,
        total_rows_b: 10,
        rows_with_changes: 2,
        total_attribute_changes: 3,
        row_details: [],
      },
      validation: {
        total_violations: 2,
        violations_by_rule: {
          R001: [
            {
              row_index: 0,
              rule_id: "R001",
              rule_name: "Status active",
              key_columns: { id: "1" },
              details: "did not match required state",
              violating_column: "status",
              violating_value: "inactive",
              rule_logic: "status must equal \"active\"",
            },
            {
              row_index: 1,
              rule_id: "R001",
              rule_name: "Status active",
              key_columns: { id: "2" },
              details: "did not match required state",
              violating_column: "status",
              violating_value: "pending",
              rule_logic: "status must equal \"active\"",
            },
          ],
        },
        violation_count_by_rule: { R001: 2 },
        distinct_violating_rows: 2,
        distinct_violating_attributes: 2,
        violating_rows_by_rule: { R001: 2 },
        violating_attributes_by_rule: { R001: 2 },
        ...overrides,
      },
      common_columns: ["id"],
      target_columns: ["status"],
      filters_applied: [],
    },
  };
}

describe("mapRunDocumentToResult", () => {
  it("uses server-provided distinct counts and per-rule counts", () => {
    const result = mapRunDocumentToResult(doc());
    expect(result.overall.ruleViolationRowCount).toBe(2);
    expect(result.overall.ruleViolationAttributeCount).toBe(2);
    expect(result.ruleResults[0]!.violationRowCount).toBe(2);
    expect(result.ruleResults[0]!.violationAttributeCount).toBe(2);
  });

  it("falls back to local derivation when the server omits the distinct counts", () => {
    const result = mapRunDocumentToResult(
      doc({
        distinct_violating_rows: undefined,
        distinct_violating_attributes: undefined,
        violating_rows_by_rule: undefined,
        violating_attributes_by_rule: undefined,
      }),
    );
    // Both violations are on distinct row keys ("1" and "2"), so the
    // local derivation produces 2.
    expect(result.overall.ruleViolationRowCount).toBe(2);
    expect(result.overall.ruleViolationAttributeCount).toBe(2);
    expect(result.ruleResults[0]!.violationRowCount).toBe(2);
    expect(result.ruleResults[0]!.violationAttributeCount).toBe(2);
  });

  it("prefers server-provided distinct counts even when the local derivation would disagree", () => {
    // Two violations share row_index 0 → key "1". Local derivation would
    // return 1 row; the server claims 5. The server wins.
    const result = mapRunDocumentToResult(
      doc({
        distinct_violating_rows: 5,
        distinct_violating_attributes: 7,
        violating_rows_by_rule: { R001: 5 },
        violating_attributes_by_rule: { R001: 7 },
        violations_by_rule: {
          R001: [
            {
              row_index: 0,
              rule_id: "R001",
              rule_name: "X",
              key_columns: { id: "1" },
              details: "...",
            },
            {
              row_index: 0,
              rule_id: "R001",
              rule_name: "X",
              key_columns: { id: "1" },
              details: "...",
            },
          ],
        },
      }),
    );
    expect(result.overall.ruleViolationRowCount).toBe(5);
    expect(result.overall.ruleViolationAttributeCount).toBe(7);
    expect(result.ruleResults[0]!.violationRowCount).toBe(5);
    expect(result.ruleResults[0]!.violationAttributeCount).toBe(7);
  });

  it("surfaces the server-provided violating column and value on the detail row", () => {
    const result = mapRunDocumentToResult(doc());
    const detail = result.ruleResults[0]!.details[0]!;
    expect(detail.column).toBe("status");
    expect(detail.violatingColumn).toBe("status");
    expect(detail.violatingValue).toBe("inactive");
  });

  it("uses the server-provided rule_logic in the per-section summary when present", () => {
    const result = mapRunDocumentToResult(doc());
    expect(result.ruleResults[0]!.logicSummary).toBe(
      'R001 — Status active: status must equal "active"',
    );
  });
});