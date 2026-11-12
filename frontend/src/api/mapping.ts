import { compareRuleIndices } from "../lib/ruleOrder";
/**
 * Pure mappings between backend wire formats (`wire.ts`) and the camelCase
 * domain types (`domain.ts`). Keeping these isolated means the rest of the
 * app keeps a stable vocabulary even if the backend contract shifts again.
 */
import type {
  AppSettings,
  CommentaryImportResult,
  ComparisonSection,
  Condition,
  DetailRow,
  ExceptionStatus,
  ExceptionTrackingDates,
  Family,
  FilterOperator,
  FilterRow,
  GroupNode,
  GroupRelation,
  GroupStat,
  GroupStatRow,
  GroupStatisticsBundle,
  HeaderReport,
  LogicClause,
  LogicFormat,
  LogicOperator,
  OverallSummary,
  PresetSource,
  RecertifyResult,
  Rule,
  RuleHistory,
  RuleHistoryEvent,
  RuleResult,
  RunResult,
  RunSummary,
  SavedFilter,
  SourceFile,
  TrackedException,
} from "./domain";
import type {
  WireAttributeChange,
  WireColumnValue,
  WireCondition,
  WireExceptionTrackingDates,
  WireExceptionTrackingList,
  WireFamily,
  WireFilterRow,
  WireGroupNode,
  WireGroupStatistics,
  WireGroupStatisticsBundle,
  WireGroupStatisticsRow,
  WireLogic,
  WirePresetSource,
  WireRule,
  WireRuleHistoryEvent,
  WireRuleHistoryResponse,
  WireRunDocument,
  LegacyWireRunDocument,
  WireRunMetadata,
  WireRunRequest,
  WireSavedFilter,
  WireSettings,
  WireSourceFile,
  WireTrackedException,
  wireScalarSchema,
  WireViolation,
} from "./wire";
import type { z } from "zod";
import { resolveExceptionId } from "../lib/exceptionIdentity";
import {
  fromPersistedGroupingTree,
  GroupingValidationError,
  resolveGroupedExpression,
  toPersistedGroupingTree,
} from "../lib/grouping";

