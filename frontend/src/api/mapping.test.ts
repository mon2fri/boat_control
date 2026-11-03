/**
 * Regression tests for the wire-mapping layer.
 *
 * The most critical invariant covered here is the empty-rule-selection
 * contract: when the user deselects every rule, the client MUST serialize
 * an explicit empty array (`rule_ids: []`) and NEVER collapse it to `null`
 * or omit the field. The backend treats `null` / omitted as "run every
 * rule", so collapsing would silently re-run the entire catalog.
 */
import { describe, expect, it } from "vitest";
import {
  formatKeyColumns,
  mapConditionToWire,
  mapExceptionTrackingList,
  mapFilterRowToWire,
  mapRuleToWireDraft,
  mapRunDocumentToResult,
  mapRunMetadata,
  mapRunRequestToWire,
  mapTrackedException,
  mapTrackingDates,
  mapWireCondition,
  mapWireFilterRow,
  mapWireRule,
} from "./mapping";
import {
  ruleDraftRequestSchema,
  wireExceptionTrackingListSchema,
  wireExceptionTrackingDatesSchema,
  wireRunRequestSchema,
  wireRunDocumentResponseSchema,
  legacyWireRunDocumentSchema,
} from "./wire";

const baseRequest = {
  sessionId: "s1",
  comparisonColumns: ["id", "region"],
  filters: [],
  targetColumns: [],
  keyColumns: ["id"],
  aggregationColumns: [],
};

describe("mapRunRequestToWire", () => {
  it("serializes a non-empty rule selection verbatim", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      ruleIndexes: ["R001", "R002"],
    });
    expect(body.rule_ids).toEqual(["R001", "R002"]);
    expect(body.rule_ids).not.toBeNull();
    expect(body.rule_ids).not.toBeUndefined();
  });

  it("serializes an empty rule selection as an explicit empty array", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      ruleIndexes: [],
    });
    expect(body.rule_ids).toEqual([]);
    // Guard the contract: must NOT be null and must NOT be omitted.
    expect(body.rule_ids).not.toBeNull();
    expect("rule_ids" in body).toBe(true);
  });

  it("produces a body that the wire schema accepts with an empty array", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      ruleIndexes: [],
    });
    // Schema must accept the explicit empty array end-to-end.
    expect(() => wireRunRequestSchema.parse(body)).not.toThrow();
    const parsed = wireRunRequestSchema.parse(body);
    expect(parsed.rule_ids).toEqual([]);
  });

  it("returns a fresh array for each call so callers cannot mutate the request", () => {
    const ruleIndexes: string[] = [];
    const a = mapRunRequestToWire({ ...baseRequest, ruleIndexes });
    const b = mapRunRequestToWire({ ...baseRequest, ruleIndexes });
    expect(a.rule_ids).not.toBe(b.rule_ids);
  });

  it("serializes a non-empty key-column selection verbatim", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      keyColumns: ["id"],
      ruleIndexes: [],
    });
    expect(body.key_columns).toEqual(["id"]);
  });

  it("serializes an empty key-column selection as an explicit empty array (no null)", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      keyColumns: [],
      ruleIndexes: [],
    });
    expect(body.key_columns).toEqual([]);
    expect(body.key_columns).not.toBeNull();
    expect("key_columns" in body).toBe(true);
  });

  it("omits comparison_sections when empty", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      ruleIndexes: [],
      comparisonSections: [],
    });
    expect(body.comparison_sections).toBeUndefined();
  });

  it("omits comparison_sections when undefined", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      ruleIndexes: [],
    });
    expect(body.comparison_sections).toBeUndefined();
  });

  it("serializes aggregation column display names separately from column keys", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      aggregationColumns: ["status"],
      aggregationColumnLabels: { status: "In HR System" },
      ruleIndexes: [],
    });
    expect(body.aggregation_columns).toEqual(["status"]);
    expect(body.aggregation_column_labels).toEqual({ status: "In HR System" });
  });

  it("serializes comparison sections", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      comparisonColumns: ["region", "status", "owner"],
      ruleIndexes: [],
      comparisonSections: [
        { id: "s1", name: "Region", columns: ["region"] },
        { id: "s2", name: "Ownership", columns: ["status", "owner"] },
      ],
    });
    expect(body.comparison_sections).toEqual([
      { id: "s1", name: "Region", columns: ["region"] },
      { id: "s2", name: "Ownership", columns: ["status", "owner"] },
    ]);
  });

  it("serializes extra display columns for each comparison section", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      ruleIndexes: [],
      comparisonSections: [
        { id: "s1", name: "Region", columns: ["region"], extraColumns: ["owner"] },
      ],
    });
    expect(body.comparison_sections).toEqual([
      {
        id: "s1",
        name: "Region",
        columns: ["region"],
        extra_columns: ["owner"],
      },
    ]);
  });

  it("returns fresh arrays for comparison section columns", () => {
    const sections = [{ id: "s1", name: "Demo", columns: ["x"] }];
    const body = mapRunRequestToWire({
      ...baseRequest,
      ruleIndexes: [],
      comparisonSections: sections,
    });
    expect(body.comparison_sections![0]!.columns).not.toBe(sections[0]!.columns);
  });

  it("produces a body the wire schema accepts with comparison_sections", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      ruleIndexes: [],
      comparisonSections: [
        { id: "s1", name: "Region", columns: ["region"] },
      ],
    });
    expect(() => wireRunRequestSchema.parse(body)).not.toThrow();
  });

  it("serializes nested_aggregation_enabled when true", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      ruleIndexes: [],
      nestedAggregationEnabled: true,
    });
    expect(body.nested_aggregation_enabled).toBe(true);
    expect(() => wireRunRequestSchema.parse(body)).not.toThrow();
  });

  it("does not set nested_aggregation_enabled when omitted", () => {
    const body = mapRunRequestToWire({
      ...baseRequest,
      ruleIndexes: [],
    });
    // Should be false (not undefined) to keep the wire contract explicit and
    // let the backend default to nested-off without ambiguity.
    expect(body.nested_aggregation_enabled).toBe(false);
  });
});

