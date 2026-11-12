import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import type { RuleDraft } from "./domain";
import {
  asRecertifyError,
  asRuleSaveDecisionRequired,
  asRuleSaveStale,
  asRuleIdentityReuseConflict,
  recertifyExceptions,
  updateRule,
  loadRuleHistory,
  createRule,
} from "./endpoints";
import {
  mapRecertifyResult,
  mapRuleHistory,
  mapTrackedException,
  mapViolation,
  normalizeReviewStatus,
} from "./mapping";
import {
  ruleSaveDecisionRequiredSchema,
  ruleSaveStaleSchema,
  ruleIdentityReuseConflictSchema,
  ruleDraftRequestSchema,
  ruleHistoryResponseSchema,
  wireTrackedExceptionSchema,
} from "./wire";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

const IDENTITY = "CBR1_00000000000000000000";

const baseTracked = {
  exception_id: `${IDENTITY}_id_42`,
  exception_rule_identifier: IDENTITY,
  rule_index: "R001",
  key_columns: { id: "42" },
  exception_timestamp: "2026-10-30T12:00:00Z",
  exception_commentary: "Known issue carried forward",
  exception_as_of_date: "2026-10-30",
  exception_first_seen_as_of_date: "2026-09-30",
  exception_last_seen_as_of_date: "2026-10-30",
};

describe("rule-evolution tracking wire contract", () => {
  it("keeps carried text pending instead of inferring Commented", () => {
    const parsed = wireTrackedExceptionSchema.parse({
      ...baseTracked,
      status: "RecertificationRequired",
      recertification_required: true,
      recertification_reason: "Recertification due to rule change",
      carried_from_exception_id: "CBR1_V1_id_42",
      carried_from_as_of_date: "2026-09-30",
      carried_from_rule_identifier: "CBR1_V1IDENTIFIER0000001",
      rule_evolution_event_id: "evt-1",
    });
    const mapped = mapTrackedException(parsed);
    expect(mapped.status).toBe("RecertificationRequired");
    expect(mapped.recertificationRequired).toBe(true);
    expect(mapped.recertificationReason).toBe("Recertification due to rule change");
    expect(mapped.carriedFromExceptionId).toBe("CBR1_V1_id_42");
    expect(mapped.carriedFromAsOfDate).toBe("2026-09-30");
    expect(mapped.carriedFromRuleIdentifier).toBe("CBR1_V1IDENTIFIER0000001");
    expect(mapped.ruleEvolutionEventId).toBe("evt-1");
    // The marker lives in structured state, never folded into the text.
    expect(mapped.exceptionCommentary).toBe("Known issue carried forward");
  });

  it("derives RecertificationRequired from the flag when status is absent", () => {    const parsed = wireTrackedExceptionSchema.parse({
      ...baseTracked,
      recertification_required: true,
    });
    expect(mapTrackedException(parsed).status).toBe("RecertificationRequired");
  });

  it("preserves legacy fallback behavior without the flag", () => {
    expect(mapTrackedException(wireTrackedExceptionSchema.parse({ ...baseTracked })).status).toBe(
      "Commented",
    );
    expect(
      mapTrackedException(
        wireTrackedExceptionSchema.parse({
          ...baseTracked,
          exception_commentary: "",
          exception_first_seen_as_of_date: "2026-10-30",
        }),
      ).status,
    ).toBe("New");
    expect(
      mapTrackedException(
        wireTrackedExceptionSchema.parse({ ...baseTracked, exception_commentary: "" }),
      ).status,
    ).toBe("NotCommented");
  });

  it("normalises review statuses defensively without inventing them", () => {
    expect(normalizeReviewStatus("RecertificationRequired")).toBe("RecertificationRequired");
    expect(normalizeReviewStatus("recertification-required")).toBe("RecertificationRequired");
    expect(normalizeReviewStatus(" Commented ")).toBe("Commented");
    expect(normalizeReviewStatus("bogus")).toBeUndefined();
    expect(normalizeReviewStatus(null)).toBeUndefined();
    expect(normalizeReviewStatus(42)).toBeUndefined();
  });

  it("carries violation review state and provenance into detail rows", () => {
    const row = mapViolation(
      {
        row_index: 0,
        rule_id: "R001",
        rule_name: "Region check",
        rule_identifier: IDENTITY,
        key_columns: { id: "42" },
        details: "Violated region check",
        exception_id: `${IDENTITY}_id_42`,
        exception_status: "RecertificationRequired",
        recertification_required: true,
        recertification_reason: "Recertification due to rule change",
        carried_from_exception_id: "OLD_id_42",
        carried_from_as_of_date: "2026-09-30",
        carried_from_rule_identifier: "CBR1_OLD0000000000000001",
        rule_evolution_event_id: "evt-9",
      },
      0,
      { keyColumnNames: ["id"] },
    );
    expect(row.exceptionStatus).toBe("RecertificationRequired");
    expect(row.recertificationReason).toBe("Recertification due to rule change");
    expect(row.carriedFromExceptionId).toBe("OLD_id_42");
    expect(row.carriedFromAsOfDate).toBe("2026-09-30");
    expect(row.carriedFromRuleIdentifier).toBe("CBR1_OLD0000000000000001");
    expect(row.ruleEvolutionEventId).toBe("evt-9");
  });

  it("maps the frozen revision token, defaulting never-carried rows", () => {
    const row = mapTrackedException(
      wireTrackedExceptionSchema.parse({ ...baseTracked, revision_token: "evt-1" }),
    );
    expect(row.revisionToken).toBe("evt-1");
    const neverCarried = mapTrackedException(
      wireTrackedExceptionSchema.parse({ ...baseTracked, revision_token: "" }),
    );
    expect(neverCarried.revisionToken).toBeUndefined();
  });

  it("extracts frozen recertify failures with their affected IDs", () => {
    const stale = new ApiError(409, "stale", {
      code: "stale_revision_token",
      details: { stale_ids: ["X", "Y"] },
    });
    const parsed = asRecertifyError(stale);
    expect(parsed?.code).toBe("stale_revision_token");
    expect(parsed?.ids).toEqual(["X", "Y"]);
    expect(parsed?.message).toContain("X, Y");
    const unknown = new ApiError(404, "nope", {
      code: "unknown_exception_ids",
      details: { unknown_ids: ["Z"] },
    });
    expect(asRecertifyError(unknown)?.ids).toEqual(["Z"]);
    expect(asRecertifyError(new ApiError(400, "bad", { code: "nope" }))).toBeNull();
    expect(asRecertifyError(new Error("boom"))).toBeNull();
  });

  it("leaves unknown violation statuses undefined so rows stay visible", () => {    const row = mapViolation(
      {
        row_index: 0,
        rule_id: "R001",
        rule_name: "Region check",
        rule_identifier: IDENTITY,
        key_columns: { id: "42" },
        details: "Violated region check",
        exception_status: "SomethingElse",
      },
      0,
      { keyColumnNames: ["id"] },
    );
    expect(row.exceptionStatus).toBeUndefined();
  });
});

