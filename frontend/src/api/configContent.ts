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
  filters?: ConfigFilterRow[];
  targetColumns?: ColumnRef[];
}

/** Warning emitted during config loading. */
export interface ConfigLoadWarning {
  type: "missing_family" | "zero_member_family" | "partial_family" | "excluded_column";
  message: string;
}

/** Resolved config load result with warnings. */
export interface ConfigLoadResult {
  comparisonColumns: string[];
  keyColumns: string[];
  aggregationColumns: string[];
  filters: FilterRow[];
  targetColumns: string[];
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
  const filters: FilterRow[] = [];
  const targetColumns: string[] = [];

  if (!data) {
    return { comparisonColumns: [], keyColumns: [], aggregationColumns: [], filters: [], targetColumns: [], warnings };
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

  if (Array.isArray(data.targetColumns)) {
    for (const ref of data.targetColumns) {
      const { resolved, warnings: w } = resolveColumnRef(ref, families, availableColumns);
      targetColumns.push(...resolved);
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

  return { comparisonColumns, keyColumns, aggregationColumns, filters, targetColumns, warnings };
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
    filters: FilterRow[];
    targetColumns: string[];
  },
  families: Family[],
): RowsColumnsConfigContent {
  return {
    comparisonColumns: columnsToRefs(state.comparisonColumns, families),
    keyColumns: columnsToRefs(state.keyColumns, families),
    aggregationColumns: columnsToRefs(state.aggregationColumns, families),
    filters: state.filters.map((f) => ({
      column: columnToRef(f.column, families),
      operator: f.operator,
      filter_values: f.values,
    })),
    targetColumns: columnsToRefs(state.targetColumns, families),
  };
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
}

/** A single rule within a saved rules config. */
export interface ConfigRule {
  name: string;
  description?: string;
  conditions?: ConfigRuleCondition[];
  condition_relation?: "and" | "or";
  grouping_tree?: { kind: "leaf"; conditionId: string } | { kind: "and"; children: unknown[] } | { kind: "or"; children: unknown[] };
  logic: ConfigRuleLogic;
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
): { resolved: { column: string; target: string; values?: string[] } | null; warnings: ConfigLoadWarning[] } {
  const colResult = resolveColumnRef(logic.column_name, families, availableColumns);
  const warnings: ConfigLoadWarning[] = [...colResult.warnings];

  if (colResult.resolved.length === 0) {
    return { resolved: null, warnings };
  }

  const resolvedValues = resolveValuesRefs(logic.target_values, families, warnings);
  const resolved: { column: string; target: string; values?: string[] } = {
    column: colResult.resolved[0]!,
    target: resolvedValues.length > 0 ? resolvedValues[0]! : logic.target_value,
  };
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
  if (Array.isArray(rule.conditions)) {
    for (const cond of rule.conditions) {
      const { resolved, warnings: w } = resolveConfigRuleCondition(cond, families, availableColumns);
      resolvedConditions.push(...resolved);
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
  };
  if (rule.description) resolved.description = rule.description;
  if (rule.condition_relation) {
    resolved.conditionJoin = rule.condition_relation as Rule["conditionJoin"];
  }
  if (rule.grouping_tree) {
    resolved.groupTree = rule.grouping_tree as GroupNode;
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

/**
 * Convert a domain Condition.column to a ColumnRef.
 * Uses a family reference when the column belongs to a family and all
 * conditions in the rule that reference that family's columns are present.
 */
function conditionColumnToRef(column: string, families: Family[]): ColumnRef {
  return columnToRef(column, families);
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
        column_name: conditionColumnToRef(cond.column, families),
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
      column_name: conditionColumnToRef(rule.logic.column, families),
      operator: rule.logic.operator,
      target_value: rule.logic.target,
    },
  };
  const valueRefs = rule.logic.values ? valuesToValueRefs(rule.logic.values, families) : undefined;
  if (valueRefs && valueRefs.length > 0) {
    result.logic.target_values = valueRefs;
  }
  if (rule.description) result.description = rule.description;
  if (rule.conditionJoin && rule.conditionJoin !== "per_grouping") {
    result.condition_relation = rule.conditionJoin as "and" | "or";
  }
  if (rule.groupTree) {
    result.grouping_tree = rule.groupTree as any;
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