describe("canonical rule catalog mapping", () => {
  it("retains the canonical identifier and server enablement", () => {
    const rule = mapWireRule({
      rule_id: "R007",
      rule_identifier: "CBR1_0123456789ABCDEFGHJK",
      enabled: true,
      enabled_position: 2,
      name: "Status",
      description: "",
      conditions: [],
      logic: { format: "value_vs_column", column_name: "status", operator: "eq", target_value: "active" },
    });
    expect(rule.identifier).toBe("CBR1_0123456789ABCDEFGHJK");
    expect(rule.enabled).toBe(true);
    expect(rule.enabledPosition).toBe(2);
  });

  it("preserves an explicit empty enabled run selection", () => {
    const request = mapRunRequestToWire({ ...baseRequest, ruleIndexes: [] });
    expect(request.rule_ids).toEqual([]);
  });
});

describe("filter row mapping", () => {
  it("serializes multiple values to filter_values", () => {
    const wire = mapFilterRowToWire({
      id: "f1",
      column: "status",
      operator: "equals",
      values: ["active", "pending"],
    });
    expect(wire.filter_values).toEqual(["active", "pending"]);
    expect(wire).not.toHaveProperty("filter_value");
  });

  it("deserializes filter_values from wire", () => {
    const row = mapWireFilterRow({
      column: "status",
      operator: "eq",
      filter_values: ["active", "pending"],
    });
    expect(row.values).toEqual(["active", "pending"]);
  });

  it("backward-compat: deserializes legacy filter_value string", () => {
    const row = mapWireFilterRow({
      column: "status",
      operator: "eq",
      filter_value: "active",
    });
    expect(row.values).toEqual(["active"]);
  });

  it("backward-compat: deserializes empty legacy filter_value", () => {
    const row = mapWireFilterRow({
      column: "status",
      operator: "eq",
      filter_value: "",
    });
    expect(row.values).toEqual([]);
  });

  it("skips empty values when serializing to wire", () => {
    const wire = mapFilterRowToWire({
      id: "f1",
      column: "status",
      operator: "equals",
      values: ["active", ""],
    });
    expect(wire.filter_values).toEqual(["active"]);
  });
});

