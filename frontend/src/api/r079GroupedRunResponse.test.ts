import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/r079GroupedRunResponse.json";
import { apiRequest } from "./client";
import { loadRun, fetchDetailPage } from "./endpoints";
import { displayOutcomeValue, mapRunDocumentToResult } from "./mapping";
import { wireOutcomeValueSchema, wireRunDocumentResponseSchema } from "./wire";

afterEach(() => vi.unstubAllGlobals());

// Captured from the actual failing R079 saved response, with detail arrays sampled.
describe("R079 compound violation response", () => {
  it("accepts and maps the actual run response without losing observed columns", () => {
    const parsed = wireRunDocumentResponseSchema.parse(fixture);
    const violation = parsed.result.validation.violations_by_rule.R079![0]!;
    expect(violation.violating_value).toEqual({ sa_flag: "Yes", cva_flag: "Yes" });
    const mapped = mapRunDocumentToResult(parsed);
    expect(JSON.stringify(mapped)).toContain("sa_flag=Yes, cva_flag=Yes");
    expect(JSON.stringify(mapped)).not.toContain("[object Object]");
  });

  it("validates the execute response and restores the same saved run", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify(fixture), { status: 200 })));
    const executed = await apiRequest("/runs/execute/", {
      method: "POST", body: {}, schema: wireRunDocumentResponseSchema,
    });
    expect(executed.run_id).toBe(fixture.run_id);
    const restored = await loadRun(fixture.run_id);
    expect(JSON.stringify(restored)).toContain("sa_flag=Yes, cva_flag=Yes");
  });

  it("loads paginated compound observations with the same readable values", async () => {
    const violation = fixture.result.validation.violations_by_rule.R079[0]!;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      run_id: fixture.run_id, section: "violations", offset: 0, total: 1, has_more: false,
      details: [{ row_key: "1", key_columns: violation.key_columns,
        column: violation.violating_column, file_a_value: null,
        file_b_value: violation.violating_value, violating_value: violation.violating_value }],
    }), { status: 200 })));
    const page = await fetchDetailPage(fixture.run_id, "violation");
    expect(page.rows[0]!.file2Value).toBe("sa_flag=Yes, cva_flag=Yes");
    expect(page.rows[0]!.violatingValue).toBe("sa_flag=Yes, cva_flag=Yes");
  });

  it("renders null/blank distinctly and rejects nested maps and arrays", () => {
    expect(displayOutcomeValue({ sa: null, cva: "" })).toBe("sa=(null), cva=(blank)");
    expect(displayOutcomeValue(null)).toBeNull();
    expect(displayOutcomeValue("No")).toBe("No");
    expect(wireOutcomeValueSchema.safeParse({ sa: { nested: "Yes" } }).success).toBe(false);
    expect(wireOutcomeValueSchema.safeParse(["Yes", "No"]).success).toBe(false);
  });
});
