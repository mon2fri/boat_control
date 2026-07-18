/**
 * Round-trip tests for the executable grouping tree.
 *
 * The grouping tree is the canonical representation that the rule editor
 * builds and the backend evaluator consumes. The legacy free-text field
 * cannot express mixed-precedence expressions, so these tests prove the
 * tree round-trips through `mapWireRule` and `mapRuleToWireDraft` for the
 * minimum required shapes plus a four-condition case for completeness.
 */
import { describe, expect, it } from "vitest";
import { mapRuleToWireDraft, mapWireRule } from "../../api/mapping";
import { ruleDraftRequestSchema, wireRuleSchema } from "../../api/wire";
import type { Condition, GroupNode, Rule } from "../../api/domain";

function cond(id: string): Condition {
  return { id, column: `col_${id}`, operator: "equals", value: `v_${id}` };
}

function ruleWithTree(tree: GroupNode | null): Rule {
  return {
    index: "R010",
    name: "Mixed grouping",
    description: "",
    conditions: [cond("c0"), cond("c1"), cond("c2"), cond("c3")],
    conditionJoin: null,
    conditionGrouping: null,
    groupTree: tree,
    logic: { id: "l0", format: "value", column: "status", operator: "equals", target: "active" },
  };
}

describe("grouping tree round-trip", () => {
  const cases: { name: string; tree: GroupNode | null }[] = [
    {
      name: "null (uniform AND join)",
      tree: null,
    },
    {
      name: "(A and B) or C",
      tree: {
        kind: "or",
        children: [
          {
            kind: "and",
            children: [{ kind: "leaf", conditionId: "c0" }, { kind: "leaf", conditionId: "c1" }],
          },
          { kind: "leaf", conditionId: "c2" },
        ],
      },
    },
    {
      name: "A and (B or C)",
      tree: {
        kind: "and",
        children: [
          { kind: "leaf", conditionId: "c0" },
          {
            kind: "or",
            children: [{ kind: "leaf", conditionId: "c1" }, { kind: "leaf", conditionId: "c2" }],
          },
        ],
      },
    },
    {
      name: "(A or B) and (C or D)",
      tree: {
        kind: "and",
        children: [
          {
            kind: "or",
            children: [{ kind: "leaf", conditionId: "c0" }, { kind: "leaf", conditionId: "c1" }],
          },
          {
            kind: "or",
            children: [{ kind: "leaf", conditionId: "c2" }, { kind: "leaf", conditionId: "c3" }],
          },
        ],
      },
    },
    {
      name: "deeply nested (A and (B or (C and D)))",
      tree: {
        kind: "and",
        children: [
          { kind: "leaf", conditionId: "c0" },
          {
            kind: "or",
            children: [
              { kind: "leaf", conditionId: "c1" },
              {
                kind: "and",
                children: [{ kind: "leaf", conditionId: "c2" }, { kind: "leaf", conditionId: "c3" }],
              },
            ],
          },
        ],
      },
    },
  ];

  for (const { name, tree } of cases) {
    it(`serializes ${name} through the mapper without losing structure`, () => {
      const rule = ruleWithTree(tree);
      const wire = mapRuleToWireDraft(rule);
      const draft = ruleDraftRequestSchema.parse(wire);
      // Re-parse as a wire rule shape so the round-trip survives the schema.
      const asWireRule = wireRuleSchema.parse({
        rule_id: rule.index,
        name: rule.name,
        conditions: draft.conditions,
        grouping_tree: draft.grouping_tree,
        logic: {
          format: "value_vs_column",
          column_name: rule.logic.column,
          operator: "eq",
          target_value: rule.logic.target,
        },
      });
      const back = mapWireRule(asWireRule);
      expect(back.groupTree).toEqual(tree);
    });
  }

  it("never sends the legacy free-text grouping field to the wire", () => {
    const wire = mapRuleToWireDraft(ruleWithTree(null));
    expect(wire).not.toHaveProperty("grouping");
    expect(wire).not.toHaveProperty("conditionGrouping");
  });

  it("never splits a free-text grouping expression on whitespace", () => {
    // Even if someone hands the mapper a stray free-text value, the mapper
    // does NOT tokenise it into a group list. The tree field is the only
    // thing that goes out.
    const wire = mapRuleToWireDraft({
      ...ruleWithTree(null),
      conditionGrouping: "(1 AND 2) OR 3",
    });
    expect(wire).not.toHaveProperty("grouping");
    expect(wire.grouping_tree).toBeUndefined();
  });
});