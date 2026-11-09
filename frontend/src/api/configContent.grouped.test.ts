import { describe, expect, it } from "vitest";
import type { Family, Rule } from "./domain";
import {
  mapRulesToConfigContent,
  mapWorkflowToRowsColumnsConfig,
  resolveRowsColumnsConfig,
  resolveRulesConfig,
} from "./configContent";

const families: Family[] = [
  { kind: "column", name: "Name Family", columns: ["name", "status"] },
];

const availableColumns = ["book", "system", "status", "sa", "cva", "name"];

describe("rows-and-columns filter grouping", () => {
  it("round-trips nested filter grouping through persisted cN references", () => {
    const state = {
      comparisonColumns: availableColumns,
      keyColumns: [],
      aggregationColumns: [],
      filters: [
        { id: "runtime-book", column: "book", operator: "equals" as const, values: ["MO"] },
        { id: "runtime-system", column: "system", operator: "equals" as const, values: ["Traded Risk"] },
        { id: "runtime-status", column: "status", operator: "equals" as const, values: ["Active"] },
      ],
      filterRelation: "or" as const,
      filterGroupTree: {
        kind: "or" as const,
        children: [
          {
            kind: "and" as const,
            children: [
              { kind: "leaf" as const, conditionId: "runtime-book" },
              { kind: "leaf" as const, conditionId: "runtime-system" },
            ],
          },
          { kind: "leaf" as const, conditionId: "runtime-status" },
        ],
      },
      targetColumns: [],
      nestedAggregationEnabled: false,
      comparisonSections: [],
    };
    const content = mapWorkflowToRowsColumnsConfig(state, families);
    expect(content.filterRelation).toBe("or");
    expect(content.filterGroupingTree).toEqual({
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

    const resolved = resolveRowsColumnsConfig(content, families, availableColumns);
    expect(resolved.filterRelation).toBe("or");
    expect(resolved.filterGroupingErrors).toEqual([]);
    expect(resolved.filterGroupTree).toEqual({
      kind: "or",
      children: [
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "fl-0" },
            { kind: "leaf", conditionId: "fl-1" },
          ],
        },
        { kind: "leaf", conditionId: "fl-2" },
      ],
    });
  });

  it("preserves legacy multi-filter AND configs without adding grouping fields", () => {
    const content = {
      comparisonColumns: ["book", "system"],
      keyColumns: [],
      aggregationColumns: [],
      filters: [
        { column: "book", operator: "eq", filter_values: ["MO"] },
        { column: "system", operator: "eq", filter_values: ["Traded Risk"] },
      ],
      targetColumns: [],
    };
    const resolved = resolveRowsColumnsConfig(content, families, availableColumns);
    expect(resolved.filters).toHaveLength(2);
    expect(resolved.filterRelation).toBeNull();
    expect(resolved.filterGroupTree).toBeNull();
    expect(resolved.filterGroupingErrors).toEqual([]);
  });

  it("saves the selected flat relation without activating a retained custom tree", () => {
    const content = mapWorkflowToRowsColumnsConfig({
      comparisonColumns: availableColumns,
      keyColumns: [],
      aggregationColumns: [],
      filters: [
        { id: "runtime-book", column: "book", operator: "equals", values: ["MO"] },
        { id: "runtime-system", column: "system", operator: "equals", values: ["Traded Risk"] },
        { id: "runtime-status", column: "status", operator: "equals", values: ["Active"] },
      ],
      filterRelation: null,
      filterGroupTree: {
        kind: "or",
        children: [
          { kind: "leaf", conditionId: "runtime-book" },
          {
            kind: "and",
            children: [
              { kind: "leaf", conditionId: "runtime-system" },
              { kind: "leaf", conditionId: "runtime-status" },
            ],
          },
        ],
      },
      filterGroupingMode: "and",
      filterGroupingRequired: true,
      targetColumns: [],
      comparisonSections: [],
    }, families);
    expect(content.filterRelation).toBe("and");
    expect(content.filterGroupingTree).toBeUndefined();
  });

  it("blocks saving newly authored multiple filters without an explicit expression", () => {
    expect(() => mapWorkflowToRowsColumnsConfig({
      comparisonColumns: availableColumns,
      keyColumns: [],
      aggregationColumns: [],
      filters: [
        { id: "a", column: "book", operator: "equals", values: ["MO"] },
        { id: "b", column: "system", operator: "equals", values: ["Traded Risk"] },
      ],
      filterGroupingRequired: true,
      targetColumns: [],
      comparisonSections: [],
    }, families)).toThrow(/must choose AND, OR, or a custom grouping/i);
  });

  it("round-trips a concrete family-member filter column without collapsing to the family", () => {
    // Regression: saving rewrote `status` to the `Name Family` reference and
    // loading resolved it back to the first member `name`, so a saved
    // `status == active` filter silently reloaded as `name == active`.
    const content = mapWorkflowToRowsColumnsConfig({
      comparisonColumns: availableColumns,
      keyColumns: [],
      aggregationColumns: [],
      filters: [
        { id: "runtime-system", column: "system", operator: "equals", values: ["Traded Risk"] },
        { id: "runtime-status-a", column: "status", operator: "equals", values: ["Active"] },
        { id: "runtime-status-b", column: "status", operator: "equals", values: ["Inactive"] },
      ],
      filterGroupTree: {
        kind: "and" as const,
        children: [
          { kind: "leaf" as const, conditionId: "runtime-system" },
          {
            kind: "or" as const,
            children: [
              { kind: "leaf" as const, conditionId: "runtime-status-a" },
              { kind: "leaf" as const, conditionId: "runtime-status-b" },
            ],
          },
        ],
      },
      targetColumns: [],
      comparisonSections: [],
    }, families);
    expect(content.filters?.map((filter) => filter.column)).toEqual([
      { kind: "column", name: "system" },
      { kind: "column", name: "status" },
      { kind: "column", name: "status" },
    ]);
    const resolved = resolveRowsColumnsConfig(content, families, availableColumns);
    expect(resolved.filterGroupingErrors).toEqual([]);
    expect(resolved.filters.map((filter) => filter.column)).toEqual([
      "system",
      "status",
      "status",
    ]);
  });

  it("does not silently drop an unresolved referenced filter", () => {
    const content = {
      comparisonColumns: ["book", "system"],
      keyColumns: [],
      aggregationColumns: [],
      filters: [
        { column: "book", operator: "eq", filter_values: ["MO"] },
        { column: "Missing Column", operator: "eq", filter_values: ["X"] },
      ],
      filterRelation: "or",
      filterGroupingTree: {
        kind: "or",
        children: [
          { kind: "leaf", conditionId: "c0" },
          { kind: "leaf", conditionId: "c1" },
        ],
      },
      targetColumns: [],
    };
    const resolved = resolveRowsColumnsConfig(content, families, availableColumns);
    expect(resolved.filters).toHaveLength(1);
    expect(resolved.filterGroupTree).toEqual({
      kind: "or",
      children: [
        { kind: "leaf", conditionId: "fl-0" },
        { kind: "leaf", conditionId: "__missing_c1__" },
      ],
    });
    expect(resolved.filterGroupingErrors.join(" ")).toMatch(/unknown or removed/i);
    expect(resolved.warnings.some((warning) => warning.type === "invalid_grouping")).toBe(true);
    expect(resolved.warnings.some((warning) => warning.type === "excluded_column")).toBe(true);
  });

  it("blocks unresolved flat or legacy filter rows instead of broadening their population", () => {
    const resolved = resolveRowsColumnsConfig({
      comparisonColumns: ["book", "system"],
      keyColumns: [],
      aggregationColumns: [],
      filters: [
        { column: "book", operator: "eq", filter_values: ["MO"] },
        { column: "Missing Column", operator: "eq", filter_values: ["X"] },
      ],
      filterRelation: "and",
      targetColumns: [],
    }, families, availableColumns);
    expect(resolved.filters).toHaveLength(1);
    expect(resolved.filterGroupingErrors.join(" ")).toMatch(/configured filter 2 could not be resolved/i);
  });

  it("reads snake_case grouping aliases from exported configs", () => {
    const resolved = resolveRowsColumnsConfig({
      filters: [
        { column: "book", operator: "eq", filter_values: ["MO"] },
        { column: "status", operator: "eq", filter_values: ["Active"] },
      ],
      filter_relation: "or",
      filter_grouping_tree: {
        kind: "or",
        children: [
          { kind: "leaf", conditionId: "c0" },
          { kind: "leaf", conditionId: "c1" },
        ],
      },
    }, families, availableColumns);
    expect(resolved.filterRelation).toBe("or");
    expect(resolved.filterGroupingErrors).toEqual([]);
    expect(resolved.filterGroupTree).toEqual({
      kind: "or",
      children: [
        { kind: "leaf", conditionId: "fl-0" },
        { kind: "leaf", conditionId: "fl-1" },
      ],
    });
  });
});

