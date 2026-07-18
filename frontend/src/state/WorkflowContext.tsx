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
  filters: FilterRow[];
  targetColumns: string[];
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
  filters: [],
  targetColumns: [],
  selectedRuleIndexes: [],
  confirmFullSet: false,
  result: null,
  serverRequiresConfirmation: false,
  sessionExpired: false,
};

type Action =
  | { type: "setHeader"; header: HeaderReport }
  | { type: "setFilters"; filters: FilterRow[] }
  | { type: "setTargetColumns"; columns: string[] }
  | { type: "setSelectedRules"; ruleIndexes: string[] }
  | { type: "setConfirmFullSet"; confirmed: boolean }
  | { type: "setServerRequiresConfirmation"; requires: boolean }
  | { type: "setResult"; result: RunResult }
  | { type: "sessionExpired" }
  | { type: "reset" };

function reducer(state: WorkflowState, action: Action): WorkflowState {
  switch (action.type) {
    case "setHeader":
      return { ...initialState, header: action.header };
    case "setFilters":
      return { ...state, filters: action.filters, confirmFullSet: false };
    case "setTargetColumns":
      return { ...state, targetColumns: action.columns };
    case "setSelectedRules":
      return { ...state, selectedRuleIndexes: action.ruleIndexes };
    case "setConfirmFullSet":
      return { ...state, confirmFullSet: action.confirmed };
    case "setServerRequiresConfirmation":
      return { ...state, serverRequiresConfirmation: action.requires };
    case "setResult":
      return { ...state, result: action.result };
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
  /** Mark the session as expired; UI should route to upload. */
  expireSession: () => void;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const expireSession = useCallback(() => dispatch({ type: "sessionExpired" }), []);
  const value = useMemo(() => ({ state, dispatch, reset, expireSession }), [state, reset, expireSession]);
  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- provider + hook co-located by convention
export function useWorkflow(): WorkflowContextValue {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error("useWorkflow must be used within a WorkflowProvider");
  return ctx;
}
