import { describe, expect, it } from "vitest";
import type { GroupNode, LogicClause, Rule } from "../../api/domain";
import {
  clearLogicOutcomeGrouping,
  columnModeHasRetainedOutcomes,
  formatLogicOutcomeExpression,
  getRuleLogicClauses,
  getRuleLogicGrouping,
  outcomeAsCondition,
  validateLogicOutcomes,
  type RuleWithLogicGrouping,
} from "./logicOutcomes";

function clause(id: string, column: string, value: string, operator: LogicClause["operator"] = "equals"): LogicClause {
  return { id, format: "value", column, operator, target: value, values: [value] };
}

const outcomes = [
  clause("l0", "SA Contributory", "Y"),
  clause("l1", "SA-CVA Hedge Book", "N"),
  clause("l2", "SA Contributory", "N"),
  clause("l3", "SA-CVA Hedge Book", "Y"),
];

const twoGroups: GroupNode = {
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
};

describe("logic outcome grouping", () => {
  it("formats the required two AND groups joined by OR unambiguously", () => {
    expect(formatLogicOutcomeExpression(outcomes, { mode: "custom", tree: twoGroups })).toBe(
      '(Outcome 1: SA Contributory must equal "Y" AND Outcome 2: SA-CVA Hedge Book must equal "N") OR (Outcome 3: SA Contributory must equal "N" AND Outcome 4: SA-CVA Hedge Book must equal "Y")',
    );
  });

  it("formats simple OR and AND outcome expressions", () => {
    expect(
      formatLogicOutcomeExpression(outcomes.slice(0, 2), { mode: "or", tree: null }),
    ).toContain(" OR ");
    expect(
      formatLogicOutcomeExpression(outcomes.slice(0, 2), { mode: "and", tree: null }),
    ).toContain(" AND ");
  });

  it("requires explicit grouping for multiple newly authored outcomes", () => {
    const result = validateLogicOutcomes(outcomes.slice(0, 2), { mode: null, tree: null });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Choose AND, OR, or CUSTOM GROUPS/);

    const custom = validateLogicOutcomes(outcomes, { mode: "custom", tree: twoGroups });
    expect(custom.valid).toBe(true);
  });

  it("reports removed outcome references so saving cannot silently broaden the rule", () => {
    const result = validateLogicOutcomes(outcomes.slice(0, 2), {
      mode: "custom",
      tree: twoGroups,
    });
    expect(result.valid).toBe(false);
    expect(result.unknownIds).toEqual(["l2", "l3"]);
    expect(result.errors.join(" ")).toMatch(/removed or unknown outcome/);
  });

  it("reads the legacy single logic clause without inventing a grouping", () => {
    const rule = {
      index: "R001",
      name: "Legacy",
      description: "",
      conditions: [],
      conditionJoin: null,
      conditionGrouping: null,
      groupTree: null,
      logic: clause("l0", "status", "Active"),
    } as Rule;
    expect(getRuleLogicClauses(rule)).toEqual([rule.logic]);
    expect(getRuleLogicGrouping(rule)).toEqual({ mode: null, tree: null });
  });

  it("reads persisted multi-outcome grouping and retains it in column mode checks", () => {
    const rule: RuleWithLogicGrouping = {
      index: "R002",
      name: "Grouped",
      description: "",
      conditions: [],
      conditionJoin: null,
      conditionGrouping: null,
      groupTree: null,
      logic: outcomes[0]!,
      logicClauses: outcomes,
      logicRelation: null,
      logicGroupTree: twoGroups,
    };
    expect(getRuleLogicClauses(rule)).toEqual(outcomes);
    expect(getRuleLogicGrouping(rule)).toEqual({ mode: "custom", tree: twoGroups });
    expect(columnModeHasRetainedOutcomes("column", outcomes)).toBe(true);
    expect(columnModeHasRetainedOutcomes("value", outcomes)).toBe(false);
  });

  it("accepts the legacy D-only logicGroupingTree alias during transition", () => {
    const rule: RuleWithLogicGrouping = {
      index: "R003",
      name: "Transitional",
      description: "",
      conditions: [],
      conditionJoin: null,
      conditionGrouping: null,
      groupTree: null,
      logic: outcomes[0]!,
      logicClauses: outcomes,
      logicRelation: "or",
      logicGroupingTree: twoGroups,
    };
    expect(getRuleLogicGrouping(rule)).toEqual({ mode: "custom", tree: twoGroups });
  });

  it("clears only the grouping choice and leaves clauses untouched", () => {
    expect(clearLogicOutcomeGrouping()).toEqual({ mode: null, tree: null });
    expect(
      validateLogicOutcomes(outcomes, clearLogicOutcomeGrouping()).errors.join(" "),
    ).toMatch(/Choose AND, OR, or CUSTOM GROUPS/i);
  });

  it("adapts an outcome to the shared tree-editor condition shape", () => {
    expect(outcomeAsCondition(outcomes[0]!)).toMatchObject({
      id: "l0",
      column: "SA Contributory",
      operator: "equals",
      values: ["Y"],
    });
  });
});
