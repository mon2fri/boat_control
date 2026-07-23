import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkflowProvider } from "../state/WorkflowContext";
import { RulesPage } from "./RulesPage";

const wireRule = {
  rule_id: "R001",
  name: "Region present",
  logic: { format: "value_vs_column", column_name: "region", operator: "neq", target_value: "" },
};

const rulesList = { version: 1, rules: [wireRule] };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkflowProvider>
        <MemoryRouter>
          <RulesPage />
        </MemoryRouter>
      </WorkflowProvider>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, text: () => Promise.resolve(JSON.stringify(body)) };
}

afterEach(() => vi.restoreAllMocks());

describe("RulesPage", () => {
  it("confirms before deleting a rule and calls the delete endpoint", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return Promise.resolve(jsonResponse({ rule_id: "R001", message: "Rule deleted." }));
      return Promise.resolve(jsonResponse(rulesList));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    await waitFor(() => expect(screen.getByText(/Region present/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog", { name: /Delete rule/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => String(url).includes("/rules/R001") && init?.method === "DELETE",
        ),
      ).toBe(true),
    );
    vi.unstubAllGlobals();
  });

  it("shows an error when the rule catalog fails to load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, false, 500)));
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Could not load rules/),
    );
    vi.unstubAllGlobals();
  });

  it("wraps rule selection in a card with run action card below", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(rulesList));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await waitFor(() => expect(screen.getByText(/Region present/)).toBeInTheDocument());

    const ruleCard = screen.getByText("Select rules for this run").closest(".card");
    expect(ruleCard).toBeTruthy();

    const runBtn = screen.getByRole("button", { name: "Run comparison and validation" });
    const runCard = runBtn.closest(".card");
    expect(runCard).toBeTruthy();
    expect(runCard).not.toBe(ruleCard);

    vi.unstubAllGlobals();
  });
});
