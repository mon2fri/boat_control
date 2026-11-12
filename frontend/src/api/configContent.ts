import type {
  ColumnFamily,
  Condition,
  Family,
  FilterRow,
  FilterGroupingMode,
  GroupNode,
  GroupRelation,
  LogicClause,
  LogicOperator,
  Rule,
  RuleDraft,
  ValueFamily,
} from "./domain";
import type { ExtraColumnDisplay } from "./domain";
import {
  GroupingValidationError,
  resolveGroupedExpression,
  toPersistedGroupingTree,
} from "../lib/grouping";

/**
 * Tagged column reference used in saved configs.
 * - `string` — legacy bare column name
 * - `{kind:"column", name}` — explicit column reference
 * - `{kind:"column_family", name}` — Column Family reference
 */
export type ColumnRef =
  | string
  | { kind: "column"; name: string }
  | { kind: "column_family"; name: string };

/**
 * Tagged value reference used in saved rule configs.
 * - `string` — legacy bare value
 * - `{kind:"values", values}` — explicit value array
 * - `{kind:"value_family", name}` — Value Family reference
 */
export type ValueRef =
  | string
  | { kind: "values"; values: string[] }
  | { kind: "value_family"; name: string };

/** Filter row within a saved rows/columns config (column may be a family ref). */
export interface ConfigFilterRow {
  column: ColumnRef;
  operator: string;
  filter_value?: string;
  filter_values?: string[];
}

/** Schema for saved rows-and-columns config content. */
export interface RowsColumnsConfigContent {
  comparisonColumns?: ColumnRef[];
  keyColumns?: ColumnRef[];
  aggregationColumns?: ColumnRef[];
  aggregationColumnLabels?: Record<string, string>;
  filters?: ConfigFilterRow[];
  /** Flat filter joiner. Absent keeps legacy AND. */
  filterRelation?: GroupRelation;
  /** Persisted filter grouping tree with indexed `cN` leaf references. */
  filterGroupingTree?: ConfigGroupNode;
  targetColumns?: ColumnRef[];
  /** Extra columns selected for result and report display. */
  extraColumns?: ColumnRef[];
  /** Legacy name retained so existing rows-and-columns configs still load. */
  exceptionColumns?: ColumnRef[];
  /** Ordered source columns appended to the commentary template and tracking table. */
  commentaryTemplateColumns?: ColumnRef[];
  extraColumnDisplay?: ExtraColumnDisplay | undefined;
  /** When true, aggregation columns form an ordered hierarchy shown as a tree. */
  nestedAggregationEnabled?: boolean;
  /** User-defined comparison sections, each with a name and column set. */
  comparisonSections?: ComparisonSectionContent[];
}

/** Persisted grouping node used inside named configuration files. */
export type ConfigGroupNode =
  | { kind: "leaf"; conditionId: string }
  | { kind: "and"; children: ConfigGroupNode[] }
  | { kind: "or"; children: ConfigGroupNode[] };

/** A user-defined comparison section within a saved config. */
export interface ComparisonSectionContent {
  id: string;
  name: string;
  columns: ColumnRef[];
  extraColumns?: ColumnRef[];
}

/** Warning emitted during config loading. */
export interface ConfigLoadWarning {
  type: "missing_family" | "zero_member_family" | "partial_family" | "excluded_column" | "invalid_grouping";
  message: string;
}

/** A resolved comparison section with concrete column names. */
export interface ResolvedComparisonSection {
  id: string;
  name: string;
  columns: string[];
  extraColumns: string[];
}

/** Resolved config load result with warnings. */
export interface ConfigLoadResult {
  comparisonColumns: string[];
  keyColumns: string[];
  aggregationColumns: string[];
  aggregationColumnLabels: Record<string, string>;
  filters: FilterRow[];
  filterRelation: GroupRelation | null;
  filterGroupTree: GroupNode | null;
  filterGroupingErrors: string[];
  targetColumns: string[];
  exceptionColumns: string[];
  commentaryColumns: string[];
  extraColumnDisplay: ExtraColumnDisplay;
  nestedAggregationEnabled: boolean;
  comparisonSections: ResolvedComparisonSection[];
  warnings: ConfigLoadWarning[];
}

const CONFIG_TO_DOMAIN_OPERATOR: Record<string, LogicOperator> = {
  eq: "equals",
  neq: "not_equals",
  contains: "contains",
  ncontains: "not_contains",
  gt: "greater_than",
  lt: "less_than",
  gte: "greater_than",
  lte: "less_than",
};

function nullOrUndefined(v: unknown): v is null | undefined {
  return v === null || v === undefined;
}

/** True when `v` is a tagged Column Family reference. */
function isColumnFamilyRef(v: ColumnRef): v is { kind: "column_family"; name: string } {
  return typeof v === "object" && v !== null && v.kind === "column_family";
}

/** True when `v` is a tagged single-column reference. */
function isExplicitColumnRef(v: ColumnRef): v is { kind: "column"; name: string } {
  return typeof v === "object" && v !== null && v.kind === "column";
}

