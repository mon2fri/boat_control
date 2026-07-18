import type { WorkflowState } from "../../state/WorkflowContext";

export interface FullSetGuard {
  /** Server-provided: true when the combined row count meets the threshold. */
  requiresConfirmation: boolean;
}

/**
 * The server tells us whether a full-set run needs explicit confirmation via
 * the `requires_confirmation` flag on the prepare response. The Prepare page
 * stores that in `state.serverRequiresConfirmation`; this helper is the typed
 * read accessor (no hook state needed because the value is server-owned).
 */
export function fullSetGuard(state: WorkflowState): FullSetGuard {
  return { requiresConfirmation: state.serverRequiresConfirmation };
}