type WireScalar = z.infer<typeof wireScalarSchema>;
type MappableViolation = Omit<WireViolation, "rule_identifier"> & {
  rule_identifier?: string | null;
};

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
  response: {
    session_id: string;
    file_a_name: string;
    file_b_name: string;
    file_a_deduplicated: boolean;
    file_b_deduplicated: boolean;
    as_of_date?: string | undefined;
    inspection: {
      columns_a: string[];
      columns_b: string[];
      common_columns: string[];
      only_in_a: string[];
      only_in_b: string[];
    };
  },
): HeaderReport {
  return {
    sessionId: response.session_id,
    file1Name: response.file_a_name,
    file2Name: response.file_b_name,
    file1Deduplicated: response.file_a_deduplicated,
    file2Deduplicated: response.file_b_deduplicated,
    ...(response.as_of_date ? { asOfDate: response.as_of_date } : {}),
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

export function mapWireFilterRow(row: WireFilterRow, id = ""): FilterRow {
  // Backward compatibility: accept legacy filter_value (string) or new filter_values (array)
  const values = row.filter_values ?? (row.filter_value ? [row.filter_value] : []);
  return {
    id,
    column: row.column,
    operator: mapWireFilterOperator(row.operator),
    values,
  };
}

/** True when a filter row is complete enough to send to the backend. */
export function isCompleteFilterRow(row: FilterRow): boolean {
  return row.column.trim().length > 0 && row.values.length > 0;
}

export interface FilterConfigurationMapping {
  filters: FilterRow[];
  relation: GroupRelation | null;
  groupTree: GroupNode | null;
  errors: string[];
}

/**
 * Serialize the runtime filter configuration for a wire request or saved
 * filter. The tree is validated against the *actual* row IDs and remapped to
 * the persisted `cN` form; it is never replaced by a flat relation when it is
 * invalid. Incomplete rows are rejected whenever grouping is configured so
 * removing/editing a referenced row cannot silently broaden the run.
 */
export function mapFilterConfigurationToWire(
  filters: FilterRow[],
  relation: GroupRelation | null | undefined,
  groupTree: GroupNode | null | undefined,
  options: { label?: string; requireExplicitForMultiple?: boolean } = {},
): {
  rows: ReturnType<typeof mapFilterRowToWire>[];
  relation: GroupRelation | null;
  groupTree: GroupNode | null;
} {
  const label = options.label ?? "filter grouping";
  const resolved = resolveGroupedExpression(filters, relation, groupTree, {
    label,
    allowLegacyAnd: !options.requireExplicitForMultiple,
    ...(options.requireExplicitForMultiple !== undefined
      ? { requireExplicitForMultiple: options.requireExplicitForMultiple }
      : {}),
  });
  if (!resolved.valid) {
    throw new GroupingValidationError(resolved.errors);
  }
  if (filters.length === 0) {
    return { rows: [], relation: null, groupTree: null };
  }

  const hasExplicitGrouping = Boolean(groupTree || relation);
  const incomplete = filters.filter((row) => !isCompleteFilterRow(row));
  if (hasExplicitGrouping && incomplete.length > 0) {
    throw new GroupingValidationError([
      `${label} references an incomplete filter row. Fill in or remove the row and repair the grouping before running.`,
    ]);
  }

  const rows = (hasExplicitGrouping ? filters : filters.filter(isCompleteFilterRow))
    .map(mapFilterRowToWire);

  return {
    rows,
    relation: hasExplicitGrouping && relation ? relation : null,
    groupTree: groupTree
      ? toPersistedGroupingTree(groupTree, filters)
      : null,
  };
}

/**
 * Restore a persisted filter configuration, remapping persisted `cN` leaf
 * references to the runtime row IDs assigned here. Invalid expressions keep
 * their tree and expose errors rather than falling back to an unrestricted run.
 */
export function mapWireFilterConfiguration(
  wireRows: WireFilterRow[],
  relation?: GroupRelation | null,
  groupTree?: WireGroupNode | null,
  options: { idPrefix?: string; label?: string } = {},
): FilterConfigurationMapping {
  const idPrefix = options.idPrefix ?? "fl";
  const filters = wireRows.map((row, index) => mapWireFilterRow(row, `${idPrefix}-${index}`));
  const mappedTree = groupTree
    ? fromPersistedGroupingTree(mapWireGroupNode(groupTree), filters)
    : null;
  const resolved = resolveGroupedExpression(filters, relation ?? null, mappedTree, {
    label: options.label ?? "filter grouping",
    allowLegacyAnd: true,
  });
  return {
    filters,
    // Preserve an absent relation so a legacy payload stays legacy on re-save.
    relation: relation ?? null,
    groupTree: mappedTree,
    errors: resolved.errors,
  };
}

// --- Rules ---------------------------------------------------------------

export function mapConditionToWire(cond: Condition) {
  const values = conditionValues(cond).filter((value) => value.length > 0);
  return {
    column_name: cond.column,
    operator: mapLogicOperatorToWire(cond.operator),
    filter_values: values,
  };
}

export function mapWireCondition(cond: WireCondition, id: string): Condition {
  const values = cond.filter_values ?? (cond.filter_value ? [cond.filter_value] : []);
  return {
    id,
    column: cond.column_name,
    operator: mapWireLogicOperator(cond.operator),
    values,
    value: values[0] ?? "",
  };
}

function conditionValues(cond: Condition): string[] {
  if (Array.isArray(cond.values)) return cond.values;
  return cond.value ? [cond.value] : [];
}

export function mapLogicToWire(logic: LogicClause) {
  const format: "value_vs_column" | "column_vs_column" =
    logic.format === "value" ? "value_vs_column" : "column_vs_column";
  const normalizedValues = logic.values
    ? [...new Set(logic.values.map((v) => v.trim()).filter((v) => v.length > 0))]
    : undefined;
  const targetValue = normalizedValues && normalizedValues.length > 0
    ? normalizedValues[0]
    : logic.target;
  return {
    format,
    column_name: logic.column,
    operator: mapLogicOperatorToWire(logic.operator),
    target_value: targetValue,
    ...(normalizedValues && normalizedValues.length > 0
      ? { target_values: normalizedValues }
      : {}),
    ...(format === "column_vs_column"
      ? { comparison_mode: logic.columnComparisonMode ?? "comparison_vs_baseline" }
      : {}),
  };
}

export function mapWireLogic(logic: WireLogic, id: string): LogicClause {
  const format: LogicFormat = logic.format === "value_vs_column" ? "value" : "column";
  const values = logic.target_values ?? (logic.target_value ? [logic.target_value] : []);
  return {
    id,
    format,
    column: logic.column_name,
    operator: mapWireLogicOperator(logic.operator),
    target: logic.target_value,
    ...(values.length > 0 ? { values } : {}),
    ...(format === "column"
      ? { columnComparisonMode: logic.comparison_mode ?? "comparison_vs_baseline" }
      : {}),
  };
}

export interface RuleLogicConfiguration {
  clauses: LogicClause[];
  /** Legacy accessor retained for callers that still read `rule.logic`. */
  legacy: LogicClause;
  relation: GroupRelation | null;
  groupTree: GroupNode | null;
  errors: string[];
  /** True when the payload used the new multi-outcome representation. */
  multiOutcomeForm: boolean;
}

/**
 * Read either legacy `logic` or `logic_clauses`, rejecting contradictory
 * payloads. The returned tree is remapped from persisted `cN` references to
 * the runtime clause IDs assigned here.
 */
export function mapWireRuleLogic(rule: Pick<
  WireRule,
  "logic" | "logic_clauses" | "logic_relation" | "logic_grouping_tree"
>): RuleLogicConfiguration {
  const hasLegacy = rule.logic !== undefined;
  const hasClauses = rule.logic_clauses !== undefined;
  if (hasLegacy && hasClauses) {
    throw new GroupingValidationError([
      "Rule contains both legacy logic and logic_clauses; refusing to choose one silently.",
    ]);
  }
  if (!hasLegacy && !hasClauses) {
    throw new GroupingValidationError(["Rule has no logic or logic_clauses."]);
  }

  if (hasLegacy) {
    const legacy = mapWireLogic(rule.logic!, "l0");
    return {
      clauses: [legacy],
      legacy,
      relation: null,
      groupTree: null,
      errors: [],
      multiOutcomeForm: false,
    };
  }

  const clauses = (rule.logic_clauses ?? []).map((clause, index) =>
    mapWireLogic(clause, `l${index}`),
  );
  if (clauses.length === 0) {
    throw new GroupingValidationError(["Rule logic_clauses is empty."]);
  }
  const groupTree = rule.logic_grouping_tree
    ? fromPersistedGroupingTree(mapWireGroupNode(rule.logic_grouping_tree), clauses)
    : null;
  const resolved = resolveGroupedExpression(clauses, rule.logic_relation ?? null, groupTree, {
    label: "rule outcome grouping",
    requireExplicitForMultiple: true,
    allowLegacyAnd: false,
  });
  return {
    clauses,
    legacy: clauses[0]!,
    relation: resolved.relation,
    groupTree,
    errors: resolved.errors,
    multiOutcomeForm: true,
  };
}

export function mapWireRule(rule: WireRule): Rule {
  // Wire shape omits empty arrays/relations; the UI model wants explicit nulls
  // and an empty array for conditions.
  const conditions = (rule.conditions ?? []).map((c, i) => mapWireCondition(c, `c${i}`));
  const logicConfig = mapWireRuleLogic(rule);
  // Prefer the executable tree; fall back to the legacy group-id list only
  // when the tree is absent (older persisted rules). The tree is the
  // canonical representation going forward.
  const groupTree: GroupNode | null = rule.grouping_tree
    ? mapWireGroupNode(rule.grouping_tree)
    : null;
  return {
    index: rule.rule_id,
    identifier: rule.rule_identifier ?? null,
    ...(rule.lineage_id ? { lineageId: rule.lineage_id } : {}),
    ...(rule.revision_number !== undefined ? { revisionNumber: rule.revision_number } : {}),
    ...(rule.equivalent_rule_id ? { equivalentRuleId: rule.equivalent_rule_id } : {}),
    enabled: rule.enabled ?? false,
    enabledPosition: rule.enabled_position ?? null,
    name: rule.name,
    ...(rule.description ? { description: rule.description } : {}),
    conditions,
    conditionJoin: groupTree
      ? "per_grouping"
      : rule.condition_relation ?? (conditions.length > 1 ? "and" : null),
    conditionGrouping: rule.grouping ? rule.grouping.join(" ") : null,
    groupTree,
    logic: logicConfig.legacy,
    ...(logicConfig.multiOutcomeForm
      ? {
          logicClauses: logicConfig.clauses,
          logicRelation: logicConfig.relation,
          logicGroupTree: logicConfig.groupTree,
          ...(logicConfig.errors.length > 0
            ? { logicGroupingErrors: logicConfig.errors }
            : {}),
        }
      : {}),
    extraColumns: rule.extra_columns ?? [],
    hideComparison: rule.hide_comparison ?? false,
  };
}

function mapWireGroupNode(node: WireGroupNode): GroupNode {
  if (node.kind === "leaf") return { kind: "leaf", conditionId: node.conditionId };
  return { kind: node.kind, children: node.children.map(mapWireGroupNode) };
}

function mapGroupNodeToWire(node: GroupNode, conditionIds: Map<string, string>): WireGroupNode {
  if (node.kind === "leaf") {
    return { kind: "leaf", conditionId: conditionIds.get(node.conditionId) ?? node.conditionId };
  }
  return { kind: node.kind, children: node.children.map((child) => mapGroupNodeToWire(child, conditionIds)) };
}

/**
 * Serialize rule outcomes following the compatibility rule: a single outcome
 * uses legacy `logic` (preserving canonical identity); multiple outcomes use
 * `logic_clauses` plus an explicit relation or valid tree.
 */
export function mapRuleLogicToWireDraft(
  rule: Pick<Rule, "logic" | "logicClauses" | "logicRelation" | "logicGroupTree" | "logicGroupingErrors">,
): {
  logic?: ReturnType<typeof mapLogicToWire>;
  logic_clauses?: ReturnType<typeof mapLogicToWire>[];
  logic_relation?: GroupRelation;
  logic_grouping_tree?: WireGroupNode;
} {
  if (rule.logicGroupingErrors && rule.logicGroupingErrors.length > 0) {
    throw new GroupingValidationError(rule.logicGroupingErrors);
  }
  const clauses = rule.logicClauses ?? [];
  if (clauses.length <= 1) {
    return { logic: mapLogicToWire(clauses[0] ?? rule.logic) };
  }
  if (clauses.some((clause) => clause.format === "column")) {
    throw new GroupingValidationError([
      "Multiple grouped outcomes support value-against-column clauses only.",
    ]);
  }
  const resolved = resolveGroupedExpression(clauses, rule.logicRelation ?? null, rule.logicGroupTree ?? null, {
    label: "rule outcome grouping",
    requireExplicitForMultiple: true,
    allowLegacyAnd: false,
  });
  if (!resolved.valid) {
    throw new GroupingValidationError(resolved.errors);
  }
  return {
    logic_clauses: clauses.map(mapLogicToWire),
    ...(rule.logicRelation ? { logic_relation: rule.logicRelation } : {}),
    ...(rule.logicGroupTree
      ? { logic_grouping_tree: mapGroupNodeToWire(rule.logicGroupTree, new Map(
          clauses.map((clause, index) => [clause.id, `c${index}`]),
        )) }
      : {}),
  };
}

export function mapRuleToWireDraft(rule: Omit<Rule, "index"> & { index?: string }) {
  const conditionIds = new Map(rule.conditions.map((condition, index) => [condition.id, `c${index}`]));
  return {
    name: rule.name,
    ...(rule.description ? { description: rule.description } : {}),
    conditions: (rule.conditions ?? []).map(mapConditionToWire),
    ...(rule.conditionJoin && rule.conditionJoin !== "per_grouping"
      ? { condition_relation: rule.conditionJoin }
      : {}),
    // Always serialize the executable tree; never split a free-text
    // expression on whitespace (that loses grouping precedence).
    ...(rule.groupTree ? { grouping_tree: mapGroupNodeToWire(rule.groupTree, conditionIds) } : {}),
    ...mapRuleLogicToWireDraft(rule),
    extra_columns: rule.extraColumns ?? [],
    hide_comparison: rule.hideComparison ?? false,
  };
}

// --- Runs & results ------------------------------------------------------

export function mapRunRequestToWire(request: {
  sessionId: string;
  asOfDate?: string;
  comparisonColumns: string[];
  filters: FilterRow[];
  filterRelation?: GroupRelation | null;
  filterGroupTree?: GroupNode | null;
  filterGroupingErrors?: string[];
  filterGroupingRequired?: boolean;
  targetColumns: string[];
  keyColumns: string[];
  aggregationColumns: string[];
  aggregationColumnLabels?: Record<string, string>;
  nestedAggregationEnabled?: boolean;
  comparisonSections?: ComparisonSection[] | undefined;
  ruleIndexes: string[];
  exceptionColumns?: string[];
  commentaryColumns?: string[];
  newExceptionsOnly?: boolean;
  extraColumnDisplay?: import("./domain").ExtraColumnDisplay;
}): WireRunRequest {
  if (request.filterGroupingErrors && request.filterGroupingErrors.length > 0) {
    throw new GroupingValidationError(request.filterGroupingErrors);
  }
  const filterConfiguration = mapFilterConfigurationToWire(
    request.filters,
    request.filterRelation ?? null,
    request.filterGroupTree ?? null,
    {
      label: "row filter grouping",
      ...(request.filterGroupingRequired !== undefined
        ? { requireExplicitForMultiple: request.filterGroupingRequired }
        : {}),
    },
  );
  return {
    session_id: request.sessionId,
    ...(request.asOfDate ? { as_of_date: request.asOfDate } : {}),
    comparison_columns: [...request.comparisonColumns],
    target_columns: request.targetColumns.length > 0 ? request.targetColumns : null,
    // Always send `key_columns` as an array (even when empty) so the backend
    // can distinguish an explicit empty selection from omitted defaults. The
    // backend will reject an empty array with a 400; the UI prevents the user
    // from getting there by requiring at least one key column.
    key_columns: [...request.keyColumns],
    aggregation_columns: request.aggregationColumns,
    aggregation_column_labels: request.aggregationColumnLabels ?? {},
    nested_aggregation_enabled: request.nestedAggregationEnabled === true,
    comparison_sections: request.comparisonSections && request.comparisonSections.length > 0
      ? request.comparisonSections.map((s) => ({
          id: s.id,
          name: s.name,
          columns: [...s.columns],
          ...(s.extraColumns && s.extraColumns.length > 0
            ? { extra_columns: [...s.extraColumns] }
            : {}),
        }))
      : undefined,
    filters: filterConfiguration.rows,
    ...(filterConfiguration.relation
      ? { filter_relation: filterConfiguration.relation }
      : {}),
    ...(filterConfiguration.groupTree
      ? { filter_grouping_tree: filterConfiguration.groupTree }
      : {}),
    // Always serialize `rule_ids` as an array so the backend can distinguish
    // an explicit empty selection (zero rules) from an omitted/default-all
    // selection. Translating an empty array to `null` here would cause every
    // rule to run when the user deliberately deselected them all.
    rule_ids: [...request.ruleIndexes],
    ...(request.exceptionColumns && request.exceptionColumns.length > 0
      ? { exception_columns: [...request.exceptionColumns] }
      : {}),
    ...(request.commentaryColumns
      ? { commentary_template_columns: [...request.commentaryColumns] }
      : {}),
    new_exceptions_only: request.newExceptionsOnly !== false,
    ...(request.extraColumnDisplay ? { extra_column_display: {
      overall_result_page: request.extraColumnDisplay.overallResultPage,
      overall_html_report: request.extraColumnDisplay.overallHtmlReport,
      overall_excel_report: request.extraColumnDisplay.overallExcelReport,
      new_books_result_page: request.extraColumnDisplay.newBooksResultPage,
      new_books_html_report: request.extraColumnDisplay.newBooksHtmlReport,
      new_books_excel_report: request.extraColumnDisplay.newBooksExcelReport,
      exception_tables: request.extraColumnDisplay.exceptionTables,
    } } : {}),
  };
}

/** Keep grouped observations readable in inline and paginated exception tables. */
export function displayOutcomeValue(value: WireScalar | Record<string, WireScalar>): string | null {
  if (value !== null && typeof value === "object") {
    return Object.entries(value)
      .map(([column, observed]) => `${column}=${observed === null ? "(null)" : observed === "" ? '(blank)' : String(observed)}`)
      .join(", ");
  }
  return displayScalar(value);
}

function displayScalar(value: WireScalar): string | null {
  return value === null ? null : String(value);
}

function mapGroupingValues(values: Record<string, WireScalar> | undefined): Record<string, string | null> | undefined {
  if (!values || Object.keys(values).length === 0) return undefined;
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, displayScalar(v)]),
  );
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
  aggregationValues?: Record<string, string | null>,
  extraValues?: Record<string, string | null>,
): DetailRow {
  return {
    rowKey: `${rowKey}#${change.column}#${index}`,
    keyColumns: Object.fromEntries(Object.entries(keyColumns).map(([k, v]) => [k, displayScalar(v)])),
    column: change.column,
    file1Value: displayScalar(change.file_a_value),
    file2Value: displayScalar(change.file_b_value),
    ...(aggregationValues ? { aggregationValues } : {}),
    ...(extraValues ? { extraValues } : {}),
    kind: "changed",
  };
}

