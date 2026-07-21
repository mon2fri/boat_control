import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import type { FilterRow, HeaderReport, RunResult } from "../api/domain";

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
  selectedRuleIndexes: string[];
  /** User acknowledged running against the full set with no filters. */
  confirmFullSet: boolean;
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
  selectedRuleIndexes: [],
  confirmFullSet: false,
  result: null,
  serverRequiresConfirmation: false,
  sessionExpired: false,
};

type Action =
  | { type: "setHeader"; header: HeaderReport }
  | { type: "setComparisonColumns"; columns: string[] }
  | { type: "removeComparisonColumn"; column: string }
  | { type: "setFilters"; filters: FilterRow[] }
  | { type: "setTargetColumns"; columns: string[] }
  | { type: "setKeyColumns"; columns: string[] }
  | { type: "setSelectedRules"; ruleIndexes: string[] }
  | { type: "setConfirmFullSet"; confirmed: boolean }
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
        keyColumns: state.keyColumns.filter((c) => colSet.has(c)),
        targetColumns: state.targetColumns.filter((c) => colSet.has(c)),
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
        keyColumns: state.keyColumns.filter((c) => c !== col),
        targetColumns: state.targetColumns.filter((c) => c !== col),
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
    case "setSelectedRules":
      return { ...state, selectedRuleIndexes: action.ruleIndexes };
    case "setConfirmFullSet":
      return { ...state, confirmFullSet: action.confirmed };
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
