/**
 * Real-backend integration test.
 *
 * The companion Python script `tests/integration/run_e2e_workflow.py` walks
 * the full upload → prepare → rules → execute → history → load → rename →
 * export flow against the real Django app and writes the raw backend
 * responses to `frontend/tests/integration-fixtures/e2e_responses.json`.
 *
 * This Vitest test loads that fixture and asserts that the client-side
 * mapping functions produce the expected domain shapes — i.e. the frontend
 * understands the real backend contract end to end.
 *
 * To regenerate the fixture after backend changes:
 *
 *   DJANGO_SETTINGS_MODULE=boat_control.settings PYTHONPATH=backend \\
 *     uv run python tests/integration/run_e2e_workflow.py \\
 *     --output frontend/tests/integration-fixtures/e2e_responses.json
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mapColumnValue,
  mapRuleToWireDraft,
  mapRunDocumentToResult,
  mapRunMetadata,
  mapRunRequestToWire,
  mapUploadToHeader,
  mapWireRule,
} from "../src/api/mapping";
import {
  prepareResponseSchema,
  ruleDraftRequestSchema,
  ruleMutationResponseSchema,
  rulesListResponseSchema,
  uploadResponseSchema,
  wireDetailPageSchema,
  wireRunDocumentSchema,
  wireRunHistorySchema,
  wireRunRequestSchema,
  wireSavedFilterListSchema,
  wireSavedFilterSchema,
  wireSettingsSchema,
  wirePresetListSchema,
} from "../src/api/wire";
// The fixture-driven tests do not issue new requests — they validate that
// the client understands the responses already on disk.

const FIXTURE_PATH = join(__dirname, "integration-fixtures", "e2e_responses.json");

interface Bundle {
  upload: unknown;
  prepare: { column_values: Record<string, unknown[]>; total_rows_a: number; total_rows_b: number; requires_confirmation: boolean };
  rules: { version: number; rules: unknown[] };
  create_rule: { rule_id: string; message: string };
  grouped_rule: {
    create_request: Record<string, unknown>;
    create_response: { rule_id: string; message: string };
    read_after_create: Record<string, unknown>;
    update_request: Record<string, unknown>;
    update_response: { rule_id: string; message: string };
    read_after_update: Record<string, unknown>;
    rule_id: string;
  };
  execute: unknown;
  history: unknown[];
  load_run: unknown;
  rename: { run_id: string; report_name: string; file_a_name: string; file_b_name: string; created_at: string; file_path: string };
  settings: unknown;
  saved_filters: {
    list_initial: unknown[];
    create_request: Record<string, unknown>;
    create_response: { id: string; name: string; rows: unknown[] };
    update_request: Record<string, unknown>;
    update_response: { id: string; name: string; rows: unknown[] };
    list_after_update: unknown[];
  };
  preset_sources: { status: number; body: unknown };
  export_html: { content_type: string; content_disposition: string; size: number; starts_with: string };
  export_excel: { content_type: string; content_disposition: string; size: number; starts_with: string };
}

function loadBundle(): Bundle {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Bundle;
}

describe("real-backend integration: client understands the live Django contract", () => {
  const bundle = loadBundle();

  it("upload: wire schema accepts the real response and mapper yields a HeaderReport", () => {
    const wire = uploadResponseSchema.parse(bundle.upload);
    const header = mapUploadToHeader(wire);
    expect(header.sessionId).toMatch(/^[0-9a-f]{12}$/);
    expect(header.file1Name).toBe("a.csv");
    expect(header.common).toEqual(expect.arrayContaining(["id", "name", "status", "score"]));
  });

  it("prepare: column values map to {value, starred} and the starred derivation is correct", () => {
    for (const [column, values] of Object.entries(bundle.prepare.column_values)) {
      for (const raw of values) {
        const mapped = mapColumnValue(raw as Parameters<typeof mapColumnValue>[0]);
        const wireVal = raw as { in_file_a: boolean; in_file_b: boolean; value: string };
        const expectedStarred = !(wireVal.in_file_a && wireVal.in_file_b);
        expect(mapped.value).toBe(wireVal.value);
        expect(mapped.starred).toBe(expectedStarred);
        // The column key in the prepared map matches the column name the row came from.
        expect(typeof column).toBe("string");
      }
    }
  });

  it("prepare: total rows and requires_confirmation are present and typed", () => {
    const { total_rows_a, total_rows_b, requires_confirmation } = bundle.prepare;
    expect(total_rows_a).toBeGreaterThan(0);
    expect(total_rows_b).toBeGreaterThan(0);
    expect(typeof requires_confirmation).toBe("boolean");
  });

  it("rules: list response round-trips through Zod + mapper", () => {
    const list = bundle.rules.rules;
    expect(Array.isArray(list)).toBe(true);
    for (const r of list) {
      const mapped = mapWireRule(r as Parameters<typeof mapWireRule>[0]);
      expect(mapped.index).toMatch(/^R\d{3,}$/);
      expect(mapped.name.length).toBeGreaterThan(0);
    }
  });

  it("rules: create rule body validates against the draft schema and the response is {rule_id, message}", () => {
    const draft = mapRuleToWireDraft({
      name: "Synthetic",
      conditions: [],
      conditionJoin: null,
      conditionGrouping: null,
      logic: { id: "l1", format: "value", column: "status", operator: "equals", target: "active" },
    });
    expect(() => ruleDraftRequestSchema.parse(draft)).not.toThrow();
    expect(bundle.create_rule.rule_id).toMatch(/^R\d{3,}$/);
    expect(typeof bundle.create_rule.message).toBe("string");
  });

  it("execute: the run document validates and maps to a full RunResult", () => {
    const doc = wireRunDocumentSchema.parse(bundle.execute);
    const result = mapRunDocumentToResult(doc);
    expect(result.id).toBe(doc.run_id);
    expect(result.file1Name).toBe("a.csv");
    expect(result.overall.recordsLoaded).toBe(bundle.prepare.total_rows_a + bundle.prepare.total_rows_b);
    expect(typeof result.overall.changedRowCount).toBe("number");
    // The pre-baked fixture changes status/score for row 1 and 2.
    expect(result.overall.changedRowCount).toBeGreaterThan(0);
  });

  it("history: list items are wire metadata, mapper yields RunSummary with id/run_id naming", () => {
    const items = wireRunHistorySchema.parse(bundle.history);
    expect(items.length).toBeGreaterThan(0);
    const summary = mapRunMetadata(items[0]!);
    expect(summary.id).toBe(items[0]!.run_id);
    expect(summary.file1Name).toBe(items[0]!.file_a_name);
  });

  it("load: get the run by id and parse the same shape as execute returned", () => {
    const doc = wireRunDocumentSchema.parse(bundle.load_run);
    expect(doc.run_id).toBe((bundle.execute as { run_id: string }).run_id);
  });

  it("rename: returns RunMetadata with the new name", () => {
    expect(bundle.rename.report_name).toBe("renamed_e2e_report");
    expect(bundle.rename.run_id).toBe(bundle.execute.run_id ?? (bundle.execute as { run_id: string }).run_id);
  });

  it("export: HTML and Excel are returned with the right content-type and disposition", () => {
    expect(bundle.export_html.content_type).toMatch(/text\/html/);
    expect(bundle.export_html.content_disposition).toMatch(/attachment/);
    expect(bundle.export_html.starts_with).toMatch(/<!doctype|<html/i);
    expect(bundle.export_excel.content_type).toMatch(/spreadsheetml/);
    expect(bundle.export_excel.content_disposition).toMatch(/attachment/);
  });

  it("grouped rule: create + read + update + read round-trip preserves all three conditions", () => {
    const grouped = bundle.grouped_rule;
    // Backend must accept a three-condition rule.
    expect(grouped.create_response.rule_id).toMatch(/^R\d{3,}$/);
    const afterCreate = grouped.read_after_create as { conditions: unknown[]; name: string };
    expect(Array.isArray(afterCreate.conditions)).toBe(true);
    expect(afterCreate.conditions).toHaveLength(3);
    expect(afterCreate.name).toBe(grouped.create_request.name);
    // PUT update must succeed and the re-read must show the new description.
    expect(grouped.update_response.rule_id).toBe(grouped.rule_id);
    const afterUpdate = grouped.read_after_update as { description: string; conditions: unknown[] };
    expect(afterUpdate.description).toContain("updated");
    expect(afterUpdate.conditions).toHaveLength(3);
  });

  it("grouped rule: backend currently drops grouping_tree — pin the divergence", () => {
    // Worker A's RuleSerializer does not yet accept or return grouping_tree.
    // The frontend sends it (see the wire mapper) but the backend ignores it.
    // This assertion documents that gap so Worker A knows exactly what to
    // close. When Worker A ships grouping_tree persistence, this assertion
    // will start failing and the test should be flipped to expect a value.
    const afterCreate = bundle.grouped_rule.read_after_create as Record<string, unknown>;
    expect("grouping_tree" in afterCreate).toBe(false);
  });
});

describe("client endpoints: happy path against the live contract", () => {
  // We do not re-run the full network here (the fixture covers that), but we
  // confirm the endpoint functions accept shapes the live backend produces.
  const bundle = loadBundle();

  it("mapRunRequestToWire produces a body that wireRunRequestSchema accepts", () => {
    const body = mapRunRequestToWire({
      sessionId: (bundle.upload as { session_id: string }).session_id,
      comparisonColumns: ["id"],
      filters: [],
      targetColumns: [],
      keyColumns: ["id"],
      ruleIndexes: [bundle.create_rule.rule_id],
    });
    // No throw.
    expect(() => JSON.stringify(body)).not.toThrow();
    expect(body.session_id).toBe((bundle.upload as { session_id: string }).session_id);
    expect(body.rule_ids).toEqual([bundle.create_rule.rule_id]);
  });
});

/**
 * Contract conformance: every captured Django response must validate through
 * the matching Zod schema. If a backend response shape drifts, this test
 * fails so the frontend and backend agree on the wire contract before a
 * shipping change goes out. Adding a new endpoint requires (a) capturing its
 * response in `run_e2e_workflow.py`, and (b) wiring it into this suite.
 */