/** Resolve a single ColumnRef against known families and currently available columns. */
export function resolveColumnRef(
  ref: ColumnRef,
  families: Family[],
  availableColumns: string[],
): { resolved: string[]; warnings: ConfigLoadWarning[] } {
  if (typeof ref === "string") {
    const col = ref.trim();
    if (!col) return { resolved: [], warnings: [] };
    if (availableColumns.includes(col)) {
      return { resolved: [col], warnings: [] };
    }
    return {
      resolved: [],
      warnings: [{ type: "excluded_column", message: `Column "${col}" is not available in the current selection.` }],
    };
  }

  if (!ref || nullOrUndefined(ref.kind)) {
    return { resolved: [], warnings: [] };
  }

  if (isExplicitColumnRef(ref)) {
    const col = ref.name.trim();
    if (!col) return { resolved: [], warnings: [] };
    if (availableColumns.includes(col)) {
      return { resolved: [col], warnings: [] };
    }
    return {
      resolved: [],
      warnings: [{ type: "excluded_column", message: `Column "${col}" is not available in the current selection.` }],
    };
  }

  if (isColumnFamilyRef(ref)) {
    const family = families.find(
      (f): f is ColumnFamily => f.kind === "column" && f.name === ref.name,
    );
    if (!family) {
      return {
        resolved: [],
        warnings: [{ type: "missing_family", message: `Column family "${ref.name}" not found.` }],
      };
    }
    const available = family.columns.filter((c) => availableColumns.includes(c));
    if (available.length === 0) {
      return {
        resolved: [],
        warnings: [{
          type: "zero_member_family",
          message: `Column family "${ref.name}" has no available members in the current selection.`,
        }],
      };
    }
    const missing = family.columns.filter((c) => !availableColumns.includes(c));
    const warnings: ConfigLoadWarning[] = [];
    if (missing.length > 0) {
      warnings.push({
        type: "partial_family",
        message: `Column family "${ref.name}": members [${missing.join(", ")}] are not available in the current selection.`,
      });
    }
    return { resolved: available, warnings };
  }

  return {
    resolved: [],
    warnings: [{ type: "missing_family", message: `Unknown column reference: ${JSON.stringify(ref)}` }],
  };
}

/** Resolve a single ValueRef against known families. */
export function resolveValueRef(ref: ValueRef, families: Family[]): string[] {
  if (typeof ref === "string") return [ref];
  if (ref.kind === "values") return ref.values;
  if (ref.kind === "value_family") {
    const family = families.find(
      (f): f is ValueFamily => f.kind === "value" && f.name === ref.name,
    );
    return family ? [...family.values] : [];
  }
  return [];
}

/** Resolve a config filter row to a domain FilterRow (or null if unresolvable). */
export function resolveConfigFilterRow(
  row: ConfigFilterRow,
  families: Family[],
  availableColumns: string[],
): { resolved: FilterRow | null; warnings: ConfigLoadWarning[] } {
  const colResult = resolveColumnRef(row.column, families, availableColumns);
  if (colResult.resolved.length === 0) {
    return { resolved: null, warnings: colResult.warnings };
  }

  if (!colResult.resolved[0]) {
    return { resolved: null, warnings: colResult.warnings };
  }
  const values = row.filter_values ?? (row.filter_value ? [row.filter_value] : []);
  return {
    resolved: {
      id: "",
      column: colResult.resolved[0],
      // Saved configs may spell the operator either way: the wire form
      // (`eq`/`neq`/`contains`/`ncontains`) or the domain form
      // (`equals`/`not_equals`/...). Normalise the wire spelling like the
      // condition loader does; an unrecognised value keeps the raw text so it
      // is never silently turned into a different comparison.
      operator: (CONFIG_TO_DOMAIN_OPERATOR[row.operator] ??
        row.operator) as FilterRow["operator"],
      values,
    },
    warnings: colResult.warnings,
  };
}

