import { useCallback, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { uploadFiles } from "../../api/endpoints";
import type { HeaderReport } from "../../api/domain";

type Status = "idle" | "loading" | "success" | "error";

interface State {
  status: Status;
  error: string | null;
  report: HeaderReport | null;
}

/**
 * Drives a header-report request (file upload or preset load) with explicit
 * cancellation. A single in-flight request is tracked via an AbortController so
 * the user can cancel a long transfer without leaving a dangling promise.
 */
export function useHeaderReport(onSuccess: (report: HeaderReport) => void) {
  const [state, setState] = useState<State>({ status: "idle", error: null, report: null });
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (request: (signal: AbortSignal) => Promise<HeaderReport>) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ status: "loading", error: null, report: null });
      try {
        const report = await request(controller.signal);
        if (controller.signal.aborted) return;
        setState({ status: "success", error: null, report });
        onSuccess(report);
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
          setState({ status: "idle", error: null, report: null });
          return;
        }
        const message = err instanceof ApiError ? err.message : "Unexpected error while loading files";
        setState({ status: "error", error: message, report: null });
      }
    },
    [onSuccess],
  );

  const submitUpload = useCallback(
    (file1: File, file2: File) => run((signal) => uploadFiles(file1, file2, signal)),
    [run],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  return { ...state, submitUpload, cancel };
}
