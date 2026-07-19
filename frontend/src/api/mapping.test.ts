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
import { mapFilterRowToWire, mapRunRequestToWire, mapWireFilterRow } from "./mapping";
import { wireRunRequestSchema } from "./wire";

const baseRequest = {
  sessionId: "s1",
  filters: [],
  targetColumns: [],
  keyColumns: ["id"],
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