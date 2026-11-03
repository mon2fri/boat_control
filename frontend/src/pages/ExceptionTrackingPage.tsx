import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import {
  downloadExceptionCommentaryTemplate,
  ExportError,
} from "../api/endpoints";
import type { ExceptionStatus, TrackedException } from "../api/domain";
import { defaultAsOfDate, formatIsoDate, isValidIsoDate } from "../lib/asOfDate";
import { formatDateTime } from "../utils/format";
import { AsOfDateField } from "../features/tracking/AsOfDateField";
import {
  useExceptionTrackingDates,
  useImportCommentary,
  useTrackedExceptions,
} from "../features/tracking/useTracking";

const STATUS_CLASS: Record<ExceptionStatus, string> = {
  New: "status-badge status-badge--new",
  Commented: "status-badge status-badge--commented",
  NotCommented: "status-badge status-badge--not-commented",
};

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }: { status: ExceptionStatus }) {
  return <span className={STATUS_CLASS[status]}>{status}</span>;
}

function countByStatus(exceptions: TrackedException[]): Record<ExceptionStatus, number> {
  const counts: Record<ExceptionStatus, number> = { New: 0, Commented: 0, NotCommented: 0 };
  for (const exception of exceptions) {
    counts[exception.status] = counts[exception.status] + 1;
  }
  return counts;
}

/**
 * Exception Tracking tab. The backend owns the tracking database, history
 * metadata, statuses and XLSX workbook; this page only selects an As-of Date,
 * displays the returned occurrences and round-trips the shared template.
 */
