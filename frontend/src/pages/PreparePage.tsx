import { useEffect, useState } from "react";
import { useWorkflow } from "../state/WorkflowContext";
import { RequireSession } from "../components/RequireSession";
import { FilterBuilder } from "../features/filters/FilterBuilder";
import { TargetSelector } from "../features/targets/TargetSelector";
import { ConfigManager } from "../features/configs/ConfigManager";
import { ConfigLoader } from "../features/configs/ConfigLoader";
import { useFamilies } from "../features/settings/useSettings";
import { prepareFilters, type PrepareResult } from "../api/endpoints";
import { resolveRowsColumnsConfig, mapWorkflowToRowsColumnsConfig } from "../api/configContent";
import { useSessionExpiryDispatcher } from "../features/session/useSessionExpiry";
import { RulesPage } from "./RulesPage";

export function PreparePage() {
  const { state, dispatch } = useWorkflow();
  const handleSessionError = useSessionExpiryDispatcher();
  const familiesQuery = useFamilies();
  const families = familiesQuery.data ?? [];

  const [prepare, setPrepare] = useState<{
    status: "loading" | "ready" | "error";
    data: PrepareResult | null;
    error: string | null;
  }>({ status: "loading", data: null, error: null });
  const [configLoadName, setConfigLoadName] = useState<string | null>(null);
  const [discardWarnings, setDiscardWarnings] = useState<string[]>([]);

  const header = state.header;
  const totalRows = (prepare.data?.totalRowsA ?? 0) + (prepare.data?.totalRowsB ?? 0);
  const comparisonColumns = state.comparisonColumns;

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
    const result = resolveRowsColumnsConfig(content, families, comparisonColumns);

    const warnings: string[] = [];

    if (result.filters.length > 0) {
      dispatch({ type: "setFilters", filters: result.filters });
    }
    if (result.targetColumns.length > 0) {
      dispatch({ type: "setTargetColumns", columns: result.targetColumns });
    }
    if (result.keyColumns.length > 0) {
      dispatch({ type: "setKeyColumns", columns: result.keyColumns });
    }

    for (const w of result.warnings) {
      warnings.push(w.message);
    }

    setDiscardWarnings(warnings);
    if (warnings.length > 0) {
      setTimeout(() => setDiscardWarnings([]), 8000);
    }
  }

  return (
    <section aria-labelledby="prepare-title">
      <div className="config-layout">
        <div>
          <h2 id="prepare-title" className="section-heading">2. Compare &amp; validate</h2>
          <p className="section-hint">
            Comparing <strong>{header.file1Name}</strong> and <strong>{header.file2Name}</strong> across{" "}
            {comparisonColumns.length} selected columns ({totalRows.toLocaleString()} total rows).
          </p>
        </div>
        <ConfigManager
          configType="rows-and-columns"
          currentContent={mapWorkflowToRowsColumnsConfig(
            {
              comparisonColumns,
              keyColumns: state.keyColumns,
              aggregationColumns: state.aggregationColumns,
              filters: state.filters,
              targetColumns: state.targetColumns,
            },
            families,
          )}
          onLoad={(name) => setConfigLoadName(name)}
          disabled={prepare.status === "loading"}
          hasUnsavedChanges={hasUnsavedChanges}
          title="Load config for rows and columns"
        />
      </div>

      {configLoadName && (
        <ConfigLoader
          configType="rows-and-columns"
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
        <p role="status" aria-live="polite" className="busy-row alert alert--error">
          <span className="spinner" aria-hidden="true" /> Loading data, please wait, DO NOT refresh...
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
        families={families}
        selected={state.targetColumns}
        onChange={(columns) => dispatch({ type: "setTargetColumns", columns })}
      />

      <RulesPage embedded columnValues={prepare.data?.columnValues ?? {}} />
    </section>
  );
}
