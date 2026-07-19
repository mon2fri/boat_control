import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { WorkflowProvider } from "./state/WorkflowContext";
import { routes } from "./router";
const wireUpload = {
  session_id: "s1",
  file_a_name: "baseline.csv",
  file_b_name: "candidate.csv",
  inspection: {
    columns_a: ["id", "region", "status", "legacy"],
    columns_b: ["id", "region", "status"],
    common_columns: ["id", "region", "status"],
    only_in_a: ["legacy"],
    only_in_b: [],
  },
};

const rulesList = {
  version: 1,
  rules: [
    {
      rule_id: "R001",
      name: "Region present",
      logic: { format: "value_vs_column", column_name: "region", operator: "neq", target_value: "" },
    },
  ],
};

const prepareResponse = {
  session_id: "s1",
  columns: ["id", "region", "status"],
  column_values: {
    region: [
      { value: "EMEA", in_file_a: true, in_file_b: true, display: "EMEA" },
      { value: "APAC", in_file_a: false, in_file_b: true, display: "APAC*" },
    ],
  },
  total_rows_a: 100,
  total_rows_b: 120,
  requires_confirmation: false,
};

const runDoc = {
  run_id: "run-1",
  report_name: "baseline_vs_candidate",
  file_a_name: "baseline.csv",
  file_b_name: "candidate.csv",
  created_at: "2026-07-18T00:00:00Z",
  result: {
    comparison: {
      total_rows_a: 100,
      total_rows_b: 120,
      rows_with_changes: 5,
      total_attribute_changes: 9,
      row_details: [
        {
          row_index: 1,
          key_columns: { id: "1" },
          attribute_changes: [
            { column: "region", file_a_value: "EMEA", file_b_value: "APAC" },
          ],
          change_count: 1,
        },
      ],
    },
    validation: {
      total_violations: 0,
      violations_by_rule: {},
      violation_count_by_rule: {},
    },
    common_columns: ["id", "region", "status"],
    target_columns: null,
    filters_applied: [],
  },
};

function json(body: unknown) {
  return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) };
}

function installFetchMock() {
  const fn = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url.includes("/files/upload/")) return Promise.resolve(json(wireUpload));
    if (url.includes("/files/trim/")) return Promise.resolve(json({ session_id: "s1", columns: ["id", "region", "status"], rows_a: 100, rows_b: 120 }));
    if (url.includes("/files/filters/prepare/")) return Promise.resolve(json(prepareResponse));
    if (url.includes("/rules/") && method === "GET") return Promise.resolve(json(rulesList));
    if (url.includes("/runs/execute/") && method === "POST") return Promise.resolve(json(runDoc));
    return Promise.resolve(json({}));
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: ["/"] });
  return render(
    <QueryClientProvider client={client}>
      <WorkflowProvider>
        <RouterProvider router={router} />
      </WorkflowProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("critical user journey: upload → prepare → rules → run → results", () => {
  it("walks the full workflow and renders the report", async () => {
    installFetchMock();
    renderApp();

    // 1. Upload two files.
    const file1 = screen.getByLabelText("First file (baseline)");
    const file2 = screen.getByLabelText("Second file (candidate)");
    fireEvent.change(file1, { target: { files: [new File(["a"], "baseline.csv")] } });
    fireEvent.change(file2, { target: { files: [new File(["b"], "candidate.csv")] } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect headers" }));

    // 2. Header review appears; select a mandatory identifier, then continue.
    await waitFor(() => expect(screen.getByText(/shared column/)).toBeInTheDocument());
    const identifierInput = screen.getByRole("searchbox", { name: "Identifier columns" });
    fireEvent.focus(identifierInput);
    fireEvent.mouseDown(screen.getByRole("option", { name: /id/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue to compare/ }));

    // 3. Compare and validate loads its filters, targets, and validation rules.
    await waitFor(() => expect(screen.getByRole("heading", { name: /Compare & validate/ })).toBeInTheDocument());
    const continueBtn = await screen.findByRole("button", { name: "Continue to validation rules" });
    await waitFor(() => expect(continueBtn).toBeEnabled());
    fireEvent.click(continueBtn);

    // 4. Rules load and default-select; continue to run.
    await waitFor(() => expect(screen.getByText(/Region present/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Continue to run" }));

    // 5. Results page: run, then the report renders with the overall counts.
    await waitFor(() => expect(screen.getByRole("button", { name: "Run now" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Overall result summary")).toBeInTheDocument(),
    );
    expect(screen.getByText("220")).toBeInTheDocument();
    expect(screen.getByText("baseline_vs_candidate")).toBeInTheDocument();
  });
});
