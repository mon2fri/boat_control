import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RuleHistoryPanel } from "./RuleHistoryPanel";

afterEach(() => vi.restoreAllMocks());

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

const events = [
  {
    event_id: "evt-0",
    lineage_id: "lin-1",
    revision_number: 1,
    previous_event_id: null,
    source_catalog_rule_id: null,
    target_catalog_rule_id: "R001",
    source_identifier: null,
    target_identifier: "CBR1_AAAAAAAAAAAAAAAAAAAA",
    change_type: "creation",
    save_decision: null,
    before_payload: null,
    after_payload: {
      conditions: [],
      logic: { format: "value_vs_column", column_name: "status", operator: "eq", target_value: "active" },
    },
    change_summary: [],
    commentary_policy: "no_inheritance",
    source: "ui_create",
    created_at: "2026-09-01T09:00:00Z",
    changed_by: null,
  },
  {
    event_id: "evt-1",
    lineage_id: "lin-1",
    revision_number: 2,
    previous_event_id: "evt-0",
    source_catalog_rule_id: "R001",
    target_catalog_rule_id: "R001",
    source_identifier: "CBR1_AAAAAAAAAAAAAAAAAAAA",
    target_identifier: "CBR1_BBBBBBBBBBBBBBBBBBBB",
    change_type: "executable_revision",
    save_decision: "modify_current",
    before_payload: {
      conditions: [{ column_name: "region", operator: "eq", filter_values: ["EMEA"] }],
      logic: { format: "value_vs_column", column_name: "status", operator: "eq", target_value: "active" },
    },
    after_payload: {
      conditions: [{ column_name: "region", operator: "eq", filter_values: ["APAC"] }],
      logic: { format: "value_vs_column", column_name: "status", operator: "eq", target_value: "active" },
    },
    change_summary: ["conditions_replaced"],
    commentary_policy: "carry_with_recertification",
    source: "ui_edit",
    created_at: "2026-10-15T10:00:00Z",
    changed_by: null,
  },
];

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RuleHistoryPanel ruleId="R001" ruleName="Region check" onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

function historyResponse(events: unknown[]) {
  return { rule_id: "R001", lineage_id: "lin-1", revision_number: 2, events };
}

describe("RuleHistoryPanel", () => {
  it("renders persisted revisions with identifiers, decision, and before/after", async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn((url: string) => {
      seen.push(url);
      return Promise.resolve(jsonResponse(historyResponse(events)));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();

    expect(await screen.findByRole("article", { name: "Revision 2" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Revision 1" })).toBeInTheDocument();
    expect(screen.getAllByText("CBR1_AAAAAAAAAAAAAAAAAAAA")).toHaveLength(2);
    expect(screen.getByText("CBR1_BBBBBBBBBBBBBBBBBBBB")).toBeInTheDocument();
    expect(screen.getByText("modify current")).toBeInTheDocument();
    expect(screen.getByText("executable_revision")).toBeInTheDocument();
    expect(screen.getByText("2026-10-15T10:00:00Z")).toBeInTheDocument();
    expect(screen.getByText("conditions_replaced")).toBeInTheDocument();
    expect(screen.getByText("carry_with_recertification")).toBeInTheDocument();
    // Before/after authored clauses, not the mutable catalog.
    expect(screen.getByText(/EMEA/)).toBeInTheDocument();
    expect(screen.getByText(/APAC/)).toBeInTheDocument();
    // History comes from the persisted endpoint, never the catalog list.
    expect(fetchMock).toHaveBeenCalledWith("/api/rules/R001/history/", expect.anything());
    expect(seen.every((url) => url.startsWith("/api/rules/"))).toBe(true);
  });

  it("handles loading, empty, and error states without losing the close action", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(historyResponse([])))));
    const onClose = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RuleHistoryPanel ruleId="R009" onClose={onClose} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/No recorded history/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("falls back to a raw snapshot when the payload shape is unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            historyResponse([
              {
                event_id: "evt-x",
                lineage_id: "lin-9",
                revision_number: 3,
                change_type: "metadata_edit",
                after_payload: { some_future_shape: { deeply: ["nested"] } },
                change_summary: [],
                created_at: "2026-10-20T10:00:00Z",
              },
            ]),
          ),
        ),
      ),
    );
    renderPanel();
    expect(await screen.findByRole("article", { name: "Revision 3" })).toBeInTheDocument();
    expect(screen.getByText("Raw snapshot")).toBeInTheDocument();
  });
});
