import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OverallSummaryCards } from "./OverallSummaryCards";
import { RuleResultSection } from "./RuleResultSection";
import { TableOfContents } from "./TableOfContents";
import { DetailTable } from "./DetailTable";
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
    render(<RuleResultSection result={ruleResult} />);
    const section = screen.getByRole("region", { name: /Region present/ });
    expect(within(section).getByText(/region must not equal/)).toBeInTheDocument();
    expect(within(section).getByText("3")).toBeInTheDocument();
  });

  it("builds a table of contents with an anchor per section", () => {
    render(<TableOfContents result={result} />);
    const nav = screen.getByRole("navigation", { name: "Result contents" });
    expect(within(nav).getByRole("link", { name: "Overall result" })).toHaveAttribute("href", "#overall");
    expect(within(nav).getByRole("link", { name: /R001/ })).toHaveAttribute("href", "#rule-R001");
  });

  it("renders a detail table header and an empty state", () => {
    const { rerender } = render(<DetailTable rows={result.changeDetails} caption="Changes" />);
    expect(screen.getByRole("columnheader", { name: "Column" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Rationale" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Kind" })).not.toBeInTheDocument();
    rerender(<DetailTable rows={[]} caption="Changes" />);
    expect(screen.getByText("No detail rows.")).toBeInTheDocument();
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
    const bodyRows = document.querySelectorAll(".detail-table tbody tr");
    // Only a small window is materialized, never all 5,000 rows.
    expect(bodyRows.length).toBeLessThan(200);
  });
});
