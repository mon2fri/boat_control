import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useWorkflow } from "../../state/WorkflowContext";

/**
 * Returns true if the error looks like a session expiry / 404, and dispatches
 * the corresponding action so the UI routes the user back to upload.
 */
export function isSessionExpiredError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status !== 404 && err.status !== 400) return false;
  const detail = typeof err.detail === "string" ? err.detail : "";
  return /session/i.test(detail) && /(not found|expired|gone|invalid)/i.test(detail);
}

/**
 * Watch the workflow's `sessionExpired` flag and route to the upload page when
 * it becomes true. Components that detect a session-expired error should call
 * the dispatcher returned by `useSessionExpiryDispatcher`.
 */
export function useSessionExpiryRedirect(): void {
  const navigate = useNavigate();
  const { state } = useWorkflow();
  useEffect(() => {
    if (state.sessionExpired) {
      void navigate("/", { replace: true });
    }
  }, [state.sessionExpired, navigate]);
}

export function useSessionExpiryDispatcher(): (err: unknown) => boolean {
  const { expireSession } = useWorkflow();
  return useCallback((err: unknown) => {
    if (isSessionExpiredError(err)) {
      expireSession();
      return true;
    }
    return false;
  }, [expireSession]);
}
