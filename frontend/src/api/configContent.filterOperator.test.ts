import { describe, expect, it } from "vitest";
import { resolveConfigFilterRow, resolveRowsColumnsConfig } from "./configContent";
import { mapRunRequestToWire } from "./mapping";
import { wireRunRequestSchema } from "./wire";
import type { Family } from "./domain";

const families: Family[] = [
  { kind: "column", name: "Test", columns: ["name", "status"] },
];

const available = [
  "id",
  "name",
  "status",
  "region",
  "score",
  "sa_flag",
  "cva_flag",
  "system",
];

describe("saved rows-and-columns filter operator normalisation", () => {
  it.each([
    ["eq", "equals"],
    ["neq", "not_equals"],
    ["contains", "contains"],
    ["ncontains", "not_contains"],
    ["equals", "equals"],
    ["not_equals", "not_equals"],
  ])("maps the persisted operator %s to the domain operator %s", (persisted, expected) => {
    const result = resolveConfigFilterRow(
      { column: "cva_flag", operator: persisted, filter_values: ["Yes"] },
      families,
      available,
    );
    expect(result.resolved?.operator).toBe(expected);
  });

  it("keeps a config that persists the wire operator runnable", () => {
    const resolved = resolveRowsColumnsConfig(
      {
        comparisonColumns: ["id", "name", "status"],
        keyColumns: ["id"],
        filters: [
          { column: "cva_flag", operator: "eq", filter_values: ["Yes"] },
          { column: "cva_flag", operator: "neq", filter_values: ["No"] },
        ],
      },
      families,
      available,
    );

    expect(resolved.filters.map((row) => row.operator)).toEqual([
      "equals",
      "not_equals",
    ]);

    const wire = mapRunRequestToWire({
      sessionId: "s1",
      comparisonColumns: available,
      filters: resolved.filters,
      filterRelation: resolved.filterRelation,
      filterGroupTree: resolved.filterGroupTree,
      targetColumns: [],
      keyColumns: resolved.keyColumns,
      aggregationColumns: resolved.aggregationColumns,
      ruleIndexes: ["R079"],
    });

    expect(wire.filters).toEqual([
      { column: "cva_flag", operator: "eq", filter_values: ["Yes"] },
      { column: "cva_flag", operator: "neq", filter_values: ["No"] },
    ]);
    const parsed = wireRunRequestSchema.safeParse(wire);
    expect(parsed.success).toBe(true);
  });
});
