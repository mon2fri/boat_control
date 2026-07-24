import { describe, expect, it } from "vitest";
import { mapWorkflowToRowsColumnsConfig, resolveRowsColumnsConfig } from "./configContent";
import type { Family } from "./domain";

const families: Family[] = [
  {
    kind: "column",
    name: "Name Family",
    columns: ["name", "status"],
  },
  {
    kind: "column",
    name: "Score Family",
    columns: ["score", "region"],
  },
];

describe("ordered-list family compression round-trip", () => {
  it("serializes aggregationColumns as explicit column refs, not family refs", () => {
    const state = {
      comparisonColumns: [],
      keyColumns: [],
      aggregationColumns: ["name", "status"],
      filters: [],
      targetColumns: [],
      nestedAggregationEnabled: true,
      comparisonSections: [],
    };

    const config = mapWorkflowToRowsColumnsConfig(state, families);

    expect(config.aggregationColumns).toEqual([
      { kind: "column", name: "name" },
      { kind: "column", name: "status" },
    ]);
  });

  it("serializes keyColumns as explicit column refs, not family refs", () => {
    const state = {
      comparisonColumns: [],
      keyColumns: ["name", "status"],
      aggregationColumns: [],
      filters: [],
      targetColumns: [],
      nestedAggregationEnabled: false,
      comparisonSections: [],
    };

    const config = mapWorkflowToRowsColumnsConfig(state, families);

    expect(config.keyColumns).toEqual([
      { kind: "column", name: "name" },
      { kind: "column", name: "status" },
    ]);
  });

  it("serializes comparisonSections columns as explicit column refs, not family refs", () => {
    const state = {
      comparisonColumns: [],
      keyColumns: [],
      aggregationColumns: [],
      filters: [],
      targetColumns: [],
      nestedAggregationEnabled: false,
      comparisonSections: [
        { id: "s1", name: "Section A", columns: ["score", "region"] },
      ],
    };

    const config = mapWorkflowToRowsColumnsConfig(state, families);

    expect(config.comparisonSections?.[0]?.columns).toEqual([
      { kind: "column", name: "score" },
      { kind: "column", name: "region" },
    ]);
  });

  it("round-trips aggregationColumns preserving exact order through save/load", () => {
    const state = {
      comparisonColumns: [],
      keyColumns: [],
      aggregationColumns: ["region", "score", "name"],
      filters: [],
      targetColumns: [],
      nestedAggregationEnabled: true,
      comparisonSections: [],
    };

    const config = mapWorkflowToRowsColumnsConfig(state, families);
    const availableColumns = ["name", "status", "score", "region"];
    const resolved = resolveRowsColumnsConfig(config, families, availableColumns);

    expect(resolved.aggregationColumns).toEqual(["region", "score", "name"]);
  });

  it("round-trips comparisonSections columns preserving exact order", () => {
    const state = {
      comparisonColumns: [],
      keyColumns: [],
      aggregationColumns: [],
      filters: [],
      targetColumns: [],
      nestedAggregationEnabled: false,
      comparisonSections: [
        { id: "s1", name: "Section A", columns: ["region", "score"] },
      ],
    };

    const config = mapWorkflowToRowsColumnsConfig(state, families);
    const availableColumns = ["name", "status", "score", "region"];
    const resolved = resolveRowsColumnsConfig(config, families, availableColumns);

    expect(resolved.comparisonSections[0]!.columns).toEqual(["region", "score"]);
  });

  it("round-trips keyColumns preserving exact order", () => {
    const state = {
      comparisonColumns: [],
      keyColumns: ["region", "score"],
      aggregationColumns: [],
      filters: [],
      targetColumns: [],
      nestedAggregationEnabled: false,
      comparisonSections: [],
    };

    const config = mapWorkflowToRowsColumnsConfig(state, families);
    const availableColumns = ["name", "status", "score", "region"];
    const resolved = resolveRowsColumnsConfig(config, families, availableColumns);

    expect(resolved.keyColumns).toEqual(["region", "score"]);
  });

  it("still uses family compression for unordered comparisonColumns", () => {
    const state = {
      comparisonColumns: ["name", "status"],
      keyColumns: [],
      aggregationColumns: [],
      filters: [],
      targetColumns: [],
      nestedAggregationEnabled: false,
      comparisonSections: [],
    };

    const config = mapWorkflowToRowsColumnsConfig(state, families);

    // comparisonColumns should still compress to family ref (unordered)
    expect(config.comparisonColumns).toEqual([
      { kind: "column_family", name: "Name Family" },
    ]);
  });
});