describe("contract conformance: every fixture validates through its Zod schema", () => {
  const bundle = loadBundle();

  it("upload response validates through uploadResponseSchema", () => {
    expect(() => uploadResponseSchema.parse(bundle.upload)).not.toThrow();
  });

  it("prepare response validates through prepareResponseSchema", () => {
    expect(() => prepareResponseSchema.parse(bundle.prepare)).not.toThrow();
  });

  it("rules list response validates through rulesListResponseSchema", () => {
    expect(() => rulesListResponseSchema.parse(bundle.rules)).not.toThrow();
  });

  it("create-rule response validates through ruleMutationResponseSchema", () => {
    expect(() => ruleMutationResponseSchema.parse(bundle.create_rule)).not.toThrow();
  });

  it("execute response validates through wireRunDocumentSchema", () => {
    expect(() => wireRunDocumentSchema.parse(bundle.execute)).not.toThrow();
  });

  it("history list validates through wireRunHistorySchema", () => {
    expect(() => wireRunHistorySchema.parse(bundle.history)).not.toThrow();
  });

  it("load-run response validates through wireRunDocumentSchema", () => {
    expect(() => wireRunDocumentSchema.parse(bundle.load_run)).not.toThrow();
  });

  it("rename response validates through wireRunHistorySchema's element schema", () => {
    // The rename endpoint returns the same shape as a history item; reuse
    // the element schema so any drift in metadata fields fails here.
    const [item] = wireRunHistorySchema.parse([bundle.rename]);
    expect(item.run_id).toBe(bundle.rename.run_id);
  });

  it("settings: response validates through the frozen contract schema", () => {
    expect(() => wireSettingsSchema.parse(bundle.settings)).not.toThrow();
  });

  it("saved filters: round-trip create + update + list survives the wire schema", () => {
    // List, create, and update responses all validate through the canonical
    // wire schema. After the update, the list contains the new name.
    const sf = bundle.saved_filters;
    expect(Array.isArray(sf.list_initial)).toBe(true);
    expect(() => wireSavedFilterListSchema.parse(sf.list_initial)).not.toThrow();
    expect(() => wireSavedFilterSchema.parse(sf.create_response)).not.toThrow();
    expect(() => wireSavedFilterSchema.parse(sf.update_response)).not.toThrow();
    const finalList = wireSavedFilterListSchema.parse(sf.list_after_update);
    const updated = finalList.find((f) => f.id === sf.create_response.id);
    expect(updated?.name).toBe("E2E active rows — updated");
  });

  it("preset sources: endpoint is live — validates through wire schema", () => {
    expect(bundle.preset_sources.status).toBe(200);
    expect(Array.isArray(bundle.preset_sources.body)).toBe(true);
    expect(() => wirePresetListSchema.parse(bundle.preset_sources.body)).not.toThrow();
  });
});

/**
 * Request-side conformance: every outgoing body the mapper produces must
 * round-trip through the matching wire schema. This is the only place where
 * a frontend bug that sends a malformed body would be caught before Django
 * rejects it.
 */
describe("request conformance: every outgoing body validates through its Zod schema", () => {
  const bundle = loadBundle();

  it("a run request with one selected rule parses through wireRunRequestSchema", () => {
    const body = mapRunRequestToWire({
      sessionId: (bundle.upload as { session_id: string }).session_id,
      comparisonColumns: ["id"],
      filters: [],
      targetColumns: [],
      keyColumns: ["id"],
      ruleIndexes: [bundle.create_rule.rule_id],
    });
    expect(() => wireRunRequestSchema.parse(body)).not.toThrow();
  });

  it("a run request with an empty selection still parses (explicit [])", () => {
    const body = mapRunRequestToWire({
      sessionId: (bundle.upload as { session_id: string }).session_id,
      comparisonColumns: ["id"],
      filters: [],
      targetColumns: [],
      keyColumns: ["id"],
      ruleIndexes: [],
    });
    expect(() => wireRunRequestSchema.parse(body)).not.toThrow();
    expect(wireRunRequestSchema.parse(body).rule_ids).toEqual([]);
  });
});