/** Full resolver for rows-and-columns config content. */
export function resolveRowsColumnsConfig(
  content: unknown,
  families: Family[],
  availableColumns: string[],
): ConfigLoadResult {
  const data = content as RowsColumnsConfigContent | null | undefined;
  const warnings: ConfigLoadWarning[] = [];

  const comparisonColumns: string[] = [];
  const keyColumns: string[] = [];
  const aggregationColumns: string[] = [];
  const aggregationColumnLabels: Record<string, string> = {};
  const filters: FilterRow[] = [];
  const unresolvedFilterErrors: string[] = [];
  const targetColumns: string[] = [];
  let nestedAggregationEnabled = false;
  const comparisonSections: ResolvedComparisonSection[] = [];

  if (!data) {
    return { comparisonColumns: [], keyColumns: [], aggregationColumns: [], aggregationColumnLabels, filters: [], filterRelation: null, filterGroupTree: null, filterGroupingErrors: [], targetColumns: [], exceptionColumns: [], commentaryColumns: [], extraColumnDisplay: { overallResultPage: false, overallHtmlReport: false, overallExcelReport: false, newBooksResultPage: false, newBooksHtmlReport: false, newBooksExcelReport: false, exceptionTables: true }, nestedAggregationEnabled, comparisonSections: [], warnings };
  }
  // Accept both the camelCase configuration spelling and the snake_case wire
  // spellings so configs exported by either side restore their grouping.
  const rawData = data as RowsColumnsConfigContent & {
    filter_relation?: unknown;
    filter_grouping_tree?: unknown;
  };
  const rawFilterRelation = rawData.filterRelation ?? rawData.filter_relation;
  const filterRelation: GroupRelation | null =
    rawFilterRelation === "and" || rawFilterRelation === "or" ? rawFilterRelation : null;
  const rawFilterTree = rawData.filterGroupingTree ?? rawData.filter_grouping_tree;

  if (Array.isArray(data.comparisonColumns)) {
    for (const ref of data.comparisonColumns) {
      const { resolved, warnings: w } = resolveColumnRef(ref, families, availableColumns);
      comparisonColumns.push(...resolved);
      warnings.push(...w);
    }
  }

  if (Array.isArray(data.keyColumns)) {
    for (const ref of data.keyColumns) {
      const { resolved, warnings: w } = resolveColumnRef(ref, families, availableColumns);
      keyColumns.push(...resolved);
      warnings.push(...w);
    }
  }

  if (Array.isArray(data.aggregationColumns)) {
    for (const ref of data.aggregationColumns) {
      const { resolved, warnings: w } = resolveColumnRef(ref, families, availableColumns);
      aggregationColumns.push(...resolved);
      warnings.push(...w);
    }
  }
  if (data.aggregationColumnLabels && typeof data.aggregationColumnLabels === "object") {
    for (const [column, label] of Object.entries(data.aggregationColumnLabels)) {
      if (aggregationColumns.includes(column) && typeof label === "string" && label.trim()) {
        aggregationColumnLabels[column] = label.trim();
      }
    }
  }

  if (Array.isArray(data.targetColumns)) {
    for (const ref of data.targetColumns) {
      const { resolved, warnings: w } = resolveColumnRef(ref, families, availableColumns);
      targetColumns.push(...resolved);
      warnings.push(...w);
    }
  }

  const exceptionColumns: string[] = [];
  const configuredExtraColumns = Array.isArray(data.extraColumns)
    ? data.extraColumns
    : data.exceptionColumns;
  if (Array.isArray(configuredExtraColumns)) {
    for (const ref of configuredExtraColumns) {
      const { resolved, warnings: w } = resolveColumnRef(ref, families, availableColumns);
      exceptionColumns.push(...resolved);
      warnings.push(...w);
    }
  }

  const commentaryColumns: string[] = [];
  // Deliberately no fallback to other selections: an old config without this
  // field must clear the selection rather than retain stale session values.
  if (Array.isArray(data.commentaryTemplateColumns)) {
    for (const ref of data.commentaryTemplateColumns) {
      const { resolved, warnings: w } = resolveColumnRef(ref, families, availableColumns);
      for (const column of resolved) {
        if (!commentaryColumns.includes(column)) commentaryColumns.push(column);
      }
      warnings.push(...w);
    }
  }

  // Track the runtime IDs generated for each configured row index. The saved
  // tree references `cN` indexes, so dropping a row would shift every later
  // reference and silently change the expression.
  const filterIdsByConfigIndex: string[][] = [];
  if (Array.isArray(data.filters)) {
    for (const row of data.filters) {
      const { resolved, warnings: w } = resolveConfigFilterRow(row, families, availableColumns);
      if (resolved) {
        const id = `fl-${filters.length}`;
        filters.push({ ...resolved, id });
        filterIdsByConfigIndex.push([id]);
      } else {
        filterIdsByConfigIndex.push([]);
        const message = `Configured filter ${filterIdsByConfigIndex.length} could not be resolved against the available columns or families. Repair or remove it before running.`;
        unresolvedFilterErrors.push(message);
        warnings.push({ type: "invalid_grouping", message });
      }
      warnings.push(...w);
    }
  }

  let filterGroupTree: GroupNode | null = null;
  if (rawFilterTree && typeof rawFilterTree === "object") {
    filterGroupTree = mapGroupTreeLeaves(rawFilterTree as GroupNode, (savedId) => {
      const match = /^c(\d+)$/.exec(savedId);
      const ids = match ? filterIdsByConfigIndex[Number(match[1])] ?? [] : [];
      if (ids.length === 0) {
        // Keep the broken reference visible so validation fails instead of
        // replacing it with a broader expression.
        return { kind: "leaf", conditionId: `__missing_${savedId}__` };
      }
      if (ids.length === 1) {
        return { kind: "leaf", conditionId: ids[0]! };
      }
      return {
        kind: "and",
        children: ids.map((conditionId) => ({ kind: "leaf" as const, conditionId })),
      };
    });
  }
  const filterGrouping = resolveGroupedExpression(
    filters,
    filterRelation,
    filterGroupTree,
    { label: "filter grouping", allowLegacyAnd: true },
  );
  const filterGroupingErrors = [...filterGrouping.errors, ...unresolvedFilterErrors];
  for (const message of filterGroupingErrors) {
    warnings.push({ type: "invalid_grouping", message });
  }

  nestedAggregationEnabled = data.nestedAggregationEnabled === true;

  if (Array.isArray(data.comparisonSections)) {
    for (const section of data.comparisonSections) {
      if (!section.name || !Array.isArray(section.columns)) continue;
      const resolvedCols: string[] = [];
      const resolvedExtras: string[] = [];
      for (const ref of section.columns) {
        const { resolved, warnings: w } = resolveColumnRef(ref, families, availableColumns);
        resolvedCols.push(...resolved);
        warnings.push(...w);
      }
      for (const ref of section.extraColumns ?? []) {
        const { resolved, warnings: w } = resolveColumnRef(ref, families, availableColumns);
        resolvedExtras.push(...resolved);
        warnings.push(...w);
      }
      if (resolvedCols.length > 0) {
        comparisonSections.push({
          id: section.id,
          name: section.name,
          columns: resolvedCols,
          extraColumns: resolvedExtras,
        });
      }
    }
  }

  const extraColumnDisplay = { overallResultPage: false, overallHtmlReport: false, overallExcelReport: false, newBooksResultPage: false, newBooksHtmlReport: false, newBooksExcelReport: false, exceptionTables: true, ...(data.extraColumnDisplay ?? {}) };
  return { comparisonColumns, keyColumns, aggregationColumns, aggregationColumnLabels, filters, filterRelation, filterGroupTree, filterGroupingErrors, targetColumns, exceptionColumns, commentaryColumns, extraColumnDisplay, nestedAggregationEnabled, comparisonSections, warnings };
}

/**
 * Convert a set of columns to ColumnRefs, collapsing into family references
 * where possible. A family reference is used only when ALL its members are
 * present in the set.
 */
function columnsToRefs(columns: string[], families: Family[]): ColumnRef[] {
  const remaining = new Set(columns);
  const result: ColumnRef[] = [];

  for (const f of families) {
    if (f.kind !== "column") continue;
    if (f.columns.length > 0 && f.columns.every((c) => remaining.has(c))) {
      result.push({ kind: "column_family", name: f.name });
      for (const c of f.columns) remaining.delete(c);
    }
  }

  for (const c of remaining) {
    result.push(c);
  }

  return result;
}

