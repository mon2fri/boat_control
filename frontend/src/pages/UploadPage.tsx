import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext";
import { useHeaderReport } from "../features/upload/useHeaderReport";
import { useFamilies, usePresetSources } from "../features/settings/useSettings";
import { clearUploadSession, listSourceFiles } from "../api/endpoints";
import { HeaderReview } from "../features/upload/HeaderReview";
import { ConfigManager } from "../features/configs/ConfigManager";
import { ConfigLoader } from "../features/configs/ConfigLoader";
import { resolveRowsColumnsConfig, mapWorkflowToRowsColumnsConfig } from "../api/configContent";
import type { SourceFile } from "../api/domain";

export function UploadPage() {
  const navigate = useNavigate();
  const { state, dispatch, reset } = useWorkflow();
  const presets = usePresetSources();

  const [sourceKind, setSourceKind] = useState<"local" | "remote">("local");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [remoteFiles, setRemoteFiles] = useState<SourceFile[]>([]);
  const [remoteFileA, setRemoteFileA] = useState<string | null>(null);
  const [remoteFileB, setRemoteFileB] = useState<string | null>(null);
  const [localFile1, setLocalFile1] = useState<File | null>(null);
  const [localFile2, setLocalFile2] = useState<File | null>(null);
  const [filesLoadKey, setFilesLoadKey] = useState(0);
  const [configLoadName, setConfigLoadName] = useState<string | null>(null);
  const lastSessionIdRef = useRef<string | null>(null);

  const familiesQuery = useFamilies();
  const families = familiesQuery.data ?? [];

  const [configWarnings, setConfigWarnings] = useState<string[]>([]);

  const header = useHeaderReport((report) => {
    dispatch({ type: "setHeader", header: report });
    lastSessionIdRef.current = report.sessionId;
  });

  const loadingFiles = sourceId !== null && remoteFiles.length === 0 && filesLoadKey > 0;
  const hasSession = state.header !== null;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!sourceId) return;
    let cancelled = false;
    setRemoteFiles([]);
    setRemoteFileA(null);
    setRemoteFileB(null);
    setFilesLoadKey((k) => k + 1);
    listSourceFiles(sourceId)
      .then((files) => {
        if (cancelled) return;
        setRemoteFiles(files);
      })
      .catch(() => {
        if (cancelled) return;
      });
    return () => {
      cancelled = true;
    };
  }, [sourceId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleLocalSubmit = useCallback(() => {
    if (!localFile1 || !localFile2) return;
    void header.submitUpload(localFile1, localFile2);
  }, [localFile1, localFile2, header]);

  const handleRemoteSubmit = useCallback(() => {
    if (!remoteFileA) return;
    void header.submitFromPreset(remoteFileA, remoteFileB);
  }, [remoteFileA, remoteFileB, header]);

  const handleContinue = useCallback(() => {
    if (!state.header) return;
    if (state.comparisonColumns.length === 0 || state.keyColumns.length === 0) return;
    void navigate("/prepare");
  }, [state.header, state.comparisonColumns.length, state.keyColumns.length, navigate]);

  const handleStartOver = useCallback(() => {
    if (state.header) {
      void clearUploadSession(state.header.sessionId).catch(() => undefined);
    }
    reset();
    setSourceKind("local");
    setSourceId(null);
    setRemoteFiles([]);
    setRemoteFileA(null);
    setRemoteFileB(null);
    setLocalFile1(null);
    setLocalFile2(null);
  }, [state.header, reset, setSourceId, setRemoteFiles, setRemoteFileA, setRemoteFileB]);

  const handleReplaceFiles = useCallback(() => {
    if (state.header) {
      void clearUploadSession(state.header.sessionId).catch(() => undefined);
    }
    reset();
    setSourceKind("local");
    setSourceId(null);
    setRemoteFiles([]);
    setRemoteFileA(null);
    setRemoteFileB(null);
    setLocalFile1(null);
    setLocalFile2(null);
  }, [state.header, reset, setSourceId, setRemoteFiles, setRemoteFileA, setRemoteFileB]);

  function handleConfigLoad(content: unknown): void {
    if (!state.header) return;
    const result = resolveRowsColumnsConfig(content, families, state.header.common);
    if (result.comparisonColumns.length > 0) {
      dispatch({ type: "setComparisonColumns", columns: result.comparisonColumns });
    }
    if (result.keyColumns.length > 0) {
      dispatch({ type: "setKeyColumns", columns: result.keyColumns });
    }
    if (result.aggregationColumns.length > 0) {
      dispatch({ type: "setAggregationColumns", columns: result.aggregationColumns });
    }
    if (result.filters.length > 0) {
      dispatch({ type: "setFilters", filters: result.filters });
    }
    if (result.targetColumns.length > 0) {
      dispatch({ type: "setTargetColumns", columns: result.targetColumns });
    }
    if (result.warnings.length > 0) {
      setConfigWarnings(result.warnings.map((w) => w.message));
      setTimeout(() => setConfigWarnings([]), 10000);
    }
  }

  return (
    <section aria-labelledby="upload-title">
      <h2 id="upload-title" className="section-heading">1. Upload &amp; compare files</h2>
      <p className="section-hint">
        Provide two CSV versions to calibrate. Choose from local upload or a configured remote source.
      </p>

      {state.sessionExpired && (
        <p className="alert alert--error" role="alert">
          Your upload session expired or is no longer available. Please select both files and upload
          them again.
        </p>
      )}

      {/* Three-card layout: Source, Baseline, Comparison */}
      <div className="card-grid-3">
        {/* Source card */}
        <div className="card" role="group" aria-label="Source">
          <h3 className="card-heading">Source</h3>
          {hasSession ? (
            <p className="field-hint">
              <strong>{sourceKind === "local" ? "Local upload" : "Remote source"}</strong>
            </p>
          ) : (
            <div className="field">
              <label htmlFor="source-kind">Source type</label>
              <select
                id="source-kind"
                value={sourceKind}
                onChange={(e) => {
                  setSourceKind(e.target.value as "local" | "remote");
                  setSourceId(null);
                }}
              >
                <option value="local">Local upload</option>
                <option value="remote">Remote source</option>
              </select>
            </div>
          )}

          {!hasSession && sourceKind === "remote" && (
            <div className="field">
              <label htmlFor="remote-source">Remote source</label>
              <select
                id="remote-source"
                value={sourceId ?? ""}
                onChange={(e) => setSourceId(e.target.value || null)}
              >
                <option value="">-- Select a configured source --</option>
                {presets.data?.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              {!presets.isLoading && (presets.data?.length ?? 0) === 0 && (
                <span className="field-hint">No remote sources are configured. Add one in Settings.</span>
              )}
            </div>
          )}

          {!hasSession && header.status === "loading" && (
            <p role="status" aria-live="polite" className="busy-row">
              <span className="spinner" aria-hidden="true" /> Inspecting…{" "}
              <button type="button" className="btn" onClick={header.cancel}>
                Cancel
              </button>
            </p>
          )}
          {!hasSession && header.status === "error" && header.error && (
            <p className="alert alert--error" role="alert">
              {header.error}
            </p>
          )}
        </div>

        {/* Baseline card */}
        <div className="card" role="group" aria-label="Baseline">
          <h3 className="card-heading">Baseline</h3>
          {hasSession ? (
            <p className="field-hint">
              <strong>{state.header!.file1Name}</strong> — currently loaded
            </p>
          ) : sourceKind === "local" ? (
            <FileField id="file1" label="First file (baseline)" onSelect={setLocalFile1} />
          ) : (
            <div>
              {loadingFiles && (
                <p role="status" aria-live="polite" className="busy-row">
                  <span className="spinner" aria-hidden="true" /> Loading files…
                </p>
              )}
              {sourceId && !loadingFiles && remoteFiles.length > 0 && (
                <div className="field">
                  <label htmlFor="remote-file-a">Baseline file</label>
                  <select
                    id="remote-file-a"
                    value={remoteFileA ?? ""}
                    onChange={(e) => setRemoteFileA(e.target.value || null)}
                  >
                    <option value="">-- Select --</option>
                    {remoteFiles.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({(f.size / 1024 / 1024).toFixed(1)} MB)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {sourceId && !loadingFiles && remoteFiles.length === 0 && (
                <p className="field-hint">No CSV files found in this source.</p>
              )}
            </div>
          )}
        </div>

        {/* Comparison card */}
        <div className="card" role="group" aria-label="Comparison">
          <h3 className="card-heading">Comparison</h3>
          {hasSession ? (
            <p className="field-hint">
              <strong>{state.header!.file2Name}</strong> — currently loaded
            </p>
          ) : sourceKind === "local" ? (
            <FileField id="file2" label="Second file (candidate)" onSelect={setLocalFile2} />
          ) : (
            <div>
              {sourceId && !loadingFiles && remoteFiles.length > 0 && (
                <div className="field">
                  <label htmlFor="remote-file-b">Candidate file</label>
                  <select
                    id="remote-file-b"
                    value={remoteFileB ?? ""}
                    onChange={(e) => setRemoteFileB(e.target.value || null)}
                  >
                    <option value="">-- Select --</option>
                    {remoteFiles.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({(f.size / 1024 / 1024).toFixed(1)} MB)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Local upload submit */}
      {!hasSession && sourceKind === "local" && (
        <div className="card" style={{ marginTop: "var(--space)" }}>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!localFile1 || !localFile2 || header.status === "loading"}
            onClick={handleLocalSubmit}
          >
            Inspect headers
          </button>
        </div>
      )}

      {/* Remote upload submit */}
      {!hasSession && sourceKind === "remote" && sourceId && !loadingFiles && remoteFiles.length > 0 && (
        <div className="card" style={{ marginTop: "var(--space)" }}>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!remoteFileA || header.status === "loading"}
            onClick={handleRemoteSubmit}
          >
            Inspect headers
          </button>
        </div>
      )}

      {/* Session loaded: column review + continue */}
      {hasSession && (
        <>
          <div className="card" role="group" aria-label="Loaded files">
            <h3 className="card-heading">Loaded files</h3>
            <p className="field-hint">
              Baseline: <strong>{state.header!.file1Name}</strong> — currently loaded
              <br />
              Comparison: <strong>{state.header!.file2Name}</strong> — currently loaded
            </p>
            <button
              type="button"
              className="btn btn--danger"
              style={{ marginTop: "var(--space)" }}
              onClick={handleReplaceFiles}
            >
              Replace files
            </button>
          </div>
          <HeaderReview
            report={state.header!}
            selectedColumns={state.comparisonColumns}
            onSelectedColumnsChange={(columns) => dispatch({ type: "setComparisonColumns", columns })}
            keyColumns={state.keyColumns}
            onKeyColumnsChange={(columns) => dispatch({ type: "setKeyColumns", columns })}
            aggregationColumns={state.aggregationColumns}
            onAggregationColumnsChange={(columns) => dispatch({ type: "setAggregationColumns", columns })}
          />
          {configWarnings.length > 0 && (
            <div className="alert alert--warn" role="alert">
              {configWarnings.map((w, i) => (
                <p key={i} style={{ margin: 0 }}>{w}</p>
              ))}
            </div>
          )}

          <ConfigManager
            configType="rows-and-columns"
            currentContent={mapWorkflowToRowsColumnsConfig(
              {
                comparisonColumns: state.comparisonColumns,
                keyColumns: state.keyColumns,
                aggregationColumns: state.aggregationColumns,
                filters: state.filters,
                targetColumns: state.targetColumns,
              },
              families,
            )}
            onLoad={(name) => setConfigLoadName(name)}
            hasUnsavedChanges={state.comparisonColumns.length > 0 || state.keyColumns.length > 0}
            title="Load config for rows and columns"
          />

          {configLoadName && (
            <ConfigLoader
              configType="rows-and-columns"
              name={configLoadName}
              onLoad={handleConfigLoad}
              onDone={() => setConfigLoadName(null)}
            />
          )}

          <div className="card">
            {state.comparisonColumns.length === 0 && (
              <p className="alert alert--error" role="alert">
                Select at least one column before continuing.
              </p>
            )}
            {state.keyColumns.length === 0 && (
              <p className="alert alert--error" role="alert">
                Select at least one identifier column before continuing.
              </p>
            )}
            <button
              type="button"
              className="btn btn--primary"
              disabled={state.comparisonColumns.length === 0 || state.keyColumns.length === 0}
              onClick={() => void handleContinue()}
            >
              Continue to compare &amp; validate
            </button>
            <button
              type="button"
              className="btn btn--danger"
              style={{ marginLeft: "var(--space)" }}
              onClick={handleStartOver}
            >
              Start Over
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function FileField({
  id,
  label,
  onSelect,
}: {
  id: string;
  label: string;
  onSelect: (file: File | null) => void;
}) {
  const [name, setName] = useState<string | null>(null);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          onSelect(file);
          setName(file?.name ?? null);
        }}
      />
      {name && (
        <span className="field-hint">
          Selected: <strong>{name}</strong>
        </span>
      )}
    </div>
  );
}
