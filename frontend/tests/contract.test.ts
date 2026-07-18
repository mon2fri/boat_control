/**
 * Frontend contract validation test.
 *
 * Validates that the contract v1 examples pass through the frontend Zod schemas
 * and that the wire/domain mappers produce correct output. This test consumes
 * the same examples.json fixture as the backend contract test.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  uploadResponseSchema,
  inspectResponseSchema,
  prepareResponseSchema,
  validateFilterResponseSchema,
  validateTargetsResponseSchema,
  rulesListResponseSchema,
  wireRuleSchema,
  wireRunDocumentSchema,
  wireRunMetadataSchema,
  wireGroupNodeSchema,
  wireErrorSchema,
} from "../src/api/wire";
import {
  mapWireRule,
  mapRunDocumentToResult,
  mapRunRequestToWire,
} from "../src/api/mapping";

const FIXTURES_PATH = resolve(
  __dirname,
  "../../tests/contracts/v1/examples.json",
);

function loadFixtures(): Record<string, unknown> {
  const raw = readFileSync(FIXTURES_PATH, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function getExample(fixtures: Record<string, unknown>, key: string): unknown {
  const examples = fixtures["examples"] as Record<string, unknown>;
  return examples[key];
}

describe("Contract v1 — fixture file exists and is valid JSON", () => {
  it("loads without error", () => {
    const fixtures = loadFixtures();
    expect(fixtures["contract_version"]).toBe(1);
    expect(fixtures["examples"]).toBeDefined();
  });
});

describe("Contract v1 — Zod schema validation", () => {
  const fixtures = loadFixtures();

  function validate<T>(schema: { safeParse: (v: unknown) => { success: boolean } }, key: string) {
    const example = getExample(fixtures, key);
    expect(example).toBeDefined();
    const result = schema.safeParse(example);
    expect(result.success).toBe(true);
  }

  it("upload response", () => {
    validate(uploadResponseSchema, "upload_response");
  });

  it("inspect response", () => {
    validate(inspectResponseSchema, "inspect_response");
  });

  it("filter prepare response", () => {
    validate(prepareResponseSchema, "filter_prepare_response");
  });

  it("filter validate response (valid)", () => {
    validate(validateFilterResponseSchema, "filter_validate_response_valid");
  });

  it("filter validate response (invalid)", () => {
    validate(validateFilterResponseSchema, "filter_validate_response_invalid");
  });

  it("target validate response", () => {
    validate(validateTargetsResponseSchema, "target_validate_response");
  });

  it("rules list response", () => {
    validate(rulesListResponseSchema, "rules_list_response");
  });

  it("rule detail response", () => {
    validate(wireRuleSchema, "rule_detail_response");
  });

  it("run document (execute response)", () => {
    validate(wireRunDocumentSchema, "execute_response");
  });

  it("run metadata (history items)", () => {
    const history = getExample(fixtures, "history_response") as unknown[];
    expect(Array.isArray(history)).toBe(true);
    for (const item of history) {
      const result = wireRunMetadataSchema.safeParse(item);
      expect(result.success).toBe(true);
    }
  });

  it("run detail response", () => {
    validate(wireRunDocumentSchema, "run_detail_response");
  });

  it("error response", () => {
    validate(wireErrorSchema, "error_response");
  });

  it("grouping tree (A and B) or C", () => {
    const tree = getExample(fixtures, "grouping_tree_and_or");
    const result = wireGroupNodeSchema.safeParse(tree);
    expect(result.success).toBe(true);
  });

  it("grouping tree deeply nested", () => {
    const tree = getExample(fixtures, "grouping_tree_deeply_nested");
    const result = wireGroupNodeSchema.safeParse(tree);
    expect(result.success).toBe(true);
  });
});

describe("Contract v1 — mapper round-trip", () => {
  const fixtures = loadFixtures();

  it("maps wire rule to domain and back", () => {
    const wireRule = getExample(fixtures, "rule_detail_response") as Parameters<
      typeof mapWireRule
    >[0];
    const domain = mapWireRule(wireRule);
    expect(domain.index).toBe("R001");
    expect(domain.name).toBe("Status Check");
  });

  it("maps run document to result", () => {
    const wireDoc = getExample(fixtures, "execute_response") as Parameters<
      typeof mapRunDocumentToResult
    >[0];
    const result = mapRunDocumentToResult(wireDoc);
    expect(result.overall.recordsLoaded).toBeGreaterThan(0);
    expect(result.ruleResults).toBeDefined();
  });

  it("maps run request to wire with explicit empty arrays", () => {
    const wire = mapRunRequestToWire({
      sessionId: "abc123",
      targetColumns: [],
      keyColumns: ["id"],
      filters: [],
      ruleIndexes: [],
    });
    expect(wire.rule_ids).toEqual([]);
    expect(wire.key_columns).toEqual(["id"]);
    expect(wire.session_id).toBe("abc123");
    expect(wire.target_columns).toBeNull();
  });
});

describe("Contract v1 — invalid examples fail validation", () => {
  it("error envelope has required 'error' field", () => {
    const invalid = { message: "wrong field name" };
    const result = wireErrorSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rule without name fails", () => {
    const invalid = {
      logic: {
        format: "value_vs_column",
        column_name: "status",
        operator: "eq",
        target_value: "active",
      },
    };
    const result = wireRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rule without logic fails", () => {
    const invalid = {
      name: "Test Rule",
    };
    const result = wireRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("run document without nested result fails", () => {
    const invalid = {
      run_id: "abc",
      report_name: "test",
      created_at: "2026-01-01T00:00:00Z",
    };
    const result = wireRunDocumentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("run document without required fields fails", () => {
    const invalid = {};
    const result = wireRunDocumentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