export function mapViolation(
  violation: MappableViolation,
  index: number,
  options: {
    ruleIdentifier?: string | null;
    keyColumnNames?: string[];
  } = {},
): DetailRow {
  const column = violation.violating_column ?? violation.rule_id;
  const violatingValue = violation.violating_value !== undefined
    ? displayOutcomeValue(violation.violating_value)
    : null;
  const comparisonValue = violation.comparison_value !== undefined
    ? displayScalar(violation.comparison_value)
    : null;
  const aggregationValues = mapGroupingValues(violation.grouping_values);
  const keyColumns = Object.fromEntries(
    Object.entries(violation.key_columns).map(([k, v]) => [k, displayScalar(v)]),
  );
  const exceptionId = resolveExceptionId(
    violation.exception_id,
    options.ruleIdentifier ?? violation.rule_identifier,
    options.keyColumnNames ?? Object.keys(violation.key_columns),
    keyColumns,
  );
  const row: DetailRow = {
    rowKey: `${rowKeyOf(violation.key_columns, violation.row_index)}#${index}`,
    ...(exceptionId ? { exceptionId } : {}),
    keyColumns,
    column,
    file1Value: comparisonValue,
    file2Value: violatingValue,
    kind: "exception",
    ...(violation.violating_column ? { violatingColumn: violation.violating_column } : {}),
    ...(violation.violating_value !== undefined
      ? { violatingValue: displayOutcomeValue(violation.violating_value) }
      : {}),
    ...(violation.extra_values
      ? {
          extraValues: Object.fromEntries(
            Object.entries(violation.extra_values).map(([key, value]) => [key, displayScalar(value)]),
          ),
        }
      : {}),
    ...(aggregationValues ? { aggregationValues } : {}),
  };
  // Rule-evolution review state rides the violation through to rendered
  // results + reloaded historical reports; a current-catalog lookup must
  // never overwrite these persisted historical definitions.
  const reviewStatus = normalizeReviewStatus(
    (violation as { exception_status?: unknown }).exception_status,
  );
  if (reviewStatus) row.exceptionStatus = reviewStatus;
  const provenance = violation as {
    recertification_required?: unknown;
    recertification_reason?: unknown;
    carried_from_exception_id?: unknown;
    carried_from_as_of_date?: unknown;
    carried_from_rule_identifier?: unknown;
    rule_evolution_event_id?: unknown;
    recertified_at?: unknown;
  };
  if (provenance.recertification_required === true) {
    row.exceptionStatus = "RecertificationRequired";
  }
  if (typeof provenance.recertification_reason === "string" && provenance.recertification_reason) {
    row.recertificationReason = provenance.recertification_reason;
  }
  if (typeof provenance.carried_from_exception_id === "string") {
    row.carriedFromExceptionId = provenance.carried_from_exception_id;
  }
  if (typeof provenance.carried_from_as_of_date === "string") {
    row.carriedFromAsOfDate = provenance.carried_from_as_of_date;
  }
  if (typeof provenance.carried_from_rule_identifier === "string") {
    row.carriedFromRuleIdentifier = provenance.carried_from_rule_identifier;
  }
  if (typeof provenance.rule_evolution_event_id === "string") {
    row.ruleEvolutionEventId = provenance.rule_evolution_event_id;
  }
  if (typeof provenance.recertified_at === "string") {
    row.recertifiedAt = provenance.recertified_at;
  }
  return row;
}

