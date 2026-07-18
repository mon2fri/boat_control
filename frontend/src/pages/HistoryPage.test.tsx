import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  it("lists saved runs and offers a load action", async () => {
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
    expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows an empty state when no runs are saved", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([])));
    renderHistory();
    await waitFor(() => expect(screen.getByText(/No runs saved yet/)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });

  it("surfaces a load failure for a stale/missing run", async () => {
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
    const fetchMock = vi.fn((url: string) => {
      if (String(url).includes("/runs/run-2") && !String(url).includes("rename")) {
        return Promise.resolve(json({ error: "gone" }, false, 404));
      }
      return Promise.resolve(json(wireRuns));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderHistory();
    await waitFor(() => expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument());
    screen.getByRole("button", { name: "Load" }).click();
    await waitFor(() => expect(screen.getByText(/Could not load that run/)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});