/** Convert workflow state to rows-and-columns config content with tagged references. */
export function mapWorkflowToRowsColumnsConfig(
  state: {
    comparisonColumns: string[];
    keyColumns: string[];
    aggregationColumns: string[];
    aggregationColumnLabels?: Record<string, string>;
    filters: FilterRow[];
    filterRelation?: GroupRelation | null;
    filterGroupTree?: GroupNode | null;
    filterGroupingMode?: FilterGroupingMode | null;
    filterGroupingRequired?: boolean;
    filterGroupingErrors?: string[];
    targetColumns: string[];
    exceptionColumns?: string[];
    commentaryColumns?: string[];
    extraColumnDisplay?: ExtraColumnDisplay;
    nestedAggregationEnabled?: boolean;
    comparisonSections?: {
      id: string;
      name: string;
      columns: string[];
      extraColumns?: string[];
    }[];
  },
  families: Family[],
): RowsColumnsConfigContent {
  const filterRelation = state.filterGroupingMode
    ? state.filterGroupingMode === "custom" ? null : state.filterGroupingMode
    : state.filterRelation;
  const filterGroupTree = state.filterGroupingMode
    ? state.filterGroupingMode === "custom" ? state.filterGroupTree : null
    : state.filterGroupTree;
  const filterGrouping = resolveGroupedExpression(
    state.filters,
    filterRelation,
    filterGroupTree,
    {
      label: "row filter grouping",
      allowLegacyAnd: !state.filterGroupingRequired,
      requireExplicitForMultiple: state.filterGroupingRequired ?? false,
    },
  );
  if (!filterGrouping.valid) {
    throw new GroupingValidationError(filterGrouping.errors);
  }
  if (state.filterGroupingErrors?.length) {
    throw new GroupingValidationError(state.filterGroupingErrors);
  }
  if (state.filters.some((filter) => !filter.column.trim() || filter.values.length === 0)) {
    throw new GroupingValidationError([
      "Row filter grouping contains an incomplete filter. Fill it in or remove it before saving.",
    ]);
  }
  const result: RowsColumnsConfigContent = {
    comparisonColumns: columnsToRefs(state.comparisonColumns, families),
    keyColumns: state.keyColumns.map((c) => ({ kind: "column" as const, name: c })),
    aggregationColumns: state.aggregationColumns.map((c) => ({ kind: "column" as const, name: c })),
    aggregationColumnLabels: Object.fromEntries(
      Object.entries(state.aggregationColumnLabels ?? {})
        .filter(([column, label]) => state.aggregationColumns.includes(column) && label.trim())
        .map(([column, label]) => [column, label.trim()]),
    ),
    // Save the exact concrete column the user selected. A bare family
    // member must never collapse to a family reference here: the loader
    // resolves a family ref to its first available member, so collapsing
    // would silently rewrite the filter on reload (e.g. status -> Test
    // family -> name). Other column sets keep their own ref rules.
    filters: state.filters.map((f) => ({
      column: { kind: "column" as const, name: f.column },
      operator: f.operator,
      filter_values: f.values,
    })),
    ...(filterRelation && state.filters.length > 0
      ? { filterRelation }
      : {}),
    ...(filterGroupTree && state.filters.length > 0
      ? { filterGroupingTree: toPersistedGroupingTree(filterGroupTree, state.filters) }
      : {}),
    targetColumns: columnsToRefs(state.targetColumns, families),
    extraColumns: (state.exceptionColumns ?? []).map((c) => ({ kind: "column" as const, name: c })),
    commentaryTemplateColumns: (state.commentaryColumns ?? []).map((c) => ({ kind: "column" as const, name: c })),
    ...(state.extraColumnDisplay ? { extraColumnDisplay: state.extraColumnDisplay } : {}),
    nestedAggregationEnabled: state.nestedAggregationEnabled ?? false,
    comparisonSections: (state.comparisonSections ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      columns: s.columns.map((c) => ({ kind: "column" as const, name: c })),
      extraColumns: (s.extraColumns ?? []).map((c) => ({ kind: "column" as const, name: c })),
    })),
  };
  return result;
}

export function tryMapWorkflowToRowsColumnsConfig(
  state: Parameters<typeof mapWorkflowToRowsColumnsConfig>[0],
  families: Family[],
): { content: RowsColumnsConfigContent | null; error: string | null } {
  try {
    return { content: mapWorkflowToRowsColumnsConfig(state, families), error: null };
  } catch (error) {
    return {
      content: null,
      error: error instanceof Error ? error.message : "Invalid rows-and-columns configuration.",
    };
  }
}

// ---------------------------------------------------------------------------
// Rules config content types and resolvers
// ---------------------------------------------------------------------------

/** Condition within a saved rules config (column may be a family ref). */
export interface ConfigRuleCondition {
  column_name: ColumnRef;
  operator: string;
  filter_value?: string;
  filter_values?: string[];
}

/** Logic clause within a saved rules config (columns and values may be refs). */
export interface ConfigRuleLogic {
  format: "value_vs_column" | "column_vs_column";
  column_name: ColumnRef;
  operator: string;
  target_value: string;
  target_values?: ValueRef[];
  comparison_mode?: "comparison_vs_baseline" | "comparison_vs_comparison";
}

/** A single rule within a saved rules config. */
export interface ConfigRule {
  name: string;
  description?: string;
  conditions?: ConfigRuleCondition[];
  condition_relation?: "and" | "or";
  grouping_tree?: ConfigGroupNode;
  /** Legacy single-outcome form. */
  logic?: ConfigRuleLogic;
  /** Multiple value-against-column outcomes. */
  logic_clauses?: ConfigRuleLogic[];
  logic_relation?: GroupRelation;
  logic_grouping_tree?: ConfigGroupNode;
  extra_columns?: ColumnRef[];
  hide_comparison?: boolean;
}

function mapGroupTreeLeaves(
  node: GroupNode,
  replacement: (conditionId: string) => GroupNode,
): GroupNode {
  if (node.kind === "leaf") return replacement(node.conditionId);
  return {
    kind: node.kind,
    children: node.children.map((child) => mapGroupTreeLeaves(child, replacement)),
  };
}

function collectGroupTreeLeafIds(node: GroupNode, ids: string[] = []): string[] {
  if (node.kind === "leaf") {
    if (!ids.includes(node.conditionId)) ids.push(node.conditionId);
    return ids;
  }
  node.children.forEach((child) => collectGroupTreeLeafIds(child, ids));
  return ids;
}

/** Resolve a single config rule condition to domain Condition values. */
export function resolveConfigRuleCondition(
  cond: ConfigRuleCondition,
  families: Family[],
  availableColumns: string[],
): { resolved: Condition[]; warnings: ConfigLoadWarning[] } {
  const colResult = resolveColumnRef(cond.column_name, families, availableColumns);
  if (colResult.resolved.length === 0) {
    return { resolved: [], warnings: colResult.warnings };
  }

  const conditionValues = cond.filter_values ?? (cond.filter_value ? [cond.filter_value] : []);
  const conditions: Condition[] = colResult.resolved.map((col, idx) => {
    const c: Condition = {
      id: `c${idx}`,
      column: col,
      operator: CONFIG_TO_DOMAIN_OPERATOR[cond.operator] ?? (cond.operator as LogicOperator),
    };
    if (conditionValues.length > 0) c.values = [...conditionValues];
    return c;
  });

  return { resolved: conditions, warnings: colResult.warnings };
}