describe("rule-save 409 helpers", () => {
  const conflict = {
    code: "rule_save_decision_required",
    message: "Choose whether to modify the current rule or save as new.",
    original_rule_id: "R001",
    original_identifier: "CBR1_AAAAAAAAAAAAAAAAAAAA",
    proposed_identifier: "CBR1_BBBBBBBBBBBBBBBBBBBB",
    extreme_changes: ["conditions_replaced", "expectations_replaced"],
  };

  it("extracts a decision-required 409 (frozen Worker A shape)", () => {
    expect(ruleSaveDecisionRequiredSchema.parse(conflict)).toMatchObject({
      original_rule_id: "R001",
    });
    const error = new ApiError(409, conflict.message, conflict);
    const parsed = asRuleSaveDecisionRequired(error);
    expect(parsed?.originalRuleId).toBe("R001");
    expect(parsed?.originalIdentifier).toBe("CBR1_AAAAAAAAAAAAAAAAAAAA");
    expect(parsed?.proposedIdentifier).toBe("CBR1_BBBBBBBBBBBBBBBBBBBB");
    expect(parsed?.extremeChanges).toEqual(["conditions_replaced", "expectations_replaced"]);
  });

  it("ignores non-409 errors and unrelated 409 bodies", () => {
    expect(asRuleSaveDecisionRequired(new Error("boom"))).toBeNull();
    expect(asRuleSaveDecisionRequired(new ApiError(400, "bad", { code: "x" }))).toBeNull();
    expect(
      asRuleSaveDecisionRequired(new ApiError(409, "stale", { code: "rule_save_stale", original_rule_id: "R001", original_identifier: "A", current_identifier: "B", lineage_id: "lin-1", revision_number: 3 })),
    ).toBeNull();
  });

  it("extracts a distinct stale-source 409 without applying it", () => {
    const stale = {
      code: "rule_save_stale",
      original_rule_id: "R001",
      original_identifier: "CBR1_AAAAAAAAAAAAAAAAAAAA",
      current_identifier: "CBR1_CCCCCCCCCCCCCCCCCCCC",
      lineage_id: "lin-1",
      revision_number: 3,
    };
    const error = new ApiError(409, "stale", stale);
    const parsed = asRuleSaveStale(error);
    expect(parsed?.currentIdentifier).toBe("CBR1_CCCCCCCCCCCCCCCCCCCC");
    expect(parsed?.revisionNumber).toBe(3);
    expect(parsed?.message).toContain("CBR1_CCCCCCCCCCCCCCCCCCCC");
    expect(
      asRuleSaveStale(new ApiError(409, "m", { code: "rule_save_decision_required" })),
    ).toBeNull();
  });

  it("extracts an identity-reuse conflict instead of merging lineages", () => {
    const reuse = {
      code: "rule_identity_reuse_conflict",
      original_rule_id: "R001",
      original_identifier: "CBR1_AAAAAAAAAAAAAAAAAAAA",
      proposed_identifier: "CBR1_BBBBBBBBBBBBBBBBBBBB",
      existing_rule_id: "R007",
      existing_lineage_id: "lin-9",
    };
    const parsed = asRuleIdentityReuseConflict(new ApiError(409, "reuse", reuse));
    expect(parsed?.existingRuleId).toBe("R007");
    expect(parsed?.existingLineageId).toBe("lin-9");
    expect(parsed?.message).toContain("R007");
    expect(
      asRuleIdentityReuseConflict(new ApiError(409, "m", { code: "rule_save_decision_required" })),
    ).toBeNull();
  });

  it("rejects unknown frozen 409/400 codes from the helpers", () => {
    expect(ruleSaveStaleSchema.safeParse({ code: "rule_save_stale" }).success).toBe(false);
    expect(
      ruleIdentityReuseConflictSchema.safeParse({
        code: "rule_identity_reuse_conflict",
        original_rule_id: "R001",
        original_identifier: "A",
        proposed_identifier: "B",
        existing_rule_id: "R007",
        existing_lineage_id: "lin-9",
      }).success,
    ).toBe(true);
    // An invalid decision is a plain 400, never a decision prompt.
    expect(asRuleSaveDecisionRequired(new ApiError(400, "bad", { code: "rule_save_decision_invalid" }))).toBeNull();
  });

  it("keeps save_decision out of the executable draft but accepts it on the request", () => {
    const parsed = ruleDraftRequestSchema.parse({
      name: "R",
      conditions: [],
      logic: { format: "value_vs_column", column_name: "c", operator: "eq", target_value: "v" },
      save_decision: "modify_current",
      source_identifier: "CBR1_AAAAAAAAAAAAAAAAAAAA",
    });
    expect(parsed.save_decision).toBe("modify_current");
    expect(parsed.source_identifier).toBe("CBR1_AAAAAAAAAAAAAAAAAAAA");
  });
});

