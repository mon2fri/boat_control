import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { HeaderReview } from "./HeaderReview";
import type { HeaderReport } from "../../api/domain";

const baseReport: HeaderReport = {
  sessionId: "s1",
  file1Name: "baseline.csv",
  file2Name: "candidate.csv",
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
});
