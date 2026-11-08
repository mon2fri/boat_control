/**
 * Regression tests for `describeLogic`. The function is what the rule list,
 * rule editor preview, and the result section use to render the rule in
 * required-state language. Each operator must produce the canonical phrase
 * so users can read the rule at a glance.
 */
import { describe, expect, it } from "vitest";
import {
  describeLogic,
  ruleLogicClauses,
  validateRuleLogicConfiguration,
} from "./useRules";
import type { LogicClause, Rule } from "../../api/domain";

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    index: "R001",
    name: "Status active",
    description: "",
    conditions: [],
    conditionJoin: null,
    conditionGrouping: null,
    groupTree: null,
    logic: { id: "l0", format: "value", column: "status", operator: "equals", target: "active" },
    ...overrides,
  };
}

describe("describeLogic", () => {
  it("renders equality as 'must equal'", () => {
    expect(describeLogic(rule())).toBe('status must equal "active"');
  });

  it("renders inequality as 'must not equal'", () => {
    expect(describeLogic(rule({ logic: { id: "l0", format: "value", column: "status", operator: "not_equals", target: "inactive" } }))).toBe(
      'status must not equal "inactive"',
    );
  });

  it("renders 'must contain' and 'must not contain'", () => {
    expect(describeLogic(rule({ logic: { id: "l0", format: "value", column: "name", operator: "contains", target: "Acme" } }))).toBe(
      'name must contain "Acme"',
    );
    expect(describeLogic(rule({ logic: { id: "l0", format: "value", column: "name", operator: "not_contains", target: "Acme" } }))).toBe(
      'name must not contain "Acme"',
    );
  });

  it("renders numeric comparators in plain English", () => {
    expect(describeLogic(rule({ logic: { id: "l0", format: "value", column: "score", operator: "greater_than", target: "10" } }))).toBe(
      'score must be greater than "10"',
    );
    expect(describeLogic(rule({ logic: { id: "l0", format: "value", column: "score", operator: "less_than", target: "100" } }))).toBe(
      'score must be less than "100"',
    );
  });

  it("renders legacy column-vs-column as same-column Comparison vs Baseline", () => {
    expect(describeLogic(rule({ logic: { id: "l0", format: "column", column: "status", operator: "equals", target: "expected" } }))).toBe(
      "status must equal the same column [status] in Baseline",
    );
  });

  it("renders different-column Comparison vs Comparison logic", () => {
    expect(describeLogic(rule({ logic: {
      id: "l0",
      format: "column",
      column: "status",
      operator: "equals",
      target: "expected",
      columnComparisonMode: "comparison_vs_comparison",
    } }))).toBe(
      "status must equal column [expected] in Comparison",
    );
  });

  it("renders multiple outcomes joined by their flat relation", () => {
    const clauses: LogicClause[] = [
      { id: "l0", format: "value", column: "sa", operator: "equals", target: "Y" },
      { id: "l1", format: "value", column: "cva", operator: "equals", target: "Y" },
    ];
    expect(describeLogic(rule({ logic: clauses[0]!, logicClauses: clauses, logicRelation: "or" })))
      .toBe('sa must equal "Y" OR cva must equal "Y"');
  });

  it("renders the full nested outcome expression", () => {
    const clauses: LogicClause[] = [
      { id: "l0", format: "value", column: "sa", operator: "equals", target: "Y" },
      { id: "l1", format: "value", column: "cva", operator: "equals", target: "N" },
      { id: "l2", format: "value", column: "status", operator: "equals", target: "Active" },
    ];
    const text = describeLogic(rule({
      logic: clauses[0]!,
      logicClauses: clauses,
      logicRelation: null,
      logicGroupTree: {
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
      },
    }));
    expect(text).toContain("overall: group 1 AND outcome 3");
    expect(text).toContain('group 1: outcome 1 (sa must equal "Y") OR outcome 2 (cva must equal "N")');
  });
});

describe("ruleLogicClauses / validation", () => {
  it("falls back to the legacy clause", () => {
    expect(ruleLogicClauses(rule())).toEqual([rule().logic]);
  });

  it("accepts a nested grouped expression", () => {
    const clauses: LogicClause[] = [
      { id: "l0", format: "value", column: "sa", operator: "equals", target: "Y" },
      { id: "l1", format: "value", column: "cva", operator: "equals", target: "N" },
      { id: "l2", format: "value", column: "status", operator: "equals", target: "Active" },
    ];
    expect(validateRuleLogicConfiguration({
      logic: clauses[0]!,
      logicClauses: clauses,
      logicRelation: "and",
      logicGroupTree: {
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
      },
    })).toEqual({ valid: true, errors: [] });
  });

  it("rejects missing references and column-against-column multi outcomes", () => {
    const clauses: LogicClause[] = [
      { id: "l0", format: "value", column: "sa", operator: "equals", target: "Y" },
      { id: "l1", format: "column", column: "cva", operator: "equals", target: "sa" },
    ];
    const result = validateRuleLogicConfiguration({
      logic: clauses[0]!,
      logicClauses: clauses,
      logicRelation: "or",
      logicGroupTree: {
        kind: "or",
        children: [
          { kind: "leaf", conditionId: "l0" },
          { kind: "leaf", conditionId: "removed" },
        ],
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/unknown or removed/i);
    expect(result.errors.join(" ")).toMatch(/value-against-column/i);
  });
});
