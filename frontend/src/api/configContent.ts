import type {
  ColumnFamily,
  Condition,
  Family,
  FilterRow,
  GroupNode,
  LogicClause,
  LogicOperator,
  Rule,
  RuleDraft,
  ValueFamily,
} from "./domain";
import type { ExtraColumnDisplay } from "./domain";

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
  targetColumns?: ColumnRef[];
  /** Extra columns included in the exception table beyond key + aggregation columns. */
  exceptionColumns?: ColumnRef[];
  extraColumnDisplay?: ExtraColumnDisplay | undefined;
  /** When true, aggregation columns form an ordered hierarchy shown as a tree. */
  nestedAggregationEnabled?: boolean;
  /** User-defined comparison sections, each with a name and column set. */
  comparisonSections?: ComparisonSectionContent[];
}

/** A user-defined comparison section within a saved config. */
export interface ComparisonSectionContent {
  id: string;
  name: string;
  columns: ColumnRef[];
  extraColumns?: ColumnRef[];
}

/** Warning emitted during config loading. */
export interface ConfigLoadWarning {
  type: "missing_family" | "zero_member_family" | "partial_family" | "excluded_column";
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
  targetColumns: string[];
  exceptionColumns: string[];
  extraColumnDisplay: ExtraColumnDisplay;
  nestedAggregationEnabled: boolean;
  comparisonSections: ResolvedComparisonSection[];
  warnings: ConfigLoadWarning[];
}

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
      operator: row.operator as FilterRow["operator"],
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
  const targetColumns: string[] = [];
  let nestedAggregationEnabled = false;
  const comparisonSections: ResolvedComparisonSection[] = [];

  if (!data) {
    return { comparisonColumns: [], keyColumns: [], aggregationColumns: [], aggregationColumnLabels, filters: [], targetColumns: [], exceptionColumns: [], extraColumnDisplay: { overallResultPage: false, overallHtmlReport: false, overallExcelReport: false, newBooksResultPage: false, newBooksHtmlReport: false, newBooksExcelReport: false }, nestedAggregationEnabled, comparisonSections: [], warnings };
  }

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
  if (Array.isArray(data.exceptionColumns)) {
    for (const ref of data.exceptionColumns) {
      const { resolved, warnings: w } = resolveColumnRef(ref, families, availableColumns);
      exceptionColumns.push(...resolved);
      warnings.push(...w);
    }
  }

  if (Array.isArray(data.filters)) {
    for (const row of data.filters) {
      const { resolved, warnings: w } = resolveConfigFilterRow(row, families, availableColumns);
      if (resolved) {
        filters.push({ ...resolved, id: `fl-${filters.length}` });
      }
      warnings.push(...w);
    }
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

  const extraColumnDisplay = data.extraColumnDisplay ?? { overallResultPage: false, overallHtmlReport: false, overallExcelReport: false, newBooksResultPage: false, newBooksHtmlReport: false, newBooksExcelReport: false };
  return { comparisonColumns, keyColumns, aggregationColumns, aggregationColumnLabels, filters, targetColumns, exceptionColumns, extraColumnDisplay, nestedAggregationEnabled, comparisonSections, warnings };
}

/**
 * Convert a single column to a ColumnRef, using a Column Family reference
 * when the column belongs to exactly one family.
 */