describe("rule history mapping", () => {
  it("parses the frozen history response leniently and maps it", () => {
    const response = ruleHistoryResponseSchema.parse({
      rule_id: "R001",
      lineage_id: "lin-1",
      revision_number: 2,
      events: [
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
          logic_clauses: [
            { format: "value_vs_column", column_name: "status", operator: "eq", target_values: ["active", "pending"] },
          ],
          logic_relation: "or",
        },
        change_summary: ["conditions_replaced"],
        commentary_policy: "carry_with_recertification",
        source: "ui_edit",
        created_at: "2026-10-15T10:00:00Z",
        changed_by: null,
        some_future_field: { nested: true },
        },
      ],
    });
    const mapped = mapRuleHistory(response);
    expect(mapped.ruleId).toBe("R001");
    expect(mapped.lineageId).toBe("lin-1");
    expect(mapped.revisionNumber).toBe(2);
    const [first] = mapped.events;
    expect(first?.eventId).toBe("evt-1");
    expect(first?.saveDecision).toBe("modify_current");
    expect(first?.changeSummary).toEqual(["conditions_replaced"]);
    expect(first?.commentaryPolicy).toBe("carry_with_recertification");
    expect(first?.beforePayload).toMatchObject({ conditions: expect.any(Array) as unknown });
  });

  it("maps recertify results across the frozen shape", () => {
    const mapped = mapRecertifyResult({
      as_of_date: "2026-10-30",
      accepted: ["A"],
      already_accepted: ["B"],
      total: 2,
      exceptions: [],
    });
    expect(mapped.accepted).toEqual(["A"]);
    expect(mapped.alreadyAccepted).toEqual(["B"]);
    expect(mapped.total).toBe(2);
    expect(mapRecertifyResult({ total: 0 }).accepted).toEqual([]);
  });
});

