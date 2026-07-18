import { useState } from "react";
import { downloadExport } from "../../api/endpoints";

/**
 * Export the current result as HTML or CSV. The backend only exposes a POST
 * `/api/reports/export/` endpoint that returns a raw file with a
 * `Content-Disposition` filename. The client POSTs and triggers a download
 * via a hidden anchor. No external resources are loaded.
 */
export function ExportControls({ runId, reportName }: { runId: string; reportName: string }) {
  const [busy, setBusy] = useState<null | "html" | "csv">(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: "html" | "csv"): Promise<void> {
    setBusy(format);
    setError(null);
    try {
      const result = await downloadExport(runId, format, reportName);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="export-controls" role="group" aria-label="Export result">
      <button type="button" className="btn" onClick={() => void download("html")} disabled={busy !== null}>
        {busy === "html" ? "Generating HTML…" : "Export HTML"}
      </button>
      <button type="button" className="btn" onClick={() => void download("csv")} disabled={busy !== null}>
        {busy === "csv" ? "Generating CSV…" : "Export CSV"}
      </button>
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