export function mapRunDocumentToResult(doc: WireRunDocument | LegacyWireRunDocument): RunResult {
  const result = doc.result;
  const validation = result.validation;
  const newExceptionsOnly = doc.new_exceptions_only ?? result.new_exceptions_only;

  // Prefer the backend's explicit distinct counts; fall back to a local
  // derivation only if the server omitted them.
  const violationsByRule = validation.violations_by_rule as Record<string, MappableViolation[]>;
  const distinctViolationRowCount =
    validation.distinct_violating_rows ?? countDistinctViolationRows(violationsByRule);
  const distinctViolationAttributeCount =
    validation.distinct_violating_attributes ?? validation.total_violations;

  const overall: OverallSummary = {
    recordsLoaded: result.comparison.total_rows_a + result.comparison.total_rows_b,
    ruleViolationRowCount: distinctViolationRowCount,
    ruleViolationAttributeCount: distinctViolationAttributeCount,
    changedRowCount: result.comparison.rows_with_changes,
    changedAttributeCount: result.comparison.total_attribute_changes,
    ...(result.comparison.new_book_count !== undefined
      ? { newBookCount: result.comparison.new_book_count }
      : {}),
  };

  // Per-rule results.
  const ruleResults: RuleResult[] = Object.entries(violationsByRule).sort(([a], [b]) => compareRuleIndices(a, b)).map(
    ([ruleId, violations]) => {
      const perRuleRowCount =
        validation.violating_rows_by_rule?.[ruleId] ?? countDistinctRowsForViolations(violations);
      const perRuleAttributeCount =
        validation.violating_attributes_by_rule?.[ruleId] ?? violations.length;
      const sample = violations[0];
      const persistedSummary = validation.rule_summaries?.[ruleId];
      const ruleIdentifier =
        sample?.rule_identifier
        ?? result.rule_bindings?.[ruleId]
        ?? persistedSummary?.rule_identifier
        ?? null;
      return {
        ruleIndex: ruleId,
        ruleIdentifier,
        ruleName: persistedSummary?.name ?? sample?.rule_name ?? ruleId,
        ...(persistedSummary?.description
          ? { ruleDescription: persistedSummary.description }
          : {}),
        logicSummary: humanizeRuleLogic(
          persistedSummary?.logic ?? describeRuleLogicFromViolations(violations, ruleId),
        ),
        ...(persistedSummary?.condition
          ? { conditionSummary: persistedSummary.condition }
          : {}),
        ...(persistedSummary?.condition_grouping
          ? { conditionGroupingSummary: persistedSummary.condition_grouping }
          : {}),
        ...(persistedSummary?.condition_clauses ? { conditionClauses: persistedSummary.condition_clauses } : {}),
        ...(persistedSummary?.expectation_clauses ? { expectationClauses: persistedSummary.expectation_clauses } : {}),
        ...(persistedSummary?.condition_groupings !== undefined ? { conditionGroupings: persistedSummary.condition_groupings } : {}),
        ...(persistedSummary?.expectation_groupings !== undefined ? { expectationGroupings: persistedSummary.expectation_groupings } : {}),
        ...(persistedSummary?.condition_tree !== undefined ? { conditionTree: persistedSummary.condition_tree } : {}),
        ...(persistedSummary?.expectation_tree !== undefined ? { expectationTree: persistedSummary.expectation_tree } : {}),
        violationRowCount: perRuleRowCount,
        violationAttributeCount: perRuleAttributeCount,
        details: violations.map((v, i) =>
          mapViolation(v, i, {
            ruleIdentifier,
            ...(result.key_columns && result.key_columns.length > 0
              ? { keyColumnNames: result.key_columns }
              : {}),
          }),
        ),
        hideComparison: persistedSummary?.hide_comparison ?? false,
      };
    },
  );

  const filterConfiguration = mapWireFilterConfiguration(
    result.filters_applied ?? [],
    result.filter_relation,
    result.filter_grouping_tree,
    { idPrefix: "fl", label: "saved row filter grouping" },
  );

  // Flatten comparison attribute changes into detail rows.
  const changeDetails: DetailRow[] = [];
  let attrIndex = 0;
  for (const detail of result.comparison.row_details) {
    const rk = rowKeyOf(detail.key_columns, detail.row_index);
    const aggVals = mapGroupingValues(detail.grouping_values);
    const extraVals = detail.extra_values
      ? Object.fromEntries(
          Object.entries(detail.extra_values).map(([key, value]) => [key, displayScalar(value)]),
        )
      : undefined;
    for (const change of detail.attribute_changes) {
      changeDetails.push(
        mapAttributeChange(change, rk, detail.key_columns, attrIndex++, aggVals, extraVals),
      );
    }
  }

  // Append new-book rows (kind="added") for B-only records.
  const newBookDetails = result.comparison.new_book_details ?? [];
  for (let i = 0; i < newBookDetails.length; i++) {
    const nb = newBookDetails[i]!;
    const row: DetailRow = {
      rowKey: `newbook#${nb.row_index}#${i}`,
      keyColumns: Object.fromEntries(
        Object.entries(nb.key_columns).map(([k, v]) => [k, displayScalar(v)]),
      ),
      column: "",
      file1Value: null,
      file2Value: null,
      kind: "added",
    };
    const aggVals = mapGroupingValues(nb.grouping_values);
    if (aggVals) row.aggregationValues = aggVals;
    if (nb.extra_values) {
      row.extraValues = Object.fromEntries(
        Object.entries(nb.extra_values).map(([k, v]) => [k, displayScalar(v)]),
      );
    }
    changeDetails.push(row);
  }

  return {
    id: doc.run_id,
    reportName: doc.report_name,
    createdAt: doc.created_at,
    ...(doc.as_of_date ? { asOfDate: doc.as_of_date } : {}),
    file1Name: doc.file_a_name,
    file2Name: doc.file_b_name,
    overall,
    ruleResults,
    changeDetails,
    ...((result.target_columns ?? result.common_columns).length > 0
      ? { comparisonColumns: result.target_columns ?? result.common_columns }
      : {}),
    ...(result.group_statistics
      ? { groupStatistics: mapGroupStatisticsBundle(result.group_statistics) }
      : {}),
    ...(result.filters_applied
      ? {
          filtersApplied: filterConfiguration.filters,
          ...(result.filter_relation !== undefined
            ? { filtersRelation: filterConfiguration.relation }
            : {}),
          ...(result.filter_grouping_tree !== undefined
            ? { filtersGroupTree: filterConfiguration.groupTree }
            : {}),
          ...(filterConfiguration.errors.length > 0
            ? { filtersGroupingErrors: filterConfiguration.errors }
            : {}),
        }
      : {}),
    ...(result.nested_aggregation_enabled !== undefined
      ? { nestedAggregationEnabled: result.nested_aggregation_enabled }
      : {}),
    ...(result.comparison_sections
      ? { comparisonSections: result.comparison_sections.map((s) => ({
          id: s.id,
          name: s.name,
          columns: [...s.columns],
          ...(s.extra_columns && s.extra_columns.length > 0
            ? { extraColumns: [...s.extra_columns] }
            : {}),
        })) }
      : {}),
    ...(result.aggregation_columns && result.aggregation_columns.length > 0
      ? { aggregationColumns: [...result.aggregation_columns] }
      : {}),
    ...(result.aggregation_column_labels
      ? { aggregationColumnLabels: { ...result.aggregation_column_labels } }
      : {}),
    ...(result.key_columns && result.key_columns.length > 0
      ? { keyColumns: [...result.key_columns] }
      : {}),
    ...(result.exception_columns && result.exception_columns.length > 0
      ? { exceptionColumns: [...result.exception_columns] }
      : {}),
    ...(result.commentary_template_columns
      ? { commentaryColumns: [...result.commentary_template_columns] }
      : {}),
    ...(newExceptionsOnly !== undefined ? { newExceptionsOnly } : {}),
    ...(result.extra_column_display ? { extraColumnDisplay: {
      overallResultPage: result.extra_column_display.overall_result_page,
      overallHtmlReport: result.extra_column_display.overall_html_report,
      overallExcelReport: result.extra_column_display.overall_excel_report,
      newBooksResultPage: result.extra_column_display.new_books_result_page,
      newBooksHtmlReport: result.extra_column_display.new_books_html_report,
      newBooksExcelReport: result.extra_column_display.new_books_excel_report,
      exceptionTables: result.extra_column_display.exception_tables,
    } } : {}),
    ...(result.rule_bindings ? { ruleBindings: { ...result.rule_bindings } } : {}),
  };
}

