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
  /** Display labels for extra columns; keys remain source column names. */
  extraColumnLabels?: Record<string, string>;
  hideComparison?: boolean;
  emptyMessage?: string;
  /** Optional column filters shown as filterable headers. */
  columnFilters?: ColumnFilter[];
  /** Active filter values per column key. */
  activeFilters?: Record<string, string[]>;
  /** Called when the user changes a column filter. */
  onFilterChange?: (key: string, values: string[]) => void;
  /** Clears all active column filters. */
  onClearAll?: () => void;
}

const ROW_HEIGHT = 42;
const LOAD_MORE_THRESHOLD = 50;
const VISIBLE_DATA_ROWS = 10;
type SortDirection = "asc" | "desc";

function detailCellValue(row: DetailRow, key: string): string {
  if (key === "row") return String(row.rowKey ?? "");
  if (key === "column") return String(row.column ?? "");
  if (key === "file1") return String(row.file1Value ?? "");
  if (key === "file2") return String(row.file2Value ?? "");
  if (key.startsWith("key_")) return String(row.keyColumns[key.slice(4)] ?? "");
  if (key.startsWith("extra_")) return String(row.extraValues?.[key.slice(6)] ?? "");
  return "";
}

export function sortDetailRows(
  rows: DetailRow[],
  key: string,
  direction: SortDirection,
): DetailRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const a = detailCellValue(left.row, key);
      const b = detailCellValue(right.row, key);
      if (!a && b) return 1;
      if (a && !b) return -1;
      const compared = a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return compared === 0 ? left.index - right.index : compared * factor;
    })
    .map(({ row }) => row);
}

export function DetailTable({
  rows,
  exportRows,
  caption,
  total,
  onReachEnd,
  hasMore = false,
  keyColumnNames = [],
  extraColumnNames: configuredExtraColumnNames,
  extraColumnLabels = {},
  hideComparison = false,
  emptyMessage = "No detail rows.",
  columnFilters = [],
  activeFilters = {},
  onFilterChange,
  onClearAll,
}: StaticProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [exportMode, setExportMode] = useState(false);
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null);
  const baseRenderedRows = exportMode ? (exportRows ?? rows) : rows;
  const renderedRows = useMemo(
    () => sort ? sortDetailRows(baseRenderedRows, sort.key, sort.direction) : baseRenderedRows,
    [baseRenderedRows, sort],
  );
  const toggleSort = useCallback((key: string) => {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

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
    count: renderedRows.length,
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
              sortKey={`key_${name}`}
              sort={sort}
              onSort={toggleSort}
              options={cf.options}
              selected={activeFilters[cf.key] ?? []}
              onChange={(vals) => onFilterChange?.(cf.key, vals)}
              forceRenderOptions={exportMode}
            />
          ) : (
            <SortableTh key={name} label={name} sortKey={`key_${name}`} sort={sort} onSort={toggleSort} />
          );
        })
      ) : (
        <SortableTh label="Row" sortKey="row" sort={sort} onSort={toggleSort} />
      )}
      {extraColumnNames.map((name) => {
        const cf = columnFilters.find((f) => f.key === `extra_${name}`);
        return cf ? (
          <FilterableTh
            key={name}
            label={extraColumnLabels[name] ?? name}
            sortKey={`extra_${name}`}
            sort={sort}
            onSort={toggleSort}
            options={cf.options}
            selected={activeFilters[cf.key] ?? []}
            onChange={(vals) => onFilterChange?.(cf.key, vals)}
            forceRenderOptions={exportMode}
          />
        ) : (
          <SortableTh key={name} label={extraColumnLabels[name] ?? name} sortKey={`extra_${name}`} sort={sort} onSort={toggleSort} />
        );
      })}
      {!hideComparison && (() => {
        const colFilter = columnFilters.find((f) => f.key === "column");
        return colFilter ? (
          <FilterableTh
            label="Column"
            sortKey="column"
            sort={sort}
            onSort={toggleSort}
            options={colFilter.options}
            selected={activeFilters[colFilter.key] ?? []}
            onChange={(vals) => onFilterChange?.(colFilter.key, vals)}
            forceRenderOptions={exportMode}
          />
        ) : (
          <SortableTh label="Column" sortKey="column" sort={sort} onSort={toggleSort} />
        );
      })()}
      {!hideComparison && <SortableTh label="In Baseline" sortKey="file1" sort={sort} onSort={toggleSort} />}
      {!hideComparison && <SortableTh label="In Comparison" sortKey="file2" sort={sort} onSort={toggleSort} />}
    </>
  );

  return (
    <>
      {columnFilters.length > 0 && Object.keys(activeFilters).length > 0 && (
        <div className="detail-toolbar">
          <span>{Object.keys(activeFilters).length} filter(s) active</span>
          <button type="button" onClick={onClearAll}>Clear all filters</button>
        </div>
      )}
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
    </>
  );
}

