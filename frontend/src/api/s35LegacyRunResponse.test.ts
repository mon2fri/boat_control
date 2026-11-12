import { afterEach, describe, expect, it, vi } from "vitest";
import { loadRun } from "./endpoints";
import { mapRunDocumentToResult } from "./mapping";
import { wireRunDocumentResponseSchema } from "./wire";
import { s35LegacyRunResponse as fixture } from "./__fixtures__/s35LegacyRunResponse.fixture";

afterEach(() => vi.unstubAllGlobals());

/**
 * Snapshot of the integration saved-run response created by the actual S35 +
 * R056/R057 execution. The backend completed the run; the frontend rejected
 * the response because the run-result serializer emits explicit JSON null for
 * `filter_relation` and `filter_grouping_tree` when no filter grouping exists.
 */

describe("S35 + legacy R056/R057 run response", () => {
  it("accepts explicit null filter grouping from the run-result serializer", () => {
    const parsed = wireRunDocumentResponseSchema.parse(fixture);
    expect(parsed.result.filter_relation).toBeNull();
    expect(parsed.result.filter_grouping_tree).toBeNull();
    expect(parsed.result.filters_applied).toEqual([]);
    expect(parsed.result.nested_aggregation_enabled).toBe(true);
    expect(parsed.result.comparison_sections).toHaveLength(2);
    expect(parsed.result.rule_bindings).toEqual({
      R057: "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
      R056: "CBR1_0Z100ERCHKBF4R1AGQ5T",
    });
  });

  it("maps nested aggregation, comparison sections and both legacy rules without data loss", () => {
    const result = mapRunDocumentToResult(wireRunDocumentResponseSchema.parse(fixture));

    expect(result.filtersApplied).toEqual([]);
    expect(result.filtersRelation).toBeNull();
    expect(result.filtersGroupTree).toBeNull();
    expect(result.nestedAggregationEnabled).toBe(true);
    expect(result.aggregationColumns).toEqual(["status", "region"]);
    expect(result.comparisonSections).toEqual([
      { id: "cs-1", name: "TBBBB", columns: ["region", "status"] },
      { id: "cs-2", name: "asdfadf", columns: ["name", "status"] },
    ]);
    expect(result.comparisonColumns).toEqual([
      "name",
      "status",
      "id",
      "region",
      "score",
      "sa_flag",
      "cva_flag",
      "system",
    ]);
    expect(result.groupStatistics?.overall.length).toBeGreaterThan(0);
    expect(result.groupStatistics?.validationRules.R056?.length).toBeGreaterThan(0);
    expect(result.groupStatistics?.validationRules.R057?.length).toBeGreaterThan(0);

    const validStatus = result.ruleResults.find((rule) => rule.ruleName === "Valid status");
    const lowScore = result.ruleResults.find((rule) => rule.ruleName === "Low Score");
    expect(validStatus).toMatchObject({
      ruleIndex: "R056",
      ruleIdentifier: "CBR1_0Z100ERCHKBF4R1AGQ5T",
      violationRowCount: 16,
      violationAttributeCount: 16,
    });
    expect(validStatus?.logicSummary).toContain("status equals");
    expect(lowScore).toMatchObject({
      ruleIndex: "R057",
      ruleIdentifier: "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
      violationRowCount: 32,
      violationAttributeCount: 32,
    });
    expect(lowScore?.logicSummary).toContain("score greater than");
    expect(result.ruleResults).toHaveLength(2);
  });

  it("restores the same saved run through the history GET path", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(fixture)),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadRun("e4ad6f7e9feb");

    expect(String(fetchMock.mock.calls[0]![0])).toContain("/api/runs/e4ad6f7e9feb/");
    expect(result.filtersRelation).toBeNull();
    expect(result.filtersGroupTree).toBeNull();
    expect(result.nestedAggregationEnabled).toBe(true);
    expect(result.comparisonSections).toHaveLength(2);
    expect(result.ruleResults.map((rule) => rule.ruleName).sort()).toEqual([
      "Low Score",
      "Valid status",
    ]);
  });

  it("still rejects malformed grouping values rather than accepting unknown payloads", () => {
    const malformedRelation = structuredClone(fixture) as {
      result: { filter_relation: unknown };
    };
    malformedRelation.result.filter_relation = "xor";
    expect(() => wireRunDocumentResponseSchema.parse(malformedRelation)).toThrow();

    const malformedTree = structuredClone(fixture) as {
      result: { filter_grouping_tree: unknown };
    };
    malformedTree.result.filter_grouping_tree = { kind: "and", children: [] };
    expect(() => wireRunDocumentResponseSchema.parse(malformedTree)).toThrow();
  });
});
