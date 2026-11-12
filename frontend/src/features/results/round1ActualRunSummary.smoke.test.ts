import { describe, expect, it } from "vitest";
import { mapRunDocumentToResult } from "../../api/mapping";
import { wireRunDocumentResponseSchema } from "../../api/wire";
import { summarizeAppliedFilters } from "./appliedFilterSummary";

const runtimeEnvironment = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;
const actualRunJson = runtimeEnvironment?.ROUND1_S35_RUN_JSON;

/**
 * Reviewer-owned smoke over the actual saved S35 + R079 run produced in an
 * isolated home. It proves Bug 2 independently of the worker fixture: the
 * Overall Results summary must render the persisted nested filter expression
 * (including the overall root) rather than a flat filter list.
 */
describe("isolated round 1 saved run summary", () => {
  it.skipIf(!actualRunJson)(
    "renders the complete persisted filter grouping for the saved run",
    () => {
      const document = wireRunDocumentResponseSchema.parse(JSON.parse(actualRunJson!));
      const result = mapRunDocumentToResult(document);

      expect(result.filtersApplied).toHaveLength(3);
      expect(result.filtersGroupTree).not.toBeNull();

      const summary = summarizeAppliedFilters({
        filtersApplied: result.filtersApplied,
        filtersRelation: result.filtersRelation,
        filtersGroupTree: result.filtersGroupTree,
        filtersGroupingErrors: result.filtersGroupingErrors,
      });

      expect(summary.invalid).toBe(false);
      expect(summary.hierarchy).toEqual([
        "overall: FILTER 1 AND group 1",
        "group 1: FILTER 2 OR FILTER 3",
      ]);
      expect(summary.clauses).toHaveLength(3);
      expect(summary.clauses[0]).toContain("system");
      expect(summary.clauses[0]).toContain("oomber");
    },
  );
});
