import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithClient } from "../../test/utils";
import { ReportName } from "./ReportName";
import type { RunResult } from "../../api/domain";

const wireRunMetadata = {
  run_id: "run-1",
  report_name: "renamed_report",
  file_a_name: "a.csv",
  file_b_name: "b.csv",
  created_at: "2026-07-18T00:00:00Z",
  file_path: "/data/results/run-1.json",
};

const wireRunDoc = {
  ...wireRunMetadata,
  result: {
    comparison: {
      total_rows_a: 0,
      total_rows_b: 0,
      rows_with_changes: 0,
      total_attribute_changes: 0,
      row_details: [],
    },
    validation: {
      total_violations: 0,
      violations_by_rule: {},
      violation_count_by_rule: {},
    },
    common_columns: [],
    target_columns: null,
    filters_applied: [],
  },
};

const renamed: RunResult = {
  id: "run-1",
  reportName: "renamed_report",
  createdAt: "2026-07-18T00:00:00Z",
  file1Name: "a.csv",
  file2Name: "b.csv",
  overall: {
    recordsLoaded: 0,
    ruleViolationRowCount: 0,
    ruleViolationAttributeCount: 0,
    changedRowCount: 0,
    changedAttributeCount: 0,
  },
  ruleResults: [],
  changeDetails: [],
};

afterEach(() => vi.restoreAllMocks());

describe("ReportName", () => {
  it("enters edit mode on double-click and saves via keyboard (Enter)", async () => {
    // Rename flow does PUT /rename/ (returns RunMetadata) then GET /runs/{id}/
    // (returns the full run document).
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("/rename/")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(wireRunMetadata)),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(wireRunDoc)),
        });
      }),
    );
    const onRenamed = vi.fn();
    renderWithClient(<ReportName runId="run-1" name="original" onRenamed={onRenamed} />);

    fireEvent.doubleClick(screen.getByText("original"));
    const input = screen.getByLabelText("Report name");
    fireEvent.change(input, { target: { value: "renamed_report" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith(renamed));
    vi.unstubAllGlobals();
  });

  it("blocks saving an invalid name and shows the reason", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderWithClient(<ReportName runId="run-1" name="original" onRenamed={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit report name" }));
    fireEvent.change(screen.getByLabelText("Report name"), { target: { value: "bad/name" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/cannot contain/);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("cancels editing on Escape without saving", () => {
    renderWithClient(<ReportName runId="run-1" name="original" onRenamed={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit report name" }));
    fireEvent.change(screen.getByLabelText("Report name"), { target: { value: "changed" } });
    fireEvent.keyDown(screen.getByLabelText("Report name"), { key: "Escape" });
    expect(screen.getByText("original")).toBeInTheDocument();
  });
});
