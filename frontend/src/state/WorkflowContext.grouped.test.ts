import { describe, expect, it } from "vitest";
import type { FilterRow, RunResult } from "../api/domain";
import type { WorkflowState } from "./WorkflowContext";
import {
  validateWorkflowFilters,
  workflowConfigurationFromRun,
  workflowReducer,
} from "./WorkflowContext";

const filters: FilterRow[] = [
  { id: "fl-0", column: "book", operator: "equals", values: ["MO"] },
  { id: "fl-1", column: "system", operator: "equals", values: ["Traded Risk"] },
  { id: "fl-2", column: "status", operator: "equals", values: ["Active"] },
];

const tree = {
  kind: "or" as const,
  children: [
    {
      kind: "and" as const,
      children: [
        { kind: "leaf" as const, conditionId: "fl-0" },
        { kind: "leaf" as const, conditionId: "fl-1" },
      ],
    },
    { kind: "leaf" as const, conditionId: "fl-2" },
  ],
};

function baseState(): WorkflowState {
  return {
    header: null,
    asOfDate: "2026-11-08",
    comparisonColumns: ["book", "system", "status"],
    filters,
    filterRelation: "or",
    filterGroupTree: tree,
    filterGroupingMode: "custom",
    filterGroupingRequired: true,
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
    preparedData: null,
    selectedRuleIndexes: [],
    confirmFullSet: false,
    page2Complete: false,
    result: null,
    serverRequiresConfirmation: false,
    sessionExpired: false,
  };
}

function runResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    id: "run-1",
    reportName: "grouped",
    createdAt: "2026-11-08T00:00:00Z",
    file1Name: "a.csv",
    file2Name: "b.csv",
    overall: {
      recordsLoaded: 0,
      ruleViolationRowCount: 0,
      ruleViolationAttributeCount: 0,
      changedRowCount: 0,
      changedAttributeCount: 0,
    },
    ruleResults: [],
    changeDetails: [],
    filtersApplied: filters,
    filtersRelation: "or",
    filtersGroupTree: tree,
    aggregationColumns: [],
    keyColumns: ["book"],
    exceptionColumns: [],
    commentaryColumns: [],
    newExceptionsOnly: false,
    ...overrides,
  };
}

describe("validateWorkflowFilters", () => {
  it("accepts a complete nested expression", () => {
    expect(validateWorkflowFilters(filters, "or", tree, ["book", "system", "status"]))
      .toMatchObject({ valid: true, errors: [] });
  });

  it("reports missing, removed and incomplete references without repairing them", () => {
    const missing = validateWorkflowFilters(
      [filters[0]!],
      "or",
      tree,
      ["book", "system", "status"],
    );
    expect(missing.valid).toBe(false);
    expect(missing.errors.join(" ")).toMatch(/unknown or removed/i);
    expect(missing.groupTree).toBe(tree);

    const incomplete = validateWorkflowFilters(
      [filters[0]!, { id: "fl-1", column: "", operator: "equals", values: [] }],
      "and",
      null,
      ["book"],
    );
    expect(incomplete.valid).toBe(false);
    expect(incomplete.errors.join(" ")).toMatch(/no column|no value/i);
  });

  it("reports a filter column that is no longer available", () => {
    const result = validateWorkflowFilters(filters, "or", tree, ["book", "system"]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/status.*not available/i);
  });
});

describe("workflowConfigurationFromRun", () => {
  it("restores grouped filters and their persisted runtime references", () => {
    const restored = workflowConfigurationFromRun(runResult(), ["book", "system", "status"]);
    expect(restored.filters.map((row) => row.id)).toEqual(["fl-0", "fl-1", "fl-2"]);
    expect(restored.filterRelation).toBe("or");
    expect(restored.filterGroupTree).toEqual(tree);
    expect(restored.filterGroupingErrors).toEqual([]);
    expect(restored.newExceptionsOnly).toBe(false);
  });

  it("keeps restoration errors from an invalid saved expression", () => {
    const restored = workflowConfigurationFromRun(runResult({
      filtersGroupTree: {
        kind: "or",
        children: [
          { kind: "leaf", conditionId: "fl-0" },
          { kind: "leaf", conditionId: "__missing_c9__" },
        ],
      },
    }), ["book", "system", "status"]);
    expect(restored.filterGroupingErrors.join(" ")).toMatch(/unknown or removed/i);
  });

  it("restores legacy runs as legacy AND with no tree", () => {
    const restored = workflowConfigurationFromRun(runResult({
      filtersRelation: null,
      filtersGroupTree: null,
      filtersApplied: [filters[0]!],
    }));
    expect(restored.filterRelation).toBeNull();
    expect(restored.filterGroupTree).toBeNull();
    expect(restored.filterGroupingErrors).toEqual([]);
  });
});

