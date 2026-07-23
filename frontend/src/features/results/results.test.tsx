import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { OverallSummaryCards } from "./OverallSummaryCards";
import { RuleResultSection } from "./RuleResultSection";
import { TableOfContents } from "./TableOfContents";
import { DetailTable } from "./DetailTable";
import { GroupStatisticsPanel } from "./GroupStatisticsPanel";
import { ExceptionRuleSummary } from "./ExceptionRuleSummary";
import { ComparisonColumnList } from "./ComparisonColumnList";
import type { RunResult, RuleResult } from "../../api/domain";

const ruleResult: RuleResult = {
  ruleIndex: "R001",
  ruleName: "Region present",
  logicSummary: 'region must not equal ""',
  violationRowCount: 3,
  violationAttributeCount: 4,
  details: [
    { rowKey: "1", keyColumns: {}, column: "region", file1Value: "EMEA", file2Value: null, kind: "exception" },
  ],
};

const result: RunResult = {
  id: "run-1",
  reportName: "baseline_vs_candidate",
  createdAt: "2026-07-18T00:00:00Z",
  file1Name: "baseline.csv",
  file2Name: "candidate.csv",
  overall: {
    recordsLoaded: 1200,
    ruleViolationRowCount: 3,
    ruleViolationAttributeCount: 4,
    changedRowCount: 10,
    changedAttributeCount: 25,
  },
  ruleResults: [ruleResult],
  changeDetails: [
    { rowKey: "2", keyColumns: {}, column: "status", file1Value: "old", file2Value: "new", kind: "changed" },
  ],
};

