import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeaderReview } from "./HeaderReview";
import type { HeaderReport } from "../../api/domain";

function renderWithQuery(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const baseReport: HeaderReport = {
  sessionId: "s1",
  file1Name: "baseline.csv",
  file2Name: "candidate.csv",
  file1Deduplicated: false,
  file2Deduplicated: false,
  common: ["id", "region", "status"],
  file1Only: ["legacy_code"],
  file2Only: ["new_flag"],
};

const defaultProps = {
  report: baseReport,
  selectedColumns: ["id", "region", "status"],
  onSelectedColumnsChange: vi.fn(),
};

describe("HeaderReview", () => {
  it("separates shared and file-specific columns", () => {
    renderWithQuery(<HeaderReview {...defaultProps} />);
    const shared = screen.getByRole("list", { name: /Shared/ });
    expect(within(shared).getByText("region")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Only in baseline\.csv/ })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Only in candidate\.csv/ })).toBeInTheDocument();
  });

  it("warns when the files have differing columns", () => {
    renderWithQuery(<HeaderReview {...defaultProps} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/differing columns/);
  });

  it("renders hostile column names as inert text (no HTML injection)", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    renderWithQuery(
      <HeaderReview
        {...defaultProps}
        report={{ ...baseReport, common: [hostile] }}
        selectedColumns={[hostile]}
      />,
    );
    // The payload appears in both Shared and Columns Included lists.
    const matches = screen.getAllByText(hostile);
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows Columns Included and Columns Excluded cards", () => {
    renderWithQuery(
      <HeaderReview
        {...defaultProps}
        selectedColumns={["id"]}
      />,
    );
    expect(screen.getByText(/Columns Included/)).toBeInTheDocument();
    expect(screen.getByText(/Columns Excluded/)).toBeInTheDocument();
  });

  it("renders included tags with green styling", () => {
    renderWithQuery(
      <HeaderReview
        {...defaultProps}
        selectedColumns={["id", "region"]}
      />,
    );
    const included = screen.getByRole("list", { name: /Columns Included/ });
    expect(within(included).getByText("id")).toHaveClass("tag--included");
    expect(within(included).getByText("region")).toHaveClass("tag--included");
  });

  it("renders excluded tags with red styling", () => {
    renderWithQuery(
      <HeaderReview
        {...defaultProps}
        selectedColumns={["id"]}
      />,
    );
    const excluded = screen.getByRole("list", { name: /Columns Excluded/ });
    expect(within(excluded).getByText("region")).toHaveClass("tag--excluded");
    expect(within(excluded).getByText("status")).toHaveClass("tag--excluded");
  });

  it("renders Aggregation Columns card after Key columns", () => {
    renderWithQuery(<HeaderReview {...defaultProps} />);
    const aggregationHeading = screen.getByText("Aggregation Columns");
    expect(aggregationHeading).toBeInTheDocument();
    expect(aggregationHeading.textContent).toBe("Aggregation Columns");
    const hint = screen.getByText(/Optional\. Pick columns for group-level statistics/);
    expect(hint).toBeInTheDocument();
  });

  it("fires onAggregationColumnsChange when aggregation columns are selected", () => {
    const onAggregationColumnsChange = vi.fn();
    renderWithQuery(
      <HeaderReview
        {...defaultProps}
        onAggregationColumnsChange={onAggregationColumnsChange}
      />,
    );
    const searchbox = screen.getByRole("searchbox", { name: "Select aggregation columns" });
    fireEvent.focus(searchbox);
    fireEvent.mouseDown(screen.getByRole("option", { name: /region/ }));
    expect(onAggregationColumnsChange).toHaveBeenCalledWith(["region"]);
  });

  it("renders aggregation column selections from props", () => {
    renderWithQuery(
      <HeaderReview
        {...defaultProps}
        selectedColumns={["id", "region"]}
        aggregationColumns={["region"]}
        onAggregationColumnsChange={vi.fn()}
      />,
    );
    const searchbox = screen.getByRole("searchbox", { name: "Select aggregation columns" });
    expect(searchbox).toBeInTheDocument();
    expect(searchbox).toHaveAttribute("placeholder", expect.stringContaining("1 selected"));
  });

  it("only lists columns selected in COLUMN FILTER in the Aggregation Columns dropdown", () => {
    // 'status' is in report.common but not in selectedColumns (i.e. excluded by the user).
    renderWithQuery(
      <HeaderReview
        {...defaultProps}
        selectedColumns={["id", "region"]}
      />,
    );
    const searchbox = screen.getByRole("searchbox", { name: "Select aggregation columns" });
    fireEvent.focus(searchbox);
    // The two filtered columns are offered.
    expect(screen.getByRole("option", { name: /region/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /\bid\b/ })).toBeInTheDocument();
    // 'status' was excluded by COLUMN FILTER and must not appear.
    expect(screen.queryByRole("option", { name: /\bstatus\b/ })).toBeNull();
  });

  it("shows the dedup banner when either uploaded file matched an existing one", () => {
    renderWithQuery(
      <HeaderReview
        {...defaultProps}
        report={{ ...baseReport, file2Deduplicated: true }}
      />,
    );
    // The status node containing "Matched existing file" should appear.
    expect(screen.getByText(/Matched existing file.*candidate\.csv/)).toBeInTheDocument();
  });

  it("does not show the dedup banner when neither file was deduplicated", () => {
    renderWithQuery(<HeaderReview {...defaultProps} />);
    expect(screen.queryByText(/Matched existing file/)).toBeNull();
  });
});
