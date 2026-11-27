import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkflowProvider, useWorkflow } from "../state/WorkflowContext";
import { RulesPage } from "./RulesPage";

afterEach(() => vi.restoreAllMocks());

const IDENTITY_V1 = "CBR1_AAAAAAAAAAAAAAAAAAAA";
const IDENTITY_V2 = "CBR1_BBBBBBBBBBBBBBBBBBBB";

const evocRule = {
  rule_id: "R001",
  rule_identifier: IDENTITY_V1,
  enabled: true,
  name: "Region check",
  description: "",
  conditions: [{ column_name: "region", operator: "eq", filter_values: ["EMEA"] }],
  logic: { format: "value_vs_column", column_name: "status", operator: "eq", target_value: "active" },
};

const rulesList = {
  version: 2,
  rules: [evocRule],
  pinned_rule_ids: ["R001"],
  total: 1,
  revision: 1,
  next_cursor: null,
  has_more: false,
};

const decisionConflict = {
  code: "rule_save_decision_required",
  message: "Choose whether to modify the current rule or save as new.",
  original_rule_id: "R001",
  original_identifier: IDENTITY_V1,
  proposed_identifier: IDENTITY_V2,
  extreme_changes: ["conditions_replaced"],
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

/** Fetch bodies are JSON strings in these tests; parse them as records. */
function parseJsonBody(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(init?.body as string) as Record<string, unknown>;
}

function historyResponse(events: unknown[]) {
  return {
    rule_id: "R001",
    lineage_id: "lin-1",
    revision_number: 2,
    events,
  };
}

function renderPage(embedded = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkflowProvider>
        <MemoryRouter>
          <RulesPage embedded={embedded} />
        </MemoryRouter>
      </WorkflowProvider>
    </QueryClientProvider>,
  );
}

function WorkflowStateProbe({ onChange }: { onChange: (s: { selectedRuleIndexes: string[] }) => void }) {
  const { state } = useWorkflow();
  useEffect(() => {
    onChange({ selectedRuleIndexes: state.selectedRuleIndexes });
  }, [state.selectedRuleIndexes, onChange]);
  return null;
}

function renderPageWithProbe(embedded = false) {
  const states: { selectedRuleIndexes: string[] }[] = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WorkflowProvider>
        <MemoryRouter>
          <WorkflowStateProbe onChange={(s) => states.push(s)} />
          <RulesPage embedded={embedded} />
        </MemoryRouter>
      </WorkflowProvider>
    </QueryClientProvider>,
  );
  return states;
}

function snapshotResponse(overrides: Record<string, unknown> = {}) {
  return {
    ...evocRule,
    rule_identifier: IDENTITY_V2,
    ...overrides,
  };
}

