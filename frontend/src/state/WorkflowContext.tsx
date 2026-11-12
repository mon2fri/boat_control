import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import type {
  ComparisonSection,
  FilterRow,
  FilterGroupingMode,
  GroupNode,
  GroupRelation,
  HeaderReport,
  PrepareResult,
  RunResult,
  ExtraColumnDisplay,
} from "../api/domain";
import { defaultAsOfDate, isValidIsoDate } from "../lib/asOfDate";
import { resolveGroupedExpression } from "../lib/grouping";

export interface PreparedDataCache {
  sessionId: string;
  comparisonColumns: string[];
  data: PrepareResult;
}

/**
 * Cross-page workflow state. The server issues a `sessionId` on upload and
 * the rest of the run lifecycle reuses it. Rule catalog, history, and saved
 * filters live in TanStack Query — this holds only the in-progress session
 * and the user's selections that flow between pages.
 */
export interface WorkflowState {
  header: HeaderReport | null;
  /** Calendar date used for exception tracking; carried through run and restoration. */
  asOfDate: string;
  /** Shared columns selected for comparison. Initialized to all common columns on upload. */
  comparisonColumns: string[];
  filters: FilterRow[];
  /** Flat joiner for filters; null means legacy AND unless a tree is valid. */
  filterRelation: GroupRelation | null;
  /** Runtime grouping tree for filters; leaves reference `filters[].id`. */
  filterGroupTree: GroupNode | null;
  /** UI mode preserves a custom tree while the user temporarily selects AND/OR. */
  filterGroupingMode: FilterGroupingMode | null;
  /** New/editor-authored multi-filter expressions cannot fall back to legacy AND. */
  filterGroupingRequired: boolean;
  /** Non-empty when the current filter expression needs repair before running. */
  filterGroupingErrors: string[];
  targetColumns: string[];
  /** Record-identity columns. Empty array means "not yet chosen"; the backend refuses to run without one. */
  keyColumns: string[];
  /** Optional subset of comparison columns used for group-level statistics. */
  aggregationColumns: string[];
  /** User-facing labels for aggregation columns; keys remain CSV column names. */
  aggregationColumnLabels: Record<string, string>;
  /** When true, aggregation columns form an ordered hierarchy shown as an expandable tree. */
  nestedAggregationEnabled: boolean;
  /** User-defined comparison sections for attribute comparing configuration. */
  comparisonSections: ComparisonSection[];
  /** Extra columns included in the exception table beyond key + aggregation columns. */
  exceptionColumns: string[];
  /** Ordered source columns appended to the commentary template and tracking table. */
  commentaryColumns: string[];
  /** Display/report scope: include New + NotCommented, exclude Commented. */
  newExceptionsOnly: boolean;
  extraColumnDisplay?: ExtraColumnDisplay;
  /** Page-two CSV scan result, reusable while files and columns are unchanged. */
  preparedData?: PreparedDataCache | null;
  selectedRuleIndexes: string[];
  /** User acknowledged running against the full set with no filters. */
  confirmFullSet: boolean;
  /** Whether page two has been submitted to the results step. */
  page2Complete: boolean;
  result: RunResult | null;
  /** Set when the server says the run needs confirmation; shown as a banner. */
  serverRequiresConfirmation: boolean;
  /** Set when a request fails because the session is gone; UI routes to upload. */
  sessionExpired: boolean;
}

const initialState: WorkflowState = {
  header: null,
  asOfDate: defaultAsOfDate(),
  comparisonColumns: [],
  filters: [],
  filterRelation: null,
  filterGroupTree: null,
  filterGroupingMode: null,
  filterGroupingRequired: false,
  filterGroupingErrors: [],
  targetColumns: [],
  keyColumns: [],
  aggregationColumns: [],
  aggregationColumnLabels: {},
  nestedAggregationEnabled: false,
  comparisonSections: [],
  exceptionColumns: [],
  commentaryColumns: [],
  newExceptionsOnly: true,
  extraColumnDisplay: { overallResultPage: false, overallHtmlReport: false, overallExcelReport: false, newBooksResultPage: false, newBooksHtmlReport: false, newBooksExcelReport: false, exceptionTables: true },
  preparedData: null,
  selectedRuleIndexes: [],
  confirmFullSet: false,
  page2Complete: false,
  result: null,
  serverRequiresConfirmation: false,
  sessionExpired: false,
};