describe("result components", () => {
  it("renders all five overall counts with their values", () => {
    render(<OverallSummaryCards summary={result.overall} />);
    const region = screen.getByLabelText("Overall result summary");
    expect(within(region).getByText("1,200")).toBeInTheDocument();
    expect(within(region).getByText("Rows with rule exception")).toBeInTheDocument();
    expect(within(region).getByText("Attributes changed")).toBeInTheDocument();
    // Five metric cards, one per required count.
    expect(region.querySelectorAll(".metric")).toHaveLength(5);
  });

  it("shows the rule logic under the section title", () => {
    render(<RuleResultSection result={{
      ...ruleResult,
      conditionSummary: "Condition 1: region equals 'EMEA'; Condition 2: owner equals 'Ops'",
      conditionGroupingSummary: "Condition 1 AND Condition 2",
    }} />);
    const section = screen.getByRole("region", { name: /Region present/ });
    expect(within(section).getByText("Condition:")).toBeInTheDocument();
    expect(within(section).getByText(/Condition 1: region equals/)).toBeInTheDocument();
    expect(within(section).getByText("Grouping:")).toBeInTheDocument();
    expect(within(section).getByText("Condition 1 AND Condition 2")).toBeInTheDocument();
    expect(within(section).getByText("Expectation:")).toBeInTheDocument();
    expect(within(section).getByText(/region must not equal/)).toBeInTheDocument();
    expect(within(section).getByText("3")).toBeInTheDocument();
  });

  it("shows and applies filters for rule-selected extra columns", () => {
    render(
      <RuleResultSection
        keyColumnNames={["id"]}
        result={{
          ...ruleResult,
          details: [
            {
              rowKey: "1",
              keyColumns: { id: "1" },
              column: "status",
              file1Value: "old",
              file2Value: "new",
              extraValues: { region: "EMEA" },
              kind: "exception",
            },
            {
              rowKey: "2",
              keyColumns: { id: "2" },
              column: "status",
              file1Value: "old",
              file2Value: "new",
              extraValues: { region: "APAC" },
              kind: "exception",
            },
          ],
        }}
      />,
    );

    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers.slice(0, 3)).toEqual(["id", "region", "Column"]);
    fireEvent.click(screen.getByRole("button", { name: "Filter region" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "EMEA" }));
    expect(screen.getByRole("cell", { name: "EMEA" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "APAC" })).not.toBeInTheDocument();
  });

  it("hides comparison columns for rules configured to hide comparison", () => {
    render(
      <RuleResultSection
        keyColumnNames={["id"]}
        result={{
          ...ruleResult,
          hideComparison: true,
          details: [{
            rowKey: "1",
            keyColumns: { id: "1" },
            column: "status",
            file1Value: "old",
            file2Value: "new",
            extraValues: { region: "EMEA" },
            kind: "exception",
          }],
        }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "id" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "region" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Rationale" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Column" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "In Baseline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "In Comparison" })).not.toBeInTheDocument();
    expect(screen.queryByText("old")).not.toBeInTheDocument();
    expect(screen.queryByText("new")).not.toBeInTheDocument();
  });

  it("builds a table of contents with an anchor per section", () => {
    render(<TableOfContents result={result} />);
    const nav = screen.getByRole("navigation", { name: "Result contents" });
    expect(within(nav).getByRole("link", { name: "Overall result" })).toHaveAttribute("href", "#overall");
    expect(within(nav).getByRole("link", { name: /R001/ })).toHaveAttribute("href", "#rule-R001");
  });

  it("summarizes exception records by rule name", () => {
    render(<ExceptionRuleSummary rules={[
      ruleResult,
      { ...ruleResult, ruleIndex: "R002", ruleName: "Owner present", violationRowCount: 1250 },
    ]} />);
    const region = screen.getByRole("region", { name: "Exception Rule Summary" });
    expect(within(region).getByRole("columnheader", { name: "Rule name" })).toBeInTheDocument();
    expect(within(region).getByRole("columnheader", { name: "Exception records" })).toBeInTheDocument();
    expect(within(region).getByRole("cell", { name: /Region present/ })).toBeInTheDocument();
    expect(within(region).getByRole("cell", { name: "1,250" })).toBeInTheDocument();
  });

  it("lists every comparing column", () => {
    render(<ComparisonColumnList columns={["status", "score", "updated_at"]} />);
    const list = screen.getByRole("list", { name: "Comparing columns" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "status",
      "score",
      "updated_at",
    ]);
  });

  it("renders a detail table header and an empty state", () => {
    const { rerender } = render(<DetailTable rows={result.changeDetails} caption="Changes" />);
    expect(screen.getByRole("columnheader", { name: "Column" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Rationale" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Kind" })).not.toBeInTheDocument();
    rerender(<DetailTable rows={[]} caption="Changes" />);
    expect(screen.getByText("No detail rows.")).toBeInTheDocument();
  });

  it("shows rule-selected extra values as named detail columns", () => {
    const onFilterChange = vi.fn();
    render(
      <DetailTable
        rows={[{
          rowKey: "1",
          keyColumns: { id: "1" },
          column: "expected_status",
          file1Value: "active",
          file2Value: "inactive",
          extraValues: { region: "EMEA", owner: "Ops" },
          kind: "exception",
        }]}
        caption="Rule details"
        keyColumnNames={["id"]}
        columnFilters={[
          { key: "extra_region", label: "region", options: ["APAC", "EMEA"] },
          { key: "extra_owner", label: "owner", options: ["Ops"] },
        ]}
        onFilterChange={onFilterChange}
      />,
    );
    expect(screen.queryByRole("columnheader", { name: "Value in Comparison" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "region" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "owner" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "EMEA" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Ops" })).toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers.slice(0, 4)).toEqual(["id", "region", "owner", "Column"]);
    fireEvent.click(screen.getByRole("button", { name: "Filter region" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "EMEA" }));
    expect(onFilterChange).toHaveBeenCalledWith("extra_region", ["EMEA"]);
  });

  it("virtualizes large result sets (does not render every row)", () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({
      rowKey: String(i),
      keyColumns: {},
      column: "c",
      file1Value: "a",
      file2Value: "b",
      kind: "changed" as const,
    }));
    render(<DetailTable rows={many} caption="Large" />);
    const bodyRows = document.querySelectorAll(".detail-grid-body > .detail-grid-row");
    // Only a small window is materialized, never all 5,000 rows.
    expect(bodyRows.length).toBeLessThan(200);
  });

  it("caps tables above ten data rows while leaving shorter tables natural", () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      rowKey: String(i),
      keyColumns: {},
      column: "score",
      file1Value: String(i),
      file2Value: String(i + 1),
      kind: "changed" as const,
    }));
    const { rerender } = render(<DetailTable rows={rows.slice(0, 10)} caption="Short" />);
    expect(screen.getByRole("region", { name: "Short" })).not.toHaveClass("detail-scroll--capped");

    rerender(<DetailTable rows={rows} caption="Long" />);
    expect(screen.getByRole("region", { name: "Long" })).toHaveClass("detail-scroll--capped");
    expect(screen.getByRole("columnheader", { name: "Column" })).toBeInTheDocument();
  });

  it("uses one ordered column contract for headers and every rendered detail row", () => {
    const rows = ["first", "middle", "last"].map((value, index) => ({
      rowKey: String(index),
      keyColumns: { id: `${value}-id`, name: `${value}-name` },
      column: `${value}-column`,
      file1Value: `${value}-baseline`,
      file2Value: `${value}-comparison`,
      kind: "changed" as const,
    }));
    render(<DetailTable rows={rows} caption="Geometry" keyColumnNames={["id", "name"]} />);

    const table = screen.getByRole("table");
    expect(table).toHaveStyle({ minWidth: "1050px" });
    const header = within(table).getAllByRole("row")[0]!;
    expect(header.style.gridTemplateColumns).toContain("minmax(150px, 1fr)");
    expect(within(header).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "id", "name", "Column", "In Baseline", "In Comparison", "Rationale",
    ]);
    for (const [index, row] of within(table).getAllByRole("row").slice(1).entries()) {
      const sourceRow = rows[index]!;
      const cells = within(row).getAllByRole("cell");
      expect(cells).toHaveLength(6);
      expect(cells.slice(0, 5).map((cell) => cell.textContent)).toEqual([
        `${sourceRow.keyColumns.id}`,
        `${sourceRow.keyColumns.name}`,
        sourceRow.column,
        sourceRow.file1Value,
        sourceRow.file2Value,
      ]);
    }
    expect(screen.getByText("first-baseline")).toBeVisible();
    expect(screen.getByText("middle-comparison")).toBeVisible();
    expect(screen.getByText("last-column")).toBeVisible();
  });

  it("keeps filter interaction and incremental loading on the scroll region", async () => {
    const onFilterChange = vi.fn();
    const onReachEnd = vi.fn();
    const rows = Array.from({ length: 12 }, (_, index) => ({
      rowKey: String(index),
      keyColumns: { id: `id-${index}` },
      column: index % 2 ? "status" : "score",
      file1Value: `before-${index}`,
      file2Value: `after-${index}`,
      kind: "changed" as const,
    }));
    render(
      <DetailTable
        rows={rows}
        total={100}
        caption="Filtered details"
        keyColumnNames={["id"]}
        columnFilters={[{ key: "column", label: "Column", options: ["score", "status"] }]}
        onFilterChange={onFilterChange}
        onReachEnd={onReachEnd}
        hasMore
      />,
    );

    const region = screen.getByRole("region", { name: "Filtered details" });
    expect(region).toHaveClass("detail-scroll--capped");
    expect(region).toHaveAttribute("aria-rowcount", "100");
    fireEvent.click(screen.getByRole("button", { name: "Filter Column" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "status" }));
    expect(onFilterChange).toHaveBeenCalledWith("column", ["status"]);
    Object.defineProperties(region, {
      scrollHeight: { configurable: true, value: 504 },
      clientHeight: { configurable: true, value: 420 },
    });
    fireEvent.scroll(region, { target: { scrollTop: 420, scrollLeft: 300 } });
    await waitFor(() => expect(onReachEnd).toHaveBeenCalledTimes(1));
  });

  it("applies row-scoped equal-height classes to aggregation cards", () => {
    render(<GroupStatisticsPanel stats={[
      { column: "short", uniqueCount: 1, attributeCount: 1, rows: [] },
      { column: "a very long aggregation column name", uniqueCount: 2, attributeCount: 3, rows: [] },
    ]} />);
    const panel = document.querySelector(".group-stats-panel");
    expect(panel?.querySelectorAll(".group-stats-row")).toHaveLength(1);
    expect(panel?.querySelector(".group-stats-row")).toHaveClass("group-stats-row--2");
    expect(panel?.querySelectorAll(".group-stats-card")).toHaveLength(2);
    expect(panel?.querySelectorAll(".group-stats-summary")).toHaveLength(2);
    expect(screen.getByText("Exception records: 1")).toBeInTheDocument();
    expect(screen.queryByText(/Unique:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Attribute Count" })).not.toBeInTheDocument();
  });
});
