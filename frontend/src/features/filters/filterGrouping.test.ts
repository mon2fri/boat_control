import { describe, expect, it } from "vitest";
import type { FilterRow, GroupNode } from "../../api/domain";
import {
  defaultFilterGrouping,
  filterRowsAsConditions,
  formatFilterGroupingExpression,
  repairFilterGroupingTree,
  resetFilterGroupingTree,
  validateFilterGrouping,
} from "./filterGrouping";

function row(id: string, column: string, value: string): FilterRow {
  return { id, column, operator: "equals", values: [value] };
}

const rows = [
  row("f1", "Book type", "MO"),
  row("f2", "SYSTEM", "Traded Risk"),
  row("f3", "Book type", "FO"),
];

describe("filter grouping", () => {
  it("preserves legacy AND when multiple filters load without grouping", () => {
    expect(defaultFilterGrouping(rows)).toEqual({ mode: "and", tree: null });
    expect(defaultFilterGrouping([rows[0]!])).toEqual({ mode: null, tree: null });
  });

  it("formats a flat expression for AND and OR", () => {
    expect(
      formatFilterGroupingExpression(rows.slice(0, 2), { mode: "and", tree: null }),
    ).toContain('AND');
    expect(
      formatFilterGroupingExpression(rows, { mode: "or", tree: null }),
    ).toContain(' OR ');
  });

  it("formats a nested custom expression with explicit parentheses", () => {
    const tree: GroupNode = {
      kind: "or",
      children: [
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "f1" },
            { kind: "leaf", conditionId: "f2" },
          ],
        },
        { kind: "leaf", conditionId: "f3" },
      ],
    };
    const expression = formatFilterGroupingExpression(rows, { mode: "custom", tree });
    expect(expression).toBe(
      '(Filter 1: Book type equals "MO" AND Filter 2: SYSTEM equals "Traded Risk") OR Filter 3: Book type equals "FO"',
    );
  });

  it("rejects missing, unknown and duplicate references", () => {
    const missing = validateFilterGrouping(rows, { mode: "custom", tree: null });
    expect(missing.valid).toBe(false);
    expect(missing.errors.join(" ")).toMatch(/at least one group/i);

    const tree: GroupNode = {
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "f1" },
        { kind: "leaf", conditionId: "f1" },
        { kind: "leaf", conditionId: "removed" },
      ],
    };
    const invalid = validateFilterGrouping(rows, { mode: "custom", tree });
    expect(invalid.valid).toBe(false);
    expect(invalid.duplicateIds).toEqual(["f1"]);
    expect(invalid.unknownIds).toEqual(["removed"]);
    expect(invalid.missingIds).toEqual(["f2", "f3"]);
  });

  it("repairs stale references without silently reintroducing removed filters", () => {
    const tree: GroupNode = {
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "f1" },
        { kind: "leaf", conditionId: "f2" },
        { kind: "leaf", conditionId: "f3" },
      ],
    };
    const repaired = repairFilterGroupingTree(rows.slice(0, 2), { mode: "custom", tree });
    expect(repaired.tree).toEqual({
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "f1" },
        { kind: "leaf", conditionId: "f2" },
      ],
    });
  });

  it("can seed custom grouping from all current filters", () => {
    const seeded = resetFilterGroupingTree(rows, { mode: "custom", tree: null }, "and");
    expect(seeded.mode).toBe("custom");
    expect(seeded.tree?.kind).toBe("and");
    expect(validateFilterGrouping(rows, seeded).valid).toBe(true);
  });

  it("maps filter rows to the shared condition shape for the tree editor", () => {
    expect(filterRowsAsConditions(rows.slice(0, 1))[0]).toMatchObject({
      id: "f1",
      column: "Book type",
      operator: "equals",
      values: ["MO"],
    });
  });
});
