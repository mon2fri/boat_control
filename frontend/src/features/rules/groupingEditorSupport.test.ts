import { describe, expect, it } from "vitest";
import type { GroupNode } from "../../api/domain";
import {
  buildFlatGroupingTree,
  formatGroupingExpression,
  inspectGroupingTree,
  pruneGroupingTree,
  validateCustomGrouping,
} from "./groupingEditorSupport";

describe("grouping editor support", () => {
  it("formats nested groups with parentheses only where precedence needs them", () => {
    const tree: GroupNode = {
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "f1" },
        {
          kind: "or",
          children: [
            { kind: "leaf", conditionId: "f2" },
            { kind: "leaf", conditionId: "f3" },
          ],
        },
      ],
    };
    expect(formatGroupingExpression(tree, (id) => id.toUpperCase())).toBe(
      "F1 AND (F2 OR F3)",
    );
  });

  it("rejects single-member groups and excessive nesting depth", () => {
    const emptyGroup: GroupNode = { kind: "and", children: [{ kind: "leaf", conditionId: "a" }] };
    expect(inspectGroupingTree(emptyGroup).structuralErrors[0]).toMatch(/at least two members/i);

    let deep: GroupNode = { kind: "leaf", conditionId: "a" };
    for (let index = 0; index < 10; index++) {
      deep = { kind: "and", children: [deep, { kind: "leaf", conditionId: `b${index}` }] };
    }
    expect(inspectGroupingTree(deep).structuralErrors.join(" ")).toMatch(/nested more than 8 levels/i);
  });

  it("prunes unknown leaves, collapses single-child groups, and returns null when empty", () => {
    const tree: GroupNode = {
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "keep" },
        { kind: "leaf", conditionId: "removed" },
      ],
    };
    expect(pruneGroupingTree(tree, new Set(["keep"]))).toEqual({
      kind: "leaf",
      conditionId: "keep",
    });
    expect(pruneGroupingTree(tree, new Set())).toBeNull();
  });

  it("builds flat trees and validates exact coverage", () => {
    const tree = buildFlatGroupingTree(["a", "b"], "or");
    expect(tree).toEqual({
      kind: "or",
      children: [
        { kind: "leaf", conditionId: "a" },
        { kind: "leaf", conditionId: "b" },
      ],
    });
    expect(validateCustomGrouping(tree, ["a", "b"], "outcome").valid).toBe(true);
    expect(validateCustomGrouping(tree, ["a", "b", "c"], "outcome").missingIds).toEqual(["c"]);
  });
});
