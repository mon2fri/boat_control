/**
 * Regression tests for `describeLogic`. The function is what the rule list,
 * rule editor preview, and the result section use to render the rule in
 * required-state language. Each operator must produce the canonical phrase
 * so users can read the rule at a glance.
 */
import { describe, expect, it } from "vitest";
import { describeLogic } from "./useRules";
import type { Rule } from "../../api/domain";

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
});