describe("RulesPage rule-evolution save flow", () => {
  it.each([false, true])("prompts for a decision on extensive edits (embedded=%s)", async (embedded) => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/rules/") && String(url).endsWith("/history/")) return Promise.resolve(jsonResponse(historyResponse([])));
      if (init?.method === "PUT") return Promise.resolve(jsonResponse(decisionConflict, false, 409));
      return Promise.resolve(jsonResponse(rulesList));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage(embedded);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const editor = screen.getByRole("dialog", { name: "Rule editor" });
    fireEvent.change(within(editor).getByLabelText("Name"), { target: { value: "Region check v2" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Save rule" }));

    // The 409 opens the in-overlay prompt; the editor stays open with the draft.
    const prompt = await screen.findByRole("alertdialog", { name: /Extensive edit/ });
    expect(within(prompt).getByRole("button", { name: "Modify current" })).toBeInTheDocument();
    expect(within(prompt).getByRole("button", { name: "Save as new" })).toBeInTheDocument();
    expect(within(prompt).getByRole("button", { name: "Back to editing" })).toBeInTheDocument();
    expect(within(prompt).getByText(IDENTITY_V1)).toBeInTheDocument();
    expect(within(prompt).getByText(IDENTITY_V2)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Rule editor" })).toBeInTheDocument();
    expect(within(editor).getByLabelText("Name")).toHaveValue("Region check v2");
    // Initial save carries no decision control.
    const firstPut = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(parseJsonBody(firstPut?.[1])).not.toHaveProperty("save_decision");
  });

  it.each([false, true])("back to editing keeps the draft without retrying (embedded=%s)", async (embedded) => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/rules/") && String(url).endsWith("/history/")) return Promise.resolve(jsonResponse(historyResponse([])));
      if (init?.method === "PUT") return Promise.resolve(jsonResponse(decisionConflict, false, 409));
      return Promise.resolve(jsonResponse(rulesList));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage(embedded);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const editor = screen.getByRole("dialog", { name: "Rule editor" });
    fireEvent.change(within(editor).getByLabelText("Name"), { target: { value: "Kept draft" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Save rule" }));
    const prompt = await screen.findByRole("alertdialog", { name: /Extensive edit/ });
    fireEvent.click(within(prompt).getByRole("button", { name: "Back to editing" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Rule editor" })).toBeInTheDocument();
    expect(within(editor).getByLabelText("Name")).toHaveValue("Kept draft");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  });

  it("modify current retries with the decision token and replaces the selection", async () => {
    const states = renderPageWithProbe();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/rules/") && String(url).endsWith("/history/")) return Promise.resolve(jsonResponse(historyResponse([])));
      if (init?.method === "PUT") {
        const body = parseJsonBody(init);
        if (!body.save_decision) return Promise.resolve(jsonResponse(decisionConflict, false, 409));
        return Promise.resolve(
          jsonResponse(snapshotResponse({ previous_rule_id: "R001", resulting_rule_id: "R005" })),
        );
      }
      return Promise.resolve(jsonResponse(rulesList));
    });
    vi.stubGlobal("fetch", fetchMock);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Rule editor" })).getByRole("button", { name: "Save rule" }));
    const prompt = await screen.findByRole("alertdialog", { name: /Extensive edit/ });
    fireEvent.click(within(prompt).getByRole("button", { name: "Modify current" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const puts = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(puts).toHaveLength(2);
    expect(puts[1]?.[1] ? parseJsonBody(puts[1]?.[1]) : {}).toMatchObject({
      save_decision: "modify_current",
      source_identifier: IDENTITY_V1,
    });
    expect(states.at(-1)?.selectedRuleIndexes).toEqual(["R005"]);
  });

  it("save as new preserves the source selection and adds the new rule", async () => {
    const states = renderPageWithProbe();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/rules/") && String(url).endsWith("/history/")) return Promise.resolve(jsonResponse(historyResponse([])));
      if (init?.method === "PUT") {
        const body = parseJsonBody(init);
        if (!body.save_decision) return Promise.resolve(jsonResponse(decisionConflict, false, 409));
        return Promise.resolve(
          jsonResponse(
            snapshotResponse({ rule_id: "R002", saved_as_new: true, previous_rule_id: undefined, resulting_rule_id: undefined }),
            true,
            201,
          ),
        );
      }
      return Promise.resolve(jsonResponse(rulesList));
    });
    vi.stubGlobal("fetch", fetchMock);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Rule editor" })).getByRole("button", { name: "Save rule" }));
    const prompt = await screen.findByRole("alertdialog", { name: /Extensive edit/ });
    fireEvent.click(within(prompt).getByRole("button", { name: "Save as new" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const puts = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(puts[1]?.[1] ? parseJsonBody(puts[1]?.[1]) : {}).toMatchObject({
      save_decision: "save_as_new",
      source_identifier: IDENTITY_V1,
    });
    // Source selection preserved; the new rule is added, not swapped in.
    expect(states.at(-1)?.selectedRuleIndexes).toEqual(expect.arrayContaining(["R001", "R002"]));
  });

  it("stale retry never applies the old confirmation and keeps the draft", async () => {
    const currentIdentifier = "CBR1_CCCCCCCCCCCCCCCCCCCC";
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/rules/") && String(url).endsWith("/history/")) return Promise.resolve(jsonResponse(historyResponse([])));
      if (init?.method === "PUT") {
        const body = parseJsonBody(init);
        if (!body.save_decision) return Promise.resolve(jsonResponse(decisionConflict, false, 409));
        return Promise.resolve(
          jsonResponse(
            {
              code: "rule_save_stale",
              original_rule_id: "R001",
              original_identifier: IDENTITY_V1,
              current_identifier: currentIdentifier,
              lineage_id: "lin-1",
              revision_number: 3,
            },
            false,
            409,
          ),
        );
      }
      return Promise.resolve(jsonResponse(rulesList));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const editor = screen.getByRole("dialog", { name: "Rule editor" });
    fireEvent.change(within(editor).getByLabelText("Name"), { target: { value: "Stale draft" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Save rule" }));
    const prompt = await screen.findByRole("alertdialog", { name: /Extensive edit/ });
    fireEvent.click(within(prompt).getByRole("button", { name: "Modify current" }));

    // The prompt collapses, the editor stays open with the draft, and the
    // current identifier is surfaced instead of a silent overwrite.
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Rule editor" })).toBeInTheDocument();
    expect(within(editor).getByLabelText("Name")).toHaveValue("Stale draft");
    await waitFor(() =>
      expect(within(editor).getByRole("alert")).toHaveTextContent(currentIdentifier),
    );
  });

  it("identity-reuse conflict keeps the draft and blocks silent lineage merges", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/rules/") && String(url).endsWith("/history/")) return Promise.resolve(jsonResponse(historyResponse([])));
      if (init?.method === "PUT") {
        const body = parseJsonBody(init);
        if (!body.save_decision) return Promise.resolve(jsonResponse(decisionConflict, false, 409));
        return Promise.resolve(
          jsonResponse(
            {
              code: "rule_identity_reuse_conflict",
              original_rule_id: "R001",
              original_identifier: IDENTITY_V1,
              proposed_identifier: IDENTITY_V2,
              existing_rule_id: "R007",
              existing_lineage_id: "lin-9",
            },
            false,
            409,
          ),
        );
      }
      return Promise.resolve(jsonResponse(rulesList));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const editor = screen.getByRole("dialog", { name: "Rule editor" });
    fireEvent.change(within(editor).getByLabelText("Name"), { target: { value: "Reuse draft" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Save rule" }));
    const prompt = await screen.findByRole("alertdialog", { name: /Extensive edit/ });
    fireEvent.click(within(prompt).getByRole("button", { name: "Modify current" }));

    // The prompt stays open with the draft; the existing rule is named and
    // nothing is merged or overwritten.
    await waitFor(() =>
      expect(within(prompt).getByRole("alert")).toHaveTextContent("R007"),
    );
    expect(screen.getByRole("dialog", { name: "Rule editor" })).toBeInTheDocument();
    expect(within(editor).getByLabelText("Name")).toHaveValue("Reuse draft");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(2);
  });

  it("copy stays a new-rule workflow without save decisions", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/rules/") && String(url).endsWith("/history/")) return Promise.resolve(jsonResponse(historyResponse([])));
      if (init?.method === "POST") {
        return Promise.resolve(jsonResponse({ ...snapshotResponse(), rule_id: "R002", name: "Copied" }));
      }
      return Promise.resolve(jsonResponse(rulesList));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Copy" }));
    const dialog = screen.getByRole("dialog");
    // Blank metadata, retained executable definition.
    expect(within(dialog).getByLabelText("Name")).toHaveValue("");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Copied" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save rule" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[1] ? parseJsonBody(post?.[1]) : {}).not.toHaveProperty("save_decision");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it.each([false, true])("opens persisted rule history from the list (embedded=%s)", async (embedded) => {
    const historyEvents = [
      {
        event_id: "evt-1",
        lineage_id: "lin-1",
        revision_number: 2,
        previous_event_id: "evt-0",
        source_catalog_rule_id: "R001",
        target_catalog_rule_id: "R001",
        source_identifier: IDENTITY_V1,
        target_identifier: IDENTITY_V2,
        change_type: "executable_revision",
        save_decision: "modify_current",
        before_payload: { conditions: [], logic: { format: "value_vs_column", column_name: "status", operator: "eq", target_value: "active" } },
        after_payload: { conditions: [], logic: { format: "value_vs_column", column_name: "status", operator: "eq", target_value: "pending" } },
        change_summary: [],
        commentary_policy: "carry_with_recertification",
        source: "ui_edit",
        created_at: "2026-10-15T10:00:00Z",
        changed_by: null,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("/api/rules/R001/history/")) {
          return Promise.resolve(jsonResponse(historyResponse(historyEvents)));
        }
        return Promise.resolve(jsonResponse(rulesList));
      }),
    );
    renderPage(embedded);
    fireEvent.click(await screen.findByRole("button", { name: "History" }));
    expect(await screen.findByRole("dialog", { name: /Rule history/ })).toBeInTheDocument();
    expect(await screen.findByRole("article", { name: "Revision 2" })).toBeInTheDocument();
    expect(screen.getByText(IDENTITY_V1)).toBeInTheDocument();
    expect(screen.getByText(IDENTITY_V2)).toBeInTheDocument();
  });
});
