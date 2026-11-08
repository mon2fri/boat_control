import { describe, expect, it } from "vitest";
import type { GroupNode } from "../api/domain";
import {
  buildFlatGroupTree,
  fromPersistedGroupingTree,
  resolveGroupedExpression,
  toPersistedGroupingTree,
  validateGroupingTree,
  MAX_GROUPING_DEPTH,
  MAX_GROUPING_LEAVES,
} from "./grouping";

const clauses = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("validateGroupingTree", () => {
  it("accepts a nested tree that references every clause exactly once", () => {
    const tree: GroupNode = {
      kind: "or",
      children: [
        { kind: "and", children: [{ kind: "leaf", conditionId: "a" }, { kind: "leaf", conditionId: "b" }] },
        { kind: "leaf", conditionId: "c" },
      ],
    };
    const result = validateGroupingTree(tree, clauses.map((clause) => clause.id));
    expect(result.valid).toBe(true);
    expect(result.referencedIds.sort()).toEqual(["a", "b", "c"]);
  });

  it("rejects unknown, duplicate, omitted and empty branches", () => {
    const tree = {
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "a" },
        { kind: "leaf", conditionId: "a" },
        { kind: "leaf", conditionId: "removed" },
        { kind: "or", children: [] },
      ],
    } as unknown as GroupNode;
    const result = validateGroupingTree(tree, ["a", "b", "c"]);
    expect(result.valid).toBe(false);
    expect(result.duplicateIds).toEqual(["a"]);
    expect(result.unknownIds).toContain("removed");
    expect(result.missingIds).toEqual(["b", "c"]);
    expect(result.errors.join(" ")).toMatch(/fewer than two children|unknown|omits|same clause/i);
  });

  it("rejects malformed nodes and unsafe depth/size", () => {
    expect(validateGroupingTree({ kind: "xor", children: [] }, []).valid).toBe(false);
    expect(validateGroupingTree({ kind: "leaf" }, []).valid).toBe(false);

    let deep: GroupNode = { kind: "leaf", conditionId: "a" };
    for (let i = 0; i < MAX_GROUPING_DEPTH; i += 1) {
      deep = { kind: "and", children: [deep, { kind: "leaf", conditionId: "a" }] };
    }
    expect(validateGroupingTree(deep, ["a"]).valid).toBe(false);

    const hugeChildren = Array.from({ length: MAX_GROUPING_LEAVES + 2 }, () => ({
      kind: "leaf" as const,
      conditionId: "a",
    }));
    expect(validateGroupingTree({ kind: "and", children: hugeChildren }, ["a"]).valid).toBe(false);
  });
});

describe("resolveGroupedExpression", () => {
  it("never falls back to a flat relation when a present tree is invalid", () => {
    const result = resolveGroupedExpression(
      [{ id: "a" }, { id: "b" }],
      "or",
      { kind: "or", children: [{ kind: "leaf", conditionId: "a" }, { kind: "leaf", conditionId: "removed" }] },
      { label: "filter grouping", allowLegacyAnd: true },
    );
    expect(result.valid).toBe(false);
    expect(result.relation).toBe("or");
    expect(result.errors.join(" ")).toMatch(/unknown|omits/i);
  });

  it("preserves legacy AND when no relation or tree is present", () => {
    const result = resolveGroupedExpression([{ id: "a" }, { id: "b" }], null, null, {
      allowLegacyAnd: true,
    });
    expect(result.valid).toBe(true);
    expect(result.legacy).toBe(true);
    expect(result.relation).toBe("and");
  });

  it("requires explicit grouping for new multi-outcome payloads", () => {
    const result = resolveGroupedExpression([{ id: "a" }, { id: "b" }], null, null, {
      requireExplicitForMultiple: true,
      allowLegacyAnd: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/must choose AND, OR/i);
  });

  it("treats a single clause as valid without grouping", () => {
    const result = resolveGroupedExpression([{ id: "a" }], null, null, {
      requireExplicitForMultiple: true,
      allowLegacyAnd: false,
    });
    expect(result.valid).toBe(true);
    expect(result.relation).toBe("and");
  });

  it("ignores a stale relation when no clauses remain (no row restriction)", () => {
    const result = resolveGroupedExpression([], "or", null, {
      label: "filter grouping",
      allowLegacyAnd: true,
    });
    expect(result.valid).toBe(true);
    expect(result.relation).toBeNull();
  });
});

describe("grouping reference remapping", () => {
  const tree: GroupNode = {
    kind: "or",
    children: [
      { kind: "and", children: [{ kind: "leaf", conditionId: "a" }, { kind: "leaf", conditionId: "b" }] },
      { kind: "leaf", conditionId: "c" },
    ],
  };

  it("maps runtime IDs to persisted indexes and back", () => {
    const persisted = toPersistedGroupingTree(tree, clauses);
    expect(persisted).toEqual({
      kind: "or",
      children: [
        { kind: "and", children: [{ kind: "leaf", conditionId: "c0" }, { kind: "leaf", conditionId: "c1" }] },
        { kind: "leaf", conditionId: "c2" },
      ],
    });
    expect(fromPersistedGroupingTree(persisted, clauses)).toEqual(tree);
  });

  it("keeps missing persisted references visible instead of dropping them", () => {
    const restored = fromPersistedGroupingTree(
      { kind: "or", children: [{ kind: "leaf", conditionId: "c0" }, { kind: "leaf", conditionId: "c9" }] },
      [{ id: "a" }],
    );
    expect(restored).toEqual({
      kind: "or",
      children: [{ kind: "leaf", conditionId: "a" }, { kind: "leaf", conditionId: "__missing_c9__" }],
    });
  });

  it("rebuilds a flat tree for a relation", () => {
    expect(buildFlatGroupTree([], "and")).toBeNull();
    expect(buildFlatGroupTree([{ id: "a" }], "or")).toEqual({ kind: "leaf", conditionId: "a" });
    expect(buildFlatGroupTree([{ id: "a" }, { id: "b" }], "or")).toEqual({
      kind: "or",
      children: [{ kind: "leaf", conditionId: "a" }, { kind: "leaf", conditionId: "b" }],
    });
  });
});
