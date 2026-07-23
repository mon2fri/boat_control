/**
 * Regression tests for the wire-mapping layer.
 *
 * The most critical invariant covered here is the empty-rule-selection
 * contract: when the user deselects every rule, the client MUST serialize
 * an explicit empty array (`rule_ids: []`) and NEVER collapse it to `null`
 * or omit the field. The backend treats `null` / omitted as "run every
 * rule", so collapsing would silently re-run the entire catalog.
 */
import { describe, expect, it } from "vitest";
import {
  mapConditionToWire,
  mapFilterRowToWire,
  mapRuleToWireDraft,
  mapRunRequestToWire,
  mapWireCondition,
  mapWireFilterRow,
  mapWireRule,
} from "./mapping";
import { ruleDraftRequestSchema } from "./wire";
import { wireRunRequestSchema } from "./wire";

const baseRequest = {
  sessionId: "s1",
  comparisonColumns: ["id", "region"],
  filters: [],
  targetColumns: [],
  keyColumns: ["id"],
  aggregationColumns: [],
};

describe("mapRunRequestToWire", () => {
  it("serializes a non-empty rule selection verbatim", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      ruleIndexes: ["R001", "R002"],
    });
    expect(body.rule_ids).toEqual(["R001", "R002"]);
    expect(body.rule_ids).not.toBeNull();
    expect(body.rule_ids).not.toBeUndefined();
  });

  it("serializes an empty rule selection as an explicit empty array", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      ruleIndexes: [],
    });
    expect(body.rule_ids).toEqual([]);
    // Guard the contract: must NOT be null and must NOT be omitted.
    expect(body.rule_ids).not.toBeNull();
    expect("rule_ids" in body).toBe(true);
  });

  it("produces a body that the wire schema accepts with an empty array", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      ruleIndexes: [],
    });
    // Schema must accept the explicit empty array end-to-end.
    expect(() => wireRunRequestSchema.parse(body)).not.toThrow();
    const parsed = wireRunRequestSchema.parse(body);
    expect(parsed.rule_ids).toEqual([]);
  });

  it("returns a fresh array for each call so callers cannot mutate the request", () => {
    const ruleIndexes: string[] = [];
    const a = mapRunRequestToWire({ ...baseRequest, ruleIndexes });
    const b = mapRunRequestToWire({ ...baseRequest, ruleIndexes });
    expect(a.rule_ids).not.toBe(b.rule_ids);
  });

  it("serializes a non-empty key-column selection verbatim", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      keyColumns: ["id"],
      ruleIndexes: [],
    });
    expect(body.key_columns).toEqual(["id"]);
  });

  it("serializes an empty key-column selection as an explicit empty array (no null)", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      keyColumns: [],
      ruleIndexes: [],
    });
    expect(body.key_columns).toEqual([]);
    expect(body.key_columns).not.toBeNull();
    expect("key_columns" in body).toBe(true);
  });
});

describe("filter row mapping", () => {
  it("serializes multiple values to filter_values", () => {
    const wire = mapFilterRowToWire({
      id: "f1",
      column: "status",
      operator: "equals",
      values: ["active", "pending"],
    });
    expect(wire.filter_values).toEqual(["active", "pending"]);
    expect(wire).not.toHaveProperty("filter_value");
  });

  it("deserializes filter_values from wire", () => {
    const row = mapWireFilterRow({
      column: "status",
      operator: "eq",
      filter_values: ["active", "pending"],
    });
    expect(row.values).toEqual(["active", "pending"]);
  });

  it("backward-compat: deserializes legacy filter_value string", () => {
    const row = mapWireFilterRow({
      column: "status",
      operator: "eq",
      filter_value: "active",
    });
    expect(row.values).toEqual(["active"]);
  });

  it("backward-compat: deserializes empty legacy filter_value", () => {
    const row = mapWireFilterRow({
      column: "status",
      operator: "eq",
      filter_value: "",
    });
    expect(row.values).toEqual([]);
  });

  it("skips empty values when serializing to wire", () => {
    const wire = mapFilterRowToWire({
      id: "f1",
      column: "status",
      operator: "equals",
      values: ["active", ""],
    });
    expect(wire.filter_values).toEqual(["active"]);
  });
});

describe("rule condition mapping", () => {
  it("serializes multiple condition values as OR alternatives", () => {
    expect(mapConditionToWire({
      id: "temporary-id",
      column: "status",
      operator: "equals",
      values: ["active", "pending"],
    })).toEqual({
      column_name: "status",
      operator: "eq",
      filter_values: ["active", "pending"],
    });
  });

  it("loads both new arrays and legacy scalar condition values", () => {
    expect(mapWireCondition({
      column_name: "status",
      operator: "eq",
      filter_values: ["active", "pending"],
    }, "c0").values).toEqual(["active", "pending"]);
    expect(mapWireCondition({
      column_name: "status",
      operator: "eq",
      filter_value: "active",
    }, "c0").values).toEqual(["active"]);
  });

  it("remaps temporary condition IDs in grouping trees before save", () => {
    const wire = mapRuleToWireDraft({
      name: "Grouped",
      conditions: [
        { id: "cond-a", column: "a", operator: "equals", values: ["1"] },
        { id: "cond-b", column: "b", operator: "equals", values: ["2"] },
      ],
      conditionJoin: null,
      conditionGrouping: null,
      groupTree: {
        kind: "and",
        children: [
          { kind: "leaf", conditionId: "cond-a" },
          { kind: "leaf", conditionId: "cond-b" },
        ],
      },
      logic: { id: "l0", format: "value", column: "result", operator: "equals", target: "ok" },
    });
    expect(wire.grouping_tree).toEqual({
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "c0" },
        { kind: "leaf", conditionId: "c1" },
      ],
    });
  });

  it("reopens a saved grouping tree in PER GROUPING mode", () => {
    const rule = mapWireRule({
      rule_id: "R001",
      name: "Grouped",
      conditions: [
        { column_name: "a", operator: "eq", filter_values: ["1"] },
        { column_name: "b", operator: "eq", filter_values: ["2"] },
      ],
      grouping_tree: {
        kind: "and",
        children: [
          { kind: "leaf", conditionId: "c0" },
          { kind: "leaf", conditionId: "c1" },
        ],
      },
      logic: {
        format: "value_vs_column",
        column_name: "result",
        operator: "eq",
        target_value: "ok",
      },
    });
    expect(rule.conditionJoin).toBe("per_grouping");
    expect(mapRuleToWireDraft(rule)).not.toHaveProperty("condition_relation");
  });

  it("preserves extra display columns through the outbound request schema", () => {
    const mapped = mapRuleToWireDraft({
      name: "Show context",
      conditions: [],
      conditionJoin: null,
      conditionGrouping: null,
      groupTree: null,
      logic: { id: "l0", format: "value", column: "status", operator: "equals", target: "active" },
      extraColumns: ["region", "owner"],
      hideComparison: true,
    });
    const request = ruleDraftRequestSchema.parse(mapped);
    expect(request.extra_columns).toEqual(["region", "owner"]);
    expect(request.hide_comparison).toBe(true);
  });
});
