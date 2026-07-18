import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext";
import { useHeaderReport } from "../features/upload/useHeaderReport";
import { usePresetSources } from "../features/settings/useSettings";
import { listSourceFiles } from "../api/endpoints";
import { HeaderReview } from "../features/upload/HeaderReview";
import type { SourceFile } from "../api/domain";

export function UploadPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useWorkflow();
  const header = useHeaderReport((report) => dispatch({ type: "setHeader", header: report }));
  const presets = usePresetSources();

  const [sourceId, setSourceId] = useState<string | null>(null);
  const [remoteFiles, setRemoteFiles] = useState<SourceFile[]>([]);
  const [remoteFileA, setRemoteFileA] = useState<string | null>(null);
  const [remoteFileB, setRemoteFileB] = useState<string | null>(null);
  const [filesLoadKey, setFilesLoadKey] = useState(0);

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
            value={sourceId ?? "local"}
            onChange={(e) => setSourceId(e.target.value === "local" ? null : e.target.value)}
          >
            <option value="local">Local upload</option>
            {presets.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {!sourceId && (
          <LocalUploadForm
            busy={header.status === "loading"}
            onSubmit={(f1, f2) => void header.submitUpload(f1, f2)}
          />
        )}

        {sourceId && (
          <div>
            {loadingFiles && (
              <p role="status" aria-live="polite" className="busy-row">
                <span className="spinner" aria-hidden="true" /> Loading files…
              </p>
            )}

            {!loadingFiles && remoteFiles.length > 0 && (
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

            {!loadingFiles && remoteFiles.length === 0 && (
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
          <HeaderReview report={state.header} />
          <div className="card">
            <button
              type="button"
              className="btn btn--primary"
              disabled={state.header.common.length === 0}
              onClick={() => void navigate("/prepare")}
            >
              Continue to filters &amp; targets
            </button>
            {state.header.common.length === 0 && (
              <p className="alert alert--error" role="alert">
                The files share no columns, so there is nothing to compare.
              </p>
            )}
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
