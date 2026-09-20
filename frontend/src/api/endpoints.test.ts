import { describe, expect, it, vi, afterEach } from "vitest";
import { createRule, exportRulesConfig, loadRulesPage, replaceRules, saveRulesConfig, setRulesEnabled } from "./endpoints";
import type { RuleDraft } from "./domain";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, text: () => Promise.resolve(JSON.stringify(body)) };
}

afterEach(() => vi.restoreAllMocks());

function makeDraft(name: string): RuleDraft {
  return {
    name,
    conditions: [],
    conditionJoin: null,
    conditionGrouping: null,
    groupTree: null,
    logic: { id: "L1", format: "value", column: "col", operator: "equals", target: "1" },
  };
}

describe("replaceRules", () => {
  it("sends POST to /rules/replace/ with the drafts array", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ message: "OK", rule_count: 2, next_index: 3 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const drafts = [makeDraft("Rule A"), makeDraft("Rule B")];

    const result = await replaceRules(drafts);

    expect(result).toEqual({ message: "OK", ruleCount: 2, nextIndex: 3 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init!.method).toBe("POST");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/rules/replace/");

    const body = JSON.parse(init!.body as string) as { rules: Array<{ name: string }> };
    expect(body.rules).toHaveLength(2);
    expect(body.rules[0]!.name).toBe("Rule A");

    vi.unstubAllGlobals();
  });

  it("sends an empty rules array when called with no drafts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ message: "OK", rule_count: 0, next_index: 1 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await replaceRules([]);

    expect(result).toEqual({ message: "OK", ruleCount: 0, nextIndex: 1 });

    const emptyBody = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    ) as { rules: unknown[] };
    expect(emptyBody.rules).toEqual([]);

    vi.unstubAllGlobals();
  });
});

describe("catalog pagination and enablement", () => {
  const rule = {
    rule_id: "R001",
    rule_identifier: "CBR1_0123456789ABCDEFGHJK",
    enabled: true,
    name: "Rule",
    description: "",
    conditions: [],
    logic: { format: "value_vs_column", column_name: "status", operator: "eq", target_value: "active" },
  };

  it("sends the opaque continuation cursor unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      version: 2,
      rules: [rule],
      pinned_rule_ids: ["R001"],
      total: 51,
      revision: 4,
      next_cursor: "opaque-token",
      has_more: true,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const page = await loadRulesPage("cursor/value");
    expect(page.nextCursor).toBe("opaque-token");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("cursor%2Fvalue");
  });

  it("retains the server's 50-plus-pinned initial page and ten-record continuation", async () => {
    const rules = Array.from({ length: 50 }, (_, index) => ({
      ...rule,
      rule_id: `R${String(index + 1).padStart(3, "0")}`,
      rule_identifier: `CBR1_${String(index + 1).padStart(20, "0")}`,
      enabled: index === 49,
    }));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      version: 2,
      rules,
      pinned_rule_ids: ["R050"],
      total: 60,
      revision: 8,
      next_cursor: "next",
      has_more: true,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const page = await loadRulesPage();
    expect(page.rules).toHaveLength(50);
    expect(page.pinnedRuleIds).toEqual(["R050"]);
    expect(page.total).toBe(60);
    expect(page.hasMore).toBe(true);
  });

  it("posts explicit IDs for atomic enablement", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ rules: [rule] }));
    vi.stubGlobal("fetch", fetchMock);
    await setRulesEnabled(["R001", "R002"], false);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ rule_ids: ["R001", "R002"], enabled: false });
  });

  it("exports rules without sending rendered catalog content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ name: "prod", version: 2, content: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await exportRulesConfig("prod");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/rules/configs/");
    expect(JSON.parse(init.body as string)).toEqual({ name: "prod" });
  });
});

describe("saved rule identifiers", () => {
  it("accepts the server-calculated identifier returned by create", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      rule_id: "R001",
      rule_identifier: "CBR1_0123456789ABCDEFGHJK",
      enabled: true,
      name: "Saved rule",
      description: "",
      conditions: [],
      logic: { format: "value_vs_column", column_name: "status", operator: "eq", target_value: "active" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const saved = await createRule(makeDraft("Saved rule"));

    expect(saved.identifier).toBe("CBR1_0123456789ABCDEFGHJK");
  });
});

describe("rules config save", () => {
  it("saves the committed enabled catalog without sending rendered rule content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ name: "prod", version: 2, content: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await saveRulesConfig("prod", 1);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/rules/configs/prod/");
    expect(JSON.parse(init.body as string)).toEqual({ version: 1 });
  });
});
