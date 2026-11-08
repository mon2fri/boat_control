import { describe, expect, it } from "vitest";
import type { FilterRow, GroupNode } from "../../api/domain";
import { mapRunDocumentToResult } from "../../api/mapping";
import { wireRunDocumentResponseSchema } from "../../api/wire";
import { workflowConfigurationFromRun } from "../../state/WorkflowContext";
import { s35NestedFilterRunResponse } from "../../api/__fixtures__/s35NestedFilterRunResponse.fixture";
import { summarizeAppliedFilters } from "./appliedFilterSummary";

const filters: FilterRow[] = [
  { id: "f1", column: "system", operator: "contains", values: ["oomber"] },
  { id: "f2", column: "status", operator: "equals", values: ["active"] },
  { id: "f3", column: "status", operator: "equals", values: ["inactive"] },
];

const nestedTree: GroupNode = {
  kind: "and",
  children: [
    { kind: "leaf", conditionId: "f1" },
    {
      kind: "or",
      children: [
        { kind: "leaf", conditionId: "f2" },
        { kind: "leaf", conditionId: "f3" },
      ],
    },
  ],
};

describe("summarizeAppliedFilters", () => {
  it("reports no filters without inventing an expression", () => {
    expect(summarizeAppliedFilters({})).toEqual({
      hierarchy: [],
      clauses: [],
      invalid: false,
      errors: [],
    });
  });

  it("renders a single applied filter with an explicit overall root", () => {
    expect(
      summarizeAppliedFilters({ filtersApplied: [filters[0]!] }),
    ).toEqual({
      hierarchy: ["overall: FILTER 1"],
      clauses: ['FILTER 1: system contains "oomber"'],
      invalid: false,
      errors: [],
    });
  });

  it("preserves legacy multi-filter AND when no relation or tree is persisted", () => {
    expect(
      summarizeAppliedFilters({ filtersApplied: filters.slice(0, 2) }).hierarchy,
    ).toEqual(["overall: FILTER 1 AND FILTER 2"]);
  });

  it("renders an explicit flat OR", () => {
    expect(
      summarizeAppliedFilters({
        filtersApplied: filters.slice(0, 2),
        filtersRelation: "or",
      }).hierarchy,
    ).toEqual(["overall: FILTER 1 OR FILTER 2"]);
  });

  it("renders the complete nested AND/OR hierarchy", () => {
    const summary = summarizeAppliedFilters({
      filtersApplied: filters,
      filtersRelation: null,
      filtersGroupTree: nestedTree,
    });

    expect(summary.hierarchy).toEqual([
      "overall: FILTER 1 AND group 1",
      "group 1: FILTER 2 OR FILTER 3",
    ]);
    expect(summary.clauses).toEqual([
      'FILTER 1: system contains "oomber"',
      'FILTER 2: status equals "active"',
      'FILTER 3: status equals "inactive"',
    ]);
    expect(summary.invalid).toBe(false);
  });

  it("never flattens a tree that references a missing filter", () => {
    const summary = summarizeAppliedFilters({
      filtersApplied: filters.slice(0, 2),
      filtersGroupTree: {
        kind: "or",
        children: [
          { kind: "leaf", conditionId: "f1" },
          { kind: "leaf", conditionId: "removed-filter" },
        ],
      },
    });

    expect(summary.invalid).toBe(true);
    expect(summary.hierarchy).toEqual([]);
    expect(summary.clauses).toHaveLength(2);
    expect(summary.errors.join(" ")).toContain("unknown or removed");
  });

  it("rejects a malformed saved tree instead of accepting it", () => {
    const summary = summarizeAppliedFilters({
      filtersApplied: filters.slice(0, 2),
      filtersGroupTree: { kind: "and", children: [] } as unknown as GroupNode,
    });

    expect(summary.invalid).toBe(true);
    expect(summary.hierarchy).toEqual([]);
    expect(summary.errors.join(" ")).toContain("fewer than two children");
  });

  it("surfaces mapper restore errors and keeps every applied filter visible", () => {
    const summary = summarizeAppliedFilters({
      filtersApplied: filters,
      filtersGroupTree: nestedTree,
      filtersGroupingErrors: ["saved row filter grouping references unknown clauses."],
    });

    expect(summary.invalid).toBe(true);
    expect(summary.hierarchy).toEqual([]);
    expect(summary.clauses).toHaveLength(3);
    expect(summary.errors).toEqual([
      "saved row filter grouping references unknown clauses.",
    ]);
  });

  it("uses the actual saved S35 nested-filter run after API remapping", () => {
    const result = mapRunDocumentToResult(
      wireRunDocumentResponseSchema.parse(s35NestedFilterRunResponse),
    );

    expect(result.filtersApplied?.map((row) => row.id)).toEqual(["fl-0", "fl-1", "fl-2"]);
    expect(result.filtersGroupTree).toEqual({
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "fl-0" },
        {
          kind: "or",
          children: [
            { kind: "leaf", conditionId: "fl-1" },
            { kind: "leaf", conditionId: "fl-2" },
          ],
        },
      ],
    });

    const summary = summarizeAppliedFilters({
      filtersApplied: result.filtersApplied,
      filtersRelation: result.filtersRelation,
      filtersGroupTree: result.filtersGroupTree,
      filtersGroupingErrors: result.filtersGroupingErrors,
    });

    expect(summary).toEqual({
      hierarchy: [
        "overall: FILTER 1 AND group 1",
        "group 1: FILTER 2 OR FILTER 3",
      ],
      clauses: [
        'FILTER 1: system contains "oomber"',
        'FILTER 2: status equals "active"',
        'FILTER 3: status equals "inactive"',
      ],
      invalid: false,
      errors: [],
    });
  });

  it("restores the same nested expression through the saved-run state boundary", () => {
    const result = mapRunDocumentToResult(
      wireRunDocumentResponseSchema.parse(s35NestedFilterRunResponse),
    );
    const restored = workflowConfigurationFromRun(result, result.comparisonColumns);

    expect(restored.filterGroupingMode).toBe("custom");
    expect(restored.filterGroupingRequired).toBe(true);
    expect(restored.filterGroupingErrors).toEqual([]);
    expect(restored.filters.map((row) => row.id)).toEqual(["fl-0", "fl-1", "fl-2"]);

    expect(
      summarizeAppliedFilters({
        filtersApplied: restored.filters,
        filtersRelation: restored.filterRelation,
        filtersGroupTree: restored.filterGroupTree,
        filtersGroupingErrors: restored.filterGroupingErrors,
      }).hierarchy,
    ).toEqual([
      "overall: FILTER 1 AND group 1",
      "group 1: FILTER 2 OR FILTER 3",
    ]);
  });
});
