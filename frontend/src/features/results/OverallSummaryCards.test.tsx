import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { FilterRow, GroupNode, OverallSummary } from "../../api/domain";
import { mapRunDocumentToResult } from "../../api/mapping";
import { wireRunDocumentResponseSchema } from "../../api/wire";
import { s35NestedFilterRunResponse } from "../../api/__fixtures__/s35NestedFilterRunResponse.fixture";
import { OverallSummaryCards } from "./OverallSummaryCards";

const summary: OverallSummary = {
  recordsLoaded: 1200,
  ruleViolationRowCount: 3,
  ruleViolationAttributeCount: 4,
  changedRowCount: 10,
  changedAttributeCount: 25,
};

const filters: FilterRow[] = [
  { id: "f1", column: "system", operator: "contains", values: ["oomber"] },
  { id: "f2", column: "status", operator: "equals", values: ["active"] },
  { id: "f3", column: "status", operator: "equals", values: ["inactive"] },
];

const nestedTree: GroupNode = {
  kind: "and",
  children: [
    { kind: "leaf", conditionId: "f1" },
    {
      kind: "or",
      children: [
        { kind: "leaf", conditionId: "f2" },
        { kind: "leaf", conditionId: "f3" },
      ],
    },
  ],
};

function groupingText(): string | null | undefined {
  return screen.getByTestId("applied-filters-grouping").querySelector("code")?.textContent;
}

describe("OverallSummaryCards", () => {
  it("keeps the six overall counts and no-filter legacy message", () => {
    render(<OverallSummaryCards summary={summary} filtersApplied={[]} />);

    const region = screen.getByLabelText("Overall result summary");
    expect(within(region).getByText("1,200")).toBeInTheDocument();
    expect(region.querySelectorAll(".metric")).toHaveLength(5);
    expect(screen.getByTestId("applied-filters-statement")).toHaveTextContent(
      "No filtering rows applied",
    );
    expect(screen.queryByTestId("applied-filters-grouping")).not.toBeInTheDocument();
  });

  it("renders the complete nested grouping above the full filter list", () => {
    render(
      <OverallSummaryCards
        summary={summary}
        filtersApplied={filters}
        filtersRelation={null}
        filtersGroupTree={nestedTree}
      />,
    );

    expect(groupingText()).toBe(
      ["overall: FILTER 1 AND group 1", "group 1: FILTER 2 OR FILTER 3"].join("\n"),
    );
    expect(screen.getByTestId("applied-filters-statement")).toHaveTextContent(
      'FILTER 1: system contains "oomber"; FILTER 2: status equals "active"; FILTER 3: status equals "inactive"',
    );
  });

  it("renders a legacy flat AND when the saved run has no tree", () => {
    render(
      <OverallSummaryCards
        summary={summary}
        filtersApplied={filters.slice(0, 2)}
      />,
    );

    expect(groupingText()).toBe("overall: FILTER 1 AND FILTER 2");
  });

  it("shows an error and keeps the filters when the saved grouping is invalid", () => {
    render(
      <OverallSummaryCards
        summary={summary}
        filtersApplied={filters.slice(0, 2)}
        filtersGroupTree={{
          kind: "or",
          children: [
            { kind: "leaf", conditionId: "f1" },
            { kind: "leaf", conditionId: "removed-filter" },
          ],
        }}
      />,
    );

    expect(screen.queryByTestId("applied-filters-grouping")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Filter grouping could not be restored",
    );
    expect(screen.getByTestId("applied-filters-statement")).toHaveTextContent("FILTER 1");
    expect(screen.getByTestId("applied-filters-statement")).toHaveTextContent("FILTER 2");
  });

  it("derives the saved S35 nested expression from persisted run fields only", () => {
    const result = mapRunDocumentToResult(
      wireRunDocumentResponseSchema.parse(s35NestedFilterRunResponse),
    );

    render(
      <OverallSummaryCards
        summary={result.overall}
        filtersApplied={result.filtersApplied}
        filtersRelation={result.filtersRelation}
        filtersGroupTree={result.filtersGroupTree}
        filtersGroupingErrors={result.filtersGroupingErrors}
      />,
    );

    expect(groupingText()).toBe(
      ["overall: FILTER 1 AND group 1", "group 1: FILTER 2 OR FILTER 3"].join("\n"),
    );
    expect(screen.getByTestId("applied-filters-statement")).toHaveTextContent(
      'FILTER 1: system contains "oomber"',
    );
    expect(screen.getByTestId("applied-filters-statement")).toHaveTextContent(
      'FILTER 2: status equals "active"',
    );
    expect(screen.getByTestId("applied-filters-statement")).toHaveTextContent(
      'FILTER 3: status equals "inactive"',
    );
  });
});
