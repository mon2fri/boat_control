/**
 * Pure mappings between backend wire formats (`wire.ts`) and the camelCase
 * domain types (`domain.ts`). Keeping these isolated means the rest of the
 * app keeps a stable vocabulary even if the backend contract shifts again.
 */
import type {
  AppSettings,
  Condition,
  DetailRow,
  FilterOperator,
  FilterRow,
  GroupNode,
  HeaderReport,
  LogicClause,
  LogicFormat,
  LogicOperator,
  OverallSummary,
  PresetSource,
  Rule,
  RuleResult,
  RunResult,
  RunSummary,
  SavedFilter,
  SourceFile,
} from "./domain";
import type {
  WireAttributeChange,
  WireColumnValue,
  WireCondition,
  WireFilterRow,
  WireGroupNode,
  WireLogic,
  WirePresetSource,
  WireRule,
  WireRunDocument,
  WireRunMetadata,
  WireRunRequest,
  WireSavedFilter,
  WireSettings,
  WireSourceFile,
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
    filter_values: row.values.filter((v) => v.length > 0),
  };
}

export function mapWireFilterRow(row: WireFilterRow): FilterRow {
  // Backward compatibility: accept legacy filter_value (string) or new filter_values (array)
  const values = row.filter_values ?? (row.filter_value ? [row.filter_value] : []);
  return {
    id: "", // assigned by client when used
    column: row.column,
    operator: mapWireFilterOperator(row.operator),
    values,
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
  // Prefer the executable tree; fall back to the legacy group-id list only
  // when the tree is absent (older persisted rules). The tree is the
  // canonical representation going forward.
  const groupTree: GroupNode | null = rule.grouping_tree
    ? mapWireGroupNode(rule.grouping_tree)
    : null;
  return {
    index: rule.rule_id,
    name: rule.name,
    ...(rule.description ? { description: rule.description } : {}),
    conditions,
    conditionJoin: rule.condition_relation ?? (conditions.length > 1 ? "and" : null),
    conditionGrouping: rule.grouping ? rule.grouping.join(" ") : null,
    groupTree,
    logic,
  };
}

function mapWireGroupNode(node: WireGroupNode): GroupNode {
  if (node.kind === "leaf") return { kind: "leaf", conditionId: node.conditionId };
  return { kind: node.kind, children: node.children.map(mapWireGroupNode) };
}

function mapGroupNodeToWire(node: GroupNode): WireGroupNode {
  if (node.kind === "leaf") return { kind: "leaf", conditionId: node.conditionId };
  return { kind: node.kind, children: node.children.map(mapGroupNodeToWire) };
}

export function mapRuleToWireDraft(rule: Omit<Rule, "index"> & { index?: string }) {
  return {
    name: rule.name,
    ...(rule.description ? { description: rule.description } : {}),
    conditions: rule.conditions.map(mapConditionToWire),
    ...(rule.conditionJoin ? { condition_relation: rule.conditionJoin } : {}),
    // Always serialize the executable tree; never split a free-text
    // expression on whitespace (that loses grouping precedence).
    ...(rule.groupTree ? { grouping_tree: mapGroupNodeToWire(rule.groupTree) } : {}),
    logic: mapLogicToWire(rule.logic),
  };
}

// --- Runs & results ------------------------------------------------------

export function mapRunRequestToWire(request: {
  sessionId: string;
  comparisonColumns: string[];
  filters: FilterRow[];
  targetColumns: string[];
  keyColumns: string[];
  ruleIndexes: string[];
}): WireRunRequest {
  return {
    session_id: request.sessionId,
    comparison_columns: [...request.comparisonColumns],
    target_columns: request.targetColumns.length > 0 ? request.targetColumns : null,
    // Always send `key_columns` as an array (even when empty) so the backend
    // can distinguish an explicit empty selection from omitted defaults. The
    // backend will reject an empty array with a 400; the UI prevents the user
    // from getting there by requiring at least one key column.
    key_columns: [...request.keyColumns],
    filters: request.filters.filter((f) => f.column && f.values.length > 0).map(mapFilterRowToWire),
    // Always serialize `rule_ids` as an array so the backend can distinguish
    // an explicit empty selection (zero rules) from an omitted/default-all
    // selection. Translating an empty array to `null` here would cause every
    // rule to run when the user deliberately deselected them all.
    rule_ids: [...request.ruleIndexes],
  };
}

function displayScalar(value: WireScalar): string | null {
  return value === null ? null : String(value);
}

function rowKeyOf(keyColumns: Record<string, WireScalar>, index: number): string {
  const values = Object.values(keyColumns).map((value) => displayScalar(value) ?? "∅");
  return values.length > 0 ? values.join("/") : `#${index}`;
}

export function mapAttributeChange(
  change: WireAttributeChange,
  rowKey: string,
  keyColumns: Record<string, WireScalar>,
  index: number,
): DetailRow {
  return {
    rowKey: `${rowKey}#${change.column}#${index}`,
    keyColumns: Object.fromEntries(Object.entries(keyColumns).map(([k, v]) => [k, displayScalar(v)])),
    column: change.column,
    file1Value: displayScalar(change.file_a_value),
    file2Value: displayScalar(change.file_b_value),
    kind: "changed",
  };
}

export function mapViolation(violation: WireViolation, index: number): DetailRow {
  const column = violation.violating_column ?? violation.rule_id;
  const violatingValue = violation.violating_value !== undefined
    ? displayScalar(violation.violating_value)
    : null;
  return {
    rowKey: `${rowKeyOf(violation.key_columns, violation.row_index)}#${index}`,
    keyColumns: Object.fromEntries(Object.entries(violation.key_columns).map(([k, v]) => [k, displayScalar(v)])),
    column,
    file1Value: violatingValue,
    file2Value: null,
    kind: "exception",
    ...(violation.violating_column ? { violatingColumn: violation.violating_column } : {}),
    ...(violation.violating_value !== undefined
      ? { violatingValue: displayScalar(violation.violating_value) }
      : {}),
  };
}

export function mapRunDocumentToResult(doc: WireRunDocument): RunResult {
  const result = doc.result;
  const validation = result.validation;

  // Prefer the backend's explicit distinct counts; fall back to a local
  // derivation only if the server omitted them.
  const distinctViolationRowCount =
    validation.distinct_violating_rows ?? countDistinctViolationRows(validation.violations_by_rule);
  const distinctViolationAttributeCount =
    validation.distinct_violating_attributes ?? validation.total_violations;

  const overall: OverallSummary = {
    recordsLoaded: result.comparison.total_rows_a + result.comparison.total_rows_b,
    ruleViolationRowCount: distinctViolationRowCount,
    ruleViolationAttributeCount: distinctViolationAttributeCount,
    changedRowCount: result.comparison.rows_with_changes,
    changedAttributeCount: result.comparison.total_attribute_changes,
  };

  // Per-rule results.
  const ruleResults: RuleResult[] = Object.entries(validation.violations_by_rule).map(
    ([ruleId, violations]) => {
      const perRuleRowCount =
        validation.violating_rows_by_rule?.[ruleId] ?? countDistinctRowsForViolations(violations);
      const perRuleAttributeCount =
        validation.violating_attributes_by_rule?.[ruleId] ?? violations.length;
      const sample = violations[0];
      return {
        ruleIndex: ruleId,
        ruleName: sample?.rule_name ?? ruleId,
        logicSummary: describeRuleLogicFromViolations(violations, ruleId),
        violationRowCount: perRuleRowCount,
        violationAttributeCount: perRuleAttributeCount,
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
      changeDetails.push(mapAttributeChange(change, rk, detail.key_columns, attrIndex++));
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
  if (violations.length === 0) return `${ruleId} (no rows did not match)`;
  const first = violations[0]!;
  if (first.rule_logic) return `${ruleId} — ${first.rule_name}: ${first.rule_logic}`;
  return `${ruleId} — ${first.rule_name}: ${first.details.replace(/^Violated\s+/i, "did not match ")}`;
}

/** Local fallback for distinct-violating-row counts. The backend should
 *  already provide these; the derivation here only runs when it doesn't. */
function countDistinctViolationRows(byRule: Record<string, WireViolation[]>): number {
  const set = new Set<string>();
  for (const violations of Object.values(byRule)) {
    for (const v of violations) set.add(rowKeyOf(v.key_columns, v.row_index));
  }
  return set.size;
}

function countDistinctRowsForViolations(violations: WireViolation[]): number {
  const set = new Set<string>();
  for (const v of violations) set.add(rowKeyOf(v.key_columns, v.row_index));
  return set.size;
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

// --- Settings, saved filters, presets -----------------------------------

export function mapSettings(wire: WireSettings): AppSettings {
  return {
    presetSourcePaths: [...wire.preset_source_paths],
    rulesConfigPath: wire.rules_config_path,
    filtersConfigPath: wire.filters_config_path,
    fullSetThreshold: wire.full_set_threshold,
  };
}

export function mapSettingsToWire(settings: AppSettings): WireSettings {
  return {
    preset_source_paths: [...settings.presetSourcePaths],
    rules_config_path: settings.rulesConfigPath,
    filters_config_path: settings.filtersConfigPath,
    full_set_threshold: settings.fullSetThreshold,
  };
}

export function mapSavedFilter(wire: WireSavedFilter): SavedFilter {
  return {
    id: wire.id,
    name: wire.name,
    rows: wire.rows.map((r, i) => {
      // Backward compatibility: accept legacy filter_value or new filter_values
      const values = r.filter_values ?? (r.filter_value ? [r.filter_value] : []);
      return {
        id: `f${i}`,
        column: r.column,
        operator: mapWireFilterOperator(r.operator),
        values,
      };
    }),
  };
}

export function mapSavedFilterToWire(filter: Omit<SavedFilter, "id"> & { id?: string }): {
  name: string;
  rows: WireFilterRow[];
} {
  return {
    name: filter.name,
    rows: filter.rows
      .filter((r) => r.column && r.values.length > 0)
      .map(mapFilterRowToWire),
  };
}

export function mapPresetSource(wire: WirePresetSource): PresetSource {
  return {
    id: wire.id,
    name: wire.name,
    ...(wire.description ? { description: wire.description } : {}),
    kind: wire.kind,
  };
}

export function mapSourceFile(wire: WireSourceFile): SourceFile {
  return { id: wire.id, name: wire.name, size: wire.size };
}
