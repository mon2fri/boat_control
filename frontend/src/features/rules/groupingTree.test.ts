import { describe, expect, it } from "vitest";
import type { GroupNode } from "../../api/domain";
import { formatGroupTreeHierarchy } from "./groupingTree";

const filterLabels = (id: string) => `FILTER ${id}`;

describe("formatGroupTreeHierarchy", () => {
  it("keeps the legacy two-argument root/group output", () => {
    const tree: GroupNode = {
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "1" },
        { kind: "or", children: [
          { kind: "leaf", conditionId: "2" },
          { kind: "leaf", conditionId: "3" },
        ] },
      ],
    };

    expect(formatGroupTreeHierarchy(tree, filterLabels)).toBe(
      ["overall: FILTER 1 AND group 1", "group 1: FILTER 2 OR FILTER 3"].join("\n"),
    );
  });

  it("supports section wording and stable bottom-up group numbers", () => {
    const tree: GroupNode = {
      kind: "or",
      children: [
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "1" },
            {
              kind: "and",
              children: [
                { kind: "leaf", conditionId: "2" },
                { kind: "leaf", conditionId: "3" },
              ],
            },
          ],
        },
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "4" },
            { kind: "leaf", conditionId: "5" },
          ],
        },
      ],
    };

    expect(
      formatGroupTreeHierarchy(tree, filterLabels, {
        rootLabel: "overall",
        groupLabel: (number) => `Group ${number}`,
        operatorLabels: { and: "and", or: "or" },
      }),
    ).toBe(
      [
        "overall: Group 2 or Group 3",
        "Group 2: FILTER 1 and Group 1",
        "Group 1: FILTER 2 and FILTER 3",
        "Group 3: FILTER 4 and FILTER 5",
      ].join("\n"),
    );
  });

  it("returns a leaf label unchanged for a single-clause expression", () => {
    expect(
      formatGroupTreeHierarchy({ kind: "leaf", conditionId: "7" }, () => "OUTCOME 1"),
    ).toBe("OUTCOME 1");
  });
});