describe("rule condition mapping", () => {
  it("serializes multiple condition values as OR alternatives", () => {
    expect(mapConditionToWire({
      id: "temporary-id",
      column: "status",
      operator: "equals",
      values: ["active", "pending"],
    })).toEqual({
      column_name: "status",
      operator: "eq",
      filter_values: ["active", "pending"],
    });
  });

  it("loads both new arrays and legacy scalar condition values", () => {
    expect(mapWireCondition({
      column_name: "status",
      operator: "eq",
      filter_values: ["active", "pending"],
    }, "c0").values).toEqual(["active", "pending"]);
    expect(mapWireCondition({
      column_name: "status",
      operator: "eq",
      filter_value: "active",
    }, "c0").values).toEqual(["active"]);
  });

  it("remaps temporary condition IDs in grouping trees before save", () => {
    const wire = mapRuleToWireDraft({
      name: "Grouped",
      conditions: [
        { id: "cond-a", column: "a", operator: "equals", values: ["1"] },
        { id: "cond-b", column: "b", operator: "equals", values: ["2"] },
      ],
      conditionJoin: null,
      conditionGrouping: null,
      groupTree: {
        kind: "and",
        children: [
          { kind: "leaf", conditionId: "cond-a" },
          { kind: "leaf", conditionId: "cond-b" },
        ],
      },
      logic: { id: "l0", format: "value", column: "result", operator: "equals", target: "ok" },
    });
    expect(wire.grouping_tree).toEqual({
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "c0" },
        { kind: "leaf", conditionId: "c1" },
      ],
    });
  });

  it("reopens a saved grouping tree in PER GROUPING mode", () => {
    const rule = mapWireRule({
      rule_id: "R001",
      rule_identifier: "CBR1_00000000000000000000",
      enabled: true,
      name: "Grouped",
      description: "",
      conditions: [
        { column_name: "a", operator: "eq", filter_values: ["1"] },
        { column_name: "b", operator: "eq", filter_values: ["2"] },
      ],
      grouping_tree: {
        kind: "and",
        children: [
          { kind: "leaf", conditionId: "c0" },
          { kind: "leaf", conditionId: "c1" },
        ],
      },
      logic: {
        format: "value_vs_column",
        column_name: "result",
        operator: "eq",
        target_value: "ok",
      },
    });
    expect(rule.conditionJoin).toBe("per_grouping");
    expect(mapRuleToWireDraft(rule)).not.toHaveProperty("condition_relation");
  });

  it("preserves extra display columns through the outbound request schema", () => {
    const mapped = mapRuleToWireDraft({
      name: "Show context",
      conditions: [],
      conditionJoin: null,
      conditionGrouping: null,
      groupTree: null,
      logic: { id: "l0", format: "value", column: "status", operator: "equals", target: "active" },
      extraColumns: ["region", "owner"],
      hideComparison: true,
    });
    const request = ruleDraftRequestSchema.parse(mapped);
    expect(request.extra_columns).toEqual(["region", "owner"]);
    expect(request.hide_comparison).toBe(true);
  });

  describe("mapRunRequestToWire — exceptionColumns", () => {
    it("omits exception_columns when empty", () => {
      const body = mapRunRequestToWire({ ...baseRequest, exceptionColumns: [], ruleIndexes: [] });
      expect(body.exception_columns).toBeUndefined();
    });

    it("omits exception_columns when undefined", () => {
      const body = mapRunRequestToWire({ ...baseRequest, ruleIndexes: [] });
      expect(body.exception_columns).toBeUndefined();
    });

    it("serializes exception_columns verbatim", () => {
      const body = mapRunRequestToWire({
        ...baseRequest,
        exceptionColumns: ["region", "owner"],
        ruleIndexes: [],
      });
      expect(body.exception_columns).toEqual(["region", "owner"]);
    });

    it("produces a body that the wire schema accepts", () => {
      const body = mapRunRequestToWire({
        ...baseRequest,
        exceptionColumns: ["region"],
        ruleIndexes: [],
      });
      expect(() => wireRunRequestSchema.parse(body)).not.toThrow();
    });
  });

  describe("mapRunDocumentToResult — exceptionColumns", () => {
    it("maps exception_columns from the wire result", () => {
      const wireDoc = legacyWireRunDocumentSchema.parse({
        run_id: "r1",
        report_name: "test",
        file_a_name: "a.csv",
        file_b_name: "b.csv",
        created_at: "2026-01-01T00:00:00Z",
        result: {
          comparison: { total_rows_a: 10, total_rows_b: 10, rows_with_changes: 0, total_attribute_changes: 0, row_details: [] },
          validation: { total_violations: 0, violations_by_rule: {}, violation_count_by_rule: {} },
          common_columns: ["id", "region"],
          target_columns: ["id", "region"],
          filters_applied: [],
          exception_columns: ["region", "owner"],
        },
      });
      const result = mapRunDocumentToResult(wireDoc);
      expect(result.exceptionColumns).toEqual(["region", "owner"]);
    });

    it("defaults to undefined when exception_columns is absent", () => {
      const wireDoc = legacyWireRunDocumentSchema.parse({
        run_id: "r1",
        report_name: "test",
        file_a_name: "a.csv",
        file_b_name: "b.csv",
        created_at: "2026-01-01T00:00:00Z",
        result: {
          comparison: { total_rows_a: 10, total_rows_b: 10, rows_with_changes: 0, total_attribute_changes: 0, row_details: [] },
          validation: { total_violations: 0, violations_by_rule: {}, violation_count_by_rule: {} },
          common_columns: ["id", "region"],
          target_columns: ["id", "region"],
          filters_applied: [],
        },
      });
      const result = mapRunDocumentToResult(wireDoc);
      expect(result.exceptionColumns).toBeUndefined();
    });
  });
});

