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
  caption: string;
  total?: number;
  onReachEnd?: () => void;
  hasMore?: boolean;
  keyColumnNames?: string[];
  emptyMessage?: string;
  /** Optional column filters shown as filterable headers. */
  columnFilters?: ColumnFilter[];
  /** Active filter values per column key. */
  activeFilters?: Record<string, string[]>;
  /** Called when the user changes a column filter. */
  onFilterChange?: (key: string, values: string[]) => void;
}

const ROW_HEIGHT = 34;
const LOAD_MORE_THRESHOLD = 50;
const VISIBLE_DATA_ROWS = 10;

export function DetailTable({
  rows,
  caption,
  total,
  onReachEnd,
  hasMore = false,
  keyColumnNames = [],
  emptyMessage = "No detail rows.",
  columnFilters = [],
  activeFilters = {},
  onFilterChange,
}: StaticProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
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

  if (rows.length === 0) {
    return <p role="status">{emptyMessage}</p>;
  }

  const items = virtualizer.getVirtualItems();
  const renderedTotal = Math.max(virtualizer.getTotalSize(), (total ?? rows.length) * ROW_HEIGHT);

  return (
    <div
      ref={scrollRef}
      className={`detail-scroll${rows.length > VISIBLE_DATA_ROWS ? " detail-scroll--capped" : ""}`}
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table className="data detail-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
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
                  <th key={name} scope="col">{name}</th>
                );
              })
            ) : (
              <th scope="col">Row</th>
            )}
            {(() => {
              const colFilter = columnFilters.find((f) => f.key === "column");
              return colFilter ? (
                <FilterableTh
                  label="Column"
                  options={colFilter.options}
                  selected={activeFilters[colFilter.key] ?? []}
                  onChange={(vals) => onFilterChange?.(colFilter.key, vals)}
                />
              ) : (
                <th scope="col">Column</th>
              );
            })()}
            <th scope="col">In Baseline</th>
            <th scope="col">In Comparison</th>
            <th scope="col">Rationale</th>
          </tr>
        </thead>
        <tbody style={{ height: `${renderedTotal}px` }}>
          {items.map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            return (
              <tr
                key={item.key}
                data-index={item.index}
                style={{ transform: `translateY(${item.start}px)` }}
              >
                {keyColumnNames.length > 0 ? (
                  keyColumnNames.map((name) => (
                    <td key={name}>{row.keyColumns[name] ?? "—"}</td>
                  ))
                ) : (
                  <td>{row.rowKey}</td>
                )}
                <td>{row.column}</td>
                <td>{row.file1Value ?? "—"}</td>
                <td>{row.file2Value ?? "—"}</td>
                <td>{row.kind === "changed" ? "Values differ" : "Rule requirement not met"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  const ref = useRef<HTMLTableCellElement>(null);

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
    <th scope="col" className="filterable-th" ref={ref}>
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
    </th>
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
      } else {
        return true;
      }
      return vals.includes(cellVal);
    }),
  );
}