function mapGroupStatisticsRow(row: WireGroupStatisticsRow): GroupStatRow {
  return {
    value: row.value,
    uniqueCount: row.unique_count,
    attributeCount: row.attribute_count,
  };
}

function mapGroupStatistics(stat: WireGroupStatistics): GroupStat {
  return {
    column: stat.column,
    uniqueCount: stat.unique_count,
    attributeCount: stat.attribute_count,
    rows: stat.rows.map(mapGroupStatisticsRow),
  };
}

function mapGroupStatisticsBundle(bundle: WireGroupStatisticsBundle): GroupStatisticsBundle {
  return {
    overall: bundle.overall.map(mapGroupStatistics),
    attributeChanges: bundle.attribute_changes.map(mapGroupStatistics),
    validationRules: Object.fromEntries(
      Object.entries(bundle.validation_rules).map(([ruleId, stats]) => [
        ruleId,
        stats.map(mapGroupStatistics),
      ]),
    ),
    ...(bundle.new_books ? { newBooks: bundle.new_books.map(mapGroupStatistics) } : {}),
  };
}

function describeRuleLogicFromViolations(violations: MappableViolation[], ruleId: string): string {
  if (violations.length === 0) return `${ruleId} — no exception; rule details unavailable for this older run`;
  const first = violations[0]!;
  if (first.rule_logic) return `${ruleId} — ${first.rule_name}: ${first.rule_logic}`;
  return `${ruleId} — ${first.rule_name}: ${first.details.replace(/^Violated\s+/i, "did not match ")}`;
}

