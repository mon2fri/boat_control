import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import type {
  ComparisonSection,
  FilterRow,
  HeaderReport,
  PrepareResult,
  RunResult,
  ExtraColumnDisplay,
} from "../api/domain";

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
  /** Shared columns selected for comparison. Initialized to all common columns on upload. */
  comparisonColumns: string[];
  filters: FilterRow[];
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
  comparisonColumns: [],
  filters: [],
  targetColumns: [],
  keyColumns: [],
  aggregationColumns: [],
  aggregationColumnLabels: {},
  nestedAggregationEnabled: false,
  comparisonSections: [],
  exceptionColumns: [],
  extraColumnDisplay: { overallResultPage: false, overallHtmlReport: false, overallExcelReport: false, newBooksResultPage: false, newBooksHtmlReport: false, newBooksExcelReport: false },
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
  | { type: "setComparisonColumns"; columns: string[] }
  | { type: "removeComparisonColumn"; column: string }
  | { type: "setAggregationColumns"; columns: string[] }
  | { type: "setAggregationColumnLabels"; labels: Record<string, string> }
  | { type: "setNestedAggregationEnabled"; enabled: boolean }
  | { type: "setComparisonSections"; sections: ComparisonSection[] }
  | { type: "setExceptionColumns"; columns: string[] }
  | { type: "setExtraColumnDisplay"; display: ExtraColumnDisplay }
  | { type: "setPreparedData"; cache: PreparedDataCache }
  | { type: "setFilters"; filters: FilterRow[] }
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

function reducer(state: WorkflowState, action: Action): WorkflowState {
  switch (action.type) {
    case "setHeader":
      return { ...initialState, header: action.header, comparisonColumns: [...action.header.common] };
    case "setComparisonColumns": {
      const cols = action.columns;
      const colSet = new Set(cols);
      return {
        ...state,
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
        filters: state.filters.map((f) =>
          colSet.has(f.column) ? f : { ...f, column: "" },
        ),
      };
    }
    case "removeComparisonColumn": {
      const col = action.column;
      const next = state.comparisonColumns.filter((c) => c !== col);
      return {
        ...state,
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
        filters: state.filters.map((f) =>
          f.column === col ? { ...f, column: "" } : f,
        ),
      };
    }
    case "setFilters":
      return { ...state, filters: action.filters, confirmFullSet: false };
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
  const [state, dispatch] = useReducer(reducer, initialState);
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