describe("workflowReducer grouped filter actions", () => {
  it("keeps the tree and reports errors when a referenced filter is removed", () => {
    const next = workflowReducer(baseState(), {
      type: "setFilters",
      filters: [filters[0]!, filters[2]!],
    });
    expect(next.filterGroupTree).toEqual(tree);
    expect(next.filterGroupingErrors.join(" ")).toMatch(/unknown or removed|omits/i);
  });

  it("restores a complete filter configuration from a config load", () => {
    const next = workflowReducer(baseState(), {
      type: "setFilterConfiguration",
      filters: [filters[0]!, filters[2]!],
      relation: "and",
      groupTree: {
        kind: "and",
        children: [
          { kind: "leaf", conditionId: "fl-0" },
          { kind: "leaf", conditionId: "fl-2" },
        ],
      },
    });
    expect(next.filterRelation).toBe("and");
    expect(next.filterGroupingErrors).toEqual([]);
  });

  it("blocks newly authored multiple filters until AND, OR or a custom tree is selected", () => {
    const empty = {
      ...baseState(),
      filters: [],
      filterRelation: null,
      filterGroupTree: null,
      filterGroupingMode: null,
    };
    const incomplete = workflowReducer(empty, { type: "setFilters", filters });
    expect(incomplete.filterGroupingRequired).toBe(true);
    expect(incomplete.filterGroupingErrors.join(" ")).toMatch(/must choose AND, OR, or a custom/i);

    const selected = workflowReducer(incomplete, {
      type: "setFilterConfiguration",
      filters,
      relation: "or",
      groupTree: null,
      mode: "or",
      requireExplicit: true,
    });
    expect(selected.filterGroupingErrors).toEqual([]);
  });

  it("retains the custom tree when the selected expression temporarily switches to flat AND", () => {
    const custom = workflowReducer(baseState(), {
      type: "setFilterConfiguration",
      filters,
      relation: null,
      groupTree: tree,
      mode: "custom",
      requireExplicit: true,
    });
    const flat = workflowReducer(custom, {
      type: "setFilterConfiguration",
      filters,
      relation: "and",
      groupTree: tree,
      mode: "and",
      requireExplicit: true,
    });
    expect(flat.filterGroupTree).toEqual(tree);
    expect(flat.filterGroupingMode).toBe("and");
    expect(flat.filterGroupingErrors).toEqual([]);
  });

  it("marks filters invalid when their columns are removed but keeps the expression", () => {
    const next = workflowReducer(baseState(), {
      type: "removeComparisonColumn",
      column: "system",
    });
    expect(next.filterGroupTree).toEqual(tree);
    expect(next.filterGroupingErrors.join(" ")).toMatch(/no column|not available/i);
  });

  it("restores grouped filters and result configuration from a saved run", () => {
    const result = runResult({ nestedAggregationEnabled: true, aggregationColumns: ["status"] });
    const next = workflowReducer(baseState(), {
      type: "restoreRunConfiguration",
      result,
      availableColumns: ["book", "system", "status"],
    });
    expect(next.result).toBe(result);
    expect(next.filterRelation).toBe("or");
    expect(next.filterGroupTree).toEqual(tree);
    expect(next.nestedAggregationEnabled).toBe(true);
    expect(next.aggregationColumns).toEqual(["status"]);
    expect(next.keyColumns).toEqual(["book"]);
  });
});