/** Resolve a ValueRef array to a flat string array, collecting warnings. */
function resolveValuesRefs(
  refs: ValueRef[] | undefined,
  families: Family[],
  warnings: ConfigLoadWarning[],
): string[] {
  if (!Array.isArray(refs) || refs.length === 0) return [];

  const result: string[] = [];
  for (const vr of refs) {
    if (typeof vr === "string") {
      result.push(vr);
    } else if (vr.kind === "values") {
      result.push(...vr.values);
    } else if (vr.kind === "value_family") {
      const family = families.find(
        (f): f is ValueFamily => f.kind === "value" && f.name === vr.name,
      );
      if (family) {
        result.push(...family.values);
      } else {
        warnings.push({
          type: "invalid_grouping",
          message: `Value family "${vr.name}" not found; the rule outcome was not imported.`,
        });
      }
    }
  }
  return result;
}

/** Resolve a single config rule logic to domain LogicClause values. */
export function resolveConfigRuleLogic(
  logic: ConfigRuleLogic,
  families: Family[],
  availableColumns: string[],
): { resolved: { column: string; target: string; values?: string[]; comparisonMode?: "comparison_vs_baseline" | "comparison_vs_comparison" } | null; warnings: ConfigLoadWarning[] } {
  const colResult = resolveColumnRef(logic.column_name, families, availableColumns);
  const warnings: ConfigLoadWarning[] = [...colResult.warnings];

  if (colResult.resolved.length === 0) {
    return { resolved: null, warnings };
  }

  const resolvedValues = resolveValuesRefs(logic.target_values, families, warnings);
  const resolved: { column: string; target: string; values?: string[]; comparisonMode?: "comparison_vs_baseline" | "comparison_vs_comparison" } = {
    column: colResult.resolved[0]!,
    target: resolvedValues.length > 0 ? resolvedValues[0]! : logic.target_value,
  };
  if (logic.format === "column_vs_column") {
    resolved.comparisonMode = logic.comparison_mode ?? "comparison_vs_baseline";
  }
  if (resolvedValues.length > 0) {
    resolved.values = resolvedValues;
  }

  return { resolved, warnings };
}

