import { useMemo, useState, useCallback } from "react";
import type { GroupStat, RuleResult } from "../../api/domain";
import { DetailTable, filterDetailRows } from "./DetailTable";
import { GroupStatisticsPanel } from "./GroupStatisticsPanel";
import { sectionId } from "./anchors";

/**
 * One rule's result: heading with its identifier, the rule logic shown under
 * the title, its violation counts, and a virtualized detail table.
 */
export function RuleResultSection({
  result,
  keyColumnNames = [],
  groupStats,
}: {
  result: RuleResult;
  keyColumnNames?: string[];
  groupStats?: GroupStat[];
}) {
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});

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

  const columnFilters = useMemo(() => {
    const filters: { key: string; label: string; options: string[] }[] = [];
    for (const kc of keyColumnNames) {
      const vals = new Set<string>();
      for (const r of result.details) {
        const v = r.keyColumns[kc];
        if (v != null) vals.add(String(v));
      }
      filters.push({ key: `key_${kc}`, label: kc, options: [...vals].sort() });
    }
    if (result.details.some((r) => r.column)) {
      const colVals = new Set<string>();
      for (const r of result.details) {
        if (r.column) colVals.add(r.column);
      }
      filters.push({ key: "column", label: "COLUMN", options: [...colVals].sort() });
    }
    return filters;
  }, [result.details, keyColumnNames]);

  const filteredRows = useMemo(
    () => filterDetailRows(result.details, activeFilters),
    [result.details, activeFilters],
  );

  const headingId = `heading-${result.ruleIndex}`;
  return (
    <section id={sectionId(result.ruleIndex)} aria-labelledby={headingId} className="card">
      <h3 id={headingId}>
        {result.ruleIndex} — {result.ruleName}
      </h3>
      <p className="section-logic">
        <span>Expectation: </span>
        <code>{result.logicSummary}</code>
      </p>
      <div className="summary-grid" style={{ marginBottom: "var(--space)" }}>
        <div className="metric">
          <b>{result.violationRowCount.toLocaleString()}</b>
          <span>Rows with exception</span>
        </div>
        <div className="metric">
          <b>{result.violationAttributeCount.toLocaleString()}</b>
          <span>Attributes with exception</span>
        </div>
      </div>
      {groupStats && groupStats.length > 0 && (
        <GroupStatisticsPanel stats={groupStats} />
      )}
      <DetailTable
        rows={filteredRows}
        total={result.details.length}
        caption={`Detail rows for ${result.ruleIndex}`}
        keyColumnNames={keyColumnNames}
        emptyMessage="Nil exception detected under current rule."
        columnFilters={columnFilters}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
      />
    </section>
  );
}