type Action =
  | { type: "setHeader"; header: HeaderReport }
  | { type: "setAsOfDate"; date: string }
  | { type: "setComparisonColumns"; columns: string[] }
  | { type: "removeComparisonColumn"; column: string }
  | { type: "setAggregationColumns"; columns: string[] }
  | { type: "setAggregationColumnLabels"; labels: Record<string, string> }
  | { type: "setNestedAggregationEnabled"; enabled: boolean }
  | { type: "setComparisonSections"; sections: ComparisonSection[] }
  | { type: "setExceptionColumns"; columns: string[] }
  | { type: "setCommentaryColumns"; columns: string[] }
  | { type: "setNewExceptionsOnly"; enabled: boolean }
  | { type: "setExtraColumnDisplay"; display: ExtraColumnDisplay }
  | { type: "setPreparedData"; cache: PreparedDataCache }
  | { type: "setFilters"; filters: FilterRow[] }
  | {
      type: "setFilterConfiguration";
      filters: FilterRow[];
      relation?: GroupRelation | null;
      groupTree?: GroupNode | null;
      mode?: FilterGroupingMode | null;
      errors?: string[];
      requireExplicit?: boolean;
    }
  | { type: "setFilterRelation"; relation: GroupRelation | null }
  | { type: "setFilterGroupTree"; groupTree: GroupNode | null }
  | { type: "restoreRunConfiguration"; result: RunResult; availableColumns?: string[] }
  | { type: "setTargetColumns"; columns: string[] }
  | { type: "setKeyColumns"; columns: string[] }
  | { type: "setSelectedRules"; ruleIndexes: string[] }
  | { type: "setConfirmFullSet"; confirmed: boolean }
  | { type: "setPage2Complete"; complete: boolean }
  | { type: "setServerRequiresConfirmation"; requires: boolean }
  | { type: "setResult"; result: RunResult }
  | { type: "clearResult" }
  | { type: "sessionExpired" }
  | { type: "reset" };

export interface FilterStateValidation {
  valid: boolean;
  errors: string[];
  relation: GroupRelation | null;
  groupTree: GroupNode | null;
}

/**
 * Validate the current row-filter configuration without mutating it. Incomplete
 * rows, grouping references to removed/duplicate clauses and missing schema
 * columns are reported so a run cannot silently broaden or skip a check.
 */
export function validateWorkflowFilters(
  filters: FilterRow[],
  relation: GroupRelation | null,
  groupTree: GroupNode | null,
  availableColumns?: string[],
  requireExplicitForMultiple = false,
): FilterStateValidation {
  const grouped = resolveGroupedExpression(filters, relation, groupTree, {
    label: "Row filter grouping",
    allowLegacyAnd: !requireExplicitForMultiple,
    requireExplicitForMultiple,
  });
  const errors = [...grouped.errors];
  const columnSet = availableColumns ? new Set(availableColumns) : null;
  filters.forEach((row, index) => {
    if (row.column.trim().length === 0) {
      errors.push(`Filter ${index + 1} has no column.`);
    } else if (columnSet && !columnSet.has(row.column)) {
      errors.push(`Filter ${index + 1} column "${row.column}" is not available.`);
    }
    if (row.values.length === 0) {
      errors.push(`Filter ${index + 1} has no value.`);
    }
  });
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    relation,
    groupTree,
  };
}