/** Resolve a single config rule to a domain RuleDraft. */
export function resolveConfigRule(
  rule: ConfigRule,
  families: Family[],
  availableColumns: string[],
): { resolved: RuleDraft | null; warnings: ConfigLoadWarning[] } {
  const warnings: ConfigLoadWarning[] = [];

  const resolvedConditions: Condition[] = [];
  const conditionIdsByConfigIndex: string[][] = [];
  const conditionCombineKinds: Array<"and" | "or"> = [];
  const familyConditionCounts = new Map<string, number>();
  for (const cond of rule.conditions ?? []) {
    if (isColumnFamilyRef(cond.column_name)) {
      familyConditionCounts.set(
        cond.column_name.name,
        (familyConditionCounts.get(cond.column_name.name) ?? 0) + 1,
      );
    }
  }
  const familyConditionIndexes = new Map<string, number>();
  if (Array.isArray(rule.conditions)) {
    for (const cond of rule.conditions) {
      const conditionResult = resolveConfigRuleCondition(cond, families, availableColumns);
      let resolved = conditionResult.resolved;
      const w = conditionResult.warnings;
      const negative = ["neq", "ncontains", "not equals", "not contains"].includes(cond.operator);
      conditionCombineKinds.push(negative ? "and" : "or");
      if (
        isColumnFamilyRef(cond.column_name)
        && resolved.length > 1
        && familyConditionCounts.get(cond.column_name.name) === resolved.length
      ) {
        // Older app versions saved every concrete condition column as the
        // same family reference. A six-column family therefore reloaded six
        // times into 36 conditions. When the occurrence count exactly
        // matches the available family size, restore one member per saved
        // condition in family order.
        const familyIndex = familyConditionIndexes.get(cond.column_name.name) ?? 0;
        resolved = resolved[familyIndex] ? [resolved[familyIndex]] : [];
        familyConditionIndexes.set(cond.column_name.name, familyIndex + 1);
      }
      const ids: string[] = [];
      for (const condition of resolved) {
        condition.id = `c${resolvedConditions.length}`;
        ids.push(condition.id);
        resolvedConditions.push(condition);
      }
      conditionIdsByConfigIndex.push(ids);
      warnings.push(...w);
      if (ids.length === 0) {
        const message = `Rule "${rule.name}" condition ${conditionIdsByConfigIndex.length} references a column or family with no available members; the rule was not imported.`;
        warnings.push({ type: "invalid_grouping", message });
      }
    }
  }

  const usesMultiLogic = Array.isArray(rule.logic_clauses) && rule.logic_clauses.length > 0;
  const usesLegacyLogic = rule.logic !== undefined;
  if (usesMultiLogic && usesLegacyLogic) {
    warnings.push({
      type: "invalid_grouping",
      message: `Rule "${rule.name}" contains both legacy logic and logic_clauses; refusing to choose one silently.`,
    });
    return { resolved: null, warnings };
  }
  if (!usesMultiLogic && !usesLegacyLogic) {
    warnings.push({
      type: "invalid_grouping",
      message: `Rule "${rule.name}" has no logic or logic_clauses.`,
    });
    return { resolved: null, warnings };
  }

  let resolvedLogic: LogicClause;
  let logicClauses: LogicClause[] | undefined;
  let logicRelation: GroupRelation | null = null;
  let logicGroupTree: GroupNode | null = null;
  let logicGroupingErrors: string[] = [];

  if (usesMultiLogic) {
    const logicIdsByConfigIndex: string[][] = [];
    const allLogicClauses: LogicClause[] = [];
    for (const clause of rule.logic_clauses!) {
      if (clause.format === "column_vs_column") {
        warnings.push({
          type: "invalid_grouping",
          message: `Rule "${rule.name}" uses column-against-column inside multiple outcomes; only value-against-column is supported.`,
        });
        return { resolved: null, warnings };
      }
      const colResult = resolveColumnRef(clause.column_name, families, availableColumns);
      warnings.push(...colResult.warnings);
      if (colResult.resolved.length === 0) {
        logicIdsByConfigIndex.push([]);
        const message = `Rule "${rule.name}" outcome ${logicIdsByConfigIndex.length} references a column or family with no available members; the rule was not imported.`;
        logicGroupingErrors.push(message);
        warnings.push({ type: "invalid_grouping", message });
        continue;
      }
      const values = resolveValuesRefs(clause.target_values, families, warnings);
      const ids: string[] = [];
      for (const column of colResult.resolved) {
        const logicClause: LogicClause = {
          id: `l${allLogicClauses.length}`,
          format: "value",
          column,
          operator:
            CONFIG_TO_DOMAIN_OPERATOR[clause.operator] ?? (clause.operator as LogicOperator),
          target: values.length > 0 ? values[0]! : clause.target_value,
          ...(values.length > 0 ? { values: [...values] } : {}),
        };
        allLogicClauses.push(logicClause);
        ids.push(logicClause.id);
      }
      logicIdsByConfigIndex.push(ids);
    }
    if (allLogicClauses.length === 0) {
      return { resolved: null, warnings };
    }
    resolvedLogic = allLogicClauses[0]!;
    logicClauses = allLogicClauses;
    logicRelation = rule.logic_relation ?? null;
    if (rule.logic_grouping_tree) {
      logicGroupTree = mapGroupTreeLeaves(rule.logic_grouping_tree as GroupNode, (savedId) => {
        const match = /^c(\d+)$/.exec(savedId);
        const index = match ? Number(match[1]) : -1;
        const ids = index >= 0 ? logicIdsByConfigIndex[index] ?? [] : [];
        if (ids.length === 0) {
          return { kind: "leaf", conditionId: `__missing_${savedId}__` };
        }
        if (ids.length === 1) {
          return { kind: "leaf", conditionId: ids[0]! };
        }
        return {
          kind: ["neq", "ncontains"].includes(rule.logic_clauses?.[index]?.operator ?? "")
            ? "and"
            : "or",
          children: ids.map((conditionId) => ({ kind: "leaf" as const, conditionId })),
        };
      });
    } else if (logicIdsByConfigIndex.some((ids) => ids.length > 1)) {
      const originalClauses = rule.logic_clauses!;
      const children: GroupNode[] = logicIdsByConfigIndex.map((ids, index) => {
        if (ids.length <= 1) {
          return { kind: "leaf", conditionId: ids[0] ?? `__missing_c${index}__` };
        }
        const operator = originalClauses[index]?.operator;
        return {
          kind: operator === "neq" || operator === "ncontains" ? "and" : "or",
          children: ids.map((conditionId) => ({ kind: "leaf" as const, conditionId })),
        };
      });
      logicGroupTree = children.length === 1
        ? children[0]!
        : { kind: rule.logic_relation ?? "and", children };
    }
    const grouped = resolveGroupedExpression(logicClauses, logicRelation, logicGroupTree, {
      label: "rule outcome grouping",
      requireExplicitForMultiple: true,
      allowLegacyAnd: false,
    });
    logicGroupingErrors = [...logicGroupingErrors, ...grouped.errors];
    for (const message of logicGroupingErrors) {
      warnings.push({ type: "invalid_grouping", message });
    }
  } else {
    const logicResult = resolveConfigRuleLogic(rule.logic!, families, availableColumns);
    warnings.push(...logicResult.warnings);

    if (!logicResult.resolved) {
      const message = `Rule "${rule.name}" legacy outcome references a column or family with no available members; the rule was not imported.`;
      warnings.push({ type: "invalid_grouping", message });
      return { resolved: null, warnings };
    }

    if (
      isColumnFamilyRef(rule.logic!.column_name)
      && resolveColumnRef(rule.logic!.column_name, families, availableColumns).resolved.length > 1
    ) {
      const message = `Rule "${rule.name}" legacy single-outcome column family expands to multiple columns; convert it to an explicit grouped outcome before import.`;
      warnings.push({ type: "invalid_grouping", message });
      return { resolved: null, warnings };
    }

    const lr = logicResult.resolved;
    resolvedLogic = {
      id: "l0",
      format: rule.logic!.format === "value_vs_column" ? "value" : "column" as const,
      column: lr.column,
      operator:
        lr.column === lr.target
          ? "equals"
          : CONFIG_TO_DOMAIN_OPERATOR[rule.logic!.operator] ?? (rule.logic!.operator as LogicOperator),
      target: lr.target,
      ...(lr.comparisonMode ? { columnComparisonMode: lr.comparisonMode } : {}),
    };
    if (lr.values && lr.values.length > 0) {
      resolvedLogic.values = [...lr.values];
    }
  }

  const resolved: RuleDraft = {
    name: rule.name,
    conditionGrouping: null,
    conditionJoin: null,
    conditions: resolvedConditions,
    groupTree: null,
    logic: resolvedLogic,
    ...(logicClauses
      ? {
          logicClauses,
          logicRelation,
          logicGroupTree,
          ...(logicGroupingErrors.length > 0 ? { logicGroupingErrors } : {}),
        }
      : {}),
    extraColumns: [],
    hideComparison: rule.hide_comparison ?? false,
  };
  if (Array.isArray(rule.extra_columns)) {
    const extras = new Set<string>();
    for (const ref of rule.extra_columns) {
      const extraResult = resolveColumnRef(ref, families, availableColumns);
      extraResult.resolved.forEach((column) => extras.add(column));
      warnings.push(...extraResult.warnings);
    }
    resolved.extraColumns = [...extras];
  }
  if (rule.description) resolved.description = rule.description;
  if (rule.condition_relation) {
    resolved.conditionJoin = rule.condition_relation as Rule["conditionJoin"];
  } else if (resolvedConditions.length > 1) {
    // One saved column-family condition may expand to multiple concrete
    // conditions. Keep the same default used when reading a wire rule so the
    // resolved draft remains executable when sent back to the catalog.
    resolved.conditionJoin = "and";
  }
  if (rule.grouping_tree) {
    const savedTree = rule.grouping_tree as GroupNode;
    const savedLeafIds = collectGroupTreeLeafIds(savedTree);
    const savedIdToConfigIndex = new Map<string, number>();
    savedLeafIds.forEach((id, traversalIndex) => {
      const match = /^c(\d+)$/.exec(id);
      const index = match ? Number(match[1]) : traversalIndex;
      savedIdToConfigIndex.set(id, index);
    });
    resolved.groupTree = mapGroupTreeLeaves(savedTree, (savedId) => {
      const configIndex = savedIdToConfigIndex.get(savedId);
      const ids = configIndex === undefined ? [] : conditionIdsByConfigIndex[configIndex] ?? [];
      if (ids.length === 0) {
        return { kind: "leaf", conditionId: `__missing_${savedId}__` };
      }
      if (ids.length === 1) {
        return { kind: "leaf", conditionId: ids[0]! };
      }
      return {
        kind: conditionCombineKinds[configIndex ?? -1] ?? "or",
        children: ids.map((conditionId) => ({ kind: "leaf", conditionId })),
      };
    });
    resolved.conditionJoin = "per_grouping";
  } else if (conditionIdsByConfigIndex.some((ids) => ids.length > 1)) {
    const children: GroupNode[] = conditionIdsByConfigIndex.map((ids, index) => {
      if (ids.length <= 1) {
        return { kind: "leaf", conditionId: ids[0] ?? `__missing_c${index}__` };
      }
      return {
        kind: conditionCombineKinds[index] ?? "or",
        children: ids.map((conditionId) => ({ kind: "leaf" as const, conditionId })),
      };
    });
    resolved.groupTree = children.length === 1
      ? children[0]!
      : { kind: rule.condition_relation ?? "and", children };
    resolved.conditionJoin = "per_grouping";
  }

  return { resolved, warnings };
}

