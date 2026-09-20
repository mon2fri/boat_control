import { useEffect } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkflowProvider, useWorkflow } from "../state/WorkflowContext";
import { RulesPage } from "./RulesPage";

const wireRule = {
  rule_id: "R001",
  rule_identifier: "CBR1_00000000000000000000",
  enabled: true,
  name: "Region present",
  description: "",
  conditions: [],
  logic: { format: "value_vs_column", column_name: "region", operator: "neq", target_value: "" },
};

const rulesList = {
  version: 2,
  rules: [wireRule],
  pinned_rule_ids: ["R001"],
  total: 1,
  revision: 1,
  next_cursor: null,
  has_more: false,
};

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

/**
 * Mounts the page next to a small probe component that snapshots the
 * workflow state on every change, so tests can assert on the live
 * selected-rule list without poking at the page's internals.
 */
function WorkflowStateProbe({
  onChange,
}: {
  onChange: (s: { selectedRuleIndexes: string[] }) => void;
}) {
  const { state } = useWorkflow();
  useEffect(() => {
    onChange({ selectedRuleIndexes: state.selectedRuleIndexes });
  }, [state.selectedRuleIndexes, onChange]);
  return null;
}

function renderPageWithProbe(): {
  states: { selectedRuleIndexes: string[] }[];
  queryClient: QueryClient;
} {
  const states: { selectedRuleIndexes: string[] }[] = [];
  const onChange = (s: { selectedRuleIndexes: string[] }) => states.push(s);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <WorkflowProvider>
        <MemoryRouter>
          <RulesPage />
          <WorkflowStateProbe onChange={onChange} />
        </MemoryRouter>
      </WorkflowProvider>
    </QueryClientProvider>,
  );
  return { states, queryClient };
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

  it("rolls an optimistic enablement change back when the server rejects it", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && String(url).includes("/rules/enablement/")) {
        return Promise.resolve(jsonResponse({ error: "enablement failed" }, false, 500));
      }
      return Promise.resolve(jsonResponse(rulesList));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitFor(() => expect(screen.getByText(/Region present/)).toBeInTheDocument());
    const checkbox = screen.getByRole("checkbox", { name: /R001/ });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
      String(url).includes("/rules/enablement/") && init?.method === "POST")).toBe(true));
    await waitFor(() => expect(checkbox).toBeChecked());
    vi.unstubAllGlobals();
  });

  it("allows multiple rules to be selected without moving their catalog rows", async () => {
    const secondRule = {
      ...wireRule,
      rule_id: "R002",
      rule_identifier: "CBR1_11111111111111111111",
      enabled: false,
      name: "Status active",
    };
    const list = {
      ...rulesList,
      rules: [wireRule, secondRule],
      pinned_rule_ids: ["R001"],
      total: 2,
    };
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST" && String(_url).includes("/rules/enablement/")) {
        return Promise.resolve(jsonResponse({ rules: [{ ...secondRule, enabled: true }] }));
      }
      return Promise.resolve(jsonResponse(list));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await waitFor(() => expect(screen.getByText(/Status active/)).toBeInTheDocument());
    const ruleList = screen.getByRole("list", { name: "Rules" });
    const before = [...ruleList.querySelectorAll("li")].map((item) => item.textContent);
    expect(before[0]).toContain("R001");
    expect(before[1]).toContain("R002");

    fireEvent.click(screen.getByRole("checkbox", { name: /R002/ }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /R002/ })).toBeChecked());
    const after = [...ruleList.querySelectorAll("li")].map((item) => item.textContent);
    expect(after[0]).toContain("R001");
    expect(after[1]).toContain("R002");
    expect(fetchMock.mock.calls.some(([url, init]) =>
      String(url).includes("/rules/enablement/") && init?.method === "POST",
    )).toBe(true);
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

  it("does not send a collection-level DELETE to the rules endpoint", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return Promise.resolve(jsonResponse({ rule_id: "R001", message: "Rule deleted." }));
      return Promise.resolve(jsonResponse(rulesList));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    await waitFor(() => expect(screen.getByText(/Region present/)).toBeInTheDocument());

    // Delete the single rule
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

    // Verify no collection-level DELETE to /rules/ (without a rule ID) was made
    const collectionDelete = fetchMock.mock.calls.some(
      ([url, init]) => {
        const u = String(url);
        return u.endsWith("/rules/") && init?.method === "DELETE";
      },
    );
    expect(collectionDelete).toBe(false);

    vi.unstubAllGlobals();
  });

  it("does not mutate the catalog during initial render", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return Promise.resolve(jsonResponse({ rule_id: "R001", message: "Rule deleted." }));
      return Promise.resolve(jsonResponse(rulesList));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    await waitFor(() => expect(screen.getByText(/Region present/)).toBeInTheDocument());

    // Simulate a config load by triggering the useEffect directly.
    // The ConfigLoader component calls onLoad → sets loadedConfigData → triggers replaceRulesApi.
    // Since we can't easily trigger this through the UI, verify the old individual-DELETE pattern is gone.
    const individualDeletes = fetchMock.mock.calls.filter(
      ([url, init]) => init?.method === "DELETE" && String(url).includes("/rules/R"),
    );
    // No DELETEs should have been sent during initial render (only from user actions)
    expect(individualDeletes).toHaveLength(0);

    vi.unstubAllGlobals();
  });

  it("checks every rule after a saved config is loaded", async () => {
    const initialList = { ...rulesList };
    const refreshedList = {
      version: 2,
      rules: [
        wireRule,
        {
          rule_id: "R002",
          rule_identifier: "CBR1_11111111111111111111",
          enabled: true,
          name: "Status active",
          description: "",
          conditions: [],
          logic: { format: "value_vs_column", column_name: "status", operator: "eq", target_value: "active" },
        },
      ],
      pinned_rule_ids: ["R001", "R002"], total: 2, revision: 2, next_cursor: null, has_more: false,
    };
    const configList = [{ name: "v2", version: 1 }];
    const configContent = {
      name: "v2",
      version: 1,
      content: {
        rules: [
          {
            name: "Region present",
            logic: { format: "value_vs_column", column_name: "region", operator: "neq", target_value: "" },
          },
          {
            name: "Status active",
            logic: { format: "value_vs_column", column_name: "status", operator: "eq", target_value: "active" },
          },
        ],
      },
    };
    const replaceResp = { message: "Rules replaced.", rule_count: 2, next_index: 2 };

    let rulesCallCount = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.includes("/rules/replace/")) {
        return Promise.resolve(jsonResponse(replaceResp));
      }
      if (init?.method === "POST" && u.includes("/rules/configs/import/")) {
        return Promise.resolve(jsonResponse({ imported: 0, reused: 2, enabled: 2, bindings: { R001: "CBR1_00000000000000000000", R002: "CBR1_00000000000000000001" } }));
      }
      if (u.includes("/rules/configs/") && !u.endsWith("/rules/configs/")) {
        return Promise.resolve(jsonResponse(configContent));
      }
      if (u.endsWith("/rules/configs/")) {
        return Promise.resolve(jsonResponse(configList));
      }
      if (u.includes("/families/") || u.endsWith("/families/")) {
        // listFamilies returns an array directly. Provide a benign column
        // family so the config-load effect passes its `families.length === 0`
        // guard.
        return Promise.resolve(jsonResponse([
          { kind: "column", name: "all", columns: ["id", "name", "status", "region", "score"] },
        ]));
      }
      if (u.includes("/rules/") && (!init?.method || init.method === "GET")) {
        rulesCallCount += 1;
        // First call: initial 1-rule catalog. After replace, subsequent calls
        // return the refreshed 2-rule catalog so the UI re-renders with both.
        return Promise.resolve(jsonResponse(rulesCallCount === 1 ? initialList : refreshedList));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { states } = renderPageWithProbe();
    await waitFor(() => expect(screen.getByText(/Region present/)).toBeInTheDocument());

    // Trigger the config load through the UI: pick "v2" in the ConfigManager
    // dropdown and click the "Load config" button.
    await waitFor(() => expect(screen.getByRole("option", { name: /v2/ })).toBeInTheDocument());
    const select = document.getElementById("rules-config-select") as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    fireEvent.change(select!, { target: { value: "v2" } });
    const loadButton = screen.getByRole("button", { name: /Load config/ });
    fireEvent.click(loadButton);
    const loadDialog = screen.getByRole("alertdialog", { name: /Discard unsaved changes/ });
    fireEvent.click(within(loadDialog).getByRole("button", { name: /Discard and load/ }));

    // After the replace + invalidate completes, the workflow state must
    // include both rule indexes — proving that loading a config selects
    // every newly-applied rule automatically.
    await waitFor(
      () => {
        const latest = states[states.length - 1];
        if (!latest) return;
        expect(latest.selectedRuleIndexes).toEqual(expect.arrayContaining(["R001", "R002"]));
        expect(latest.selectedRuleIndexes).toHaveLength(2);
      },
      { timeout: 3000 },
    );

    // And the page should now show the second rule's checkbox as well.
    expect(screen.getByText(/Status active/)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
