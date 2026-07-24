import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NestedAggregationPanel } from "./NestedAggregationPanel";
import type { DetailRow } from "../../api/domain";

function makeDetail(id: string, overrides: Partial<DetailRow> = {}): DetailRow {
  return {
    rowKey: id,
    keyColumns: { id },
    column: "status",
    file1Value: "old",
    file2Value: "new",
    kind: "changed",
    aggregationValues: { status: "active", region: "EMEA" },
    ...overrides,
  };
}

describe("NestedAggregationPanel", () => {
  it("renders nothing when details are empty", () => {
    const { container } = render(
      <NestedAggregationPanel details={[]} aggregationColumns={["status"]} />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders group nodes with labels and counts", () => {
    render(
      <NestedAggregationPanel
        details={[
          makeDetail("1", { aggregationValues: { status: "active" } }),
          makeDetail("2", { aggregationValues: { status: "inactive" } }),
        ]}
        aggregationColumns={["status"]}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons.some((b) => b.textContent?.includes("active"))).toBe(true);
    expect(buttons.some((b) => b.textContent?.includes("inactive"))).toBe(true);
  });

  it("expands group nodes to show child records", () => {
    render(
      <NestedAggregationPanel
        details={[
          makeDetail("1", { aggregationValues: { status: "active" } }),
        ]}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );

    const buttons = screen.getAllByRole("button");
    const groupBtn = buttons.find((b) => b.textContent?.includes("active"))!;
    expect(groupBtn).toBeDefined();
    // Initial state: expanded (depth 0) — children should be visible
    expect(screen.getByText(/1 attribute changed/)).toBeInTheDocument();
  });

  it("expands record nodes to show Column/Old/New table", () => {
    render(
      <NestedAggregationPanel
        details={[
          makeDetail("1", {
            aggregationValues: { status: "active" },
            column: "score",
            file1Value: "100",
            file2Value: "95",
          }),
        ]}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );

    const recordBtn = screen.getByText(/1 attribute changed/).closest("button")!;
    fireEvent.click(recordBtn);

    expect(screen.getByRole("columnheader", { name: "Column" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Old" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "New" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "score" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "100" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "95" })).toBeInTheDocument();
  });

  it("shows null and empty values in the expanded table", () => {
    render(
      <NestedAggregationPanel
        details={[
          makeDetail("1", {
            aggregationValues: { status: "active" },
            column: "notes",
            file1Value: null,
            file2Value: "",
          }),
        ]}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );

    const recordBtn = screen.getByText(/1 attribute changed/).closest("button")!;
    fireEvent.click(recordBtn);

    expect(screen.getByText("(null)")).toBeInTheDocument();
    expect(screen.getByText("(empty)")).toBeInTheDocument();
  });

  it("aggregates multiple changed attributes per record correctly", () => {
    const details: DetailRow[] = [
      makeDetail("1", {
        rowKey: "1",
        keyColumns: { id: "1" },
        aggregationValues: { status: "active" },
        column: "score",
      }),
      makeDetail("1", {
        rowKey: "1",
        keyColumns: { id: "1" },
        aggregationValues: { status: "active" },
        column: "status",
      }),
    ];

    render(
      <NestedAggregationPanel
        details={details}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );

    expect(screen.getByText(/2 changes/)).toBeInTheDocument();
  });

  it("builds nested hierarchy with multiple aggregation columns", () => {
    render(
      <NestedAggregationPanel
        details={[
          makeDetail("1", { aggregationValues: { status: "active", region: "EMEA" } }),
          makeDetail("2", { aggregationValues: { status: "active", region: "APAC" } }),
        ]}
        aggregationColumns={["status", "region"]}
        keyColumnNames={["id"]}
      />,
    );

    expect(screen.getByText("EMEA")).toBeInTheDocument();
    expect(screen.getByText("APAC")).toBeInTheDocument();
  });

  it("applies the nested-agg-panel wrapper class", () => {
    render(
      <NestedAggregationPanel
        details={[makeDetail("1")]}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    expect(document.querySelector(".nested-agg-panel")).toBeInTheDocument();
  });

  it("renders the tree as an unordered list with nested-agg-tree class", () => {
    render(
      <NestedAggregationPanel
        details={[makeDetail("1")]}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    const tree = document.querySelector(".nested-agg-tree");
    expect(tree).toBeInTheDocument();
    expect(tree?.tagName).toBe("UL");
  });

  it("applies nested-agg-group class to group nodes and nested-agg-record to record nodes", () => {
    render(
      <NestedAggregationPanel
        details={[makeDetail("1", { aggregationValues: { status: "active" } })]}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    expect(document.querySelector(".nested-agg-group")).toBeInTheDocument();
    expect(document.querySelector(".nested-agg-record")).toBeInTheDocument();
  });

  it("renders expand/collapse buttons with aria-expanded attribute", () => {
    render(
      <NestedAggregationPanel
        details={[makeDetail("1", { aggregationValues: { status: "active" } })]}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).toHaveAttribute("aria-expanded");
    }
  });

  it("toggle buttons have nested-agg-toggle class and toggle-icon span", () => {
    render(
      <NestedAggregationPanel
        details={[makeDetail("1", { aggregationValues: { status: "active" } })]}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    const toggles = document.querySelectorAll(".nested-agg-toggle");
    expect(toggles.length).toBeGreaterThanOrEqual(1);
    for (const toggle of toggles) {
      expect(toggle.querySelector(".nested-agg-toggle-icon")).toBeInTheDocument();
    }
  });

  it("renders nested-agg-children container for expanded group nodes", () => {
    render(
      <NestedAggregationPanel
        details={[makeDetail("1", { aggregationValues: { status: "active" } })]}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    // Depth-0 groups start expanded
    const children = document.querySelector(".nested-agg-children");
    expect(children).toBeInTheDocument();
    expect(children?.tagName).toBe("UL");
  });

  it("applies nested-agg-count class to count spans", () => {
    render(
      <NestedAggregationPanel
        details={[makeDetail("1", { aggregationValues: { status: "active" } })]}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    const count = document.querySelector(".nested-agg-count");
    expect(count).toBeInTheDocument();
    expect(count?.textContent).toMatch(/sub-node/);
  });

  it("renders nested-agg-table for expanded record details", () => {
    render(
      <NestedAggregationPanel
        details={[
          makeDetail("1", {
            aggregationValues: { status: "active" },
            column: "score",
            file1Value: "100",
            file2Value: "95",
          }),
        ]}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    const recordBtn = screen.getByText(/1 attribute changed/).closest("button")!;
    fireEvent.click(recordBtn);

    const table = document.querySelector(".nested-agg-table");
    expect(table).toBeInTheDocument();
    expect(table?.tagName).toBe("TABLE");
    const detail = document.querySelector(".nested-agg-record-detail");
    expect(detail).toBeInTheDocument();
  });

  it("toggle buttons are keyboard accessible and respond to click", () => {
    render(
      <NestedAggregationPanel
        details={[makeDetail("1", { aggregationValues: { status: "active" } })]}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    const recordBtn = screen.getByText(/1 attribute changed/).closest("button")!;
    expect(recordBtn.tagName).toBe("BUTTON");
    // Initially collapsed (recordExpanded is false)
    expect(recordBtn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(recordBtn);
    expect(recordBtn).toHaveAttribute("aria-expanded", "true");
    // Table appears after expand
    expect(screen.getByRole("columnheader", { name: "Column" })).toBeInTheDocument();
  });

  it("excludes kind:exception rows from the tree", () => {
    const details: DetailRow[] = [
      makeDetail("1", { kind: "exception", file1Value: "Iris", file2Value: "Iris" }),
      makeDetail("2", { kind: "changed", column: "status", file1Value: "active", file2Value: "inactive" }),
    ];
    render(
      <NestedAggregationPanel
        details={details}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    // Only the changed row should appear
    expect(screen.getByText(/1 attribute changed/)).toBeInTheDocument();
    expect(screen.queryByText("Iris")).not.toBeInTheDocument();
  });

  it("renders nothing when all rows are kind:exception", () => {
    const details: DetailRow[] = [
      makeDetail("1", { kind: "exception", file1Value: "Sam", file2Value: "Sam" }),
      makeDetail("2", { kind: "exception", file1Value: "81", file2Value: "81" }),
    ];
    const { container } = render(
      <NestedAggregationPanel
        details={details}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("counts only changed attributes when mixed with exceptions", () => {
    const details: DetailRow[] = [
      makeDetail("1", { kind: "exception", file1Value: "Carol", file2Value: "Carol" }),
      makeDetail("1", { kind: "changed", column: "score", file1Value: "90", file2Value: "85" }),
      makeDetail("1", { kind: "exception", file1Value: "92", file2Value: "92" }),
    ];
    render(
      <NestedAggregationPanel
        details={details}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    // Only the one changed attribute should be counted
    expect(screen.getByText(/1 attribute changed/)).toBeInTheDocument();
  });

  it("still renders real changes alongside exceptions", () => {
    const details: DetailRow[] = [
      makeDetail("1", { kind: "exception", file1Value: "X", file2Value: "X" }),
      makeDetail("1", { kind: "changed", column: "name", file1Value: "Alice", file2Value: "Bob" }),
      makeDetail("1", { kind: "changed", column: "score", file1Value: "100", file2Value: "95" }),
    ];
    render(
      <NestedAggregationPanel
        details={details}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    expect(screen.getByText(/2 attributes changed/)).toBeInTheDocument();
  });

  it("exception rows with different values are also excluded", () => {
    const details: DetailRow[] = [
      makeDetail("1", { kind: "exception", file1Value: "old", file2Value: "different" }),
      makeDetail("2", { kind: "changed", column: "status", file1Value: "A", file2Value: "B" }),
    ];
    render(
      <NestedAggregationPanel
        details={details}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    // The exception row with different values should still be excluded
    expect(screen.queryByText("old")).not.toBeInTheDocument();
    expect(screen.getByText(/1 attribute changed/)).toBeInTheDocument();
  });
});