function humanizeRuleLogic(summary: string): string {
  const operators: Array<[RegExp, string]> = [
    [/\bncontains\b/g, "does not contain"],
    [/\bcontains\b/g, "contains"],
    [/\bneq\b/g, "does not equal"],
    [/\bgte\b/g, "greater than or equal to"],
    [/\blte\b/g, "less than or equal to"],
    [/\bgt\b/g, "greater than"],
    [/\blt\b/g, "less than"],
    [/\beq\b/g, "equals"],
  ];
  return operators.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), summary);
}

/** Local fallback for distinct-violating-row counts. The backend should
 *  already provide these; the derivation here only runs when it doesn't. */
function countDistinctViolationRows(byRule: Record<string, MappableViolation[]>): number {
  const set = new Set<string>();
  for (const violations of Object.values(byRule)) {
    for (const v of violations) set.add(rowKeyOf(v.key_columns, v.row_index));
  }
  return set.size;
}

function countDistinctRowsForViolations(violations: MappableViolation[]): number {
  const set = new Set<string>();
  for (const v of violations) set.add(rowKeyOf(v.key_columns, v.row_index));
  return set.size;
}

export function mapRunMetadata(meta: WireRunMetadata): RunSummary {
  return {
    id: meta.run_id,
    reportName: meta.report_name,
    createdAt: meta.created_at,
    ...(meta.as_of_date ? { asOfDate: meta.as_of_date } : {}),
    file1Name: meta.file_a_name,
    file2Name: meta.file_b_name,
  };
}

export function mapRunDocumentMetadata(doc: WireRunDocument): RunSummary {
  return {
    id: doc.run_id,
    reportName: doc.report_name,
    createdAt: doc.created_at,
    ...(doc.as_of_date ? { asOfDate: doc.as_of_date } : {}),
    file1Name: doc.file_a_name,
    file2Name: doc.file_b_name,
  };
}

// --- Settings, saved filters, presets -----------------------------------

export function mapSettings(wire: WireSettings): AppSettings {
  return {
    applicationName: wire.application_name,
    defaultRemotePath: wire.default_remote_path,
    ruleConfigPath: wire.rule_config_path,
    rowsAndColumnsConfigPath: wire.rows_and_columns_config_path,
    filterConfigPath: wire.filter_config_path,
    familyConfigPath: wire.family_config_path,
    fullSetConfirmationRows: wire.full_set_confirmation_rows,
    runHistoryPath: wire.run_history_path,
    exceptionTrackingPath: wire.exception_tracking_path,
  };
}

export function mapSettingsToWire(settings: AppSettings): WireSettings {
  return {
    application_name: settings.applicationName,
    default_remote_path: settings.defaultRemotePath,
    rule_config_path: settings.ruleConfigPath,
    rows_and_columns_config_path: settings.rowsAndColumnsConfigPath,
    filter_config_path: settings.filterConfigPath,
    family_config_path: settings.familyConfigPath,
    full_set_confirmation_rows: settings.fullSetConfirmationRows,
    run_history_path: settings.runHistoryPath,
    exception_tracking_path: settings.exceptionTrackingPath,
  };
}

