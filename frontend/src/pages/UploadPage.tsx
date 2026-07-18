import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext";
import { useHeaderReport } from "../features/upload/useHeaderReport";
import { HeaderReview } from "../features/upload/HeaderReview";

export function UploadPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useWorkflow();
  const header = useHeaderReport((report) => dispatch({ type: "setHeader", header: report }));

  return (
    <section aria-labelledby="upload-title">
      <h2 id="upload-title">Upload &amp; compare files</h2>
      <p>
        Provide two CSV versions to calibrate. Headers are inspected first; only columns present in
        both files are compared and validated.
      </p>

      {state.sessionExpired && (
        <p className="alert alert--error" role="alert">
          Your upload session expired or is no longer available. Please select both files and upload
          them again.
        </p>
      )}

      <div className="card" role="group" aria-label="Source selection">
        <UploadForm
          busy={header.status === "loading"}
          onSubmit={(f1, f2) => void header.submitUpload(f1, f2)}
        />

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

function UploadForm({
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
