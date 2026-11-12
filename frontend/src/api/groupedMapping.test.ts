import { describe, expect, it } from "vitest";
import type { FilterRow, GroupNode, Rule } from "./domain";
import {
  mapFilterConfigurationToWire,
  mapRuleLogicToWireDraft,
  mapRuleToWireDraft,
  mapRunDocumentToResult,
  mapRunRequestToWire,
  mapSavedFilter,
  mapSavedFilterToWire,
  mapWireRule,
  mapWireRuleLogic,
} from "./mapping";
import {
  legacyWireRunDocumentSchema,
  ruleDraftRequestSchema,
  wireRuleSchema,
  wireRunDocumentSchema,
  wireRunRequestSchema,
  wireSavedFilterSchema,
} from "./wire";
import { GroupingValidationError } from "../lib/grouping";

const baseRequest = {
  sessionId: "s1",
  comparisonColumns: ["book", "system", "status"],
  filters: [] as FilterRow[],
  targetColumns: [],
  keyColumns: ["book"],
  aggregationColumns: [],
  ruleIndexes: [],
};

const filters: FilterRow[] = [
  { id: "runtime-book", column: "book", operator: "equals", values: ["MO"] },
  { id: "runtime-system", column: "system", operator: "equals", values: ["Traded Risk"] },
  { id: "runtime-status", column: "status", operator: "equals", values: ["Active"] },
];

const filterTree: GroupNode = {
  kind: "or",
  children: [
    {
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "runtime-book" },
        { kind: "leaf", conditionId: "runtime-system" },
      ],
    },
    { kind: "leaf", conditionId: "runtime-status" },
  ],
};

function runDocument(extra: Record<string, unknown> = {}) {
  return wireRunDocumentSchema.parse({
    run_id: "r1",
    report_name: "grouped",
    file_a_name: "a.csv",
    file_b_name: "b.csv",
    created_at: "2026-11-08T00:00:00Z",
    result: {
      comparison: {
        total_rows_a: 0,
        total_rows_b: 0,
        rows_with_changes: 0,
        total_attribute_changes: 0,
        row_details: [],
      },
      validation: {
        total_violations: 0,
        violations_by_rule: {},
        violation_count_by_rule: {},
      },
      rule_bindings: {},
      common_columns: ["book", "system", "status"],
      target_columns: ["book", "system", "status"],
      filters_applied: [
        { column: "book", operator: "eq", filter_values: ["MO"] },
        { column: "system", operator: "eq", filter_values: ["Traded Risk"] },
        { column: "status", operator: "eq", filter_values: ["Active"] },
      ],
      ...extra,
    },
  });
}

