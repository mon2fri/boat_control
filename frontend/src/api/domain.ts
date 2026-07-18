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
  value: string;
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
  conditionGrouping: string | null;
  logic: LogicClause;
}

export interface RunRequest {
  sessionId: string;
  filters: FilterRow[];
  targetColumns: string[];
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
  column: string;
  file1Value: string | null;
  file2Value: string | null;
  kind: "changed" | "violation";
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
