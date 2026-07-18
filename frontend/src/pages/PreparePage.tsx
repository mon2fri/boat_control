import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext";
import { RequireSession } from "../components/RequireSession";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FilterBuilder } from "../features/filters/FilterBuilder";
import { fullSetGuard } from "../features/filters/useFullSetGuard";
import { TargetSelector } from "../features/targets/TargetSelector";
import { KeyColumnSelector } from "../features/keys/KeyColumnSelector";
import { useSavedFilters } from "../features/settings/useSettings";
import { ConfigLoader } from "../features/configs/ConfigLoader";
import { ConfigManager } from "../features/configs/ConfigManager";
import { prepareFilters, type PrepareResult } from "../api/endpoints";
import type { FilterRow as FilterRowType } from "../api/domain";
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
  const savedFilters = useSavedFilters();
  const [applyingFilter, setApplyingFilter] = useState(false);
  const [configLoadName, setConfigLoadName] = useState<string | null>(null);

  const header = state.header;
  const guard = fullSetGuard(state);
  const totalRows = (prepare.data?.totalRowsA ?? 0) + (prepare.data?.totalRowsB ?? 0);

  const prepareConfigContent = {
    filters: state.filters,
    targetColumns: state.targetColumns,
    keyColumns: state.keyColumns,
  };

  const hasUnsavedChanges = state.filters.length > 0 || state.targetColumns.length > 0 || state.keyColumns.length > 0;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header?.sessionId, dispatch, handleSessionError]);

  if (!header) {
    return <RequireSession>Upload two files before choosing filters and targets.</RequireSession>;
  }

  function applySavedFilter(filter: { rows: FilterRowType[] }): void {
    setApplyingFilter(true);
    dispatch({ type: "setFilters", filters: filter.rows.map((row, i) => ({ ...row, id: `saved-${i}` })) });
    setTimeout(() => setApplyingFilter(false), 0);
  }

  function handleConfigLoad(content: unknown): void {
    const data = content as { filters?: FilterRowType[]; targetColumns?: string[]; keyColumns?: string[] } | null;
    if (!data) return;
    if (data.filters) dispatch({ type: "setFilters", filters: data.filters.map((r, i) => ({ ...r, id: `fl-${i}` })) });
    if (data.targetColumns) dispatch({ type: "setTargetColumns", columns: data.targetColumns });
    if (data.keyColumns) dispatch({ type: "setKeyColumns", columns: data.keyColumns });
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

      {savedFilters.data && savedFilters.data.length > 0 && (
        <div className="card">
          <h3>Load saved filter</h3>
          <div className="field">
            <label htmlFor="saved-filter-select">Saved filter</label>
            <select
              id="saved-filter-select"
              defaultValue=""
              onChange={(e) => {
                const match = savedFilters.data?.find((f) => f.id === e.target.value);
                if (match) applySavedFilter(match);
              }}
              disabled={applyingFilter}
            >
              <option value="" disabled>
                -- Select a saved filter --
              </option>
              {savedFilters.data.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          {applyingFilter && (
            <p className="field-hint" role="status">
              Filter applied.
            </p>
          )}
        </div>
      )}

      <ConfigManager
        configType="filters"
        currentContent={prepareConfigContent}
        onLoad={(name) => setConfigLoadName(name)}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {configLoadName && (
        <ConfigLoader
          configType="filters"
          name={configLoadName}
          onLoad={handleConfigLoad}
          onDone={() => setConfigLoadName(null)}
        />
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

      <KeyColumnSelector
        columns={header.common}
        selected={state.keyColumns}
        onChange={(columns) => dispatch({ type: "setKeyColumns", columns })}
      />

      <div className="card">
        {guard.requiresConfirmation && (
          <p className="alert alert--warn" role="status">
            No filters set and {totalRows.toLocaleString()} rows exceed the server threshold. You
            will be asked to confirm a full-set run.
          </p>
        )}
        {state.keyColumns.length === 0 && (
          <p className="alert alert--error" role="alert">
            Pick at least one key column before continuing — it identifies a record across both
            files.
          </p>
        )}
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleContinue}
          disabled={prepare.status !== "ready" || state.keyColumns.length === 0}
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
