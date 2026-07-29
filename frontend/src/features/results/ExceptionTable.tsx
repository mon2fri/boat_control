import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RuleResult } from "../../api/domain";

interface ExceptionRow {
  ruleIndex: string;
  ruleName: string;
  keyColumns: Record<string, string | null>;
  aggregationValues: Record<string, string | null>;
  extraValues: Record<string, string | null>;
}

interface Props {
  ruleResults: RuleResult[];
  keyColumnNames: string[];
  aggregationColumnLabels: Record<string, string>;
  exceptionColumns: string[];
}

/**
 * Builds the exception table rows from all rule results.
 * Each violation row becomes an exception table row, with key columns + rule index as identifiers.
 */
function buildExceptionRows(
  ruleResults: RuleResult[],
  keyColumnNames: string[],
  exceptionColumns: string[],
): ExceptionRow[] {
  const rows: ExceptionRow[] = [];
  const exceptionColSet = new Set(exceptionColumns);

  for (const rule of ruleResults) {
    for (const detail of rule.details) {
      if (detail.kind !== "exception") continue;

      const keyValues: Record<string, string | null> = {};
      for (const kc of keyColumnNames) {
        keyValues[kc] = detail.keyColumns[kc] ?? null;
      }

      const aggValues: Record<string, string | null> = {};
      for (const [col, val] of Object.entries(detail.aggregationValues ?? {})) {
        aggValues[col] = val;
      }

      const extraValues: Record<string, string | null> = {};
      for (const [col, val] of Object.entries(detail.extraValues ?? {})) {
        if (exceptionColSet.has(col)) {
          extraValues[col] = val;
        }
      }

      rows.push({
        ruleIndex: rule.ruleIndex,
        ruleName: rule.ruleName,
        keyColumns: keyValues,
        aggregationValues: aggValues,
        extraValues,
      });
    }
  }

  return rows;
}

/**
 * Exception table that aggregates all rule violations.
 * Key columns + Rule Index form the identifier.
 * Aggregation columns and user-selected extra columns are included.
 */