/** Detect whether config content is old-format domain Rule[] or new ConfigRule[]. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDomainRulesFormat(content: unknown[]): boolean {
  if (content.length === 0) return true;
  const first = content[0] as Record<string, unknown>;
  return "index" in first || "rule_id" in first;
}

function wireConfigLogicToDomain(logic: Record<string, any>, id: string): LogicClause {
  return {
    id,
    format: logic.format === "value_vs_column" ? "value" : "column",
    column: logic.column_name ?? "",
    operator: CONFIG_TO_DOMAIN_OPERATOR[logic.operator ?? ""] ?? "equals",
    target: logic.target_value ?? "",
    ...(Array.isArray(logic.target_values) && logic.target_values.length > 0
      ? { values: [...logic.target_values] }
      : {}),
    ...(logic.comparison_mode
      ? { columnComparisonMode: logic.comparison_mode }
      : {}),
  };
}

/** Full resolver for rules config content. Returns domain RuleDraft[] + warnings. */
export function resolveRulesConfig(
  content: unknown,
  families: Family[],
  availableColumns: string[],
): { drafts: RuleDraft[]; warnings: ConfigLoadWarning[] } {
  const warnings: ConfigLoadWarning[] = [];
  const drafts: RuleDraft[] = [];

  const arr = Array.isArray(content)
    ? content
    : isRecord(content) && Array.isArray(content.items)
      ? content.items
      : isRecord(content) && Array.isArray(content.rules)
        ? content.rules
        : [];
  if (arr.length === 0) return { drafts, warnings };

  // Old format (domain Rule[]): ignore family references, return as-is
  if (isDomainRulesFormat(arr)) {
    for (const item of arr) {
      const rule = item as unknown as Record<string, any>;
      const wireLogic = rule.logic?.column_name !== undefined;
      const conditions = wireLogic
        ? (rule.conditions ?? []).map((condition: Record<string, any>, index: number) => ({
            id: `c${index}`,
            column: condition.column_name ?? "",
            operator: CONFIG_TO_DOMAIN_OPERATOR[condition.operator ?? ""] ?? "equals",
            values: condition.filter_values ?? (condition.filter_value ? [condition.filter_value] : []),
            value: condition.filter_value ?? "",
          }))
        : Array.isArray(rule.conditions)
          ? rule.conditions
          : [];
      if (rule.logic !== undefined && Array.isArray(rule.logic_clauses)) {
        warnings.push({
          type: "invalid_grouping",
          message: `Rule "${String(rule.name ?? "")}" contains both legacy logic and logic_clauses; refusing to choose one silently.`,
        });
        continue;
      }
      const isMulti = Array.isArray(rule.logic_clauses) && rule.logic_clauses.length > 0;
      const logicClauses: LogicClause[] | undefined = isMulti
        ? rule.logic_clauses.map((clause: Record<string, any>, index: number) =>
            wireConfigLogicToDomain(clause, `l${index}`),
          )
        : undefined;
      let logicTree: GroupNode | null = null;
      if (isMulti && rule.logic_grouping_tree) {
        logicTree = mapGroupTreeLeaves(
          rule.logic_grouping_tree as GroupNode,
          (savedId) => {
            const match = /^c(\d+)$/.exec(savedId);
            const clause = match ? logicClauses![Number(match[1])] : undefined;
            return {
              kind: "leaf",
              conditionId: clause?.id ?? `__missing_${savedId}__`,
            };
          },
        );
      }
      const logic = wireLogic
        ? wireConfigLogicToDomain(rule.logic, "l0")
        : isMulti
          ? logicClauses![0]!
          : rule.logic;
      if (!logic) {
        warnings.push({
          type: "invalid_grouping",
          message: `Rule "${String(rule.name ?? "")}" has no logic or logic_clauses.`,
        });
        continue;
      }
      let logicGroupingErrors: string[] = [];
      if (logicClauses) {
        const grouped = resolveGroupedExpression(
          logicClauses,
          rule.logic_relation ?? null,
          logicTree,
          {
            label: "rule outcome grouping",
            requireExplicitForMultiple: true,
            allowLegacyAnd: false,
          },
        );
        logicGroupingErrors = grouped.errors;
        for (const message of logicGroupingErrors) {
          warnings.push({ type: "invalid_grouping", message });
        }
      }
      const draft: RuleDraft = {
        name: String(rule.name ?? ""),
        conditionGrouping: rule.conditionGrouping ?? null,
        // Exported catalog configs use wire names. Preserve those fields when
        // treating the export as a legacy/domain config; otherwise a valid
        // two-condition rule is sent back without its AND/OR relationship.
        conditionJoin: rule.conditionJoin ?? rule.condition_relation ?? null,
        conditions,
        groupTree: rule.groupTree ?? rule.grouping_tree ?? null,
        logic,
        ...(logicClauses
          ? {
              logicClauses,
              logicRelation: rule.logic_relation ?? null,
              logicGroupTree: logicTree,
              ...(logicGroupingErrors.length > 0
                ? { logicGroupingErrors }
                : {}),
            }
          : {}),
      };
      if (rule.description) draft.description = rule.description;
      if (rule.index !== undefined) draft.index = rule.index;
      drafts.push(draft);
    }
    return { drafts, warnings };
  }

  // New format (ConfigRule[]): resolve family references
  for (const rule of arr as ConfigRule[]) {
    if (!rule.name) continue;
    if (!rule.logic && !(rule.logic_clauses && rule.logic_clauses.length > 0)) continue;
    const { resolved, warnings: w } = resolveConfigRule(rule, families, availableColumns);
    if (resolved) {
      drafts.push(resolved);
    }
    warnings.push(...w);
  }

  return { drafts, warnings };
}