export function ExceptionTrackingPage() {
  const queryClient = useQueryClient();
  const datesQuery = useExceptionTrackingDates();
  const [explicitDate, setExplicitDate] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const backendDefault = datesQuery.data?.defaultDate ?? null;
  const dates = useMemo(() => datesQuery.data?.dates ?? [], [datesQuery.data]);
  const selectedDate =
    explicitDate ??
    (backendDefault && isValidIsoDate(backendDefault) ? backendDefault : undefined) ??
    dates[0] ??
    defaultAsOfDate();

  const listQuery = useTrackedExceptions(selectedDate);
  const importMutation = useImportCommentary(selectedDate);
  const exceptions = useMemo(
    () => listQuery.data?.exceptions ?? [],
    [listQuery.data],
  );
  const counts = useMemo(() => countByStatus(exceptions), [exceptions]);

  async function handleDownload(): Promise<void> {
    setNotice(null);
    setDownloadBusy(true);
    try {
      const result = await downloadExceptionCommentaryTemplate(selectedDate);
      saveBlob(result.blob, result.filename);
      setNotice({ tone: "info", text: `Downloaded ${result.filename}.` });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof ExportError
            ? `Could not download the commentary template: ${error.message}`
            : error instanceof Error
              ? `Could not download the commentary template: ${error.message}`
              : "Could not download the commentary template.",
      });
    } finally {
      setDownloadBusy(false);
    }
  }

  function handleFile(file: File | undefined): void {
    setNotice(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setNotice({
        tone: "error",
        text: "Choose the commentary template as an .xlsx file. Other formats are not accepted.",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size === 0) {
      setNotice({ tone: "error", text: "The selected workbook is empty." });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    importMutation.mutate(file, {
      onSuccess: (result) => {
        setNotice({
          tone: "success",
          text:
            result.message ??
            `Updated ${result.updatedCount}${
              result.clearedCount > 0 ? `, cleared ${result.clearedCount}` : ""
            }${
              result.unchangedCount > 0 ? `, unchanged ${result.unchangedCount}` : ""
            } exception(s) for ${formatIsoDate(result.asOfDate ?? selectedDate)}. The list has been refreshed.`,
        });
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
      onError: (error) => {
        const detail = error instanceof ApiError ? error.detail : null;
        const ids = detail && typeof detail === "object" && "details" in detail
          ? (detail.details as Record<string, unknown>)
          : null;
        const idMessages: string[] = [];
        for (const [label, key] of [
          ["Unknown", "unknown_ids"],
          ["Duplicate", "duplicate_ids"],
          ["Missing", "missing_ids"],
        ] as const) {
          const values = ids?.[key];
          if (Array.isArray(values) && values.length > 0) {
            idMessages.push(`${label}: ${values.map(String).join(", ")}`);
          }
        }
        setNotice({
          tone: "error",
          text: `The commentary template was rejected: ${error.message}${
            idMessages.length > 0 ? ` (${idMessages.join("; ")})` : ""
          }`,
        });
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    });
  }

  const dateInvalid = !isValidIsoDate(selectedDate);

  return (
    <section aria-labelledby="exception-tracking-title">
      <h2 id="exception-tracking-title" className="section-heading">Exception Tracking</h2>
      <p className="section-hint">
        Review exceptions for a selected As-of Date, then download, complete and upload the
        commentary template. The backend validates every exception ID before changing the database.
      </p>

      <div className="card">
        <div className="tracking-toolbar">
          <AsOfDateField
            id="tracking-as-of-date"
            value={selectedDate}
            dates={dates}
            onChange={(date) => {
              setExplicitDate(date);
              setNotice(null);
            }}
            hint="Pick a date to load its exception-tracking table. Dates with recorded data are offered below."
          />
          {dates.length > 0 && (
            <div className="field">
              <label htmlFor="tracking-recorded-dates">Recorded dates</label>
              <select
                id="tracking-recorded-dates"
                value={dates.includes(selectedDate) ? selectedDate : ""}
                onChange={(event) => {
                  if (!event.target.value) return;
                  setExplicitDate(event.target.value);
                  setNotice(null);
                }}
              >
                <option value="">-- Choose a recorded date --</option>
                {dates.map((date) => (
                  <option key={date} value={date}>{date}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {datesQuery.isError && (
          <p className="alert alert--warn" role="status">
            Recorded dates could not be loaded ({datesQuery.error.message}). You can still try a date
            directly.
          </p>
        )}
        {dateInvalid && (
          <p className="alert alert--error" role="alert">
            Choose a valid As-of Date in YYYY-MM-DD form.
          </p>
        )}
      </div>

      <div className="card tracking-actions">
        <div className="config-inline-row">
          <button
            type="button"
            className="btn"
            onClick={() => void handleDownload()}
            disabled={downloadBusy || dateInvalid}
          >
            {downloadBusy ? "Preparing template…" : "Download commentary template"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void listQuery.refetch()}
            disabled={listQuery.isFetching || dateInvalid}
          >
            {listQuery.isFetching ? "Refreshing…" : "Refresh list"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setExplicitDate(null);
              setNotice(null);
            }}
          >
            Use default date
          </button>
        </div>
        <div className="field tracking-upload">
          <label htmlFor="commentary-upload">Upload completed commentary template (.xlsx)</label>
          <input
            id="commentary-upload"
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={importMutation.isPending || dateInvalid}
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          {importMutation.isPending && (
            <span className="field-hint" role="status">Validating and importing commentary…</span>
          )}
        </div>
        {notice && (
          <p
            className={`alert alert--${notice.tone === "error" ? "error" : notice.tone === "success" ? "success" : "info"}`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        )}
        <p className="field-hint">
          Unknown, duplicate or mismatched exception IDs are rejected as a whole; no partial
          commentary updates are applied.
        </p>
      </div>

      <div className="card">
        <div className="tracking-summary" aria-label="Exception status summary">
          <span>As-of Date: <strong>{isValidIsoDate(selectedDate) ? formatIsoDate(selectedDate) : selectedDate}</strong></span>
          <span>Total: <strong>{exceptions.length}</strong></span>
          <span><StatusBadge status="New" /> {counts.New}</span>
          <span><StatusBadge status="Commented" /> {counts.Commented}</span>
          <span><StatusBadge status="NotCommented" /> {counts.NotCommented}</span>
        </div>

        {listQuery.isLoading && (
          <p role="status" className="busy-row">
            <span className="spinner" aria-hidden="true" /> Loading exceptions…
          </p>
        )}
        {listQuery.isError && (
          <p className="alert alert--error" role="alert">
            Could not load exceptions for {selectedDate}: {listQuery.error.message}
          </p>
        )}
        {!listQuery.isLoading && !listQuery.isError && exceptions.length === 0 && (
          <p role="status">
            No exceptions are recorded for {selectedDate}. Run a comparison with this As-of Date to
            populate the tracking table.
          </p>
        )}

        {exceptions.length > 0 && (
          <div className="table-scroll">
            <table className="data exception-tracking-table">
              <caption className="visually-hidden">
                Exceptions recorded for {selectedDate}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Exception ID</th>
                  <th scope="col">Exception Rule Identifier</th>
                  <th scope="col">Key Columns</th>
                  <th scope="col">Exception Timestamp</th>
                  <th scope="col">Exception Commentary</th>
                  <th scope="col">Exception As-of Date</th>
                  <th scope="col">Exception First Seen As-of Date</th>
                  <th scope="col">Exception Last Seen As-of Date</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((exception) => (
                  <tr key={exception.exceptionId}>
                    <td><code>{exception.exceptionId}</code></td>
                    <td><code>{exception.exceptionRuleIdentifier}</code></td>
                    <td>{exception.keyColumns || "—"}</td>
                    <td>{formatDateTime(exception.exceptionTimestamp)}</td>
                    <td className="tracking-commentary">{exception.exceptionCommentary || "—"}</td>
                    <td>{exception.exceptionAsOfDate}</td>
                    <td>{exception.exceptionFirstSeenAsOfDate}</td>
                    <td>{exception.exceptionLastSeenAsOfDate}</td>
                    <td><StatusBadge status={exception.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="config-inline-row">
          <button
            type="button"
            className="btn"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["exception-tracking"] });
              void queryClient.invalidateQueries({ queryKey: ["exception-tracking-dates"] });
            }}
          >
            Refresh dates and list
          </button>
        </div>
      </div>
    </section>
  );
}