function groupedRule(): Rule {
  return {
    index: "R010",
    name: "Mutually exclusive flags",
    conditions: [],
    conditionJoin: null,
    conditionGrouping: null,
    groupTree: null,
    logic: {
      id: "l0",
      format: "value",
      column: "sa",
      operator: "equals",
      target: "Y",
      values: ["Y"],
    },
    logicClauses: [
      { id: "l0", format: "value", column: "sa", operator: "equals", target: "Y", values: ["Y"] },
      { id: "l1", format: "value", column: "cva", operator: "equals", target: "N", values: ["N"] },
      { id: "l2", format: "value", column: "sa", operator: "equals", target: "N", values: ["N"] },
      { id: "l3", format: "value", column: "cva", operator: "equals", target: "Y", values: ["Y"] },
    ],
    logicRelation: "or",
    logicGroupTree: {
      kind: "or",
      children: [
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "l0" },
            { kind: "leaf", conditionId: "l1" },
          ],
        },
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "l2" },
            { kind: "leaf", conditionId: "l3" },
          ],
        },
      ],
    },
  };
}

describe("rules config outcome grouping", () => {
  it("round-trips multiple grouped outcomes through import/export", () => {
    const content = mapRulesToConfigContent([groupedRule()], families);
    expect(content[0]).not.toHaveProperty("logic");
    expect(content[0]?.logic_clauses).toHaveLength(4);
    expect(content[0]?.logic_relation).toBe("or");
    expect(content[0]?.logic_grouping_tree).toEqual({
      kind: "or",
      children: [
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "c0" },
            { kind: "leaf", conditionId: "c1" },
          ],
        },
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "c2" },
            { kind: "leaf", conditionId: "c3" },
          ],
        },
      ],
    });

    const { drafts, warnings } = resolveRulesConfig(content, families, availableColumns);
    expect(warnings).toEqual([]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.logicClauses).toHaveLength(4);
    expect(drafts[0]?.logicRelation).toBe("or");
    expect(drafts[0]?.logicGroupTree).toEqual({
      kind: "or",
      children: [
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "l0" },
            { kind: "leaf", conditionId: "l1" },
          ],
        },
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "l2" },
            { kind: "leaf", conditionId: "l3" },
          ],
        },
      ],
    });
  });

  it("keeps legacy single outcomes in the legacy logic field", () => {
    const legacy: Rule = {
      index: "R011",
      name: "Legacy",
      conditions: [],
      conditionJoin: null,
      conditionGrouping: null,
      groupTree: null,
      logic: { id: "l0", format: "value", column: "status", operator: "equals", target: "Active" },
    };
    const content = mapRulesToConfigContent([legacy], families);
    expect(content[0]?.logic?.column_name).toEqual({ kind: "column", name: "status" });
    expect(content[0]).not.toHaveProperty("logic_clauses");
    const { drafts } = resolveRulesConfig(content, families, availableColumns);
    expect(drafts[0]?.logicClauses).toBeUndefined();
  });

  it("rejects contradictory saved outcome representations", () => {
    const { drafts, warnings } = resolveRulesConfig([{
      name: "Contradictory",
      logic: {
        format: "value_vs_column",
        column_name: "status",
        operator: "eq",
        target_value: "Active",
      },
      logic_clauses: [{
        format: "value_vs_column",
        column_name: "sa",
        operator: "eq",
        target_value: "Y",
      }],
      logic_relation: "or",
    }], families, availableColumns);
    expect(drafts).toHaveLength(0);
    expect(warnings.some((warning) => /both legacy logic and logic_clauses/i.test(warning.message))).toBe(true);
  });

  it("rejects multiple column-against-column saved outcomes", () => {
    const { drafts, warnings } = resolveRulesConfig([{
      name: "Column outcomes",
      logic_clauses: [
        { format: "column_vs_column", column_name: "sa", operator: "eq", target_value: "cva" },
        { format: "value_vs_column", column_name: "status", operator: "eq", target_value: "Active" },
      ],
      logic_relation: "or",
    }], families, availableColumns);
    expect(drafts).toHaveLength(0);
    expect(warnings.some((warning) => /value-against-column/i.test(warning.message))).toBe(true);
  });

  it("preserves family expansion and remaps outcome references", () => {
    const { drafts, warnings } = resolveRulesConfig([{
      name: "Family outcomes",
      logic_clauses: [{
        format: "value_vs_column",
        column_name: { kind: "column_family", name: "Name Family" },
        operator: "eq",
        target_value: "Y",
      }, {
        format: "value_vs_column",
        column_name: "status",
        operator: "eq",
        target_value: "Active",
      }],
      logic_relation: "or",
      logic_grouping_tree: {
        kind: "or",
        children: [
          { kind: "leaf", conditionId: "c0" },
          { kind: "leaf", conditionId: "c1" },
        ],
      },
    }], families, availableColumns);
    expect(warnings).toEqual([]);
    expect(drafts[0]?.logicClauses?.map((clause) => clause.column)).toEqual([
      "name",
      "status",
      "status",
    ]);
    expect(drafts[0]?.logicGroupTree).toEqual({
      kind: "or",
      children: [
        {
          kind: "or",
          children: [
            { kind: "leaf", conditionId: "l0" },
            { kind: "leaf", conditionId: "l1" },
          ],
        },
        { kind: "leaf", conditionId: "l2" },
      ],
    });
  });

  it("expands condition families with operator semantics inside their original grouping", () => {
    const { drafts, warnings } = resolveRulesConfig([{
      name: "Family condition",
      conditions: [
        {
          column_name: { kind: "column_family", name: "Name Family" },
          operator: "eq",
          filter_value: "X",
        },
        { column_name: "sa", operator: "eq", filter_value: "Y" },
      ],
      condition_relation: "and",
      logic: { format: "value_vs_column", column_name: "status", operator: "eq", target_value: "Active" },
    }], families, availableColumns);
    expect(warnings).toEqual([]);
    expect(drafts[0]?.groupTree).toEqual({
      kind: "and",
      children: [
        {
          kind: "or",
          children: [
            { kind: "leaf", conditionId: "c0" },
            { kind: "leaf", conditionId: "c1" },
          ],
        },
        { kind: "leaf", conditionId: "c2" },
      ],
    });
  });

  it("keeps unresolved condition references distinct from later resolved indexes", () => {
    const { drafts, warnings } = resolveRulesConfig([{
      name: "Missing condition",
      conditions: [
        { column_name: "missing", operator: "eq", filter_value: "X" },
        { column_name: "sa", operator: "eq", filter_value: "Y" },
      ],
      condition_relation: "or",
      grouping_tree: {
        kind: "or",
        children: [
          { kind: "leaf", conditionId: "c0" },
          { kind: "leaf", conditionId: "c1" },
        ],
      },
      logic: { format: "value_vs_column", column_name: "status", operator: "eq", target_value: "Active" },
    }], families, availableColumns);
    expect(drafts[0]?.groupTree).toEqual({
      kind: "or",
      children: [
        { kind: "leaf", conditionId: "__missing_c0__" },
        { kind: "leaf", conditionId: "c0" },
      ],
    });
    expect(warnings.some((warning) => warning.type === "invalid_grouping")).toBe(true);
  });

  it("marks a missing flat grouped outcome as blocking instead of dropping its clause", () => {
    const { drafts, warnings } = resolveRulesConfig([{
      name: "Missing outcome",
      logic_clauses: [
        { format: "value_vs_column", column_name: "missing", operator: "eq", target_value: "Y" },
        { format: "value_vs_column", column_name: "cva", operator: "eq", target_value: "N" },
      ],
      logic_relation: "and",
    }], families, availableColumns);
    expect(drafts[0]?.logicGroupingErrors?.join(" ")).toMatch(/outcome 1.*no available members/i);
    expect(warnings.some((warning) => warning.type === "invalid_grouping")).toBe(true);
  });
});