/* ---------- Inline header filter dropdown ---------- */

function FilterableTh({
  label,
  sortKey,
  sort,
  onSort,
  options,
  selected,
  onChange,
  forceRenderOptions = false,
}: {
  label: string;
  sortKey: string;
  sort: { key: string; direction: SortDirection } | null;
  onSort: (key: string) => void;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  forceRenderOptions?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The popup is positioned against the viewport (fixed) so the scrollable
  // table container never clips it. Close it whenever the page moves so it
  // cannot end up detached from its trigger button.
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function close() {
      setOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", handleKey);
    };
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
    <div
      className="filterable-th"
      ref={ref}
      role="columnheader"
      aria-label={label}
      aria-sort={sort?.key === sortKey ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <span>{label}</span>
      <SortButton label={label} sortKey={sortKey} sort={sort} onSort={onSort} />
      <button
        ref={buttonRef}
        type="button"
        className={`th-filter-btn${hasActive ? " th-filter-btn--active" : ""}`}
        onClick={() => {
          if (!open) {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (rect) {
              const width = 180;
              setPos({
                top: rect.bottom + 2,
                left: Math.min(rect.left, Math.max(8, window.innerWidth - width - 8)),
              });
            }
          }
          setOpen(!open);
        }}
        aria-label={`Filter ${label}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M1.5 1.5h13l-5.5 6.5v5l-2 1v-6z" />
        </svg>
        {hasActive && <span className="th-filter-count">{selected.length}</span>}
      </button>
      {(open || forceRenderOptions) && <div
        className="th-filter-dropdown"
        role="group"
        aria-label={`Filter ${label}`}
        hidden={!open}
        style={pos ? { position: "fixed", top: pos.top, left: pos.left, zIndex: 1000 } : undefined}
      >
          <input
            type="text"
            className="th-filter-search"
            placeholder={`Search ${label.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="th-filter-options">
            <div className="th-filter-empty" hidden={filtered.length !== 0}>No matches</div>
            {options.map((val) => (
              <label
                key={val}
                className="th-filter-option"
                hidden={q.length > 0 && !val.toLowerCase().includes(q)}
              >
                <input
                  type="checkbox"
                  value={val}
                  checked={selected.includes(val)}
                  onChange={() => toggle(val)}
                />
                <span>{val}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="th-filter-clear"
            onClick={() => { onChange([]); setQuery(""); }}
          >
            Clear
          </button>
      </div>}
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: string;
  sort: { key: string; direction: SortDirection } | null;
  onSort: (key: string) => void;
}) {
  return (
    <div
      className="sortable-th"
      role="columnheader"
      aria-label={label}
      aria-sort={sort?.key === sortKey ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <span>{label}</span>
      <SortButton label={label} sortKey={sortKey} sort={sort} onSort={onSort} />
    </div>
  );
}

function SortButton({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: string;
  sort: { key: string; direction: SortDirection } | null;
  onSort: (key: string) => void;
}) {
  const active = sort?.key === sortKey;
  const nextDirection = active && sort.direction === "asc" ? "descending" : "ascending";
  return (
    <button
      type="button"
      className={`th-sort-btn${active ? " th-sort-btn--active" : ""}`}
      data-detail-sort={sortKey}
      data-sort-direction={active ? sort.direction : "none"}
      onClick={() => onSort(sortKey)}
      aria-label={`Sort ${label} ${nextDirection}`}
      title={`Sort ${label} ${nextDirection}`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <path className="sort-icon sort-icon--none" d="M3 4.5 6 1.5l3 3H7v3H5v-3H3Zm6 3L6 10.5 3 7.5h2v-3h2v3h2Z" />
        <path className="sort-icon sort-icon--asc" d="M2 8 6 4l4 4H2Z" />
        <path className="sort-icon sort-icon--desc" d="m2 4 4 4 4-4H2Z" />
      </svg>
    </button>
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
