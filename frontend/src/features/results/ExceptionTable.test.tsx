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
  ruleIdentifier: "CBR1_00000000000000000001",
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
  ruleIdentifier: "CBR1_00000000000000000002",
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
    expect(screen.getByText("Exception ID")).toBeInTheDocument();
    expect(screen.getByText("Rule Index")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("region")).toBeInTheDocument();
  });

  it("uses stable canonical Exception IDs instead of row positions", () => {
    const { container } = render(
      <ExceptionTable
        ruleResults={[RULE_A, RULE_B]}
        keyColumnNames={["id"]}
        aggregationColumnLabels={{}}
        exceptionColumns={["region"]}
      />,
    );
    container.querySelector("details")?.setAttribute("open", "");
    const ids = [...container.querySelectorAll(".detail-grid-body .exception-detail-id")]
      .map((cell) => cell.textContent);
    expect(ids).toEqual([
      "CBR1_00000000000000000001_1",
      "CBR1_00000000000000000001_2",
      "CBR1_00000000000000000002_3",
    ]);
    expect(ids).not.toContain("1");
    expect(ids).not.toContain("2");
  });

  it("prefers a backend-supplied Exception ID over the frontend fallback", () => {
    const supplied: RuleResult = {
      ...RULE_A,
      details: [{
        ...RULE_A.details[0]!,
        exceptionId: "BACKEND_SUPPLIED_ID",
      }],
    };
    const { container } = render(
      <ExceptionTable
        ruleResults={[supplied]}
        keyColumnNames={["id"]}
        aggregationColumnLabels={{}}
        exceptionColumns={["region"]}
      />,
    );
    container.querySelector("details")?.setAttribute("open", "");
    expect(container.querySelector(".exception-detail-id code")).toHaveTextContent(
      "BACKEND_SUPPLIED_ID",
    );
  });

  it("shows a dash rather than a row number when no stable identity exists", () => {
    const legacy: RuleResult = {
      ...RULE_A,
      ruleIdentifier: null,
      details: [RULE_A.details[0]!],
    };
    const { container } = render(
      <ExceptionTable
        ruleResults={[legacy]}
        keyColumnNames={["id"]}
        aggregationColumnLabels={{}}
        exceptionColumns={["region"]}
      />,
    );
    container.querySelector("details")?.setAttribute("open", "");
    expect(container.querySelector(".exception-detail-id code")).toHaveTextContent("—");
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
    const filterButton = screen.getByRole("button", { name: "Filter by key_id" });
    const filterMenu = filterButton
      .closest(".th-filter-wrapper")
      ?.querySelector(".th-filter-dropdown");

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