function columnToRef(column: string, families: Family[]): ColumnRef {
  for (const f of families) {
    if (f.kind === "column" && f.columns.includes(column)) {
      return { kind: "column_family", name: f.name };
    }
  }
  return column;
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
    targetColumns: string[];
    exceptionColumns?: string[];
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
  const result: RowsColumnsConfigContent = {
    comparisonColumns: columnsToRefs(state.comparisonColumns, families),
    keyColumns: state.keyColumns.map((c) => ({ kind: "column" as const, name: c })),
    aggregationColumns: state.aggregationColumns.map((c) => ({ kind: "column" as const, name: c })),
    aggregationColumnLabels: Object.fromEntries(
      Object.entries(state.aggregationColumnLabels ?? {})
        .filter(([column, label]) => state.aggregationColumns.includes(column) && label.trim())
        .map(([column, label]) => [column, label.trim()]),
    ),
    filters: state.filters.map((f) => ({
      column: columnToRef(f.column, families),
      operator: f.operator,
      filter_values: f.values,
    })),
    targetColumns: columnsToRefs(state.targetColumns, families),
    exceptionColumns: (state.exceptionColumns ?? []).map((c) => ({ kind: "column" as const, name: c })),
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
  grouping_tree?: { kind: "leaf"; conditionId: string } | { kind: "and"; children: unknown[] } | { kind: "or"; children: unknown[] };
  logic: ConfigRuleLogic;
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
      operator: cond.operator as LogicOperator,
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
          type: "missing_family",
          message: `Value family "${vr.name}" not found.`,
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
    }
  }

  const logicResult = resolveConfigRuleLogic(rule.logic, families, availableColumns);
  warnings.push(...logicResult.warnings);

  if (!logicResult.resolved) {
    return { resolved: null, warnings };
  }

  const lr = logicResult.resolved;
  const resolvedLogic: LogicClause = {
    id: "l0",
    format: rule.logic.format === "value_vs_column" ? "value" : "column" as const,
    column: lr.column,
    operator: lr.column === lr.target ? "equals" : rule.logic.operator as LogicOperator,
    target: lr.target,
    ...(lr.comparisonMode ? { columnComparisonMode: lr.comparisonMode } : {}),
  };
  if (lr.values && lr.values.length > 0) {
    resolvedLogic.values = [...lr.values];
  }

  const resolved: RuleDraft = {
    name: rule.name,
    conditionGrouping: null,
    conditionJoin: null,
    conditions: resolvedConditions,
    groupTree: null,
    logic: resolvedLogic,
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
      if (ids.length <= 1) {
        return { kind: "leaf", conditionId: ids[0] ?? savedId };
      }
      return {
        kind: "and",
        children: ids.map((conditionId) => ({ kind: "leaf", conditionId })),
      };
    });
    resolved.conditionJoin = "per_grouping";
  }

  return { resolved, warnings };
}

/** Detect whether config content is old-format domain Rule[] or new ConfigRule[]. */
function isDomainRulesFormat(content: unknown[]): boolean {
  if (content.length === 0) return true;
  const first = content[0] as Record<string, unknown>;
  return "index" in first || "rule_id" in first;
}

/** Full resolver for rules config content. Returns domain RuleDraft[] + warnings. */
export function resolveRulesConfig(
  content: unknown,
  families: Family[],
  availableColumns: string[],
): { drafts: RuleDraft[]; warnings: ConfigLoadWarning[] } {
  const warnings: ConfigLoadWarning[] = [];
  const drafts: RuleDraft[] = [];

  const arr = Array.isArray(content) ? content : [];
  if (arr.length === 0) return { drafts, warnings };

  // Old format (domain Rule[]): ignore family references, return as-is
  if (isDomainRulesFormat(arr)) {
    for (const item of arr) {
      const rule = item as Rule;
      const draft: RuleDraft = {
        name: rule.name,
        conditionGrouping: rule.conditionGrouping ?? null,
        conditionJoin: rule.conditionJoin ?? null,
        conditions: rule.conditions,
        groupTree: rule.groupTree ?? null,
        logic: rule.logic,
      };
      if (rule.description) draft.description = rule.description;
      if (rule.index !== undefined) draft.index = rule.index;
      drafts.push(draft);
    }
    return { drafts, warnings };
  }

  // New format (ConfigRule[]): resolve family references
  for (const rule of arr as ConfigRule[]) {
    if (!rule.name || !rule.logic) continue;
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

/** Convert a domain Rule to a ConfigRule with tagged references. */
function ruleToConfigRule(rule: Rule, families: Family[]): ConfigRule {
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
    logic: {
      format: rule.logic.format === "value" ? "value_vs_column" : "column_vs_column",
      column_name: ruleColumnToRef(rule.logic.column),
      operator: rule.logic.operator,
      target_value: rule.logic.target,
      ...(rule.logic.format === "column"
        ? { comparison_mode: rule.logic.columnComparisonMode ?? "comparison_vs_baseline" }
        : {}),
    },
  };
  const valueRefs = rule.logic.values ? valuesToValueRefs(rule.logic.values, families) : undefined;
  if (valueRefs && valueRefs.length > 0) {
    result.logic.target_values = valueRefs;
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
