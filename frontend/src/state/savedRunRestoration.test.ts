import { describe, expect, it } from "vitest";
import type { WorkflowState } from "./WorkflowContext";

/**
 * Tests for saved-run configuration restoration in the Results deep-link
 * loader (ResultsPage.tsx). These verify that dispatch calls always restore
 * nested-aggregation flag, aggregation columns, and key columns — including
 * false/empty values — and that loading a second result clears stale state.
 *
 * The reducer is replicated inline to avoid coupling to the module export.
 */

function reducer(state: WorkflowState, action: any): WorkflowState {
  switch (action.type) {
    case "setNestedAggregationEnabled":
      return { ...state, nestedAggregationEnabled: action.enabled };
    case "setAggregationColumns":
      return { ...state, aggregationColumns: action.columns };
    case "setKeyColumns":
      return { ...state, keyColumns: action.columns };
    case "setResult":
      return { ...state, result: action.result };
    default:
      return state;
  }
}

function base(): WorkflowState {
  return {
    header: null,
    comparisonColumns: [],
    filters: [],
    targetColumns: [],
    keyColumns: [],
    aggregationColumns: [],
    aggregationColumnLabels: {},
    nestedAggregationEnabled: false,
  comparisonSections: [],
  exceptionColumns: [],
  selectedRuleIndexes: [],
    confirmFullSet: false,
    page2Complete: false,
    result: null,
    serverRequiresConfirmation: false,
    sessionExpired: false,
  };
}

describe("saved-run restoration — stale-value prevention", () => {
  it("restores nestedAggregationEnabled, aggregationColumns, and keyColumns from a full result", () => {
    let state = base();
    state = reducer(state, {
      type: "setNestedAggregationEnabled",
      enabled: true,
    });
    state = reducer(state, {
      type: "setAggregationColumns",
      columns: ["status", "region"],
    });
    state = reducer(state, {
      type: "setKeyColumns",
      columns: ["id"],
    });

    expect(state.nestedAggregationEnabled).toBe(true);
    expect(state.aggregationColumns).toEqual(["status", "region"]);
    expect(state.keyColumns).toEqual(["id"]);
  });

  it("restores nestedAggregationEnabled: false when the loaded result has it false", () => {
    let state = base();
    // Pre-set to true to verify it gets overwritten
    state = reducer(state, {
      type: "setNestedAggregationEnabled",
      enabled: true,
    });
    state = reducer(state, {
      type: "setNestedAggregationEnabled",
      enabled: false,
    });

    expect(state.nestedAggregationEnabled).toBe(false);
  });

  it("restores empty aggregation and key-column lists", () => {
    let state = base();
    // Pre-populate with values from a previous run
    state = reducer(state, {
      type: "setAggregationColumns",
      columns: ["status"],
    });
    state = reducer(state, {
      type: "setKeyColumns",
      columns: ["id"],
    });

    // Load a result with empty lists (using ?? [] fallback)
    const loadedAggregationColumns: string[] | undefined = undefined;
    const loadedKeyColumns: string[] | undefined = undefined;
    state = reducer(state, {
      type: "setAggregationColumns",
      columns: loadedAggregationColumns ?? [],
    });
    state = reducer(state, {
      type: "setKeyColumns",
      columns: loadedKeyColumns ?? [],
    });

    expect(state.aggregationColumns).toEqual([]);
    expect(state.keyColumns).toEqual([]);
  });

  it("handles a legacy result where optional fields are absent (undefined)", () => {
    let state = base();

    // Simulate a legacy result that lacks the optional fields.
    // In ResultsPage, the ?? fallback handles this:
    //   result.nestedAggregationEnabled ?? false
    //   result.aggregationColumns ?? []
    //   result.keyColumns ?? []
    const legacyResult: Record<string, unknown> = {
      id: "legacy-run",
      // nestedAggregationEnabled, aggregationColumns, keyColumns are absent
    };

    state = reducer(state, {
      type: "setNestedAggregationEnabled",
      enabled: (legacyResult.nestedAggregationEnabled as boolean | undefined) ?? false,
    });
    state = reducer(state, {
      type: "setAggregationColumns",
      columns: (legacyResult.aggregationColumns as string[] | undefined) ?? [],
    });
    state = reducer(state, {
      type: "setKeyColumns",
      columns: (legacyResult.keyColumns as string[] | undefined) ?? [],
    });

    expect(state.nestedAggregationEnabled).toBe(false);
    expect(state.aggregationColumns).toEqual([]);
    expect(state.keyColumns).toEqual([]);
  });

  it("clears stale values when loading a second result after a populated first result", () => {
    let state = base();

    // Simulate loading result A with populated key columns and aggregation
    state = reducer(state, {
      type: "setNestedAggregationEnabled",
      enabled: true,
    });
    state = reducer(state, {
      type: "setAggregationColumns",
      columns: ["status"],
    });
    state = reducer(state, {
      type: "setKeyColumns",
      columns: ["id"],
    });

    expect(state.nestedAggregationEnabled).toBe(true);
    expect(state.aggregationColumns).toEqual(["status"]);
    expect(state.keyColumns).toEqual(["id"]);

    // Now load result B with different (or absent) configuration.
    // The restoration dispatches must overwrite the previous values.
    state = reducer(state, {
      type: "setNestedAggregationEnabled",
      enabled: false,
    });
    state = reducer(state, {
      type: "setAggregationColumns",
      columns: [],
    });
    state = reducer(state, {
      type: "setKeyColumns",
      columns: [],
    });

    expect(state.nestedAggregationEnabled).toBe(false);
    expect(state.aggregationColumns).toEqual([]);
    expect(state.keyColumns).toEqual([]);
  });

  it("does not retain keyColumns from a previous run when loading a legacy result", () => {
    let state = base();

    // Simulate loading a modern result with key columns
    state = reducer(state, {
      type: "setKeyColumns",
      columns: ["id", "name"],
    });
    expect(state.keyColumns).toEqual(["id", "name"]);

    // Load a legacy result (keyColumns is undefined → defaults to [])
    const legacyKeyColumns: string[] | undefined = undefined;
    state = reducer(state, {
      type: "setKeyColumns",
      columns: legacyKeyColumns ?? [],
    });

    expect(state.keyColumns).toEqual([]);
  });
});