// --- Exception tracking --------------------------------------------------

function displayScalarValue(value: string | number | boolean | null): string {
  if (value === null) return "";
  return String(value);
}

/** Render the documented lossless `key_columns` representation for display. */
export function formatKeyColumns(value: WireTrackedException["key_columns"]): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((item) => displayScalarValue(item)).join(", ");
  }
  return Object.entries(value)
    .map(([key, item]) => `${key}=${displayScalarValue(item)}`)
    .join(", ");
}

function fallbackExceptionStatus(
  exception: WireTrackedException,
): ExceptionStatus {
  // A pending recertification is never inferred as accepted commentary, even
  // when the carried text is nonblank: it stays reviewable until the user
  // explicitly recertifies it.
  if (exception.recertification_required === true) return "RecertificationRequired";
  if ((exception.exception_commentary ?? "").trim().length > 0) return "Commented";
  return exception.exception_first_seen_as_of_date === exception.exception_as_of_date
    ? "New"
    : "NotCommented";
}

/**
 * Normalise a backend-supplied review status from a run/violation payload.
 * Unknown or absent values stay undefined so the row remains visible rather
 * than being hidden by a guessed scope decision.
 */
export function normalizeReviewStatus(value: unknown): ExceptionStatus | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.replace(/[\s_-]/g, "").toLowerCase();
  if (compact === "new") return "New";
  if (compact === "commented") return "Commented";
  if (compact === "notcommented") return "NotCommented";
  if (compact === "recertificationrequired") return "RecertificationRequired";
  return undefined;
}

export function mapTrackedException(wire: WireTrackedException): TrackedException {
  const detailValues = Object.fromEntries(
    Object.entries(wire.detail_values ?? wire.extra_values ?? {}).map(([key, value]) => [
      key,
      value === null ? "" : String(value),
    ]),
  );
  const explicit = wire.status;
  const recertificationRequired =
    wire.recertification_required === true || explicit === "RecertificationRequired";
  const exception: TrackedException = {
    exceptionId: wire.exception_id,
    exceptionRuleIdentifier: wire.exception_rule_identifier,
    ruleIndex: wire.rule_index ?? "",
    keyColumns: formatKeyColumns(wire.key_columns),
    exceptionTimestamp: wire.exception_timestamp,
    exceptionCommentary: wire.exception_commentary ?? "",
    exceptionAsOfDate: wire.exception_as_of_date,
    exceptionFirstSeenAsOfDate: wire.exception_first_seen_as_of_date,
    exceptionLastSeenAsOfDate: wire.exception_last_seen_as_of_date,
    detailValues,
    status: explicit ?? fallbackExceptionStatus({ ...wire, recertification_required: recertificationRequired }),
    recertificationRequired,
    recertificationReason: wire.recertification_reason ?? null,
  };
  if (wire.carried_from_exception_id) {
    exception.carriedFromExceptionId = wire.carried_from_exception_id;
  }
  if (wire.carried_from_as_of_date) {
    exception.carriedFromAsOfDate = wire.carried_from_as_of_date;
  }
  if (wire.carried_from_rule_identifier) {
    exception.carriedFromRuleIdentifier = wire.carried_from_rule_identifier;
  }
  if (wire.rule_evolution_event_id) {
    exception.ruleEvolutionEventId = wire.rule_evolution_event_id;
  }
  if (wire.recertified_at) {
    exception.recertifiedAt = wire.recertified_at;
  }
  if (wire.revision_token) {
    exception.revisionToken = wire.revision_token;
  }
  if (wire.exception_first_seen_timestamp) {
    exception.exceptionFirstSeenTimestamp = wire.exception_first_seen_timestamp;
  }
  if (wire.exception_last_seen_timestamp) {
    exception.exceptionLastSeenTimestamp = wire.exception_last_seen_timestamp;
  }
  return exception;
}

export function mapTrackingDates(wire: WireExceptionTrackingDates): ExceptionTrackingDates {
  const raw = wire.dates ?? wire.available_dates ?? [];
  const dates = [...new Set(raw)].sort((a, b) => b.localeCompare(a));
  return {
    dates,
    defaultDate: wire.default_as_of_date ?? wire.default_date ?? null,
  };
}

export function mapExceptionTrackingList(
  wire: WireExceptionTrackingList,
): import("./domain").ExceptionTrackingResult {
  if (Array.isArray(wire)) {
    const exceptions = wire.map(mapTrackedException);
    const detailColumns = exceptionDetailColumnUnion(exceptions);
    return {
      asOfDate: wire[0]?.exception_as_of_date ?? null,
      exceptions,
      detailColumns,
      carryWarnings: [],
      total: exceptions.length,
      unfilteredTotal: exceptions.length,
      offset: 0,
      limit: exceptions.length,
      hasMore: false,
      sort: null,
      order: "asc",
      columns: fallbackTrackingColumns(detailColumns),
      availableFilters: {},
    };
  }
  const exceptions = wire.exceptions.map(mapTrackedException);
  const declared = wire.detail_columns ?? wire.available_columns;
  const detailColumns = declared && declared.length > 0
    ? [...declared]
    : exceptionDetailColumnUnion(exceptions);
  return {
    asOfDate: wire.as_of_date ?? null,
    exceptions,
    detailColumns,
    carryWarnings: [...(wire.carry_warnings ?? [])],
    total: wire.total ?? exceptions.length,
    unfilteredTotal: wire.unfiltered_total ?? wire.total ?? exceptions.length,
    offset: wire.offset ?? 0,
    limit: wire.limit ?? exceptions.length,
    hasMore: wire.has_more ?? false,
    sort: wire.sort ?? null,
    order: wire.order ?? "asc",
    columns: wire.columns ?? fallbackTrackingColumns(detailColumns),
    availableFilters: wire.available_filters ?? {},
  };
}