export function ExceptionTable({
  ruleResults,
  keyColumnNames,
  aggregationColumnLabels,
  exceptionColumns,
}: Props) {
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [exportMode, setExportMode] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const wasOpenBeforeExport = useRef(false);

  useEffect(() => {
    const prepare = () => {
      wasOpenBeforeExport.current = detailsRef.current?.open ?? false;
      if (detailsRef.current) detailsRef.current.open = true;
      setExportMode(true);
    };
    const cleanup = () => {
      if (detailsRef.current) detailsRef.current.open = wasOpenBeforeExport.current;
      setExportMode(false);
    };
    document.addEventListener("prepare-result-export", prepare);
    document.addEventListener("cleanup-result-export", cleanup);
    return () => {
      document.removeEventListener("prepare-result-export", prepare);
      document.removeEventListener("cleanup-result-export", cleanup);
    };
  }, []);

  const allRows = useMemo(
    () => buildExceptionRows(ruleResults, keyColumnNames, exceptionColumns),
    [ruleResults, keyColumnNames, exceptionColumns],
  );

  // Collect unique values for each column for filtering
  const columnOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const kc of keyColumnNames) {
      const vals = new Set<string>();
      for (const row of allRows) {
        const v = row.keyColumns[kc];
        if (v != null) vals.add(String(v));
      }
      options[`key_${kc}`] = [...vals].sort();
    }
    options["ruleIndex"] = [...new Set(allRows.map((r) => r.ruleIndex))].sort();
    const aggCols = new Set<string>();
    for (const row of allRows) {
      for (const col of Object.keys(row.aggregationValues)) {
        aggCols.add(col);
      }
    }
    for (const col of aggCols) {
      const vals = new Set<string>();
      for (const row of allRows) {
        const v = row.aggregationValues[col];
        if (v != null) vals.add(String(v));
      }
      options[`agg_${col}`] = [...vals].sort();
    }
    const extraCols = new Set<string>();
    for (const row of allRows) {
      for (const col of Object.keys(row.extraValues)) {
        extraCols.add(col);
      }
    }
    for (const col of extraCols) {
      const vals = new Set<string>();
      for (const row of allRows) {
        const v = row.extraValues[col];
        if (v != null) vals.add(String(v));
      }
      options[`extra_${col}`] = [...vals].sort();
    }
    return options;
  }, [allRows, keyColumnNames]);

  // Apply filters
  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      for (const [filterKey, filterValues] of Object.entries(activeFilters)) {
        if (filterValues.length === 0) continue;
        let cellValue: string | null = null;
        if (filterKey.startsWith("key_")) {
          const col = filterKey.slice(4);
          cellValue = row.keyColumns[col] != null ? String(row.keyColumns[col]) : null;
        } else if (filterKey === "ruleIndex") {
          cellValue = row.ruleIndex;
        } else if (filterKey.startsWith("agg_")) {
          const col = filterKey.slice(4);
          cellValue = row.aggregationValues[col] != null ? String(row.aggregationValues[col]) : null;
        } else if (filterKey.startsWith("extra_")) {
          const col = filterKey.slice(6);
          cellValue = row.extraValues[col] != null ? String(row.extraValues[col]) : null;
        }
        if (cellValue == null || !filterValues.includes(cellValue)) {
          return false;
        }
      }
      return true;
    });
  }, [allRows, activeFilters]);

  // Apply sorting
  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      let aVal: string = "";
      let bVal: string = "";
      if (sortKey.startsWith("key_")) {
        const col = sortKey.slice(4);
        aVal = a.keyColumns[col] != null ? String(a.keyColumns[col]) : "";
        bVal = b.keyColumns[col] != null ? String(b.keyColumns[col]) : "";
      } else if (sortKey === "ruleIndex") {
        aVal = a.ruleIndex;
        bVal = b.ruleIndex;
      } else if (sortKey.startsWith("agg_")) {
        const col = sortKey.slice(4);
        aVal = a.aggregationValues[col] != null ? String(a.aggregationValues[col]) : "";
        bVal = b.aggregationValues[col] != null ? String(b.aggregationValues[col]) : "";
      } else if (sortKey.startsWith("extra_")) {
        const col = sortKey.slice(6);
        aVal = a.extraValues[col] != null ? String(a.extraValues[col]) : "";
        bVal = b.extraValues[col] != null ? String(b.extraValues[col]) : "";
      }
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortKey, sortDir]);

  const handleFilterChange = useCallback((key: string, values: string[]) => {
    setActiveFilters((prev) => {
      const next = { ...prev };
      if (values.length === 0) {
        delete next[key];
      } else {
        next[key] = values;
      }
      return next;
    });
  }, []);

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const aggColumnNames = useMemo(() => {
    const cols = new Set<string>();
    for (const row of allRows) {
      for (const col of Object.keys(row.aggregationValues)) {
        cols.add(col);
      }
    }
    return [...cols];
  }, [allRows]);

  const extraColumnNames = useMemo(() => {
    const cols = new Set<string>();
    for (const row of allRows) {
      for (const col of Object.keys(row.extraValues)) {
        cols.add(col);
      }
    }
    return [...cols];
  }, [allRows]);

  const hasRows = allRows.length > 0;
  const columnTemplate = [
    ...keyColumnNames.map(() => "minmax(150px, 1fr)"),
    "minmax(130px, 0.85fr)",
    ...aggColumnNames.map(() => "minmax(150px, 1fr)"),
    ...extraColumnNames.map(() => "minmax(180px, 1.2fr)"),
  ].join(" ");
  const tableMinWidth = keyColumnNames.length * 150
    + 130
    + aggColumnNames.length * 150
    + extraColumnNames.length * 180;

  return (
    <section id="exception-table" aria-labelledby="exception-table-title" className="card">
      <details ref={detailsRef}>
        <summary
          className="group-stat-toggle"
          style={{ width: "100%", justifyContent: "space-between", cursor: "pointer" }}
        >
          <span className="nested-agg-label" style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-muted)" }}>
            Exception Table
          </span>
          <span className="nested-agg-count">
            {allRows.length.toLocaleString()} rows
          </span>
        </summary>

        <div style={{ marginTop: "var(--space)" }}>
          {hasRows ? (
          <div
            className={`detail-scroll${exportMode ? "" : " detail-scroll--capped"}`}
            role="region"
            aria-label="Exception details"
            tabIndex={0}
          >
            <div className="detail-grid" role="table" style={{ minWidth: tableMinWidth }}>
              <div className="detail-grid-header results-layer-table-header" role="rowgroup">
                <div className="detail-grid-row" role="row" style={{ gridTemplateColumns: columnTemplate }}>
                  {keyColumnNames.map((kc) => (
                    <div
                      key={`key_${kc}`}
                      role="columnheader"
                      className="filterable-th sortable-th"
                    >
                      <span>{kc}</span>
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => handleSort(`key_${kc}`)}
                        data-detail-sort={`key_${kc}`}
                        data-sort-direction={sortKey === `key_${kc}` ? sortDir : "none"}
                        aria-label={`Sort by ${kc}`}
                      >
                        <span className="sort-icon sort-icon--none">⇅</span>
                        <span className="sort-icon sort-icon--asc">↑</span>
                        <span className="sort-icon sort-icon--desc">↓</span>
                      </button>
                      {(columnOptions[`key_${kc}`]?.length ?? 0) > 0 && (
                        <FilterDropdown
                          column={`key_${kc}`}
                          options={columnOptions[`key_${kc}`]!}
                          active={activeFilters[`key_${kc}`] ?? []}
                          onChange={handleFilterChange}
                        />
                      )}
                    </div>
                  ))}
                  <div
                    role="columnheader"
                    className="filterable-th sortable-th"
                  >
                    <span>Rule Index</span>
                    <button
                      type="button"
                      className="th-sort-btn"
                      onClick={() => handleSort("ruleIndex")}
                      data-detail-sort="ruleIndex"
                      data-sort-direction={sortKey === "ruleIndex" ? sortDir : "none"}
                      aria-label="Sort by Rule Index"
                    >
                      <span className="sort-icon sort-icon--none">⇅</span>
                      <span className="sort-icon sort-icon--asc">↑</span>
                      <span className="sort-icon sort-icon--desc">↓</span>
                    </button>
                    {(columnOptions["ruleIndex"]?.length ?? 0) > 0 && (
                      <FilterDropdown
                        column="ruleIndex"
                        options={columnOptions["ruleIndex"]!}
                        active={activeFilters["ruleIndex"] ?? []}
                        onChange={handleFilterChange}
                      />
                    )}
                  </div>
                  {aggColumnNames.map((col) => {
                    const label = aggregationColumnLabels[col] ?? col;
                    return (
                      <div
                        key={`agg_${col}`}
                        role="columnheader"
                        className="filterable-th sortable-th"
                      >
                        <span>{label}</span>
                        <button
                          type="button"
                          className="th-sort-btn"
                          onClick={() => handleSort(`agg_${col}`)}
                          data-detail-sort={`agg_${col}`}
                          data-sort-direction={sortKey === `agg_${col}` ? sortDir : "none"}
                          aria-label={`Sort by ${label}`}
                        >
                          <span className="sort-icon sort-icon--none">⇅</span>
                          <span className="sort-icon sort-icon--asc">↑</span>
                          <span className="sort-icon sort-icon--desc">↓</span>
                        </button>
                        {(columnOptions[`agg_${col}`]?.length ?? 0) > 0 && (
                          <FilterDropdown
                            column={`agg_${col}`}
                            options={columnOptions[`agg_${col}`]!}
                            active={activeFilters[`agg_${col}`] ?? []}
                            onChange={handleFilterChange}
                          />
                        )}
                      </div>
                    );
                  })}
                  {extraColumnNames.map((col) => (
                    <div
                      key={`extra_${col}`}
                      role="columnheader"
                      className="filterable-th sortable-th"
                    >
                      <span>{col}</span>
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => handleSort(`extra_${col}`)}
                        data-detail-sort={`extra_${col}`}
                        data-sort-direction={sortKey === `extra_${col}` ? sortDir : "none"}
                        aria-label={`Sort by ${col}`}
                      >
                        <span className="sort-icon sort-icon--none">⇅</span>
                        <span className="sort-icon sort-icon--asc">↑</span>
                        <span className="sort-icon sort-icon--desc">↓</span>
                      </button>
                      {(columnOptions[`extra_${col}`]?.length ?? 0) > 0 && (
                        <FilterDropdown
                          column={`extra_${col}`}
                          options={columnOptions[`extra_${col}`]!}
                          active={activeFilters[`extra_${col}`] ?? []}
                          onChange={handleFilterChange}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="detail-grid-body" role="rowgroup">
                {sortedRows.map((row, idx) => (
                  <div
                    className="detail-grid-row"
                    role="row"
                    key={`${row.ruleIndex}-${idx}`}
                    style={{ gridTemplateColumns: columnTemplate }}
                  >
                    {keyColumnNames.map((kc) => (
                      <div key={`key_${kc}`} role="cell">
                        {row.keyColumns[kc] != null ? String(row.keyColumns[kc]) : "—"}
                      </div>
                    ))}
                    <div role="cell">
                      <span className="exception-rule-id">{row.ruleIndex}</span>
                    </div>
                    {aggColumnNames.map((col) => (
                      <div key={`agg_${col}`} role="cell">
                        {row.aggregationValues[col] != null ? String(row.aggregationValues[col]) : "—"}
                      </div>
                    ))}
                    {extraColumnNames.map((col) => (
                      <div key={`extra_${col}`} role="cell">
                        {row.extraValues[col] != null ? String(row.extraValues[col]) : "—"}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          ) : (
            <p className="field-hint" style={{ textAlign: "center", padding: "var(--space)" }}>
              No exceptions found across any rule.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}

interface FilterDropdownProps {
  column: string;
  options: string[];
  active: string[];
  onChange: (column: string, values: string[]) => void;
}

function FilterDropdown({ column, options, active, onChange }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  function toggleOption(value: string) {
    const next = active.includes(value)
      ? active.filter((v) => v !== value)
      : [...active, value];
    onChange(column, next);
  }

  function clearAll() {
    onChange(column, []);
    setSearch("");
  }

  return (
    <div className="th-filter-wrapper" style={{ position: "relative" }}>
      <button
        type="button"
        className={`th-filter-btn ${active.length > 0 ? "th-filter-btn--active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        aria-expanded={isOpen}
        aria-label={`Filter by ${column}`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1 2h10M3 6h6M5 10h2" strokeLinecap="round" />
        </svg>
        {active.length > 0 && (
          <span className="th-filter-count">{active.length}</span>
        )}
      </button>
      <div className="th-filter-dropdown" hidden={!isOpen} style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, minWidth: "150px" }}>
        <input
          type="text"
          className="th-filter-search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="th-filter-options">
          {filteredOptions.map((opt) => (
            <label key={opt} className="th-filter-option">
                <input
                  type="checkbox"
                  value={opt}
                  checked={active.includes(opt)}
                  onChange={() => toggleOption(opt)}
                  onClick={(e) => e.stopPropagation()}
                />
              {opt}
            </label>
          ))}
          {filteredOptions.length === 0 && (
            <div className="th-filter-empty">No matches</div>
          )}
        </div>
        {active.length > 0 && (
          <button type="button" className="th-filter-clear" onClick={clearAll}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
