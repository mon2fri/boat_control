import { describe, expect, it } from "vitest";
import {
  mapRulesToConfigContent,
  mapWorkflowToRowsColumnsConfig,
  resolveRowsColumnsConfig,
  resolveRulesConfig,
} from "./configContent";
import type { Family, Rule } from "./domain";

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
  it("round-trips extra columns and their three display destinations", () => {
    const extraColumnDisplay = {
      overallResultPage: true, overallHtmlReport: true, overallExcelReport: true,
      newBooksResultPage: false, newBooksHtmlReport: false, newBooksExcelReport: false,
      exceptionTables: true,
    };
    const config = mapWorkflowToRowsColumnsConfig({
      comparisonColumns: ["status", "region"], keyColumns: [], aggregationColumns: [],
      filters: [], targetColumns: [], exceptionColumns: ["region"], extraColumnDisplay,
      nestedAggregationEnabled: false, comparisonSections: [],
    }, families);

    expect(config.extraColumns).toEqual([{ kind: "column", name: "region" }]);
    expect(resolveRowsColumnsConfig(config, families, ["status", "region"]).extraColumnDisplay)
      .toEqual(extraColumnDisplay);
  });

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

  it("round-trips aggregation column display names", () => {
    const config = mapWorkflowToRowsColumnsConfig({
      comparisonColumns: ["status"],
      keyColumns: [],
      aggregationColumns: ["status"],
      aggregationColumnLabels: { status: "In HR System" },
      filters: [],
      targetColumns: [],
      nestedAggregationEnabled: false,
      comparisonSections: [],
    }, families);

    expect(config.aggregationColumnLabels).toEqual({ status: "In HR System" });
    const resolved = resolveRowsColumnsConfig(config, families, ["status"]);
    expect(resolved.aggregationColumnLabels).toEqual({ status: "In HR System" });
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

describe("rules config grouping-tree round-trip", () => {
  it("normalizes client condition IDs when saving and restores valid IDs when loading", () => {
    const rule: Rule = {
      index: "R001",
      name: "Grouped",
      conditions: [
        { id: "condition-alpha", column: "name", operator: "equals", values: ["A"] },
        { id: "condition-beta", column: "score", operator: "greater_than", values: ["10"] },
      ],
      conditionJoin: "per_grouping",
      conditionGrouping: null,
      groupTree: {
        kind: "or",
        children: [
          { kind: "leaf", conditionId: "condition-alpha" },
          { kind: "leaf", conditionId: "condition-beta" },
        ],
      },
      logic: {
        id: "l0",
        format: "value",
        column: "status",
        operator: "equals",
        target: "active",
        values: ["active"],
      },
    };

    const config = mapRulesToConfigContent([rule], []);
    expect(config[0]?.conditions?.map((condition) => condition.column_name)).toEqual([
      { kind: "column", name: "name" },
      { kind: "column", name: "score" },
    ]);
    expect(config[0]?.grouping_tree).toEqual({
      kind: "or",
      children: [
        { kind: "leaf", conditionId: "c0" },
        { kind: "leaf", conditionId: "c1" },
      ],
    });

    const { drafts } = resolveRulesConfig(
      config,
      [],
      ["name", "score", "status"],
    );
    expect(drafts[0]?.conditions.map((condition) => condition.id)).toEqual(["c0", "c1"]);
    expect(drafts[0]?.groupTree).toEqual(config[0]?.grouping_tree);
    expect(drafts[0]?.conditionJoin).toBe("per_grouping");
  });

  it("expands a grouped column-family condition without omitting generated conditions", () => {
    const { drafts } = resolveRulesConfig([
      {
        name: "Family grouped",
        conditions: [
          {
            column_name: { kind: "column_family", name: "Name Family" },
            operator: "equals",
            filter_values: ["A"],
          },
          { column_name: "score", operator: "greater_than", filter_values: ["10"] },
        ],
        grouping_tree: {
          kind: "or",
          children: [
            { kind: "leaf", conditionId: "c0" },
            { kind: "leaf", conditionId: "c1" },
          ],
        },
        logic: {
          format: "value_vs_column",
          column_name: "status",
          operator: "equals",
          target_value: "active",
        },
      },
    ], families, ["name", "status", "score"]);

    expect(drafts[0]?.conditions.map((condition) => condition.id)).toEqual(["c0", "c1", "c2"]);
    expect(drafts[0]?.groupTree).toEqual({
      kind: "or",
      children: [
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "c0" },
            { kind: "leaf", conditionId: "c1" },
          ],
        },
        { kind: "leaf", conditionId: "c2" },
      ],
    });
  });

  it("loads legacy grouping trees whose leaves contain old client IDs", () => {
    const { drafts } = resolveRulesConfig([
      {
        name: "Legacy grouped",
        conditions: [
          { column_name: "name", operator: "equals", filter_values: ["A"] },
          { column_name: "score", operator: "greater_than", filter_values: ["10"] },
        ],
        grouping_tree: {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "old-alpha" },
            { kind: "leaf", conditionId: "old-beta" },
          ],
        },
        logic: {
          format: "value_vs_column",
          column_name: "status",
          operator: "equals",
          target_value: "active",
        },
      },
    ], [], ["name", "score", "status"]);

    expect(drafts[0]?.groupTree).toEqual({
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "c0" },
        { kind: "leaf", conditionId: "c1" },
      ],
    });
  });

  it("repairs legacy configs that repeated one family reference for every family member", () => {
    const { drafts } = resolveRulesConfig([
      {
        name: "Legacy family group",
        conditions: [
          {
            column_name: { kind: "column_family", name: "Name Family" },
            operator: "equals",
            filter_values: ["A"],
          },
          {
            column_name: { kind: "column_family", name: "Name Family" },
            operator: "equals",
            filter_values: ["B"],
          },
        ],
        grouping_tree: {
          kind: "or",
          children: [
            { kind: "leaf", conditionId: "c0" },
            { kind: "leaf", conditionId: "c1" },
          ],
        },
        logic: {
          format: "value_vs_column",
          column_name: "score",
          operator: "greater_than",
          target_value: "10",
        },
      },
    ], families, ["name", "status", "score"]);

    expect(drafts[0]?.conditions).toMatchObject([
      { id: "c0", column: "name", values: ["A"] },
      { id: "c1", column: "status", values: ["B"] },
    ]);
    expect(drafts[0]?.groupTree).toEqual({
      kind: "or",
      children: [
        { kind: "leaf", conditionId: "c0" },
        { kind: "leaf", conditionId: "c1" },
      ],
    });
  });
});