describe("rule-evolution endpoints", () => {
  const draftBase: Pick<RuleDraft, "conditions" | "conditionJoin" | "conditionGrouping" | "groupTree"> = {
    conditions: [],
    conditionJoin: null,
    conditionGrouping: null,
    groupTree: null,
  };

  /** Fetch bodies are JSON strings in these tests; parse them as records. */
  function parseJsonBody(init?: RequestInit): Record<string, unknown> {
    return JSON.parse(init?.body as string) as Record<string, unknown>;
  }

  it("sends save_decision and source_identifier on update retries", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url: String(url), body: parseJsonBody(init) });
        return Promise.resolve(
          jsonResponse({
            rule_id: "R001",
            rule_identifier: "CBR1_BBBBBBBBBBBBBBBBBBBB",
            enabled: true,
            name: "R",
            description: "",
            conditions: [],
            logic: { format: "value_vs_column", column_name: "c", operator: "eq", target_value: "v" },
            previous_rule_id: "R001",
            resulting_rule_id: "R001",
            save_decision: "modify_current",
            lineage_id: "lin-1",
            evolution_event_id: "evt-9",
          }),
        );
      }),
    );
    try {
      const updated = await updateRule(
        "R001",
        {
          name: "R",
          ...draftBase,
          logic: { id: "l0", format: "value", column: "c", operator: "equals", target: "v" },
        },
        { saveDecision: "modify_current", sourceIdentifier: "CBR1_AAAAAAAAAAAAAAAAAAAA" },
      );
      expect(updated.resultingRuleId).toBe("R001");
      expect(updated.lineageId).toBe("lin-1");
      expect(updated.evolutionEventId).toBe("evt-9");
      const put = calls.find((call) => call.url === "/api/rules/R001/");
      expect(put?.body).toMatchObject({
        save_decision: "modify_current",
        source_identifier: "CBR1_AAAAAAAAAAAAAAAAAAAA",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("never sends a save decision for plain edits or creates", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url: String(url), body: parseJsonBody(init) });
        return Promise.resolve(
          jsonResponse({
            rule_id: "R001",
            rule_identifier: IDENTITY,
            enabled: true,
            name: "R",
            description: "",
            conditions: [],
            logic: { format: "value_vs_column", column_name: "c", operator: "eq", target_value: "v" },
          }),
        );
      }),
    );
    try {
      await updateRule("R001", {
        name: "R",
        ...draftBase,
        logic: { id: "l0", format: "value", column: "c", operator: "equals", target: "v" },
      });
      await createRule({
        name: "R",
        ...draftBase,
        logic: { id: "l0", format: "value", column: "c", operator: "equals", target: "v" },
      });
      for (const call of calls) {
        expect(call.body).not.toHaveProperty("save_decision");
        expect(call.body).not.toHaveProperty("source_identifier");
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("loads history through the frozen per-rule history endpoint", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        calls.push(String(url));
        return Promise.resolve(
          jsonResponse({ rule_id: "R001", lineage_id: "lin-1", revision_number: 2, events: [] }),
        );
      }),
    );
    try {
      const history = await loadRuleHistory("R001");
      expect(calls).toEqual(["/api/rules/R001/history/"]);
      expect(history.lineageId).toBe("lin-1");
      expect(history.events).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("recertifies selected IDs with revision tokens", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url: String(url), body: parseJsonBody(init) });
        return Promise.resolve(
          jsonResponse({ as_of_date: "2026-10-30", accepted: ["A"], already_accepted: ["B"], total: 2, exceptions: [] }),
        );
      }),
    );
    try {
      const result = await recertifyExceptions("2026-10-30", [
        { exceptionId: "A", revisionToken: "evt-1" },
        { exceptionId: "B", revisionToken: "" },
      ]);
      expect(result.accepted).toEqual(["A"]);
      expect(result.alreadyAccepted).toEqual(["B"]);
      expect(calls[0]?.body).toEqual({
        as_of_date: "2026-10-30",
        exception_ids: ["A", "B"],
        revision_tokens: ["evt-1", ""],
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
