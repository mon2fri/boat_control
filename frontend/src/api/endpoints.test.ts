import { describe, expect, it, vi, afterEach } from "vitest";
import { replaceRules } from "./endpoints";
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
