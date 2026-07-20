/**
 * Internal domain types used by React components. These are the "comfortable"
 * shape the UI works with; `mapping.ts` translates to and from the wire
 * formats declared in `wire.ts`.
 */

export type FilterOperator = "equals" | "not_equals" | "contains" | "not_contains";
export type LogicOperator = FilterOperator | "greater_than" | "less_than";

export const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "equals", label: "equals to" },
  { value: "not_equals", label: "not equal to" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
];

export interface HeaderReport {
  sessionId: string;
  file1Name: string;
  file2Name: string;
  common: string[];
  file1Only: string[];
  file2Only: string[];
}

export interface ColumnValue {
  value: string;
  starred: boolean;
}

export interface FilterRow {
  id: string;
  column: string;
  operator: FilterOperator;
  values: string[];
}

export interface SavedFilter {
  id: string;
  name: string;
  rows: FilterRow[];
}

export interface Condition {
  id: string;
  column: string;
  operator: LogicOperator;
  value: string;
}

export type LogicFormat = "value" | "column";

export interface LogicClause {
  id: string;
  format: LogicFormat;
  column: string;
  operator: LogicOperator;
  target: string;
}

export interface Rule {
  index: string;
  name: string;
  description?: string;
  conditions: Condition[];
  conditionJoin: "and" | "or" | null;
  /**
   * Legacy free-text grouping input. New code MUST build and persist
   * `groupTree` instead — splitting free text on whitespace cannot represent
   * `(A and B) or C` or `A and (B or C)` unambiguously.
   */
  conditionGrouping: string | null;
  /**
   * Canonical executable grouping tree. Each leaf references a condition by
   * its client-side id; AND/OR nodes combine children. This is the only
   * representation that round-trips mixed-precedence grouping through the
   * editor and the backend evaluator.
   */
  groupTree: GroupNode | null;
  logic: LogicClause;
}

/**
 * Recursive grouping node used by `Rule.groupTree`.
 * - `leaf`: references a condition by its client-side id.
 * - `and`/`or`: combine children; precedence is explicit because the tree
 *   is structural, not tokenised.
 */
export type GroupNode =
  | { kind: "leaf"; conditionId: string }
  | { kind: "and"; children: GroupNode[] }
  | { kind: "or"; children: GroupNode[] };

export interface RunRequest {
  sessionId: string;
  comparisonColumns: string[];
  filters: FilterRow[];
  targetColumns: string[];
  /**
   * Columns used to identify a record across the two files. At least one is
   * required for a meaningful comparison. The empty selection is rejected at
   * the backend; the UI guides the user to choose one or more explicitly.
   */
  keyColumns: string[];
  ruleIndexes: string[];
  confirmFullSet: boolean;
}

export interface OverallSummary {
  recordsLoaded: number;
  ruleViolationRowCount: number;
  ruleViolationAttributeCount: number;
  changedRowCount: number;
  changedAttributeCount: number;
}

export interface DetailRow {
  rowKey: string;
  keyColumns: Record<string, string | null>;
  column: string;
  file1Value: string | null;
  file2Value: string | null;
  /** When the row is a violation, the server-provided violating column/value. */
  violatingColumn?: string;
  violatingValue?: string | null;
  kind: "changed" | "exception";
}

export interface RuleResult {
  ruleIndex: string;
  ruleName: string;
  logicSummary: string;
  violationRowCount: number;
  violationAttributeCount: number;
  details: DetailRow[];
}

export interface RunResult {
  id: string;
  reportName: string;
  createdAt: string;
  file1Name: string;
  file2Name: string;
  overall: OverallSummary;
  ruleResults: RuleResult[];
  changeDetails: DetailRow[];
}

export interface RunSummary {
  id: string;
  reportName: string;
  createdAt: string;
  file1Name: string;
  file2Name: string;
}

/** Draft used to create or update a rule (server may assign `index`). */
export type RuleDraft = Omit<Rule, "index"> & { index?: string };

export interface ExportRequest {
  runId: string;
  format: "html" | "csv";
}

/**
 * Application settings as the UI sees them. Field names mirror the frozen
 * wire contract (`docs/20260718_contract_api_final.md` §10) but in camelCase.
 * `presetSourcePaths` is an array because the contract allows multiple
 * preset directories; the form binds to the first one for editing.
 */
export interface AppSettings {
  presetSourcePaths: string[];
  rulesConfigPath: string;
  filtersConfigPath: string;
  fullSetThreshold: number;
}

/**
 * A saved filter preset the user can recall on the Prepare page. The server
 * owns persistence; the client only edits, lists, and deletes by id.
 */
export interface SavedFilter {
  id: string;
  name: string;
  rows: FilterRow[];
}

/**
 * A configured preset/network source. The backend exposes a curated list
 * rooted at an allowed directory; arbitrary paths are not accepted.
 */
export interface PresetSource {
  id: string;
  name: string;
  /** Display label for the UI; the server may include a short description. */
  description?: string;
  /** Whether the preset is for a single file (compared against another upload) or a paired comparison. */
  kind: "single" | "pair";
}

export interface SourceFile {
  id: string;
  name: string;
  size: number;
}
