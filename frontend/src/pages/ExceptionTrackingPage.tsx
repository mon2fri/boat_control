import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import {
  downloadExceptionCommentaryTemplate,
  ExportError,
  asRecertifyError,
} from "../api/endpoints";
import type {
  ExceptionStatus,
  ExceptionTrackingColumn,
  RecertifySelection,
  TrackedException,
} from "../api/domain";
import { RECERTIFICATION_LABEL } from "../api/domain";
import { defaultAsOfDate, formatIsoDate, isValidIsoDate } from "../lib/asOfDate";
import { formatDateTime } from "../utils/format";
import { AsOfDateSelector } from "../features/tracking/AsOfDateSelector";
import {
  useExceptionTrackingDates,
  useImportCommentary,
  useRecertify,
  useTrackedExceptions,
} from "../features/tracking/useTracking";
import { RecertificationBadge } from "../features/results/RecertificationBadge";
import {
  EXCEPTION_TRACKING_DATES_KEY,
  EXCEPTION_TRACKING_KEY,
} from "../features/tracking/queryKeys";

const STATUS_CLASS: Record<ExceptionStatus, string> = {
  New: "status-badge status-badge--new",
  Commented: "status-badge status-badge--commented",
  NotCommented: "status-badge status-badge--not-commented",
  RecertificationRequired: "status-badge status-badge--recertification-required",
};

const PAGE_SIZES = [50, 100, 200, 500] as const;
const DEFAULT_VISIBLE_COLUMNS = ["exception_id", "status", "commentary", "rule_index"];

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

function detailName(column: ExceptionTrackingColumn): string {
  return column.key.startsWith("detail:")
    ? column.key.slice("detail:".length)
    : column.label;
}

/**
 * Exception Tracking tab. Paging, sorting and filtering are authoritative in
 * Worker B's complete-dataset endpoint: the client sends those query options
 * and renders only the returned page, so operations always cover every row for
 * the selected date rather than only the currently loaded page.
 */
