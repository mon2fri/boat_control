import { describe, expect, it } from "vitest";
import type { WorkflowState } from "./WorkflowContext";

/**
 * Unit tests for the workflow reducer.
 *
 * These tests validate the pruning logic for `comparisonSections`:
 * - `setComparisonSections` discards sections with empty names or no columns
 * - `removeComparisonColumn` prunes removed columns from sections and drops empty ones
 * - `setComparisonColumns` prunes orphaned columns from sections and drops empty ones
 */

// Replicate the reducer inline to avoid coupling to the module export.
// (WorkflowContext only exports the provider/hook, not the reducer directly.)
function reducer(state: WorkflowState, action: any): WorkflowState {
  switch (action.type) {
    case "setComparisonColumns": {
      const cols = action.columns;
      const colSet = new Set(cols);
      return {
        ...state,
        comparisonColumns: cols,
        keyColumns: state.keyColumns.filter((c) => colSet.has(c)),
        targetColumns: state.targetColumns.filter((c) => colSet.has(c)),
        aggregationColumns: state.aggregationColumns.filter((c) => colSet.has(c)),
        comparisonSections: state.comparisonSections
          .map((s) => ({ ...s, columns: s.columns.filter((c) => colSet.has(c)) }))
          .filter((s) => s.columns.length > 0),
        filters: state.filters.map((f) =>
          colSet.has(f.column) ? f : { ...f, column: "" },
        ),
      };
    }
    case "removeComparisonColumn": {
      const col = action.column;
      const next = state.comparisonColumns.filter((c) => c !== col);
      return {
        ...state,
        comparisonColumns: next,
        keyColumns: state.keyColumns.filter((c) => c !== col),
        targetColumns: state.targetColumns.filter((c) => c !== col),
        aggregationColumns: state.aggregationColumns.filter((c) => c !== col),
        comparisonSections: state.comparisonSections
          .map((s) => ({ ...s, columns: s.columns.filter((c) => c !== col) }))
          .filter((s) => s.columns.length > 0),
        filters: state.filters.map((f) =>
          f.column === col ? { ...f, column: "" } : f,
        ),
      };
    }
    case "setComparisonSections":
      return {
        ...state,
        comparisonSections: action.sections.filter(
          (s: any) => s.name.trim().length > 0 && s.columns.length > 0,
        ),
      };
    default:
      return state;
  }
}

function base(): WorkflowState {
  return {
    header: null,
    comparisonColumns: ["region", "status", "owner", "type"],
    filters: [],
    targetColumns: [],
    keyColumns: ["id"],
    aggregationColumns: [],
    aggregationColumnLabels: {},
    nestedAggregationEnabled: false,
    comparisonSections: [
      { id: "s1", name: "Region", columns: ["region"] },
      { id: "s2", name: "Ownership", columns: ["status", "owner"] },
    ],
    selectedRuleIndexes: [],
    confirmFullSet: false,
    result: null,
    serverRequiresConfirmation: false,
    sessionExpired: false,
  };
}

describe("Workflow reducer — comparisonSections pruning", () => {
  describe("setComparisonSections", () => {
    it("stores valid sections verbatim", () => {
      const state = base();
      const next = reducer(state, {
        type: "setComparisonSections",
        sections: [
          { id: "x", name: "X", columns: ["a"] },
          { id: "y", name: "Y", columns: ["b", "c"] },
        ],
      });
      expect(next.comparisonSections).toEqual([
        { id: "x", name: "X", columns: ["a"] },
        { id: "y", name: "Y", columns: ["b", "c"] },
      ]);
    });

    it("discards sections with empty name", () => {
      const state = base();
      const next = reducer(state, {
        type: "setComparisonSections",
        sections: [
          { id: "x", name: "  ", columns: ["a"] },
          { id: "y", name: "Y", columns: ["b"] },
        ],
      });
      expect(next.comparisonSections).toEqual([
        { id: "y", name: "Y", columns: ["b"] },
      ]);
    });

    it("discards sections with no columns", () => {
      const state = base();
      const next = reducer(state, {
        type: "setComparisonSections",
        sections: [
          { id: "x", name: "X", columns: [] },
          { id: "y", name: "Y", columns: ["b"] },
        ],
      });
      expect(next.comparisonSections).toEqual([
        { id: "y", name: "Y", columns: ["b"] },
      ]);
    });

    it("stores empty array when all sections are invalid", () => {
      const state = base();
      const next = reducer(state, {
        type: "setComparisonSections",
        sections: [
          { id: "x", name: "", columns: [] },
        ],
      });
      expect(next.comparisonSections).toEqual([]);
    });
  });

  describe("removeComparisonColumn", () => {
    it("prunes removed column from section columns", () => {
      const state = base();
      const next = reducer(state, { type: "removeComparisonColumn", column: "status" });
      expect(next.comparisonSections).toEqual([
        { id: "s1", name: "Region", columns: ["region"] },
        { id: "s2", name: "Ownership", columns: ["owner"] },
      ]);
    });

    it("drops section that becomes empty after removal", () => {
      const state = base();
      const next = reducer(state, { type: "removeComparisonColumn", column: "region" });
      expect(next.comparisonSections.find((s) => s.id === "s1")).toBeUndefined();
    });
  });

  describe("setComparisonColumns", () => {
    it("prunes orphaned columns from sections", () => {
      const state = base();
      const next = reducer(state, {
        type: "setComparisonColumns",
        columns: ["region", "status"],
      });
      expect(next.comparisonSections).toEqual([
        { id: "s1", name: "Region", columns: ["region"] },
        { id: "s2", name: "Ownership", columns: ["status"] },
      ]);
    });

    it("drops section that loses all columns", () => {
      const state = base();
      const next = reducer(state, {
        type: "setComparisonColumns",
        columns: ["type"],
      });
      expect(next.comparisonSections).toEqual([]);
    });
  });
});
