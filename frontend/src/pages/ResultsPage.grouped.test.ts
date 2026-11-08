import { describe, expect, it } from "vitest";
import type { WorkflowState } from "../state/WorkflowContext";
import { buildRunRequest } from "./ResultsPage";

describe("buildRunRequest filter grouping wiring", () => {
  it("sends the active nested tree, repair errors and explicit-grouping requirement", () => {
    const state = {
      header: { sessionId: "session-1" },
      asOfDate: "2026-11-08",
      comparisonColumns: ["book", "system", "status"],
      filters: [
        { id: "f1", column: "book", operator: "equals", values: ["MO"] },
        { id: "f2", column: "system", operator: "equals", values: ["Traded Risk"] },
        { id: "f3", column: "status", operator: "equals", values: ["Active"] },
      ],
      filterRelation: null,
      filterGroupTree: {
        kind: "or",
        children: [
          {
            kind: "and",
            children: [
              { kind: "leaf", conditionId: "f1" },
              { kind: "leaf", conditionId: "f2" },
            ],
          },
          { kind: "leaf", conditionId: "f3" },
        ],
      },
      filterGroupingMode: "custom",
      filterGroupingRequired: true,
      filterGroupingErrors: [],
      targetColumns: [],
      keyColumns: ["book"],
      aggregationColumns: [],
      aggregationColumnLabels: {},
      selectedRuleIndexes: [],
      confirmFullSet: false,
      comparisonSections: [],
      exceptionColumns: [],
      commentaryColumns: [],
      extraColumnDisplay: { overallResultPage: false, overallHtmlReport: false, overallExcelReport: false, newBooksResultPage: false, newBooksHtmlReport: false, newBooksExcelReport: false, exceptionTables: true },
      nestedAggregationEnabled: false,
      newExceptionsOnly: true,
    } as unknown as WorkflowState;

    const request = buildRunRequest(state);

    expect(request).toMatchObject({
      filterRelation: null,
      filterGroupTree: state.filterGroupTree,
      filterGroupingRequired: true,
      filterGroupingErrors: [],
    });
  });
});