export function ExceptionTrackingPage() {
  const queryClient = useQueryClient();
  const datesQuery = useExceptionTrackingDates();
  const [explicitDate, setExplicitDate] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([...DEFAULT_VISIBLE_COLUMNS]);
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const backendDefault = datesQuery.data?.defaultDate ?? null;
  const dates = useMemo(() => datesQuery.data?.dates ?? [], [datesQuery.data]);
  const selectedDate =
    explicitDate ??
    (backendDefault && isValidIsoDate(backendDefault) ? backendDefault : undefined) ??
    dates[0] ??
    defaultAsOfDate();

  const queryOptions = useMemo(() => ({
    offset: (page - 1) * pageSize,
    limit: pageSize,
    ...(sort ? { sort: sort.key, order: sort.direction } : {}),
    filters: Object.fromEntries(
      Object.entries(filters).filter(([, values]) => values.length > 0),
    ),
  }), [filters, page, pageSize, sort]);

  const listQuery = useTrackedExceptions(selectedDate, queryOptions);
  const importMutation = useImportCommentary(selectedDate);
  const recertifyMutation = useRecertify(selectedDate);
  /** Selected rows with their frozen revision tokens ("" when never carried). */
  const [selected, setSelected] = useState<RecertifySelection[]>([]);
  const data = listQuery.data;
  const exceptions = useMemo(() => data?.exceptions ?? [], [data]);
  const columns = useMemo(() => data?.columns ?? [], [data]);
  const availableFilters = data?.availableFilters ?? {};
  const total = data?.total ?? 0;
  const unfilteredTotal = data?.unfilteredTotal ?? total;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageRows = exceptions;
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  const visibleColumnDefs = useMemo(
    () => columns.filter((column) => visibleColumns.includes(column.key)),
    [columns, visibleColumns],
  );

  function resetPaging(): void {
    setPage(1);
  }

  function toggleColumn(key: string, checked: boolean): void {
    setVisibleColumns((current) => {
      if (checked) {
        return current.includes(key) ? current : [...current, key];
      }
      return current.filter((item) => item !== key);
    });
    resetPaging();
  }

  function resetColumns(): void {
    setVisibleColumns([...DEFAULT_VISIBLE_COLUMNS]);
    resetPaging();
  }

  function changeSort(key: string): void {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
    resetPaging();
  }

  function setColumnFilter(key: string, values: string[]): void {
    setFilters((current) => {
      const next = { ...current };
      if (values.length === 0) delete next[key];
      else next[key] = values;
      return next;
    });
    resetPaging();
  }

  function toggleSelected(exceptionId: string, revisionToken: string, checked: boolean): void {
    setSelected((current) =>
      checked
        ? [...current.filter((entry) => entry.exceptionId !== exceptionId), { exceptionId, revisionToken }]
        : current.filter((entry) => entry.exceptionId !== exceptionId),
    );
  }

  function togglePageSelection(checked: boolean): void {
    const pageEntries = pageRows.map((row) => ({
      exceptionId: row.exceptionId,
      revisionToken: row.revisionToken ?? "",
    }));
    const pageIds = new Set(pageEntries.map((entry) => entry.exceptionId));
    setSelected((current) =>
      checked
        ? [...current.filter((entry) => !pageIds.has(entry.exceptionId)), ...pageEntries]
        : current.filter((entry) => !pageIds.has(entry.exceptionId)),
    );
  }

  const selectedIdSet = new Set(selected.map((entry) => entry.exceptionId));

  function handleRecertify(): void {
    if (selected.length === 0 || recertifyMutation.isPending) return;
    setNotice(null);
    recertifyMutation.mutate(selected, {
      onSuccess: (result) => {
        setSelected([]);
        const accepted = result.accepted.length;
        const repeated = result.alreadyAccepted.length;
        setNotice({
          tone: "success",
          text:
            result.message ??
            `Recertified ${accepted} exception(s)${
              repeated > 0 ? ` (${repeated} already accepted)` : ""
            } for ${formatIsoDate(result.asOfDate ?? selectedDate)}. The list has been refreshed.`,
        });
      },
      onError: (error) => {
        // Atomic failure: nothing was written, so the selection is kept for
        // correction and retry. Frozen error codes name the affected IDs.
        const recertifyError = asRecertifyError(error);
        setNotice({
          tone: "error",
          text: recertifyError
            ? `Recertification was rejected and nothing was accepted: ${recertifyError.message}`
            : `Recertification was rejected and nothing was accepted: ${error.message}`,
        });
      },
    });
  }

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

  function renderCell(column: ExceptionTrackingColumn, row: TrackedException) {
    if (column.key === "status") {
      // Single status presentation: the status badge alone. Pending
      // provenance (exact reason + carried-from detail) lives in the purple
      // R marker beside the exception ID, as a title tooltip / accessible
      // name — never as a second visible badge.
      return (
        <span className="tracking-status-cell">
          <StatusBadge status={row.status} />
        </span>
      );
    }
    if (column.key === "recertification") {
      return row.recertificationRequired ? (
        <RecertificationBadge
          reason={row.recertificationReason}
          carriedFromExceptionId={row.carriedFromExceptionId}
          carriedFromAsOfDate={row.carriedFromAsOfDate}
          carriedFromRuleIdentifier={row.carriedFromRuleIdentifier}
          ruleEvolutionEventId={row.ruleEvolutionEventId}
        />
      ) : (
        "—"
      );
    }
    if (column.key === "exception_id") {
      return (
        <span className="tracking-exception-id">
          <code>{row.exceptionId}</code>
          {row.recertificationRequired && (
            <>
              {" "}
              <RecertificationBadge
                reason={row.recertificationReason}
                carriedFromExceptionId={row.carriedFromExceptionId}
                carriedFromAsOfDate={row.carriedFromAsOfDate}
                carriedFromRuleIdentifier={row.carriedFromRuleIdentifier}
                ruleEvolutionEventId={row.ruleEvolutionEventId}
              />
            </>
          )}
        </span>
      );
    }
    if (column.key === "commentary") {
      return <span className="tracking-commentary">{row.exceptionCommentary || "—"}</span>;
    }
    if (column.key === "rule_index") return row.ruleIndex || "—";
    if (column.key === "exception_rule_identifier") return row.exceptionRuleIdentifier;
    if (column.key === "key_columns") return row.keyColumns || "—";
    if (column.key === "exception_timestamp") return formatDateTime(row.exceptionTimestamp);
    if (column.key === "exception_as_of_date") return row.exceptionAsOfDate;
    if (column.key === "exception_first_seen_as_of_date") return row.exceptionFirstSeenAsOfDate;
    if (column.key === "exception_last_seen_as_of_date") return row.exceptionLastSeenAsOfDate;
    if (column.key === "carried_from_exception_id") return row.carriedFromExceptionId || "—";
    if (column.key === "carried_from_as_of_date") return row.carriedFromAsOfDate || "—";
    if (column.key === "carried_from_rule_identifier") return row.carriedFromRuleIdentifier || "—";
    if (column.key === "rule_evolution_event_id") return row.ruleEvolutionEventId || "—";
    if (column.key.startsWith("detail:")) {
      return row.detailValues[detailName(column)] || "—";
    }
    return "—";
  }

  const dateInvalid = !isValidIsoDate(selectedDate);
  const hasVisibleColumns = visibleColumnDefs.length > 0;
  const hasFilters = Object.values(filters).some((values) => values.length > 0);

  return (
    <section aria-labelledby="exception-tracking-title">
      <h2 id="exception-tracking-title" className="section-heading">Exception Tracking</h2>
      <p className="section-hint">
        Review exceptions for a selected As-of Date, then download, complete and upload the
        commentary template. The backend validates every exception ID before changing the database.
      </p>

      <div className="card">
        <AsOfDateSelector
          id="tracking-as-of-date"
          value={selectedDate}
          availableDates={dates}
          onChange={(date) => {
            setExplicitDate(date);
            setNotice(null);
            setFilters({});
            setSort(null);
            setSelected([]);
            resetPaging();
          }}
        />
        <p className="field-hint">
          The menu lists up to ten latest recorded dates. Choose <strong>Other date…</strong> to
          open the calendar, where a dot marks every date that has tracking data.
        </p>
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
          commentary updates are applied. Downloaded templates no longer carry the six
          provenance columns — pending recertification shows via Exception Status instead.
          Use the <strong>Commentary Recertify</strong> column to act on carried commentary:
          Keep Current ignores the sheet text and retains the stored commentary; Updated
          stores the sheet text (an empty cell deliberately clears it, while unchanged text
          counts as acceptance); a blank cell preserves the stored commentary. For ordinary
          commented rows, a nonempty cell accepts the text and an empty cell preserves it.
          Invalid dropdown values are rejected for that row only; nothing is partially applied.
          Uploading commentary text never recertifies carried commentary — use{" "}
          <strong>Recertify selected</strong> below to accept it, including unchanged text.
        </p>
      </div>

      <div className="card">
        <div className="tracking-summary" aria-label="Exception status summary">
          <span>As-of Date: <strong>{isValidIsoDate(selectedDate) ? formatIsoDate(selectedDate) : selectedDate}</strong></span>
          <span>Filtered total: <strong>{total}</strong></span>
          <span>All rows: <strong>{unfilteredTotal}</strong></span>
          <span>Pending recertification on this page: <strong>{pageRows.filter((row) => row.recertificationRequired).length}</strong></span>
          <span>Selected: <strong>{selected.length}</strong></span>
        </div>

        {(data?.carryWarnings ?? []).length > 0 && (
          <div className="alert alert--warn" role="status">
            <strong>Carry warnings:</strong> predecessor ambiguity meant no commentary
            was carried for some exceptions — nothing was guessed.
            <ul>
              {(data?.carryWarnings ?? []).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="config-inline-row tracking-recertify-bar">
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleRecertify}
            disabled={selected.length === 0 || recertifyMutation.isPending || dateInvalid}
            title="Explicitly accept the carried commentary for the selected exceptions, including unchanged text"
          >
            {recertifyMutation.isPending ? "Recertifying…" : `Recertify selected (${selected.length})`}
          </button>
          {selected.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => setSelected([])}
              disabled={recertifyMutation.isPending}
            >
              Clear selection
            </button>
          )}
        </div>
        <p className="field-hint">
          Pending recertification (“{RECERTIFICATION_LABEL}”) stays reviewable even when its
          commentary text is nonblank: selecting the row and using Recertify selected accepts
          it for the current rule revision. Uploading an unchanged template never accepts it.
        </p>

        <details className="tracking-column-chooser">
          <summary>
            Columns ({visibleColumnDefs.length} of {columns.length} visible)
          </summary>
          <div className="tracking-column-chooser__grid" role="group" aria-label="Choose visible columns">
            {columns.map((column) => (
              <label key={column.key} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(column.key)}
                  onChange={(event) => toggleColumn(column.key, event.target.checked)}
                />
                {column.label}
              </label>
            ))}
          </div>
          <button type="button" className="btn" onClick={resetColumns}>
            Show default columns
          </button>
        </details>

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
        {!listQuery.isLoading && !listQuery.isError && total === 0 && !hasFilters && (
          <p role="status">
            No exceptions are recorded for {selectedDate}. Run a comparison with this As-of Date to
            populate the tracking table.
          </p>
        )}
        {!listQuery.isLoading && !listQuery.isError && total === 0 && hasFilters && (
          <p role="status">No exceptions match the current filters.</p>
        )}

        {total > 0 && !hasVisibleColumns && (
          <p role="status">No columns are selected. Choose at least one column above.</p>
        )}

        {total > 0 && hasVisibleColumns && (
          <>
            <div className="table-scroll">
              <table className="data exception-tracking-table">
                <caption className="visually-hidden">
                  Exceptions recorded for {selectedDate}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        aria-label="Select all exceptions on this page"
                        checked={pageRows.length > 0 && pageRows.every((row) => selectedIdSet.has(row.exceptionId))}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              pageRows.some((row) => selectedIdSet.has(row.exceptionId)) &&
                              !pageRows.every((row) => selectedIdSet.has(row.exceptionId));
                          }
                        }}
                        onChange={(event) => togglePageSelection(event.target.checked)}
                      />
                    </th>
                    {visibleColumnDefs.map((column) => (
                      <th key={column.key} scope="col" aria-sort={
                        sort?.key === column.key
                          ? sort.direction === "asc" ? "ascending" : "descending"
                          : "none"
                      }>
                        <div className="tracking-th">
                          <span>{column.label}</span>
                          {column.sortable && (
                            <button
                              type="button"
                              className="th-sort-btn"
                              onClick={() => changeSort(column.key)}
                              aria-label={`Sort by ${column.label}`}
                            >
                              <span className="sort-icon sort-icon--none">⇅</span>
                              <span className="sort-icon sort-icon--asc">↑</span>
                              <span className="sort-icon sort-icon--desc">↓</span>
                            </button>
                          )}
                          {column.filterable && (
                            <TrackingFilter
                              label={column.label}
                              options={availableFilters[column.key] ?? []}
                              selected={filters[column.key] ?? []}
                              onChange={(values) => setColumnFilter(column.key, values)}
                            />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((exception) => (
                    <tr key={exception.exceptionId}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select exception ${exception.exceptionId}`}
                          checked={selectedIdSet.has(exception.exceptionId)}
                          onChange={(event) => toggleSelected(exception.exceptionId, exception.revisionToken ?? "", event.target.checked)}
                        />
                      </td>
                      {visibleColumnDefs.map((column) => (
                        <td key={column.key} className={
                          column.key === "commentary" || column.key.startsWith("detail:")
                            ? "tracking-commentary"
                            : undefined
                        }>
                          {renderCell(column, exception)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="tracking-pagination" aria-label="Exception table pagination">
              <label htmlFor="tracking-page-size">Rows per page</label>
              <select
                id="tracking-page-size"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  resetPaging();
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <span>{firstRow}–{lastRow} of {total}</span>
              <button
                type="button"
                className="btn"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                Previous
              </button>
              <span>Page {page} of {pageCount}</span>
              <button
                type="button"
                className="btn"
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                disabled={page >= pageCount}
              >
                Next
              </button>
            </div>
          </>
        )}

        <div className="config-inline-row">
          <button
            type="button"
            className="btn"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: EXCEPTION_TRACKING_KEY });
              void queryClient.invalidateQueries({ queryKey: EXCEPTION_TRACKING_DATES_KEY });
            }}
          >
            Refresh dates and list
          </button>
        </div>
      </div>
    </section>
  );
}

function TrackingFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  if (options.length === 0) return null;
  return (
    <details className="tracking-filter">
      <summary aria-label={`Filter by ${label}`}>
        Filter{selected.length > 0 ? ` (${selected.length})` : ""}
      </summary>
      <div className="tracking-filter__options">
        {options.map((option) => (
          <label key={option} className="checkbox-row">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onChange(
                selected.includes(option)
                  ? selected.filter((value) => value !== option)
                  : [...selected, option],
              )}
            />
            {option}
          </label>
        ))}
        {selected.length > 0 && (
          <button type="button" className="btn" onClick={() => onChange([])}>
            Clear filter
          </button>
        )}
      </div>
    </details>
  );
}
