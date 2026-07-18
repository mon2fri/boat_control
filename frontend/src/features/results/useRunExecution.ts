import { useCallback, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { executeRun } from "../../api/endpoints";
import type { RunRequest, RunResult } from "../../api/domain";
import { useSessionExpiryDispatcher } from "../session/useSessionExpiry";

type Status = "idle" | "running" | "success" | "error";

interface State {
  status: Status;
  error: string | null;
}

/**
 * Executes a comparison/validation run with cancellation support. Only one run
 * is in flight at a time; starting a new run aborts the previous one.
 */
export function useRunExecution(onSuccess: (result: RunResult) => void) {
  const [state, setState] = useState<State>({ status: "idle", error: null });
  const controllerRef = useRef<AbortController | null>(null);
  const handleSessionError = useSessionExpiryDispatcher();

  const run = useCallback(
    async (request: RunRequest) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ status: "running", error: null });
      try {
        const result = await executeRun(request, controller.signal);
        if (controller.signal.aborted) return;
        setState({ status: "success", error: null });
        onSuccess(result);
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
          setState({ status: "idle", error: null });
          return;
        }
        if (handleSessionError(err)) return;
        setState({
          status: "error",
          error: err instanceof ApiError ? err.message : "The run failed unexpectedly",
        });
      }
    },
    [onSuccess, handleSessionError],
  );

  const cancel = useCallback(() => controllerRef.current?.abort(), []);

  return { ...state, run, cancel };
}