describe("filter grouping transport", () => {
  it("remaps runtime filter IDs to indexed cN references", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      filters,
      filterRelation: "or",
      filterGroupTree: filterTree,
    });
    expect(body.filters).toHaveLength(3);
    expect(body.filter_relation).toBe("or");
    expect(body.filter_grouping_tree).toEqual({
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
    expect(() => wireRunRequestSchema.parse(body)).not.toThrow();
  });

  it("remaps correctly after filters are reordered", () => {
    const reordered = [filters[2]!, filters[0]!, filters[1]!];
    const body = mapRunRequestToWire({
      ...baseRequest,
      filters: reordered,
      filterGroupTree: filterTree,
    });
    // book is now index 1, system index 2, status index 0.
    expect(body.filter_grouping_tree).toEqual({
      kind: "or",
      children: [
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "c1" },
            { kind: "leaf", conditionId: "c2" },
          ],
        },
        { kind: "leaf", conditionId: "c0" },
      ],
    });
  });

  it("rejects a tree that drops, duplicates or invents references", () => {
    const duplicate: GroupNode = {
      kind: "or",
      children: [
        { kind: "leaf", conditionId: "runtime-book" },
        { kind: "leaf", conditionId: "runtime-book" },
      ],
    };
    expect(() => mapRunRequestToWire({
      ...baseRequest,
      filters,
      filterGroupTree: duplicate,
    })).toThrow(GroupingValidationError);

    const invented: GroupNode = {
      kind: "or",
      children: [
        { kind: "leaf", conditionId: "runtime-book" },
        { kind: "leaf", conditionId: "removed-filter" },
      ],
    };
    expect(() => mapRunRequestToWire({
      ...baseRequest,
      filters,
      filterGroupTree: invented,
    })).toThrow(/unknown or removed/i);
  });

  it("rejects incomplete rows when grouping is configured but preserves legacy filtering", () => {
    const incomplete: FilterRow[] = [
      filters[0]!,
      { id: "empty", column: "", operator: "equals", values: [] },
    ];
    expect(() => mapRunRequestToWire({
      ...baseRequest,
      filters: incomplete,
      filterRelation: "and",
    })).toThrow(/incomplete filter row/i);

    const legacy = mapRunRequestToWire({ ...baseRequest, filters: incomplete });
    expect(legacy.filters).toHaveLength(1);
    expect(legacy.filter_relation).toBeUndefined();
    expect(legacy.filter_grouping_tree).toBeUndefined();
  });

  it("keeps legacy multi-filter AND payloads free of grouping fields", () => {
    const body = mapRunRequestToWire({ ...baseRequest, filters });
    expect(body.filters).toHaveLength(3);
    expect(body).not.toHaveProperty("filter_relation");
    expect(body).not.toHaveProperty("filter_grouping_tree");
  });

  it("requires explicit grouping for newly authored multi-filter runs", () => {
    expect(() => mapRunRequestToWire({
      ...baseRequest,
      filters,
      filterGroupingRequired: true,
    })).toThrow(/must choose AND, OR, or a custom grouping/i);

    const legacy = mapRunRequestToWire({ ...baseRequest, filters });
    expect(legacy.filter_relation).toBeUndefined();
  });

  it("restores persisted grouping into runtime row IDs", () => {
    const result = mapRunDocumentToResult(runDocument({
      filter_relation: "or",
      filter_grouping_tree: {
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
      },
    }));
    expect(result.filtersApplied?.map((row) => row.id)).toEqual(["fl-0", "fl-1", "fl-2"]);
    expect(result.filtersRelation).toBe("or");
    expect(result.filtersGroupTree).toEqual({
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
    expect(result.filtersGroupingErrors).toBeUndefined();
  });

  it("surfaces invalid restored grouping without broadening to legacy AND", () => {
    const result = mapRunDocumentToResult(runDocument({
      filter_grouping_tree: {
        kind: "or",
        children: [
          { kind: "leaf", conditionId: "c0" },
          { kind: "leaf", conditionId: "c9" },
        ],
      },
    }));
    expect(result.filtersGroupTree).toEqual({
      kind: "or",
      children: [
        { kind: "leaf", conditionId: "fl-0" },
        { kind: "leaf", conditionId: "__missing_c9__" },
      ],
    });
    expect(result.filtersGroupingErrors?.join(" ")).toMatch(/unknown or removed/i);
  });

  it("restores legacy run payloads as legacy AND with no tree", () => {
    const legacy = legacyWireRunDocumentSchema.parse({
      run_id: "r-legacy",
      report_name: "legacy",
      file_a_name: "a.csv",
      file_b_name: "b.csv",
      created_at: "2026-11-08T00:00:00Z",
      result: {
        comparison: {
          total_rows_a: 0,
          total_rows_b: 0,
          rows_with_changes: 0,
          total_attribute_changes: 0,
          row_details: [],
        },
        validation: { total_violations: 0, violations_by_rule: {}, violation_count_by_rule: {} },
        common_columns: ["book"],
        target_columns: ["book"],
        filters_applied: [{ column: "book", operator: "eq", filter_value: "MO" }],
      },
    });
    const result = mapRunDocumentToResult(legacy);
    expect(result.filtersRelation).toBeUndefined();
    expect(result.filtersGroupTree).toBeUndefined();
    expect(result.filtersGroupingErrors).toBeUndefined();
  });
});

function legacyRule(overrides: Record<string, unknown> = {}) {
  return wireRuleSchema.parse({
    rule_id: "R001",
    rule_identifier: "CBR1_00000000000000000000",
    enabled: true,
    name: "Rule",
    description: "",
    conditions: [],
    logic: {
      format: "value_vs_column",
      column_name: "status",
      operator: "eq",
      target_value: "Active",
    },
    ...overrides,
  });
}

function multiOutcomeRule(overrides: Record<string, unknown> = {}) {
  return wireRuleSchema.parse({
    rule_id: "R002",
    rule_identifier: "CBR1_11111111111111111111",
    enabled: true,
    name: "Grouped outcomes",
    description: "",
    conditions: [],
    logic_clauses: [
      {
        format: "value_vs_column",
        column_name: "sa",
        operator: "eq",
        target_value: "Y",
      },
      {
        format: "value_vs_column",
        column_name: "cva",
        operator: "eq",
        target_value: "N",
      },
      {
        format: "value_vs_column",
        column_name: "status",
        operator: "eq",
        target_value: "Active",
      },
    ],
    logic_relation: "and",
    logic_grouping_tree: {
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
    },
    ...overrides,
  });
}

