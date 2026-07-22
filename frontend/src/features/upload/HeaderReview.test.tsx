import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { HeaderReview } from "./HeaderReview";
import type { HeaderReport } from "../../api/domain";

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
    render(<HeaderReview {...defaultProps} />);
    const shared = screen.getByRole("list", { name: /Shared/ });
    expect(within(shared).getByText("region")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Only in baseline\.csv/ })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Only in candidate\.csv/ })).toBeInTheDocument();
  });

  it("warns when the files have differing columns", () => {
    render(<HeaderReview {...defaultProps} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/differing columns/);
  });

  it("renders hostile column names as inert text (no HTML injection)", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    render(
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
    render(
      <HeaderReview
        {...defaultProps}
        selectedColumns={["id"]}
      />,
    );
    expect(screen.getByText(/Columns Included/)).toBeInTheDocument();
    expect(screen.getByText(/Columns Excluded/)).toBeInTheDocument();
  });

  it("renders included tags with green styling", () => {
    render(
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
    render(
      <HeaderReview
        {...defaultProps}
        selectedColumns={["id"]}
      />,
    );
    const excluded = screen.getByRole("list", { name: /Columns Excluded/ });
    expect(within(excluded).getByText("region")).toHaveClass("tag--excluded");
    expect(within(excluded).getByText("status")).toHaveClass("tag--excluded");
  });

  it("renders Grouping Columns card after Key columns", () => {
    render(<HeaderReview {...defaultProps} />);
    const groupingHeading = screen.getByText("Grouping Columns");
    expect(groupingHeading).toBeInTheDocument();
    expect(groupingHeading.textContent).toBe("Grouping Columns");
    const hint = screen.getByText(/Optional\. Pick columns for group-level statistics/);
    expect(hint).toBeInTheDocument();
  });

  it("fires onGroupingColumnsChange when grouping columns are selected", () => {
    const onGroupingColumnsChange = vi.fn();
    render(
      <HeaderReview
        {...defaultProps}
        onGroupingColumnsChange={onGroupingColumnsChange}
      />,
    );
    const searchbox = screen.getByRole("searchbox", { name: "Select grouping columns" });
    fireEvent.focus(searchbox);
    fireEvent.mouseDown(screen.getByRole("option", { name: /region/ }));
    expect(onGroupingColumnsChange).toHaveBeenCalledWith(["region"]);
  });

  it("renders grouping column selections from props", () => {
    render(
      <HeaderReview
        {...defaultProps}
        selectedColumns={["id", "region"]}
        groupingColumns={["region"]}
        onGroupingColumnsChange={vi.fn()}
      />,
    );
    const searchbox = screen.getByRole("searchbox", { name: "Select grouping columns" });
    expect(searchbox).toBeInTheDocument();
    expect(searchbox).toHaveAttribute("placeholder", expect.stringContaining("1 selected"));
  });

  it("only lists columns selected in COLUMN FILTER in the Grouping Columns dropdown", () => {
    // 'status' is in report.common but not in selectedColumns (i.e. excluded by the user).
    render(
      <HeaderReview
        {...defaultProps}
        selectedColumns={["id", "region"]}
      />,
    );
    const searchbox = screen.getByRole("searchbox", { name: "Select grouping columns" });
    fireEvent.focus(searchbox);
    // The two filtered columns are offered.
    expect(screen.getByRole("option", { name: /region/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /\bid\b/ })).toBeInTheDocument();
    // 'status' was excluded by COLUMN FILTER and must not appear.
    expect(screen.queryByRole("option", { name: /\bstatus\b/ })).toBeNull();
  });

  it("shows the dedup banner when either uploaded file matched an existing one", () => {
    render(
      <HeaderReview
        {...defaultProps}
        report={{ ...baseReport, file2Deduplicated: true }}
      />,
    );
    // The status node containing "Matched existing file" should appear.
    expect(screen.getByText(/Matched existing file.*candidate\.csv/)).toBeInTheDocument();
  });

  it("does not show the dedup banner when neither file was deduplicated", () => {
    render(<HeaderReview {...defaultProps} />);
    expect(screen.queryByText(/Matched existing file/)).toBeNull();
  });
});
