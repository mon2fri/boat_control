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

/**
 * Groups are collapsed by default, so any test that inspects the inner record
 * list has to open at least one group toggle first. This helper finds the
 * first group button whose label contains the given substring and clicks it.
 */
function expandGroup(label: string): HTMLElement {
  const btn = screen
    .getAllByRole("button")
    .find((b) => b.textContent?.includes(label));
  if (!btn) throw new Error(`Group toggle containing "${label}" not found`);
  fireEvent.click(btn);
  return btn as HTMLElement;
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

  it("collapses group nodes by default, then expands them on click", () => {
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
    // Initial state: collapsed — the record's detail is hidden via the `hidden`
    // attribute, so it is rendered into the DOM but not visible.
    const recordText = screen.getByText(/1 attribute changed/);
    expect(recordText.closest("[hidden]")).toBeInTheDocument();
    // Click to expand
    fireEvent.click(groupBtn);
    expect(recordText.closest("[hidden]")).not.toBeInTheDocument();
    // Click again to collapse
    fireEvent.click(groupBtn);
    expect(recordText.closest("[hidden]")).toBeInTheDocument();
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

    expandGroup("active");
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

    expandGroup("active");
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

    expandGroup("active");
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

    // First expand the top-level "active" group, then the EMEA/APAC groups
    expandGroup("active");
    expandGroup("EMEA");
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
    // Both classes are always present in the DOM, but the record's detail is
    // hidden until its parent group is expanded.
    expect(document.querySelector(".nested-agg-group")).toBeInTheDocument();
    const record = document.querySelector(".nested-agg-record");
    expect(record).toBeInTheDocument();
    expect(record?.querySelector("[hidden]")).toBeInTheDocument();
    expandGroup("active");
    // After expanding the parent group, the group-level children container is
    // no longer hidden (records still start collapsed individually).
    expect(document.querySelector(".nested-agg-group")).toBeInTheDocument();
    expect(document.querySelector(".nested-agg-record")).toBeInTheDocument();
    expect(document.querySelector(".nested-agg-children")).not.toHaveAttribute("hidden");
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

  it("renders nested-agg-children container with the `hidden` attribute when collapsed", () => {
    render(
      <NestedAggregationPanel
        details={[makeDetail("1", { aggregationValues: { status: "active" } })]}
        aggregationColumns={["status"]}
        keyColumnNames={["id"]}
      />,
    );
    // The children UL is always rendered so the export's static DOM has the
    // structure to toggle. Visibility is controlled by the `hidden` attribute.
    const childrenBefore = document.querySelector(".nested-agg-children");
    expect(childrenBefore).toBeInTheDocument();
    expect(childrenBefore?.tagName).toBe("UL");
    expect(childrenBefore?.hasAttribute("hidden")).toBe(true);
    // Click the group toggle to expand
    const groupBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("active"))!;
    fireEvent.click(groupBtn);
    const childrenAfter = document.querySelector(".nested-agg-children");
    expect(childrenAfter).toBeInTheDocument();
    expect(childrenAfter?.hasAttribute("hidden")).toBe(false);
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
    expandGroup("active");
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
    expandGroup("active");
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
    expandGroup("active");
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
    expandGroup("active");
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
    expandGroup("active");
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
    expandGroup("active");
    // The exception row with different values should still be excluded
    expect(screen.queryByText("old")).not.toBeInTheDocument();
    expect(screen.getByText(/1 attribute changed/)).toBeInTheDocument();
  });
});