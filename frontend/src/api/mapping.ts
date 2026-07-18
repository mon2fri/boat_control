/**
 * Pure mappings between backend wire formats (`wire.ts`) and the camelCase
 * domain types (`domain.ts`). Keeping these isolated means the rest of the
 * app keeps a stable vocabulary even if the backend contract shifts again.
 */
import type {
  Condition,
  DetailRow,
  FilterOperator,
  FilterRow,
  HeaderReport,
  LogicClause,
  LogicFormat,
  LogicOperator,
  OverallSummary,
  Rule,
  RuleResult,
  RunResult,
  RunSummary,
} from "./domain";
import type {
  WireAttributeChange,
  WireColumnValue,
  WireCondition,
  WireFilterRow,
  WireLogic,
  WireRule,
  WireRunDocument,
  WireRunMetadata,
  WireRunRequest,
  wireScalarSchema,
  WireViolation,
} from "./wire";
import type { z } from "zod";

type WireScalar = z.infer<typeof wireScalarSchema>;

// --- Filter operators ----------------------------------------------------

const WIRE_TO_DOMAIN_OPERATOR: Record<string, FilterOperator> = {
  eq: "equals",
  neq: "not_equals",
  contains: "contains",
  ncontains: "not_contains",
};

const DOMAIN_TO_WIRE_OPERATOR: Record<FilterOperator, string> = {
  equals: "eq",
  not_equals: "neq",
  contains: "contains",
  not_contains: "ncontains",
};

const WIRE_TO_DOMAIN_LOGIC_OPERATOR: Record<string, LogicOperator> = {
  ...WIRE_TO_DOMAIN_OPERATOR,
  gt: "greater_than",
  lt: "less_than",
  gte: "greater_than",
  lte: "less_than",
};

const DOMAIN_TO_WIRE_LOGIC_OPERATOR: Record<LogicOperator, string> = {
  equals: "eq",
  not_equals: "neq",
  contains: "contains",
  not_contains: "ncontains",
  greater_than: "gt",
  less_than: "lt",
};

export function mapFilterOperatorToWire(op: FilterOperator): string {
  return DOMAIN_TO_WIRE_OPERATOR[op];
}

export function mapWireFilterOperator(value: string): FilterOperator {
  return WIRE_TO_DOMAIN_OPERATOR[value] ?? "equals";
}

export function mapLogicOperatorToWire(op: LogicOperator): string {
  return DOMAIN_TO_WIRE_LOGIC_OPERATOR[op];
}

export function mapWireLogicOperator(value: string): LogicOperator {
  return WIRE_TO_DOMAIN_LOGIC_OPERATOR[value] ?? "equals";
}

// --- Inspection & upload -------------------------------------------------

export function mapUploadToHeader(
  response: { session_id: string; file_a_name: string; file_b_name: string; inspection: { columns_a: string[]; columns_b: string[]; common_columns: string[]; only_in_a: string[]; only_in_b: string[] } },
): HeaderReport {
  return {
    sessionId: response.session_id,
    file1Name: response.file_a_name,
    file2Name: response.file_b_name,
    common: response.inspection.common_columns,
    file1Only: response.inspection.only_in_a,
    file2Only: response.inspection.only_in_b,
  };
}

// --- Column values -------------------------------------------------------

export function mapColumnValue(value: WireColumnValue) {
  return { value: value.value, starred: !(value.in_file_a && value.in_file_b) };
}

// --- Filters -------------------------------------------------------------

export function mapFilterRowToWire(row: FilterRow) {
  return {
    column: row.column,
    operator: mapFilterOperatorToWire(row.operator),
    filter_value: row.value,
  };
}

export function mapWireFilterRow(row: WireFilterRow): FilterRow {
  return {
    id: "", // assigned by client when used
    column: row.column,
    operator: mapWireFilterOperator(row.operator),
    value: row.filter_value,
  };
}

// --- Rules ---------------------------------------------------------------

export function mapConditionToWire(cond: Condition) {
  return {
    column_name: cond.column,
    operator: mapLogicOperatorToWire(cond.operator),
    filter_value: cond.value,
  };
}

export function mapWireCondition(cond: WireCondition, id: string): Condition {
  return {
    id,
    column: cond.column_name,
    operator: mapWireLogicOperator(cond.operator),
    value: cond.filter_value,
  };
}

export function mapLogicToWire(logic: LogicClause) {
  const format: "value_vs_column" | "column_vs_column" =
    logic.format === "value" ? "value_vs_column" : "column_vs_column";
  return {
    format,
    column_name: logic.column,
    operator: mapLogicOperatorToWire(logic.operator),
    target_value: logic.target,
  };
}

export function mapWireLogic(logic: WireLogic, id: string): LogicClause {
  const format: LogicFormat = logic.format === "value_vs_column" ? "value" : "column";
  return {
    id,
    format,
    column: logic.column_name,
    operator: mapWireLogicOperator(logic.operator),
    target: logic.target_value,
  };
}

export function mapWireRule(rule: WireRule): Rule {
  // Wire shape omits empty arrays/relations; the UI model wants explicit nulls
  // and an empty array for conditions.
  const conditions = (rule.conditions ?? []).map((c, i) => mapWireCondition(c, `c${i}`));
  const logic = mapWireLogic(rule.logic, "l0");
  return {
    index: rule.rule_id,
    name: rule.name,
    ...(rule.description ? { description: rule.description } : {}),
    conditions,
    conditionJoin: rule.condition_relation ?? (conditions.length > 1 ? "and" : null),
    conditionGrouping: rule.grouping ? rule.grouping.join(" ") : null,
    logic,
  };
}

