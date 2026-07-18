import { describe, expect, it } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
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

describe("HeaderReview", () => {
  it("separates shared and file-specific columns", () => {
    render(<HeaderReview report={baseReport} />);
    const shared = screen.getByRole("list", { name: /Shared/ });
    expect(within(shared).getByText("region")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Only in baseline\.csv/ })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Only in candidate\.csv/ })).toBeInTheDocument();
  });

  it("warns when the files have differing columns", () => {
    render(<HeaderReview report={baseReport} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/differing columns/);
  });

  it("renders hostile column names as inert text (no HTML injection)", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    render(<HeaderReview report={{ ...baseReport, common: [hostile] }} />);
    // The payload is present verbatim as text and produced no <img> element.
    expect(screen.getByText(hostile)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("filters long header lists by query", () => {
    render(<HeaderReview report={baseReport} />);
    fireEvent.change(screen.getByLabelText("Filter columns"), { target: { value: "reg" } });
    const shared = screen.getByRole("list", { name: /Shared/ });
    expect(within(shared).getByText("region")).toBeInTheDocument();
    expect(within(shared).queryByText("status")).not.toBeInTheDocument();
  });
});
