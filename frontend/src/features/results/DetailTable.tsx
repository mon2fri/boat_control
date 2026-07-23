import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { DetailRow } from "../../api/domain";

interface ColumnFilter {
  key: string;
  label: string;
  options: string[];
}

interface StaticProps {
  rows: DetailRow[];
  /** Complete rows used only while producing a rendered HTML export. */
  exportRows?: DetailRow[];
  caption: string;
  total?: number;
  onReachEnd?: () => void;
  hasMore?: boolean;
  keyColumnNames?: string[];
  extraColumnNames?: string[];
  hideComparison?: boolean;
  emptyMessage?: string;
  /** Optional column filters shown as filterable headers. */
  columnFilters?: ColumnFilter[];
  /** Active filter values per column key. */
  activeFilters?: Record<string, string[]>;
  /** Called when the user changes a column filter. */
  onFilterChange?: (key: string, values: string[]) => void;
}

const ROW_HEIGHT = 42;
const LOAD_MORE_THRESHOLD = 50;
const VISIBLE_DATA_ROWS = 10;

export function DetailTable({
  rows,
  exportRows,
  caption,
  total,
  onReachEnd,
  hasMore = false,
  keyColumnNames = [],
  extraColumnNames: configuredExtraColumnNames,
  hideComparison = false,
  emptyMessage = "No detail rows.",
  columnFilters = [],
  activeFilters = {},
  onFilterChange,
}: StaticProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [exportMode, setExportMode] = useState(false);
  const renderedRows = exportMode ? (exportRows ?? rows) : rows;

  useEffect(() => {
    const prepare = () => setExportMode(true);
    const cleanup = () => setExportMode(false);
    document.addEventListener("prepare-result-export", prepare);
    document.addEventListener("cleanup-result-export", cleanup);
    return () => {
      document.removeEventListener("prepare-result-export", prepare);
      document.removeEventListener("cleanup-result-export", cleanup);
    };
  }, []);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    initialRect: { width: 0, height: VISIBLE_DATA_ROWS * ROW_HEIGHT },
    overscan: 20,
  });

  const lastTriggeredRef = useRef<number>(-1);

  useEffect(() => {
    if (!onReachEnd || !hasMore) return;
    const items = virtualizer.getVirtualItems();
    const last = items[items.length - 1];
    if (!last) return;
    if (rows.length - last.index > LOAD_MORE_THRESHOLD) return;
    if (lastTriggeredRef.current === rows.length) return;
    lastTriggeredRef.current = rows.length;
    onReachEnd();
  }, [rows.length, hasMore, onReachEnd, virtualizer]);

  if (renderedRows.length === 0) {
    return <p role="status">{emptyMessage}</p>;
  }

  const virtualized = !exportMode && renderedRows.length > VISIBLE_DATA_ROWS;
  const items = !virtualized
    ? renderedRows.map((_, index) => ({ key: index, index, start: index * ROW_HEIGHT }))
    : virtualizer.getVirtualItems();
  // The virtualizer only owns rows that are loaded. Using the server-side total here
  // creates a scrollable but unrenderable tail, which appears as blank table cells.
  const renderedTotal = virtualized ? virtualizer.getTotalSize() : undefined;

  const keyColCount = keyColumnNames.length || 1;
  const extraColumnNames = configuredExtraColumnNames
    ?? [...new Set(renderedRows.flatMap((row) => Object.keys(row.extraValues ?? {})))];
  const colWidths: number[] = [];
  for (let i = 0; i < keyColCount; i++) colWidths.push(150);
  colWidths.push(...extraColumnNames.map(() => 180));
  if (!hideComparison) colWidths.push(150, 180, 180);
  const tableMinWidth = colWidths.reduce((a, b) => a + b, 0);
  const colTemplate = [
    ...Array.from({ length: keyColCount }, () => "minmax(150px, 1fr)"),
    ...extraColumnNames.map(() => "minmax(180px, 1.2fr)"),
    ...(!hideComparison
      ? ["minmax(150px, 1fr)", "minmax(180px, 1.2fr)", "minmax(180px, 1.2fr)"]
      : []),
  ].join(" ");

  const headerCells = (
    <>
      {keyColumnNames.length > 0 ? (
        keyColumnNames.map((name) => {
          const cf = columnFilters.find((f) => f.key === `key_${name}`);
          return cf ? (
            <FilterableTh
              key={name}
              label={name}
              options={cf.options}
              selected={activeFilters[cf.key] ?? []}
              onChange={(vals) => onFilterChange?.(cf.key, vals)}
            />
          ) : (
            <div key={name} role="columnheader">{name}</div>
          );
        })
      ) : (
        <div role="columnheader">Row</div>
      )}
      {extraColumnNames.map((name) => {
        const cf = columnFilters.find((f) => f.key === `extra_${name}`);
        return cf ? (
          <FilterableTh
            key={name}
            label={name}
            options={cf.options}
            selected={activeFilters[cf.key] ?? []}
            onChange={(vals) => onFilterChange?.(cf.key, vals)}
          />
        ) : (
          <div key={name} role="columnheader">{name}</div>
        );
      })}
      {!hideComparison && (() => {
        const colFilter = columnFilters.find((f) => f.key === "column");
        return colFilter ? (
          <FilterableTh
            label="Column"
            options={colFilter.options}
            selected={activeFilters[colFilter.key] ?? []}
            onChange={(vals) => onFilterChange?.(colFilter.key, vals)}
          />
        ) : (
          <div role="columnheader">Column</div>
        );
      })()}
      {!hideComparison && <div role="columnheader">In Baseline</div>}
      {!hideComparison && <div role="columnheader">In Comparison</div>}
    </>
  );

  return (
    <div
      ref={scrollRef}
      className={`detail-scroll${rows.length > VISIBLE_DATA_ROWS ? " detail-scroll--capped" : ""}`}
      role="region"
      aria-label={caption}
      aria-rowcount={total ?? rows.length}
      tabIndex={0}
      onScroll={(event) => {
        if (!onReachEnd || !hasMore || lastTriggeredRef.current === rows.length) return;
        const target = event.currentTarget;
        if (target.scrollHeight - target.scrollTop - target.clientHeight > ROW_HEIGHT * 2) return;
        lastTriggeredRef.current = rows.length;
        onReachEnd();
      }}
    >
      <div className="detail-grid" role="table" style={{ minWidth: tableMinWidth }}>
        <div className="detail-grid-header results-layer-table-header" role="rowgroup">
          <div className="detail-grid-row" role="row" style={{ gridTemplateColumns: colTemplate }}>
            {headerCells}
          </div>
        </div>
        <div
          className="detail-grid-body"
          role="rowgroup"
          style={virtualized ? { position: "relative", height: `${renderedTotal}px` } : undefined}
        >
          {items.map((item) => {
            const row = renderedRows[item.index];
            if (!row) return null;
            return (
              <div
                key={item.key}
                data-index={item.index}
                className="detail-grid-row"
                role="row"
                aria-rowindex={item.index + 2}
                ref={(node) => {
                  if (node && node.getBoundingClientRect().height > 0) {
                    virtualizer.measureElement(node);
                  }
                }}
                style={virtualized
                  ? {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      gridTemplateColumns: colTemplate,
                      transform: `translateY(${item.start}px)`,
                    }
                  : { gridTemplateColumns: colTemplate }}
              >
                {keyColumnNames.length > 0 ? (
                  keyColumnNames.map((name) => (
                    <div role="cell" key={name}>{row.keyColumns[name] ?? "—"}</div>
                  ))
                ) : (
                  <div role="cell">{row.rowKey}</div>
                )}
                {extraColumnNames.map((name) => (
                  <div role="cell" key={name}>{row.extraValues?.[name] ?? "—"}</div>
                ))}
                {!hideComparison && <div role="cell">{row.column}</div>}
                {!hideComparison && <div role="cell">{row.file1Value ?? "—"}</div>}
                {!hideComparison && <div role="cell">{row.file2Value ?? "—"}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- Inline header filter dropdown ---------- */

function FilterableTh({
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, q]);

  const toggle = useCallback(
    (val: string) => {
      onChange(
        selected.includes(val)
          ? selected.filter((v) => v !== val)
          : [...selected, val],
      );
    },
    [selected, onChange],
  );

  const hasActive = selected.length > 0;

  return (
    <div className="filterable-th" ref={ref} role="columnheader">
      <span>{label}</span>
      <button
        type="button"
        className={`th-filter-btn${hasActive ? " th-filter-btn--active" : ""}`}
        onClick={() => setOpen(!open)}
        aria-label={`Filter ${label}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M1.5 1.5h13l-5.5 6.5v5l-2 1v-6z" />
        </svg>
        {hasActive && <span className="th-filter-count">{selected.length}</span>}
      </button>
      {open && (
        <div className="th-filter-dropdown" role="group" aria-label={`Filter ${label}`}>
          <input
            type="text"
            className="th-filter-search"
            placeholder={`Search ${label.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="th-filter-options">
            {filtered.length === 0 && <div className="th-filter-empty">No matches</div>}
            {filtered.map((val) => (
              <label key={val} className="th-filter-option">
                <input
                  type="checkbox"
                  checked={selected.includes(val)}
                  onChange={() => toggle(val)}
                />
                <span>{val}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              className="th-filter-clear"
              onClick={() => { onChange([]); setQuery(""); }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Client-side filter helper ---------- */

export function filterDetailRows(
  rows: DetailRow[],
  activeFilters: Record<string, string[]>,
): DetailRow[] {
  const entries = Object.entries(activeFilters).filter(([, vals]) => vals.length > 0);
  if (entries.length === 0) return rows;
  return rows.filter((row) =>
    entries.every(([key, vals]) => {
      let cellVal: string;
      if (key === "column") {
        cellVal = row.column ?? "";
      } else if (key.startsWith("key_")) {
        const colName = key.slice(4);
        cellVal = String(row.keyColumns[colName] ?? "");
      } else if (key.startsWith("extra_")) {
        const colName = key.slice(6);
        cellVal = String(row.extraValues?.[colName] ?? "");
      } else {
        return true;
      }
      return vals.includes(cellVal);
    }),
  );
}
