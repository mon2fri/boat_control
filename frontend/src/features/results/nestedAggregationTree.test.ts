import { describe, expect, it } from "vitest";
import { buildNestedAggregationTree } from "./nestedAggregationTree";
import type { DetailRow } from "../../api/domain";

function makeDetailRow(overrides: Partial<DetailRow> & { rowKey: string }): DetailRow {
  return {
    keyColumns: {},
    column: "status",
    file1Value: "old",
    file2Value: "new",
    kind: "changed",
    ...overrides,
  };
}

describe("buildNestedAggregationTree", () => {
  it("returns empty array for empty details", () => {
    const tree = buildNestedAggregationTree([], ["status"], ["id"]);
    expect(tree).toEqual([]);
  });

  it("returns empty array for no aggregation columns", () => {
    const tree = buildNestedAggregationTree(
      [makeDetailRow({ rowKey: "1", keyColumns: { id: "1" } })],
      [],
      ["id"],
    );
    expect(tree).toEqual([]);
  });

  it("builds a flat record list when aggregation columns are exhausted", () => {
    const details = [
      makeDetailRow({ rowKey: "1", keyColumns: { id: "1" }, aggregationValues: { status: "active" } }),
      makeDetailRow({ rowKey: "2", keyColumns: { id: "2" }, aggregationValues: { status: "inactive" } }),
    ];
    const tree = buildNestedAggregationTree(details, ["status"], ["id"]);

    expect(tree).toHaveLength(2);
    expect(tree[0]!.kind).toBe("group");
    if (tree[0]!.kind === "group") {
      expect(tree[0]!.label).toBe("active");
      expect(tree[0]!.depth).toBe(0);
      expect(tree[0]!.children).toHaveLength(1);
      const child = tree[0]!.children[0]!;
      expect(child.kind).toBe("record");
      if (child.kind === "record") {
        expect(child.label).toBe("1");
        expect(child.changeCount).toBe(1);
      }
    }
  });

  it("groups records by the first aggregation column", () => {
    const details = [
      makeDetailRow({ rowKey: "1", keyColumns: { id: "1" }, aggregationValues: { status: "active" } }),
      makeDetailRow({ rowKey: "2", keyColumns: { id: "2" }, aggregationValues: { status: "inactive" } }),
      makeDetailRow({ rowKey: "3", keyColumns: { id: "3" }, aggregationValues: { status: "active" } }),
    ];
    const tree = buildNestedAggregationTree(details, ["status"], ["id"]);

    expect(tree).toHaveLength(2);
    // active group
    const activeGroup = tree.find((n) => n.kind === "group" && n.label === "active");
    expect(activeGroup).toBeDefined();
    // inactive group
    const inactiveGroup = tree.find((n) => n.kind === "group" && n.label === "inactive");
    expect(inactiveGroup).toBeDefined();
  });

  it("builds hierarchy for multiple aggregation columns", () => {
    const details = [
      makeDetailRow({
        rowKey: "1",
        keyColumns: { id: "1" },
        aggregationValues: { status: "active", region: "EMEA" },
      }),
      makeDetailRow({
        rowKey: "2",
        keyColumns: { id: "2" },
        aggregationValues: { status: "active", region: "APAC" },
      }),
      makeDetailRow({
        rowKey: "3",
        keyColumns: { id: "3" },
        aggregationValues: { status: "inactive", region: "EMEA" },
      }),
    ];
    const tree = buildNestedAggregationTree(details, ["status", "region"], ["id"]);

    expect(tree).toHaveLength(2);

    const activeGroup = tree.find((n) => n.kind === "group" && n.label === "active")!;
    expect(activeGroup.kind).toBe("group");
    if (activeGroup.kind === "group") {
      expect(activeGroup.children).toHaveLength(2);
      // First level is status groups, second level is region groups
      const emeaChild = activeGroup.children.find((c) => c.kind === "group" && c.label === "EMEA");
      expect(emeaChild).toBeDefined();
      if (emeaChild?.kind === "group") {
        expect(emeaChild.depth).toBe(1);
        expect(emeaChild.children).toHaveLength(1);
        const record = emeaChild.children[0]!;
        expect(record.kind).toBe("record");
        if (record.kind === "record") {
          expect(record.label).toBe("1");
        }
      }
    }
  });

  it("counts changed attributes per record correctly", () => {
    const details = [
      makeDetailRow({ rowKey: "1", keyColumns: { id: "1" }, column: "status", aggregationValues: { status: "active" } }),
      makeDetailRow({ rowKey: "1", keyColumns: { id: "1" }, column: "score", aggregationValues: { status: "active" } }),
      makeDetailRow({ rowKey: "1", keyColumns: { id: "1" }, column: "owner", aggregationValues: { status: "active" } }),
    ];
    // All three details share the same rowKey, so they should be grouped into one record with changeCount: 3
    const tree = buildNestedAggregationTree(details, ["status"], ["id"]);

    expect(tree).toHaveLength(1);
    const group = tree[0]!;
    expect(group.kind).toBe("group");
    if (group.kind === "group") {
      expect(group.children).toHaveLength(1);
      const record = group.children[0]!;
      expect(record.kind).toBe("record");
      if (record.kind === "record") {
        expect(record.changeCount).toBe(3);
        expect(record.attributes).toHaveLength(3);
      }
    }
  });

  it("shows accurate old/new values in record attributes", () => {
    const details = [
      makeDetailRow({
        rowKey: "1",
        keyColumns: { id: "1" },
        column: "status",
        file1Value: "active",
        file2Value: "inactive",
        aggregationValues: { status: "active" },
      }),
    ];
    const tree = buildNestedAggregationTree(details, ["status"], ["id"]);
    const group = tree[0]!;
    expect(group.kind).toBe("group");
    if (group.kind === "group") {
      const record = group.children[0]!;
      expect(record.kind).toBe("record");
      if (record.kind === "record") {
        expect(record.attributes[0]).toEqual({
          column: "status",
          old: "active",
          new: "inactive",
        });
      }
    }
  });

  it("handles null, empty, and missing aggregation values distinctly", () => {
    const details = [
      makeDetailRow({
        rowKey: "1",
        keyColumns: { id: "1" },
        aggregationValues: { status: null },
      }),
      makeDetailRow({
        rowKey: "2",
        keyColumns: { id: "2" },
        aggregationValues: { status: "" },
      }),
      makeDetailRow({
        rowKey: "3",
        keyColumns: { id: "3" },
        aggregationValues: {},
      }),
    ];
    const tree = buildNestedAggregationTree(details, ["status"], ["id"]);
    // null → "(null)", "" → "(empty)", missing key → "(missing)"
    expect(tree).toHaveLength(3);
    const nullGroup = tree.find((n) => n.kind === "group" && n.label === "(null)");
    expect(nullGroup).toBeDefined();
    const emptyGroup = tree.find((n) => n.kind === "group" && n.label === "(empty)");
    expect(emptyGroup).toBeDefined();
    const missingGroup = tree.find((n) => n.kind === "group" && n.label === "(missing)");
    expect(missingGroup).toBeDefined();
  });

  it("uses key column values for record labels", () => {
    const details = [
      makeDetailRow({
        rowKey: "rec-1",
        keyColumns: { id: "ABC-001", region: "EMEA" },
        aggregationValues: { status: "active" },
      }),
    ];
    const tree = buildNestedAggregationTree(details, ["status"], ["id", "region"]);
    expect(tree).toHaveLength(1);
    if (tree[0]?.kind === "group") {
      const record = tree[0].children[0]!;
      expect(record.kind).toBe("record");
      if (record.kind === "record") {
        expect(record.label).toBe("ABC-001/EMEA");
      }
    }
  });

  it("builds tree for Overall Result combining changes and violations", () => {
    const changeDetails = [
      makeDetailRow({
        rowKey: "1",
        keyColumns: { id: "1" },
        column: "status",
        aggregationValues: { status: "active" },
      }),
    ];
    const violationDetails = [
      makeDetailRow({
        rowKey: "2",
        keyColumns: { id: "2" },
        column: "region",
        file1Value: "EMEA",
        file2Value: null,
        kind: "exception",
        aggregationValues: { status: "inactive" },
      }),
    ];
    const allDetails = [...changeDetails, ...violationDetails];
    const tree = buildNestedAggregationTree(allDetails, ["status"], ["id"]);

    // Only changed rows should appear; exception rows are excluded
    expect(tree).toHaveLength(1);
    const activeGroup = tree.find((n) => n.kind === "group" && n.label === "active");
    expect(activeGroup).toBeDefined();
    const inactiveGroup = tree.find((n) => n.kind === "group" && n.label === "inactive");
    expect(inactiveGroup).toBeUndefined();
  });
});
