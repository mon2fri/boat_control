import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext";
import { useHeaderReport } from "../features/upload/useHeaderReport";
import { usePresetSources } from "../features/settings/useSettings";
import { clearUploadSession, listSourceFiles } from "../api/endpoints";
import { HeaderReview } from "../features/upload/HeaderReview";
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
  const [filesLoadKey, setFilesLoadKey] = useState(0);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const lastSessionIdRef = useRef<string | null>(null);

  const initColumns = useCallback((columns: string[]) => {
    setSelectedColumns([...columns]);
  }, []);

  const header = useHeaderReport((report) => {
    dispatch({ type: "setHeader", header: report });
    initColumns(report.common);
    lastSessionIdRef.current = report.sessionId;
  });

  const loadingFiles = sourceId !== null && remoteFiles.length === 0 && filesLoadKey > 0;

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

  const handleRemoteSubmit = useCallback(() => {
    if (!remoteFileA) return;
    void header.submitFromPreset(remoteFileA, remoteFileB);
  }, [remoteFileA, remoteFileB, header]);

  const handleContinue = useCallback(() => {
    if (!state.header) return;
    if (selectedColumns.length === 0 || state.keyColumns.length === 0) return;
    void navigate("/prepare");
  }, [state.header, selectedColumns, state.keyColumns.length, navigate]);

  const handleStartOver = useCallback(() => {
    if (state.header) {
      // The request only removes server-side copies. It never accesses a user's local CSV.
      void clearUploadSession(state.header.sessionId).catch(() => undefined);
    }
    reset();
    setSelectedColumns([]);
    setSourceKind("local");
    setSourceId(null);
    setRemoteFiles([]);
    setRemoteFileA(null);
    setRemoteFileB(null);
  }, [state.header, reset, setSelectedColumns, setSourceId, setRemoteFiles, setRemoteFileA, setRemoteFileB]);

  return (
    <section aria-labelledby="upload-title">
      <h2 id="upload-title">Upload &amp; compare files</h2>
      <p>
        Provide two CSV versions to calibrate. Choose from local upload or a configured remote source.
      </p>

      {state.sessionExpired && (
        <p className="alert alert--error" role="alert">
          Your upload session expired or is no longer available. Please select both files and upload
          them again.
        </p>
      )}

      <div className="card" role="group" aria-label="Source selection">
        <div className="field">
          <label htmlFor="source-kind">Source</label>
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

        {sourceKind === "local" && (
          <LocalUploadForm
            busy={header.status === "loading"}
            onSubmit={(f1, f2) => void header.submitUpload(f1, f2)}
          />
        )}

        {sourceKind === "remote" && (
          <div>
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

            {loadingFiles && (
              <p role="status" aria-live="polite" className="busy-row">
                <span className="spinner" aria-hidden="true" /> Loading files…
              </p>
            )}

            {sourceId && !loadingFiles && remoteFiles.length > 0 && (
              <>
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

                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!remoteFileA || header.status === "loading"}
                  onClick={handleRemoteSubmit}
                >
                  Inspect headers
                </button>
              </>
            )}

            {sourceId && !loadingFiles && remoteFiles.length === 0 && (
              <p className="field-hint">No CSV files found in this source.</p>
            )}
          </div>
        )}

        {header.status === "loading" && (
          <p role="status" aria-live="polite" className="busy-row">
            <span className="spinner" aria-hidden="true" /> Inspecting headers…{" "}
            <button type="button" className="btn" onClick={header.cancel}>
              Cancel
            </button>
          </p>
        )}
        {header.status === "error" && header.error && (
          <p className="alert alert--error" role="alert">
            {header.error}
          </p>
        )}
      </div>

      {state.header && (
        <>
          <HeaderReview
            report={state.header}
            selectedColumns={selectedColumns}
            onSelectedColumnsChange={setSelectedColumns}
            keyColumns={state.keyColumns}
            onKeyColumnsChange={(columns) => dispatch({ type: "setKeyColumns", columns })}
          />
          <div className="card">
            {selectedColumns.length === 0 && (
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
              disabled={selectedColumns.length === 0 || state.keyColumns.length === 0}
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

function LocalUploadForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (file1: File, file2: File) => void;
}) {
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (file1 && file2) onSubmit(file1, file2);
      }}
    >
      <FileField id="file1" label="First file (baseline)" onSelect={setFile1} />
      <FileField id="file2" label="Second file (candidate)" onSelect={setFile2} />
      <button type="submit" className="btn btn--primary" disabled={!file1 || !file2 || busy}>
        Inspect headers
      </button>
    </form>
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
