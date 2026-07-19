import { useEffect, useState } from "react";
import { useWorkflow } from "../state/WorkflowContext";
import { RequireSession } from "../components/RequireSession";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FilterBuilder } from "../features/filters/FilterBuilder";
import { fullSetGuard } from "../features/filters/useFullSetGuard";
import { TargetSelector } from "../features/targets/TargetSelector";
import { ConfigManager } from "../features/configs/ConfigManager";
import { ConfigLoader } from "../features/configs/ConfigLoader";
import { prepareFilters, type PrepareResult } from "../api/endpoints";
import type { FilterRow as FilterRowType } from "../api/domain";
import { useSessionExpiryDispatcher } from "../features/session/useSessionExpiry";
import { RulesPage } from "./RulesPage";

export function PreparePage() {
  const { state, dispatch } = useWorkflow();
  const handleSessionError = useSessionExpiryDispatcher();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prepare, setPrepare] = useState<{
    status: "loading" | "ready" | "error";
    data: PrepareResult | null;
    error: string | null;
  }>({ status: "loading", data: null, error: null });
  const [configLoadName, setConfigLoadName] = useState<string | null>(null);
  const [discardWarnings, setDiscardWarnings] = useState<string[]>([]);

  const header = state.header;
  const guard = fullSetGuard(state);
  const totalRows = (prepare.data?.totalRowsA ?? 0) + (prepare.data?.totalRowsB ?? 0);
  const comparisonColumns = state.comparisonColumns;

  const prepareConfigContent = {
    filters: state.filters,
    targetColumns: state.targetColumns,
    keyColumns: state.keyColumns,
    comparisonColumns,
  };

  const hasUnsavedChanges = state.filters.length > 0 || state.targetColumns.length > 0 || state.keyColumns.length > 0;

  useEffect(() => {
    if (!header) return;
    let cancelled = false;
    prepareFilters(header.sessionId, comparisonColumns)
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
  }, [header?.sessionId, comparisonColumns.join(","), dispatch, handleSessionError]);

  if (!header) {
    return <RequireSession>Upload two files before choosing filters and targets.</RequireSession>;
  }

  function handleConfigLoad(content: unknown): void {
    const data = content as {
      filters?: FilterRowType[];
      targetColumns?: string[];
      keyColumns?: string[];
      comparisonColumns?: string[];
    } | null;
    if (!data) return;

    const warnings: string[] = [];

    if (data.filters) {
      dispatch({ type: "setFilters", filters: data.filters.map((r, i) => ({ ...r, id: `fl-${i}` })) });
    }

    if (data.targetColumns) {
      const valid = data.targetColumns.filter((c) => comparisonColumns.includes(c));
      const discarded = data.targetColumns.filter((c) => !comparisonColumns.includes(c));
      if (discarded.length > 0) {
        warnings.push(`Comparing columns discarded (not in current selection): ${discarded.join(", ")}`);
      }
      dispatch({ type: "setTargetColumns", columns: valid });
    }

    if (data.keyColumns) {
      const valid = data.keyColumns.filter((c) => comparisonColumns.includes(c));
      const discarded = data.keyColumns.filter((c) => !comparisonColumns.includes(c));
      if (discarded.length > 0) {
        warnings.push(`Identifier columns discarded (not in current selection): ${discarded.join(", ")}`);
      }
      dispatch({ type: "setKeyColumns", columns: valid });
    }

    setDiscardWarnings(warnings);
    if (warnings.length > 0) {
      setTimeout(() => setDiscardWarnings([]), 8000);
    }
  }

  function proceed(): void {
    dispatch({ type: "setConfirmFullSet", confirmed: guard.requiresConfirmation });
    setDialogOpen(false);
    document.getElementById("validation-rules")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleContinue(): void {
    if (guard.requiresConfirmation) setDialogOpen(true);
    else proceed();
  }

  return (
    <section aria-labelledby="prepare-title">
      <div className="config-layout">
        <div>
          <h2 id="prepare-title" className="section-heading">Compare &amp; validate</h2>
          <p className="section-hint">
            Comparing <strong>{header.file1Name}</strong> and <strong>{header.file2Name}</strong> across{" "}
            {comparisonColumns.length} selected columns ({totalRows.toLocaleString()} total rows).
          </p>
        </div>
        <ConfigManager
          configType="filters"
          currentContent={prepareConfigContent}
          onLoad={(name) => setConfigLoadName(name)}
          hasUnsavedChanges={hasUnsavedChanges}
          title="Load config for rows and columns"
        />
      </div>

      {configLoadName && (
        <ConfigLoader
          configType="filters"
          name={configLoadName}
          onLoad={handleConfigLoad}
          onDone={() => setConfigLoadName(null)}
        />
      )}

      {discardWarnings.length > 0 && (
        <div className="alert alert--warn" role="alert">
          {discardWarnings.map((w, i) => (
            <p key={i} style={{ margin: 0 }}>{w}</p>
          ))}
        </div>
      )}

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
        columns={comparisonColumns}
        rows={state.filters}
        columnValues={prepare.data?.columnValues ?? {}}
        loadingValues={prepare.status === "loading"}
        onChange={(rows) => dispatch({ type: "setFilters", filters: rows })}
      />

      <TargetSelector
        columns={comparisonColumns}
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
          Continue to validation rules
        </button>
      </div>

      <RulesPage embedded />

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