function fallbackTrackingColumns(detailColumns: string[]): import("./domain").ExceptionTrackingColumn[] {
  const standard: Array<[string, string, boolean]> = [
    ["exception_id", "Exception ID", true],
    ["status", "Exception Status", true],
    ["recertification", "Recertification", false],
    ["commentary", "Commentary", true],
    ["rule_index", "Rule Index", true],
    ["exception_rule_identifier", "Exception Rule Identifier", false],
    ["key_columns", "Key Columns", false],
    ["exception_timestamp", "Exception Timestamp", false],
    ["exception_as_of_date", "Exception As-of Date", false],
    ["exception_first_seen_as_of_date", "Exception First Seen As-of Date", false],
    ["exception_last_seen_as_of_date", "Exception Last Seen As-of Date", false],
    ["carried_from_exception_id", "Carried From Exception ID", false],
    ["carried_from_as_of_date", "Carried From As-of Date", false],
    ["carried_from_rule_identifier", "Carried From Rule Identifier", false],
    ["rule_evolution_event_id", "Rule Evolution Event ID", false],
  ];
  return [
    ...standard.map(([key, label, visible]) => ({
      key, label, visible, sortable: true, filterable: true, source: "standard" as const,
    })),
    ...detailColumns.map((label) => ({
      key: `detail:${label}`,
      label,
      visible: false,
      sortable: true,
      filterable: true,
      source: "detail" as const,
    })),
  ];
}

function exceptionDetailColumnUnion(exceptions: TrackedException[]): string[] {
  const columns: string[] = [];
  for (const exception of exceptions) {
    for (const column of Object.keys(exception.detailValues)) {
      if (!columns.includes(column)) columns.push(column);
    }
  }
  return columns;
}

export function mapCommentaryImportResult(
  wire: {
    as_of_date?: string | undefined;
    updated?: number | undefined;
    updated_count?: number | undefined;
    cleared?: number | undefined;
    unchanged?: number | undefined;
    imported?: number | undefined;
    message?: string | undefined;
    carry_warnings?: string[] | undefined;
  },
): CommentaryImportResult {
  return {
    asOfDate: wire.as_of_date ?? null,
    updatedCount: wire.updated ?? wire.updated_count ?? wire.imported ?? 0,
    clearedCount: wire.cleared ?? 0,
    unchangedCount: wire.unchanged ?? 0,
    message: wire.message ?? null,
    carryWarnings: [...(wire.carry_warnings ?? [])],
  };
}

export function mapRecertifyResult(wire: {
  as_of_date?: string | undefined;
  accepted?: string[] | undefined;
  already_accepted?: string[] | undefined;
  total?: number | undefined;
  exceptions?: WireTrackedException[] | undefined;
  message?: string | undefined;
}): RecertifyResult {
  return {
    asOfDate: wire.as_of_date ?? null,
    accepted: [...(wire.accepted ?? [])],
    alreadyAccepted: [...(wire.already_accepted ?? [])],
    total: wire.total ?? 0,
    exceptions: (wire.exceptions ?? []).map(mapTrackedException),
    message: wire.message ?? null,
  };
}

export function mapRuleHistory(wire: WireRuleHistoryResponse): RuleHistory {
  return {
    ruleId: wire.rule_id,
    lineageId: wire.lineage_id,
    revisionNumber: wire.revision_number,
    events: wire.events.map(mapRuleHistoryEvent),
  };
}

export function mapRuleHistoryEvent(wire: WireRuleHistoryEvent): RuleHistoryEvent {
  return {
    eventId: wire.event_id,
    lineageId: wire.lineage_id,
    revisionNumber: wire.revision_number,
    ...(wire.previous_event_id !== undefined && wire.previous_event_id !== null
      ? { previousEventId: wire.previous_event_id }
      : {}),
    ...(wire.source_catalog_rule_id ? { sourceCatalogRuleId: wire.source_catalog_rule_id } : {}),
    ...(wire.target_catalog_rule_id ? { targetCatalogRuleId: wire.target_catalog_rule_id } : {}),
    ...(wire.source_identifier ? { sourceIdentifier: wire.source_identifier } : {}),
    ...(wire.target_identifier ? { targetIdentifier: wire.target_identifier } : {}),
    changeType: wire.change_type,
    ...(wire.save_decision !== undefined && wire.save_decision !== null
      ? { saveDecision: wire.save_decision }
      : {}),
    ...(wire.before_payload !== undefined ? { beforePayload: wire.before_payload } : {}),
    ...(wire.after_payload !== undefined ? { afterPayload: wire.after_payload } : {}),
    changeSummary: [...wire.change_summary],
    ...(wire.commentary_policy !== undefined && wire.commentary_policy !== null
      ? { commentaryPolicy: wire.commentary_policy }
      : {}),
    ...(wire.source ? { source: wire.source } : {}),
    createdAt: wire.created_at,
    ...(wire.changed_by ? { changedBy: wire.changed_by } : {}),
  };
}

export function mapFamily(wire: WireFamily): Family {
  if (wire.kind === "column") {
    return { kind: "column", name: wire.name, columns: wire.columns };
  }
  return { kind: "value", name: wire.name, owners: wire.owners, values: wire.values };
}

export function mapFamilyToWire(family: Family): WireFamily {
  if (family.kind === "column") {
    return { kind: "column", name: family.name, columns: family.columns };
  }
  return { kind: "value", name: family.name, owners: family.owners, values: family.values };
}

export function mapSavedFilter(wire: WireSavedFilter): SavedFilter {
  const configuration = mapWireFilterConfiguration(
    wire.rows,
    wire.filter_relation,
    wire.filter_grouping_tree,
    { idPrefix: "f", label: "saved filter grouping" },
  );
  return {
    id: wire.id,
    name: wire.name,
    rows: configuration.filters,
    relation: configuration.relation,
    groupTree: configuration.groupTree,
    ...(configuration.errors.length > 0
      ? { groupingErrors: configuration.errors }
      : {}),
  };
}

export function mapSavedFilterToWire(filter: Omit<SavedFilter, "id"> & { id?: string }): {
  name: string;
  rows: WireFilterRow[];
  filter_relation?: GroupRelation;
  filter_grouping_tree?: WireGroupNode;
} {
  if (filter.groupingErrors && filter.groupingErrors.length > 0) {
    throw new GroupingValidationError(filter.groupingErrors);
  }
  const configuration = mapFilterConfigurationToWire(
    filter.rows,
    filter.relation ?? null,
    filter.groupTree ?? null,
    { label: "saved filter grouping" },
  );
  return {
    name: filter.name,
    rows: configuration.rows,
    ...(configuration.relation ? { filter_relation: configuration.relation } : {}),
    ...(configuration.groupTree
      ? { filter_grouping_tree: configuration.groupTree }
      : {}),
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
