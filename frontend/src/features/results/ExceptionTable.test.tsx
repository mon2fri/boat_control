import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExceptionTable } from "./ExceptionTable";
import type { DetailRow, RuleResult } from "../../api/domain";

function makeExceptionRow(
  ruleIndex: string,
  keyColumns: Record<string, string | null>,
  extraValues?: Record<string, string | null>,
  aggregationValues?: Record<string, string | null>,
): DetailRow {
  const row: DetailRow = {
    rowKey: `${Object.values(keyColumns).join("/")}#0`,
    keyColumns,
    column: ruleIndex,
    file1Value: null,
    file2Value: null,
    kind: "exception",
  };
  if (extraValues) row.extraValues = extraValues;
  if (aggregationValues) row.aggregationValues = aggregationValues;
  return row;
}

const RULE_A: RuleResult = {
  ruleIndex: "R001",
  ruleName: "Rule A",
  logicSummary: "score lt 20",
  violationRowCount: 2,
  violationAttributeCount: 2,
  details: [
    makeExceptionRow("R001", { id: "1" }, { region: "EMEA" }, { status: "active" }),
    makeExceptionRow("R001", { id: "2" }, { region: "APAC" }, { status: "inactive" }),
  ],
};

const RULE_B: RuleResult = {
  ruleIndex: "R002",
  ruleName: "Rule B",
  logicSummary: "score eq 10",
  violationRowCount: 1,
  violationAttributeCount: 1,
  details: [
    makeExceptionRow("R002", { id: "3" }, { region: "EMEA" }, { status: "active" }),
  ],
};

describe("ExceptionTable", () => {
  it("renders the section with row count", () => {
    render(
      <ExceptionTable
        ruleResults={[RULE_A, RULE_B]}
        keyColumnNames={["id"]}
        aggregationColumnLabels={{}}
        exceptionColumns={["region"]}
      />,
    );
    expect(screen.getByText("Exception Table")).toBeInTheDocument();
    expect(screen.getByText("3 rows")).toBeInTheDocument();
  });

  it("renders empty state when there are no exceptions", () => {
    render(
      <ExceptionTable
        ruleResults={[]}
        keyColumnNames={["id"]}
        aggregationColumnLabels={{}}
        exceptionColumns={["region"]}
      />,
    );
    expect(screen.getByText("Exception Table")).toBeInTheDocument();
    expect(screen.getByText("0 rows")).toBeInTheDocument();
    expect(screen.getByText(/No exceptions found/)).toBeInTheDocument();
  });

  it("includes key columns, rule index, aggregation, and extra columns", () => {
    render(
      <ExceptionTable
        ruleResults={[RULE_A]}
        keyColumnNames={["id"]}
        aggregationColumnLabels={{ status: "Status" }}
        exceptionColumns={["region"]}
      />,
    );
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("Rule Index")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("region")).toBeInTheDocument();
  });

  it("aggregates rows across multiple rules", () => {
    const { container } = render(
      <ExceptionTable
        ruleResults={[RULE_A, RULE_B]}
        keyColumnNames={["id"]}
        aggregationColumnLabels={{}}
        exceptionColumns={["region"]}
      />,
    );
    expect(screen.getByText("3 rows")).toBeInTheDocument();
    expect(container.textContent).toContain("R001");
    expect(container.textContent).toContain("R002");
  });

  it("renders collapsed by default", () => {
    const { container } = render(
      <ExceptionTable
        ruleResults={[RULE_A]}
        keyColumnNames={["id"]}
        aggregationColumnLabels={{}}
        exceptionColumns={["region"]}
      />,
    );
    const details = container.querySelector("details");
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute("open");
  });

  it("shows a column filter menu only after its filter button is clicked", () => {
    const { container } = render(
      <ExceptionTable
        ruleResults={[RULE_A]}
        keyColumnNames={["id"]}
        aggregationColumnLabels={{}}
        exceptionColumns={["region"]}
      />,
    );
    container.querySelector("details")?.setAttribute("open", "");
    const filterMenu = container.querySelector(".th-filter-dropdown");
    const filterButton = screen.getByRole("button", { name: "Filter by key_id" });

    expect(filterMenu).toHaveAttribute("hidden");
    expect(filterButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(filterButton);

    expect(filterMenu).not.toHaveAttribute("hidden");
    expect(filterButton).toHaveAttribute("aria-expanded", "true");
  });

  it("expands and fully renders the table while preparing an HTML export", async () => {
    const { container } = render(
      <ExceptionTable
        ruleResults={[RULE_A]}
        keyColumnNames={["id"]}
        aggregationColumnLabels={{}}
        exceptionColumns={["region"]}
      />,
    );

    document.dispatchEvent(new Event("prepare-result-export"));

    await waitFor(() => {
      expect(container.querySelector("details")).toHaveAttribute("open");
      expect(container.querySelector(".detail-scroll")).not.toHaveClass("detail-scroll--capped");
    });

    document.dispatchEvent(new Event("cleanup-result-export"));

    await waitFor(() => {
      expect(container.querySelector("details")).not.toHaveAttribute("open");
      expect(container.querySelector(".detail-scroll")).toHaveClass("detail-scroll--capped");
    });
  });
});