export function mapRuleToWireDraft(rule: Omit<Rule, "index"> & { index?: string }) {
  return {
    name: rule.name,
    ...(rule.description ? { description: rule.description } : {}),
    conditions: rule.conditions.map(mapConditionToWire),
    ...(rule.conditionJoin ? { condition_relation: rule.conditionJoin } : {}),
    ...(rule.conditionGrouping
      ? { grouping: rule.conditionGrouping.split(/\s+/).filter(Boolean) }
      : {}),
    logic: mapLogicToWire(rule.logic),
  };
}

// --- Runs & results ------------------------------------------------------

export function mapRunRequestToWire(request: {
  sessionId: string;
  filters: FilterRow[];
  targetColumns: string[];
  ruleIndexes: string[];
}): WireRunRequest {
  return {
    session_id: request.sessionId,
    target_columns: request.targetColumns.length > 0 ? request.targetColumns : null,
    filters: request.filters.filter((f) => f.column && f.value).map(mapFilterRowToWire),
    rule_ids: request.ruleIndexes.length > 0 ? request.ruleIndexes : null,
  };
}

function displayScalar(value: WireScalar): string | null {
  return value === null ? null : String(value);
}

function rowKeyOf(keyColumns: Record<string, WireScalar>, index: number): string {
  const values = Object.values(keyColumns).map((value) => displayScalar(value) ?? "∅");
  return values.length > 0 ? values.join("/") : `#${index}`;
}

export function mapAttributeChange(change: WireAttributeChange, rowKey: string, index: number): DetailRow {
  return {
    rowKey: `${rowKey}#${change.column}#${index}`,
    column: change.column,
    file1Value: displayScalar(change.file_a_value),
    file2Value: displayScalar(change.file_b_value),
    kind: "changed",
  };
}

export function mapViolation(violation: WireViolation, index: number): DetailRow {
  return {
    // Backend doesn't expose the violating attribute; we surface the rule name
    // in the column slot so the row is at least identifiable in the detail
    // table. The full attribute/value pair is a P1 follow-up.
    rowKey: `${rowKeyOf(violation.key_columns, violation.row_index)}#${index}`,
    column: violation.rule_id,
    file1Value: null,
    file2Value: violation.details,
    kind: "violation",
  };
}

export function mapRunDocumentToResult(doc: WireRunDocument): RunResult {
  const result = doc.result;

  // Distinct violating rows (by row key).
  const distinctViolationRows = new Set<string>();
  for (const violations of Object.values(result.validation.violations_by_rule)) {
    for (const v of violations) distinctViolationRows.add(rowKeyOf(v.key_columns, v.row_index));
  }

  // One attribute per violation in the current schema.
  const violationAttributeCount = result.validation.total_violations;

  const overall: OverallSummary = {
    recordsLoaded: result.comparison.total_rows_a + result.comparison.total_rows_b,
    ruleViolationRowCount: distinctViolationRows.size,
    ruleViolationAttributeCount: violationAttributeCount,
    changedRowCount: result.comparison.rows_with_changes,
    changedAttributeCount: result.comparison.total_attribute_changes,
  };

  // Per-rule results.
  const ruleResults: RuleResult[] = Object.entries(result.validation.violations_by_rule).map(
    ([ruleId, violations]) => {
      const distinctRows = new Set<string>();
      for (const v of violations) distinctRows.add(rowKeyOf(v.key_columns, v.row_index));
      const sample = violations[0];
      return {
        ruleIndex: ruleId,
        ruleName: sample?.rule_name ?? ruleId,
        logicSummary: describeRuleLogicFromViolations(violations, ruleId),
        violationRowCount: distinctRows.size,
        violationAttributeCount: violations.length,
        details: violations.map((v, i) => mapViolation(v, i)),
      };
    },
  );

  // Flatten comparison attribute changes into detail rows.
  const changeDetails: DetailRow[] = [];
  let attrIndex = 0;
  for (const detail of result.comparison.row_details) {
    const rk = rowKeyOf(detail.key_columns, detail.row_index);
    for (const change of detail.attribute_changes) {
      changeDetails.push(mapAttributeChange(change, rk, attrIndex++));
    }
  }

  return {
    id: doc.run_id,
    reportName: doc.report_name,
    createdAt: doc.created_at,
    file1Name: doc.file_a_name,
    file2Name: doc.file_b_name,
    overall,
    ruleResults,
    changeDetails,
  };
}

function describeRuleLogicFromViolations(violations: WireViolation[], ruleId: string): string {
  if (violations.length === 0) return `${ruleId} (no violations)`;
  return `${ruleId}: ${violations[0]!.rule_name}`;
}

export function mapRunMetadata(meta: WireRunMetadata): RunSummary {
  return {
    id: meta.run_id,
    reportName: meta.report_name,
    createdAt: meta.created_at,
    file1Name: meta.file_a_name,
    file2Name: meta.file_b_name,
  };
}

export function mapRunDocumentMetadata(doc: WireRunDocument): RunSummary {
  return {
    id: doc.run_id,
    reportName: doc.report_name,
    createdAt: doc.created_at,
    file1Name: doc.file_a_name,
    file2Name: doc.file_b_name,
  };
}
