import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext";
import { RequireSession } from "../components/RequireSession";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FilterBuilder } from "../features/filters/FilterBuilder";
import { fullSetGuard } from "../features/filters/useFullSetGuard";
import { TargetSelector } from "../features/targets/TargetSelector";
import { prepareFilters, type PrepareResult } from "../api/endpoints";
import { useSessionExpiryDispatcher } from "../features/session/useSessionExpiry";

export function PreparePage() {
  const navigate = useNavigate();
  const { state, dispatch } = useWorkflow();
  const handleSessionError = useSessionExpiryDispatcher();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prepare, setPrepare] = useState<{
    status: "loading" | "ready" | "error";
    data: PrepareResult | null;
    error: string | null;
  }>({ status: "loading", data: null, error: null });

  const header = state.header;
  const guard = fullSetGuard(state);
  const totalRows = (prepare.data?.totalRowsA ?? 0) + (prepare.data?.totalRowsB ?? 0);

  // Run prepare once when the page mounts and a session is available.
  useEffect(() => {
    if (!header) return;
    let cancelled = false;
    prepareFilters(header.sessionId, header.common)
      .then((data) => {
        if (cancelled) return;
        setPrepare({ status: "ready", data, error: null });
        dispatch({ type: "setServerRequiresConfirmation", requires: data.requiresConfirmation });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        if (handleSessionError(err)) return;
        setPrepare({ status: "error", data: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
    // header.sessionId is the dependency; header.common is captured at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header?.sessionId, dispatch, handleSessionError]);

  if (!header) {
    return <RequireSession>Upload two files before choosing filters and targets.</RequireSession>;
  }

  function proceed(): void {
    dispatch({ type: "setConfirmFullSet", confirmed: guard.requiresConfirmation });
    setDialogOpen(false);
    void navigate("/rules");
  }

  function handleContinue(): void {
    if (guard.requiresConfirmation) setDialogOpen(true);
    else proceed();
  }

  return (
    <section aria-labelledby="prepare-title">
      <h2 id="prepare-title">Filters &amp; targets</h2>
      <p>
        Comparing <strong>{header.file1Name}</strong> and <strong>{header.file2Name}</strong> across{" "}
        {header.common.length} shared columns ({totalRows.toLocaleString()} total rows).
      </p>

      {prepare.status === "loading" && (
        <p role="status" aria-live="polite" className="busy-row">
          <span className="spinner" aria-hidden="true" /> Loading column values…
        </p>
      )}
      {prepare.status === "error" && (
        <p className="alert alert--error" role="alert">
          Could not prepare filters: {prepare.error}
        </p>
      )}

      <FilterBuilder
        columns={header.common}
        rows={state.filters}
        columnValues={prepare.data?.columnValues ?? {}}
        loadingValues={prepare.status === "loading"}
        onChange={(rows) => dispatch({ type: "setFilters", filters: rows })}
      />

      <TargetSelector
        sessionId={header.sessionId}
        columns={header.common}
        selected={state.targetColumns}
        onChange={(columns) => dispatch({ type: "setTargetColumns", columns })}
      />

      <div className="card">
        {guard.requiresConfirmation && (
          <p className="alert alert--warn" role="status">
            No filters set and {totalRows.toLocaleString()} rows exceed the server threshold. You
            will be asked to confirm a full-set run.
          </p>
        )}
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleContinue}
          disabled={prepare.status !== "ready"}
        >
          Continue to rules
        </button>
      </div>

      <ConfirmDialog
        title="Run against the full set?"
        open={dialogOpen}
        confirmLabel="Yes, run on all rows"
        onCancel={() => setDialogOpen(false)}
        onConfirm={proceed}
      >
        <p>
          You have not defined any filters and the combined row count is{" "}
          {totalRows.toLocaleString()}. This will compare and validate every row. Continue?
        </p>
      </ConfirmDialog>
    </section>
  );
}