/** Preserve a rule's concrete column so loading cannot multiply conditions. */
function ruleColumnToRef(column: string): ColumnRef {
  return { kind: "column", name: column };
}

/**
 * Convert a set of values to ValueRef[], finding Value Family references
 * when the entire set of values matches a family's values.
 */
function valuesToValueRefs(values: string[] | undefined, families: Family[]): ValueRef[] | undefined {
  if (!values || values.length === 0) return undefined;

  // Check if values match a Value Family
  for (const f of families) {
    if (f.kind !== "value") continue;
    const fSet = new Set(f.values);
    if (values.length === fSet.size && values.every((v) => fSet.has(v))) {
      return [{ kind: "value_family" as const, name: f.name }];
    }
  }

  return values;
}

function logicClauseToConfig(logic: LogicClause, families: Family[]): ConfigRuleLogic {
  const clause: ConfigRuleLogic = {
    format: logic.format === "value" ? "value_vs_column" : "column_vs_column",
    column_name: ruleColumnToRef(logic.column),
    operator: logic.operator,
    target_value: logic.target,
    ...(logic.format === "column"
      ? { comparison_mode: logic.columnComparisonMode ?? "comparison_vs_baseline" }
      : {}),
  };
  const valueRefs = logic.values ? valuesToValueRefs(logic.values, families) : undefined;
  if (valueRefs && valueRefs.length > 0) {
    clause.target_values = valueRefs;
  }
  return clause;
}

/** Convert a domain Rule to a ConfigRule with tagged references. */
function ruleToConfigRule(rule: Rule, families: Family[]): ConfigRule {
  if (rule.logicGroupingErrors && rule.logicGroupingErrors.length > 0) {
    throw new GroupingValidationError(rule.logicGroupingErrors);
  }
  const result: ConfigRule = {
    name: rule.name,
    conditions: rule.conditions.map((cond) => {
      const c: ConfigRuleCondition = {
        column_name: ruleColumnToRef(cond.column),
        operator: cond.operator,
      };
      if (cond.values && cond.values.length > 0) {
        c.filter_values = cond.values;
      } else if (cond.value) {
        c.filter_value = cond.value;
      }
      return c;
    }),
  };
  const clauses = rule.logicClauses ?? [];
  if (clauses.length > 1) {
    if (clauses.some((clause) => clause.format === "column")) {
      throw new GroupingValidationError([
        "Multiple grouped outcomes support value-against-column clauses only.",
      ]);
    }
    const grouped = resolveGroupedExpression(clauses, rule.logicRelation ?? null, rule.logicGroupTree ?? null, {
      label: "rule outcome grouping",
      requireExplicitForMultiple: true,
      allowLegacyAnd: false,
    });
    if (!grouped.valid) {
      throw new GroupingValidationError(grouped.errors);
    }
    result.logic_clauses = clauses.map((clause) => logicClauseToConfig(clause, families));
    if (rule.logicRelation) result.logic_relation = rule.logicRelation;
    if (rule.logicGroupTree) {
      result.logic_grouping_tree = toPersistedGroupingTree(rule.logicGroupTree, clauses) as ConfigGroupNode;
    }
  } else {
    result.logic = logicClauseToConfig(clauses[0] ?? rule.logic, families);
  }
  if (rule.description) result.description = rule.description;
  if (rule.extraColumns && rule.extraColumns.length > 0) {
    result.extra_columns = rule.extraColumns.map((column) => ({ kind: "column" as const, name: column }));
  }
  if (rule.hideComparison) result.hide_comparison = true;
  if (rule.conditionJoin && rule.conditionJoin !== "per_grouping") {
    result.condition_relation = rule.conditionJoin as "and" | "or";
  }
  if (rule.groupTree) {
    const conditionIds = new Map(
      rule.conditions.map((condition, index) => [condition.id, `c${index}`]),
    );
    result.grouping_tree = mapGroupTreeLeaves(rule.groupTree, (conditionId) => ({
      kind: "leaf",
      conditionId: conditionIds.get(conditionId) ?? conditionId,
    })) as NonNullable<ConfigRule["grouping_tree"]>;
  }
  return result;
}

/** Convert domain Rule[] to rules config content with tagged references. */
export function mapRulesToConfigContent(
  rules: Rule[],
  families: Family[],
): ConfigRule[] {
  return rules.map((rule) => ruleToConfigRule(rule, families));
}
