import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkflowProvider } from "../state/WorkflowContext";
import { HistoryPage } from "./HistoryPage";

function renderHistory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WorkflowProvider>
        <MemoryRouter>
          <HistoryPage />
        </MemoryRouter>
      </WorkflowProvider>
    </QueryClientProvider>,
  );
}

function json(body: unknown, ok = true, status = 200) {
  return { ok, status, text: () => Promise.resolve(JSON.stringify(body)) };
}

afterEach(() => vi.restoreAllMocks());

describe("HistoryPage", () => {
  it("lists saved runs and offers adjacent Open and Delete actions", async () => {
    const wireRuns = [
      {
        run_id: "run-2",
        report_name: "b_vs_c",
        file_a_name: "b.csv",
        file_b_name: "c.csv",
        created_at: "2026-07-18T01:00:00Z",
        file_path: "/data/results/run-2.json",
      },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(wireRuns)));
    renderHistory();
    await waitFor(() => expect(screen.getByText("b_vs_c")).toBeInTheDocument());
    const link = screen.getByRole("link", { name: "Open" });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/results/run-2");
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("replaces Delete with Cancel then Confirm and removes the run", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json([{
        run_id: "run-2",
        report_name: "b_vs_c",
        file_a_name: "b.csv",
        file_b_name: "c.csv",
        created_at: "2026-07-18T01:00:00Z",
      }]))
      .mockResolvedValueOnce(json({ run_id: "run-2", deleted: true }))
      .mockResolvedValueOnce(json([]));
    vi.stubGlobal("fetch", fetchMock);
    renderHistory();
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(cancel.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(confirm);

    await waitFor(() => expect(screen.getByText(/No runs saved yet/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/runs/run-2/",
      expect.objectContaining({ method: "DELETE" }),
    );
    vi.unstubAllGlobals();
  });

  it("shows an empty state when no runs are saved", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    renderHistory();
    await waitFor(() => expect(screen.getByText(/No runs saved yet/)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });

  it("renders one Open link per saved run", async () => {
    const wireRuns = [
      {
        run_id: "run-1",
        report_name: "a_vs_b",
        file_a_name: "a.csv",
        file_b_name: "b.csv",
        created_at: "2026-07-18T00:00:00Z",
      },
      {
        run_id: "run-2",
        report_name: "b_vs_c",
        file_a_name: "b.csv",
        file_b_name: "c.csv",
        created_at: "2026-07-18T01:00:00Z",
      },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(wireRuns)));
    renderHistory();
    await waitFor(() => expect(screen.getAllByRole("link", { name: "Open" })).toHaveLength(2));
    vi.unstubAllGlobals();
  });
});