describe("exception tracking mapping", () => {
  const exception = {
    exception_id: "CBR1_00000000000000000000_id_42",
    exception_rule_identifier: "CBR1_00000000000000000000",
    key_columns: { id: "42" },
    exception_timestamp: "2026-10-30T12:00:00Z",
    exception_commentary: "",
    exception_as_of_date: "2026-10-30",
    exception_first_seen_as_of_date: "2026-10-30",
    exception_last_seen_as_of_date: "2026-10-30",
    exception_first_seen_timestamp: "2026-10-30T12:00:00Z",
    exception_last_seen_timestamp: "2026-10-30T12:00:00Z",
  };

  it("propagates as_of_date through the run request wire body", () => {
    const body = mapRunRequestToWire({
      sessionId: "s1",
      asOfDate: "2026-10-30",
      comparisonColumns: ["id"],
      filters: [],
      targetColumns: [],
      keyColumns: ["id"],
      aggregationColumns: [],
      ruleIndexes: [],
    });
    expect(body.as_of_date).toBe("2026-10-30");
    expect(() => wireRunRequestSchema.parse(body)).not.toThrow();
  });

  it("omits as_of_date when no date is selected", () => {
    const body = mapRunRequestToWire({
      sessionId: "s1",
      comparisonColumns: ["id"],
      filters: [],
      targetColumns: [],
      keyColumns: ["id"],
      aggregationColumns: [],
      ruleIndexes: [],
    });
    expect(body.as_of_date).toBeUndefined();
  });

  it("restores as_of_date from run documents and history metadata", () => {
    const doc = legacyWireRunDocumentSchema.parse({
      run_id: "r1",
      report_name: "test",
      file_a_name: "a.csv",
      file_b_name: "b.csv",
      created_at: "2026-10-30T12:00:00Z",
      as_of_date: "2026-10-30",
      result: {
        comparison: { total_rows_a: 1, total_rows_b: 1, rows_with_changes: 0, total_attribute_changes: 0, row_details: [] },
        validation: { total_violations: 0, violations_by_rule: {}, violation_count_by_rule: {} },
        common_columns: ["id"],
        target_columns: ["id"],
        filters_applied: [],
      },
    });
    expect(mapRunDocumentToResult(doc).asOfDate).toBe("2026-10-30");
    expect(
      mapRunMetadata({
        run_id: "r1",
        report_name: "test",
        file_a_name: "a.csv",
        file_b_name: "b.csv",
        created_at: "2026-10-30T12:00:00Z",
        as_of_date: "2026-10-30",
      }).asOfDate,
    ).toBe("2026-10-30");
  });

  it("restores saved runs whose group_statistics is explicitly null", () => {
    const doc = wireRunDocumentResponseSchema.parse({
      run_id: "r-null-stats",
      report_name: "test",
      file_a_name: "a.csv",
      file_b_name: "b.csv",
      created_at: "2026-10-30T12:00:00Z",
      as_of_date: "2026-10-30",
      result: {
        comparison: {
          total_rows_a: 1,
          total_rows_b: 1,
          rows_with_changes: 0,
          total_attribute_changes: 0,
          row_details: [],
        },
        validation: {
          total_violations: 0,
          violations_by_rule: {},
          violation_count_by_rule: {},
        },
        rule_bindings: {},
        common_columns: ["id"],
        target_columns: ["id"],
        filters_applied: [],
        group_statistics: null,
      },
    });

    expect(mapRunDocumentToResult(doc).asOfDate).toBe("2026-10-30");
  });

  it("maps all three statuses verbatim when supplied by the backend", () => {
    const statuses = wireExceptionTrackingListSchema.parse([
      { ...exception, status: "New" },
      { ...exception, exception_id: "e2", status: "Commented", exception_commentary: "known" },
      { ...exception, exception_id: "e3", status: "not-commented" },
    ]);
    const mapped = mapExceptionTrackingList(statuses);
    expect(mapped.exceptions.map((item) => item.status)).toEqual([
      "New",
      "Commented",
      "NotCommented",
    ]);
  });

  it("formats string, ordered-array and object key-column representations", () => {
    expect(formatKeyColumns("a_b")).toBe("a_b");
    expect(formatKeyColumns(["a", 1, null])).toBe("a, 1, ");
    expect(formatKeyColumns({ id: "42", region: "EMEA" })).toBe("id=42, region=EMEA");
    expect(formatKeyColumns(null)).toBe("");
  });

  it("falls back to commentary/history only when the backend omits status", () => {
    const first = mapTrackedException({ ...exception });
    expect(first.status).toBe("New");
    const later = mapTrackedException({
      ...exception,
      exception_as_of_date: "2026-11-30",
      exception_first_seen_as_of_date: "2026-10-30",
    });
    expect(later.status).toBe("NotCommented");
    const commented = mapTrackedException({
      ...exception,
      exception_as_of_date: "2026-11-30",
      exception_first_seen_as_of_date: "2026-10-30",
      exception_commentary: "Known issue",
    });
    expect(commented.status).toBe("Commented");
  });

  it("accepts envelope and array list responses and sorts recorded dates newest-first", () => {
    const envelope = mapExceptionTrackingList(
      wireExceptionTrackingListSchema.parse({
        as_of_date: "2026-10-30",
        exceptions: [exception],
      }),
    );
    expect(envelope.asOfDate).toBe("2026-10-30");
    expect(envelope.exceptions[0]?.exceptionId).toBe(exception.exception_id);

    const dates = mapTrackingDates(
      wireExceptionTrackingDatesSchema.parse({
        available_dates: ["2026-09-30", "2026-10-30", "2026-10-30"],
        default_as_of_date: "2026-10-30",
      }),
    );
    expect(dates.dates).toEqual(["2026-10-30", "2026-09-30"]);
    expect(dates.defaultDate).toBe("2026-10-30");
  });
});