/**
 * Derive the grouped-filter portion of workflow state from a saved run.
 * Persisted tree references are already remapped by the API mapper; any
 * restoration errors stay attached so execution can block until repaired.
 */
export function workflowConfigurationFromRun(
  result: RunResult,
  availableColumns?: string[],
): {
  filters: FilterRow[];
  filterRelation: GroupRelation | null;
  filterGroupTree: GroupNode | null;
  filterGroupingMode: FilterGroupingMode | null;
  filterGroupingRequired: boolean;
  filterGroupingErrors: string[];
  nestedAggregationEnabled: boolean;
  aggregationColumns: string[];
  aggregationColumnLabels: Record<string, string>;
  keyColumns: string[];
  exceptionColumns: string[];
  commentaryColumns: string[];
  newExceptionsOnly: boolean;
  extraColumnDisplay: ExtraColumnDisplay;
} {
  const filters = (result.filtersApplied ?? []).map((row, index) =>
    row.id ? row : { ...row, id: `fl-${index}` },
  );
  const filterRelation = result.filtersRelation ?? null;
  const filterGroupTree = result.filtersGroupTree ?? null;
  const filterGroupingMode: FilterGroupingMode | null = filterGroupTree
    ? "custom"
    : result.filtersRelation ?? (filters.length > 1 ? "and" : null);
  const filterGroupingRequired = Boolean(
    filterRelation || filterGroupTree || result.filtersGroupingErrors?.length,
  );
  const validation = validateWorkflowFilters(
    filters,
    filterGroupingMode === "custom" ? null : filterGroupingMode,
    filterGroupingMode === "custom" ? filterGroupTree : null,
    availableColumns,
    filterGroupingRequired,
  );
  return {
    filters,
    filterRelation,
    filterGroupTree,
    filterGroupingMode,
    filterGroupingRequired,
    filterGroupingErrors: result.filtersGroupingErrors?.length
      ? [...result.filtersGroupingErrors]
      : validation.errors,
    nestedAggregationEnabled: result.nestedAggregationEnabled ?? false,
    aggregationColumns: result.aggregationColumns ?? [],
    aggregationColumnLabels: result.aggregationColumnLabels ?? {},
    keyColumns: result.keyColumns ?? [],
    exceptionColumns: result.exceptionColumns ?? [],
    commentaryColumns: result.commentaryColumns ?? [],
    newExceptionsOnly: result.newExceptionsOnly ?? true,
    extraColumnDisplay: result.extraColumnDisplay ?? {
      overallResultPage: false,
      overallHtmlReport: false,
      overallExcelReport: false,
      newBooksResultPage: false,
      newBooksHtmlReport: false,
      newBooksExcelReport: false,
      exceptionTables: true,
    },
  };
}

function withFilterValidation(
  state: WorkflowState,
  filters: FilterRow[],
  relation: GroupRelation | null,
  groupTree: GroupNode | null,
  availableColumns?: string[],
  requireExplicit = state.filterGroupingRequired,
  mode = state.filterGroupingMode,
): Pick<WorkflowState, "filters" | "filterRelation" | "filterGroupTree" | "filterGroupingMode" | "filterGroupingRequired" | "filterGroupingErrors"> {
  const validation = validateWorkflowFilters(
    filters,
    mode === "custom" ? null : mode,
    mode === "custom" ? groupTree : null,
    availableColumns ?? state.comparisonColumns,
    requireExplicit,
  );
  return {
    filters,
    filterRelation: relation,
    filterGroupTree: groupTree,
    filterGroupingMode: mode,
    filterGroupingRequired: requireExplicit,
    filterGroupingErrors: validation.errors,
  };
}

