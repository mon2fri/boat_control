import { describe, expect, it } from "vitest";
import { fullSetGuard } from "./useFullSetGuard";
import type { WorkflowState } from "../../state/WorkflowContext";

const baseState: WorkflowState = {
  header: null,
  asOfDate: "2026-10-30",
  comparisonColumns: [],
  filters: [],
  filterRelation: null,
  filterGroupTree: null,
  filterGroupingMode: null,
  filterGroupingRequired: false,
  filterGroupingErrors: [],
  targetColumns: [],
  keyColumns: [],
  aggregationColumns: [],
  aggregationColumnLabels: {},
  nestedAggregationEnabled: false,
  comparisonSections: [],
  exceptionColumns: [],
  commentaryColumns: [],
  newExceptionsOnly: true,
  selectedRuleIndexes: [],
  confirmFullSet: false,
  page2Complete: false,
  result: null,
  serverRequiresConfirmation: false,
  sessionExpired: false,
};

describe("fullSetGuard (server-owned flag)", () => {
  it("does not require confirmation when the server says so", () => {
    expect(fullSetGuard(baseState).requiresConfirmation).toBe(false);
  });

  it("requires confirmation when the server requires it", () => {
    expect(
      fullSetGuard({ ...baseState, serverRequiresConfirmation: true }).requiresConfirmation,
    ).toBe(true);
  });
});
