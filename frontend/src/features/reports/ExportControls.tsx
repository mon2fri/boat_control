import { useRef, useState } from "react";
import { downloadExport, ExportError } from "../../api/endpoints";

interface Props {
  runId: string;
  reportName: string;
}

interface DownloadState {
  format: "html" | "csv";
  received: number;
  total: number | null;
}

/**
 * Export the current result as HTML or CSV. The backend only exposes a POST
 * `/api/reports/export/` endpoint that streams a file with a
 * `Content-Disposition` filename. The client POSTs, streams the response
 * (so a progress bar updates), and triggers a download via a hidden anchor
 * using the server-supplied filename — never one the user typed.
 *
 * The component shows: a live progress bar while generating, the chosen
 * safe filename, an in-flight cancel button, and a clear error message that
 * distinguishes between user-cancelled, network interruption, and server
 * errors.
 */
export function ExportControls({ runId, reportName }: Props) {
  const [busy, setBusy] = useState<DownloadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function download(format: "html" | "csv"): Promise<void> {
    setError(null);
    setSuccess(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy({ format, received: 0, total: null });
    try {
      const result = await downloadExport(runId, format, reportName, {
        signal: controller.signal,
        onProgress: (received, total) => {
          setBusy({ format, received, total });
        },
      });
      // Anchor download: server-supplied filename, never a user-typed one.
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSuccess(result.filename);
    } catch (err) {
      if (controller.signal.aborted) {
        setError("Export cancelled.");
      } else if (err instanceof ExportError) {
        setError(`Export failed: ${err.message}`);
      } else if (err instanceof Error) {
        setError(`Export interrupted: ${err.message}`);
      } else {
        setError("Export failed for an unknown reason.");
      }
    } finally {
      abortRef.current = null;
      setBusy(null);
    }
  }

  function cancel(): void {
    abortRef.current?.abort();
  }

  const percent =
    busy && busy.total && busy.total > 0 ? Math.min(100, Math.round((busy.received / busy.total) * 100)) : null;

  return (
    <div className="export-controls" role="group" aria-label="Export result">
      <button type="button" className="btn" onClick={() => void download("html")} disabled={busy !== null}>
        {busy?.format === "html" ? "Generating HTML…" : "Export HTML"}
      </button>
      <button type="button" className="btn" onClick={() => void download("csv")} disabled={busy !== null}>
        {busy?.format === "csv" ? "Generating CSV…" : "Export CSV"}
      </button>

      {busy && (
        <div className="export-progress" role="status" aria-live="polite">
          <span>
            Downloading {busy.format.toUpperCase()}… {formatBytes(busy.received)}
            {busy.total !== null && ` of ${formatBytes(busy.total)}`}
          </span>
          {percent !== null && (
            <progress value={busy.received} max={busy.total ?? busy.received} aria-label="Export progress">
              {percent}%
            </progress>
          )}
          <button type="button" className="btn" onClick={cancel}>
            Cancel
          </button>
        </div>
      )}

      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      {success && !error && (
        <p className="field-hint" role="status">
          Saved as <code>{success}</code>.
        </p>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}