export function workflowReducer(state: WorkflowState, action: Action): WorkflowState {
  switch (action.type) {
    case "setHeader":
      return {
        ...initialState,
        // Keep the date the user chose before/while loading files; a
        // backend-echoed date is authoritative when present.
        asOfDate: action.header.asOfDate && isValidIsoDate(action.header.asOfDate)
          ? action.header.asOfDate
          : state.asOfDate || initialState.asOfDate,
        header: action.header,
        comparisonColumns: [...action.header.common],
      };
    case "setAsOfDate":
      return { ...state, asOfDate: action.date };
    case "setComparisonColumns": {
      const cols = action.columns;
      const colSet = new Set(cols);
      const filters = state.filters.map((f) =>
        colSet.has(f.column) ? f : { ...f, column: "" },
      );
      return {
        ...state,
        ...withFilterValidation(
          state,
          filters,
          state.filterRelation,
          state.filterGroupTree,
          cols,
          state.filterGroupingRequired,
        ),
        comparisonColumns: cols,
        preparedData: null,
        page2Complete: false,
        keyColumns: state.keyColumns.filter((c) => colSet.has(c)),
        targetColumns: state.targetColumns.filter((c) => colSet.has(c)),
        aggregationColumns: state.aggregationColumns.filter((c) => colSet.has(c)),
        aggregationColumnLabels: Object.fromEntries(
          Object.entries(state.aggregationColumnLabels).filter(([column]) => colSet.has(column)),
        ),
        comparisonSections: state.comparisonSections
          .map((s) => ({
            ...s,
            columns: s.columns.filter((c) => colSet.has(c)),
            extraColumns: (s.extraColumns ?? []).filter((c) => colSet.has(c)),
          }))
          .filter((s) => s.columns.length > 0),
        exceptionColumns: state.exceptionColumns.filter((c) => colSet.has(c)),
        commentaryColumns: state.commentaryColumns.filter((c) => colSet.has(c)),
      };
    }
    case "removeComparisonColumn": {
      const col = action.column;
      const next = state.comparisonColumns.filter((c) => c !== col);
      const filters = state.filters.map((f) =>
        f.column === col ? { ...f, column: "" } : f,
      );
      return {
        ...state,
        ...withFilterValidation(
          state,
          filters,
          state.filterRelation,
          state.filterGroupTree,
          next,
          state.filterGroupingRequired,
        ),
        comparisonColumns: next,
        preparedData: null,
        page2Complete: false,
        keyColumns: state.keyColumns.filter((c) => c !== col),
        targetColumns: state.targetColumns.filter((c) => c !== col),
        aggregationColumns: state.aggregationColumns.filter((c) => c !== col),
        aggregationColumnLabels: Object.fromEntries(
          Object.entries(state.aggregationColumnLabels).filter(([column]) => column !== col),
        ),
        comparisonSections: state.comparisonSections
          .map((s) => ({
            ...s,
            columns: s.columns.filter((c) => c !== col),
            extraColumns: (s.extraColumns ?? []).filter((c) => c !== col),
          }))
          .filter((s) => s.columns.length > 0),
        exceptionColumns: state.exceptionColumns.filter((c) => c !== col),
        commentaryColumns: state.commentaryColumns.filter((c) => c !== col),
      };
    }
    case "setFilters":
      return {
        ...state,
        ...withFilterValidation(
          state,
          action.filters,
          state.filterRelation,
          state.filterGroupTree,
          undefined,
          action.filters.length > 1,
        ),
        confirmFullSet: false,
      };
    case "setFilterConfiguration": {
      const next = withFilterValidation(
        state,
        action.filters,
        action.relation !== undefined ? action.relation : state.filterRelation,
        action.groupTree !== undefined ? action.groupTree : state.filterGroupTree,
        undefined,
        action.requireExplicit ?? state.filterGroupingRequired,
        action.mode !== undefined
          ? action.mode
          : action.groupTree
            ? "custom"
            : action.relation ?? state.filterGroupingMode,
      );
      return {
        ...state,
        ...next,
        filterGroupingErrors: action.errors
          ? [...new Set([...action.errors, ...next.filterGroupingErrors])]
          : next.filterGroupingErrors,
        confirmFullSet: false,
      };
    }
    case "setFilterRelation":
      return {
        ...state,
        ...withFilterValidation(
          state,
          state.filters,
          action.relation,
          state.filterGroupTree,
          undefined,
          state.filters.length > 1,
          action.relation,
        ),
        confirmFullSet: false,
      };
    case "setFilterGroupTree":
      return {
        ...state,
        ...withFilterValidation(
          state,
          state.filters,
          state.filterRelation,
          action.groupTree,
          undefined,
          state.filters.length > 1,
          action.groupTree ? "custom" : state.filterGroupingMode,
        ),
        confirmFullSet: false,
      };
    case "restoreRunConfiguration": {
      const restored = workflowConfigurationFromRun(action.result, action.availableColumns);
      return {
        ...state,
        ...restored,
        result: action.result,
        confirmFullSet: false,
      };
    }
    case "setTargetColumns":
      return { ...state, targetColumns: action.columns };
    case "setKeyColumns":
      return { ...state, keyColumns: action.columns };
    case "setAggregationColumns":
      return {
        ...state,
        aggregationColumns: action.columns,
        aggregationColumnLabels: Object.fromEntries(
          Object.entries(state.aggregationColumnLabels).filter(([column]) =>
            action.columns.includes(column),
          ),
        ),
      };
    case "setAggregationColumnLabels":
      return { ...state, aggregationColumnLabels: action.labels };
    case "setNestedAggregationEnabled":
      return { ...state, nestedAggregationEnabled: action.enabled };
    case "setComparisonSections":
      return {
        ...state,
        comparisonSections: action.sections.filter(
          (s) => s.name.trim().length > 0 && s.columns.length > 0,
        ),
      };
    case "setExceptionColumns":
      return { ...state, exceptionColumns: action.columns };
    case "setCommentaryColumns":
      return { ...state, commentaryColumns: action.columns };
    case "setNewExceptionsOnly":
      return { ...state, newExceptionsOnly: action.enabled };
    case "setExtraColumnDisplay":
      return { ...state, extraColumnDisplay: action.display };
    case "setPreparedData":
      return { ...state, preparedData: action.cache };
    case "setSelectedRules":
      return { ...state, selectedRuleIndexes: action.ruleIndexes };
    case "setConfirmFullSet":
      return { ...state, confirmFullSet: action.confirmed };
    case "setPage2Complete":
      return { ...state, page2Complete: action.complete };
    case "setServerRequiresConfirmation":
      return { ...state, serverRequiresConfirmation: action.requires };
    case "setResult":
      return { ...state, result: action.result };
    case "clearResult":
      // Drop the most recent run so the user can re-tune filters / rules
      // and re-run, without losing the rest of the workflow state.
      return { ...state, result: null, serverRequiresConfirmation: false };
    case "sessionExpired":
      // Keep the flag after clearing sensitive workflow state so UploadPage
      // can explain why the user was returned there.
      return { ...initialState, sessionExpired: true };
    case "reset":
      return initialState;
    default:
      return state;
  }
}

interface WorkflowContextValue {
  state: WorkflowState;
  dispatch: React.Dispatch<Action>;
  /** Convenience to clear the workflow (e.g. on session expiry). */
  reset: () => void;
  /** Drop the most recent run so the user can re-tune and re-run. */
  clearResult: () => void;
  /** Mark the session as expired; UI should route to upload. */
  expireSession: () => void;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workflowReducer, initialState);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const clearResult = useCallback(() => dispatch({ type: "clearResult" }), []);
  const expireSession = useCallback(() => dispatch({ type: "sessionExpired" }), []);
  const value = useMemo(
    () => ({ state, dispatch, reset, clearResult, expireSession }),
    [state, reset, clearResult, expireSession],
  );
  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- provider + hook co-located by convention
export function useWorkflow(): WorkflowContextValue {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error("useWorkflow must be used within a WorkflowProvider");
  return ctx;
}