describe("rule outcome grouping transport", () => {
  it("reads grouped outcomes and remaps persisted references to runtime clause IDs", () => {
    const rule = mapWireRule(multiOutcomeRule());
    expect(rule.logicClauses?.map((clause) => clause.column)).toEqual(["sa", "cva", "status"]);
    expect(rule.logicClauses?.map((clause) => clause.id)).toEqual(["l0", "l1", "l2"]);
    expect(rule.logicRelation).toBe("and");
    expect(rule.logicGroupTree).toEqual({
      kind: "and",
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
    expect(rule.logic).toEqual(rule.logicClauses?.[0]);
  });

  it("writes grouped outcomes using the new form with indexed references", () => {
    const rule = mapWireRule(multiOutcomeRule());
    const draft = mapRuleToWireDraft(rule);
    expect(draft).not.toHaveProperty("logic");
    expect(draft.logic_clauses).toHaveLength(3);
    expect(draft.logic_relation).toBe("and");
    expect(draft.logic_grouping_tree).toEqual({
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
    expect(() => ruleDraftRequestSchema.parse(draft)).not.toThrow();
  });

  it("round-trips R079's canonical custom tree through the catalog API shape", () => {
    const groupedRule = mapWireRule(wireRuleSchema.parse({
      rule_id: "R079",
      rule_identifier: "CBR1_00000000000000000000",
      enabled: true,
      enabled_position: 1,
      name: "UI Flags - opposite Yes No",
      description: "",
      conditions: [],
      logic_clauses: [
        { format: "value_vs_column", column_name: "sa_flag", operator: "eq", target_value: "Yes" },
        { format: "value_vs_column", column_name: "cva_flag", operator: "eq", target_value: "No" },
        { format: "value_vs_column", column_name: "sa_flag", operator: "eq", target_value: "No" },
        { format: "value_vs_column", column_name: "cva_flag", operator: "eq", target_value: "Yes" },
      ],
      logic_relation: "or",
      logic_grouping_tree: {
        kind: "or",
        children: [
          { kind: "and", children: [
            { kind: "leaf", conditionId: "c0" },
            { kind: "leaf", conditionId: "c1" },
          ] },
          { kind: "and", children: [
            { kind: "leaf", conditionId: "c2" },
            { kind: "leaf", conditionId: "c3" },
          ] },
        ],
      },
      extra_columns: ["sa_flag", "cva_flag"],
      hide_comparison: false,
    }));

    const savedPayload = mapRuleToWireDraft(groupedRule);
    expect(ruleDraftRequestSchema.parse(savedPayload)).toEqual(savedPayload);
    expect(savedPayload.logic_relation).toBe("or");
    expect(savedPayload.logic_clauses).toHaveLength(4);
    expect(savedPayload.logic_grouping_tree).toEqual({
      kind: "or",
      children: [
        { kind: "and", children: [
          { kind: "leaf", conditionId: "c0" },
          { kind: "leaf", conditionId: "c1" },
        ] },
        { kind: "and", children: [
          { kind: "leaf", conditionId: "c2" },
          { kind: "leaf", conditionId: "c3" },
        ] },
      ],
    });

    const reloaded = mapWireRule(wireRuleSchema.parse({
      ...savedPayload,
      rule_id: "R079",
      rule_identifier: groupedRule.identifier,
      enabled: true,
      enabled_position: 1,
      description: "",
    }));
    expect(reloaded.logicGroupTree).toEqual(groupedRule.logicGroupTree);
    expect(reloaded.logicRelation).toBe("or");
    expect(reloaded.logicClauses).toHaveLength(4);
  });

  it("remaps references after outcomes are reordered", () => {
    const rule = mapWireRule(multiOutcomeRule());
    const clauses = rule.logicClauses!;
    const reordered: Rule = { ...rule, logicClauses: [clauses[1]!, clauses[0]!, clauses[2]!] };
    const draft = mapRuleToWireDraft(reordered);
    // l0 was sa and moved to index 1; l1 was cva and moved to index 0.
    expect(draft.logic_grouping_tree).toEqual({
      kind: "and",
      children: [
        {
          kind: "or",
          children: [
            { kind: "leaf", conditionId: "c1" },
            { kind: "leaf", conditionId: "c0" },
          ],
        },
        { kind: "leaf", conditionId: "c2" },
      ],
    });
  });

  it("keeps a single legacy outcome in the legacy wire form", () => {
    const rule = mapWireRule(legacyRule());
    expect(rule.logicClauses).toBeUndefined();
    expect(rule.logicRelation).toBeUndefined();
    expect(rule.logicGroupTree).toBeUndefined();
    const draft = mapRuleToWireDraft(rule);
    expect(draft.logic).toEqual({
      format: "value_vs_column",
      column_name: "status",
      operator: "eq",
      target_value: "Active",
      target_values: ["Active"],
    });
    expect(draft).not.toHaveProperty("logic_clauses");
    expect(draft).not.toHaveProperty("logic_relation");
    expect(draft).not.toHaveProperty("logic_grouping_tree");
  });

  it("preserves legacy column-against-column outcomes", () => {
    const wire = legacyRule({
      logic: {
        format: "column_vs_column",
        column_name: "status",
        operator: "eq",
        target_value: "status",
        comparison_mode: "comparison_vs_baseline",
      },
    });
    const rule = mapWireRule(wire);
    expect(rule.logic.format).toBe("column");
    expect(rule.logic.columnComparisonMode).toBe("comparison_vs_baseline");
    const draft = mapRuleToWireDraft(rule);
    expect(draft.logic).toMatchObject({
      format: "column_vs_column",
      comparison_mode: "comparison_vs_baseline",
    });
  });

  it("rejects contradictory legacy/new representations", () => {
    expect(() => mapWireRuleLogic({
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
    })).toThrow(/both legacy logic and logic_clauses/i);

    expect(() => wireRuleSchema.parse({
      rule_id: "R003",
      rule_identifier: "CBR1_22222222222222222222",
      enabled: true,
      name: "Contradictory",
      description: "",
      conditions: [],
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
    })).toThrow();
  });

  it("rejects multiple column-against-column or ungrouped outcomes", () => {
    const rule = mapWireRule(multiOutcomeRule());
    const columnOutcome: Rule = {
      ...rule,
      logicClauses: [
        { id: "l0", format: "column", column: "a", operator: "equals", target: "b" },
        { id: "l1", format: "value", column: "c", operator: "equals", target: "Y" },
      ],
      logicRelation: "or",
      logicGroupTree: null,
    };
    expect(() => mapRuleLogicToWireDraft(columnOutcome)).toThrow(/value-against-column/i);

    const ungrouped: Rule = {
      ...rule,
      logicClauses: rule.logicClauses!.slice(0, 2),
      logicRelation: null,
      logicGroupTree: null,
    };
    expect(() => mapRuleLogicToWireDraft(ungrouped)).toThrow(/must choose AND, OR/i);
  });
});

describe("saved filter grouping transport", () => {
  const wire = wireSavedFilterSchema.parse({
    id: "saved-1",
    name: "Population",
    rows: [
      { column: "book", operator: "eq", filter_values: ["MO"] },
      { column: "system", operator: "eq", filter_values: ["Traded Risk"] },
      { column: "status", operator: "eq", filter_values: ["Active"] },
    ],
    filter_relation: "or",
    filter_grouping_tree: {
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
    },
  });

  it("round-trips nested grouping through runtime IDs", () => {
    const saved = mapSavedFilter(wire);
    expect(saved.rows.map((row) => row.id)).toEqual(["f-0", "f-1", "f-2"]);
    expect(saved.groupTree).toEqual({
      kind: "or",
      children: [
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "f-0" },
            { kind: "leaf", conditionId: "f-1" },
          ],
        },
        { kind: "leaf", conditionId: "f-2" },
      ],
    });
    const outbound = mapSavedFilterToWire(saved);
    expect(outbound.filter_relation).toBe("or");
    expect(outbound.filter_grouping_tree).toEqual(wire.filter_grouping_tree);
  });

  it("blocks saving a restored saved filter with invalid references", () => {
    const saved = mapSavedFilter(wireSavedFilterSchema.parse({
      id: "broken",
      name: "Broken",
      rows: [{ column: "book", operator: "eq", filter_values: ["MO"] }],
      filter_grouping_tree: {
        kind: "or",
        children: [
          { kind: "leaf", conditionId: "c0" },
          { kind: "leaf", conditionId: "c8" },
        ],
      },
    }));
    expect(saved.groupingErrors?.join(" ")).toMatch(/unknown or removed/i);
    expect(() => mapSavedFilterToWire(saved)).toThrow(GroupingValidationError);
  });
});

describe("filter configuration helper", () => {
  it("returns persisted references without dropping grouping", () => {
    const mapped = mapFilterConfigurationToWire(filters, null, filterTree, {
      label: "filters",
    });
    expect(mapped.groupTree).toEqual({
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
});
