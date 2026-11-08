import { describe, expect, it } from "vitest";
import { mapRunDocumentToResult } from "./mapping";
import { wireRunDocumentResponseSchema } from "./wire";
import { workflowConfigurationFromRun } from "../state/WorkflowContext";

const runtimeEnvironment = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;
const actualResponseJson = runtimeEnvironment?.S35_RUN_RESPONSE_JSON;

describe("isolated current S35 run response", () => {
  it.skipIf(!actualResponseJson)(
    "validates, maps and restores the actual R056/R057 saved response",
    () => {
      const document = wireRunDocumentResponseSchema.parse(
        JSON.parse(actualResponseJson!),
      );
      const result = mapRunDocumentToResult(document);
      const restored = workflowConfigurationFromRun(
        result,
        result.comparisonColumns,
      );

      expect(result.ruleResults.map((rule) => rule.ruleIndex).sort()).toEqual([
        "R056",
        "R057",
      ]);
      expect(result.nestedAggregationEnabled).toBe(true);
      expect(result.comparisonSections).toHaveLength(2);
      expect(result.filtersRelation).toBeNull();
      expect(result.filtersGroupTree).toBeNull();
      expect(restored.filterGroupingErrors).toEqual([]);
      expect(restored.filters).toEqual([]);
      expect(restored.nestedAggregationEnabled).toBe(true);
      expect(restored.aggregationColumns).toEqual(["status", "region"]);
      expect(restored.keyColumns).toEqual(["id", "name"]);
    },
  );
});
