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


describe("OverallSummaryCards", () => {
  it("keeps five headline counts and the plain filtered count", () => {
    render(<OverallSummaryCards summary={{ ...summary, newBookCount: 2 }} filtersApplied={[]} />);

    const region = screen.getByLabelText("Overall result summary");
    expect(within(region).queryByText("1,200")).not.toBeInTheDocument();
    expect(screen.getByText("Books after filters: 1,200")).toBeInTheDocument();
    expect(region.querySelectorAll(".metric")).toHaveLength(5);
    expect(screen.getByTestId("applied-filters-statement")).toHaveTextContent(
      "No filtering rows applied",
    );
    expect(screen.queryByTestId("applied-filters-grouping")).not.toBeInTheDocument();
  });

  it("keeps single-filter details in the hover preview only", () => {
    render(<OverallSummaryCards summary={summary} filtersApplied={[filters[0]!]} />);
    expect(screen.queryByTestId("applied-filters-grouping")).not.toBeInTheDocument();
    expect(screen.queryByTestId("applied-filters-statement")).not.toBeInTheDocument();
  });

  it("does not show nested filter clauses inline", () => {
    render(
      <OverallSummaryCards
        summary={summary}
        filtersApplied={filters}
        filtersRelation={null}
        filtersGroupTree={nestedTree}
      />,
    );

    expect(screen.queryByTestId("applied-filters-grouping")).not.toBeInTheDocument();
    expect(screen.queryByTestId("applied-filters-statement")).not.toBeInTheDocument();
    expect(screen.queryByTestId("applied-filters-expression")).not.toBeInTheDocument();

  });

  it("does not show legacy filter clauses inline", () => {
    render(
      <OverallSummaryCards
        summary={summary}
        filtersApplied={filters.slice(0, 2)}
      />,
    );

    expect(screen.queryByTestId("applied-filters-expression")).not.toBeInTheDocument();
  });

  it("shows an error without inline clauses when saved grouping is invalid", () => {
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
  });

  it("does not show saved S35 clauses inline", () => {
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

    expect(screen.queryByTestId("applied-filters-grouping")).not.toBeInTheDocument();
    expect(screen.queryByTestId("applied-filters-statement")).not.toBeInTheDocument();
    expect(screen.queryByTestId("applied-filters-expression")).not.toBeInTheDocument();

  });
});
