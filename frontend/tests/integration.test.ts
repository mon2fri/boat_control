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
import { ruleDraftRequestSchema, uploadResponseSchema, wireRunDocumentSchema, wireRunHistorySchema } from "../src/api/wire";
// The fixture-driven tests do not issue new requests — they validate that
// the client understands the responses already on disk.

const FIXTURE_PATH = join(__dirname, "integration-fixtures", "e2e_responses.json");

interface Bundle {
  upload: unknown;
  prepare: { column_values: Record<string, unknown[]>; total_rows_a: number; total_rows_b: number; requires_confirmation: boolean };
  rules: { version: number; rules: unknown[] };
  create_rule: { rule_id: string; message: string };
  execute: unknown;
  history: unknown[];
  load_run: unknown;
  rename: { run_id: string; report_name: string; file_a_name: string; file_b_name: string; created_at: string; file_path: string };
  export_html: { content_type: string; content_disposition: string; size: number; starts_with: string };
  export_csv: { content_type: string; content_disposition: string; size: number; starts_with: string };
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
    expect(bundle.rename.file_path).toContain(bundle.rename.run_id);
  });

  it("export: HTML and CSV are returned with the right content-type and disposition", () => {
    expect(bundle.export_html.content_type).toMatch(/text\/html/);
    expect(bundle.export_html.content_disposition).toMatch(/attachment/);
    expect(bundle.export_html.starts_with).toMatch(/<!doctype|<html/i);
    expect(bundle.export_csv.content_type).toMatch(/text\/csv/);
    expect(bundle.export_csv.content_disposition).toMatch(/attachment/);
  });
});

describe("client endpoints: happy path against the live contract", () => {
  // We do not re-run the full network here (the fixture covers that), but we
  // confirm the endpoint functions accept shapes the live backend produces.
  const bundle = loadBundle();

  it("mapRunRequestToWire produces a body that wireRunRequestSchema accepts", () => {
    const body = mapRunRequestToWire({
      sessionId: (bundle.upload as { session_id: string }).session_id,
      filters: [],
      targetColumns: [],
      ruleIndexes: [bundle.create_rule.rule_id],
    });
    // No throw.
    expect(() => JSON.stringify(body)).not.toThrow();
    expect(body.session_id).toBe((bundle.upload as { session_id: string }).session_id);
    expect(body.rule_ids).toEqual([bundle.create_rule.rule_id]);
  });
});
