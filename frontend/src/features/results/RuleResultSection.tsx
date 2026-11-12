import { useMemo, useState, useCallback } from "react";
import type { GroupStat, RuleResult } from "../../api/domain";
import { DetailTable, filterDetailRows } from "./DetailTable";
import { GroupStatisticsPanel } from "./GroupStatisticsPanel";
import { sectionId } from "./anchors";
import { resolveExceptionId } from "../../lib/exceptionIdentity";
import { RuleResultGroupingPreview } from "./ResultGroupingPreview";

/**
 * One rule's result: heading with its identifier and saved grouping preview,
 * its violation counts, and a virtualized detail table. Exception
 * detail rows use the stable Exception ID as their identifier.
 */
export function RuleResultSection({
  result,
  keyColumnNames = [],
  groupStats,
  aggregationColumnLabels = {},
}: {
  result: RuleResult;
  keyColumnNames?: string[];
  groupStats?: GroupStat[];
  aggregationColumnLabels?: Record<string, string>;
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
    const extraValuesByColumn = new Map<string, Set<string>>();
    for (const row of result.details) {
      for (const [column, value] of Object.entries(row.extraValues ?? {})) {
        if (!extraValuesByColumn.has(column)) {
          extraValuesByColumn.set(column, new Set());
        }
        if (value != null) extraValuesByColumn.get(column)!.add(String(value));
      }
    }
    for (const [column, values] of extraValuesByColumn) {
      filters.push({
        key: `extra_${column}`,
        label: column,
        options: [...values].sort(),
      });
    }
    if (!result.hideComparison && result.details.some((r) => r.column)) {
      const colVals = new Set<string>();
      for (const r of result.details) {
        if (r.column) colVals.add(r.column);
      }
      filters.push({ key: "column", label: "COLUMN", options: [...colVals].sort() });
    }
    return filters;
  }, [result.details, result.hideComparison, keyColumnNames]);

  const filteredRows = useMemo(
    () => filterDetailRows(result.details, activeFilters),
    [result.details, activeFilters],
  );
  const rowsWithIdentity = useMemo(
    () =>
      filteredRows.map((row) => {
        if (row.kind !== "exception") return row;
        const exceptionId = resolveExceptionId(
          row.exceptionId,
          result.ruleIdentifier,
          keyColumnNames,
          row.keyColumns,
        );
        return exceptionId ? { ...row, exceptionId } : row;
      }),
    [filteredRows, result.ruleIdentifier, keyColumnNames],
  );

  const headingId = `heading-${result.ruleIndex}`;
  return (
    <section id={sectionId(result.ruleIndex)} aria-labelledby={headingId} className="card">
      <h3 id={headingId} className="results-card-title">
        <span className="result-heading-with-preview"><RuleResultGroupingPreview result={result} />{result.ruleIndex} — {result.ruleName}</span>
        {result.ruleIdentifier && (
          <code className="result-rule-identifier">{result.ruleIdentifier}</code>
        )}
      </h3>
      {result.ruleDescription && (
        <p className="rule-result-description">{result.ruleDescription}</p>
      )}
      <div className="summary-grid" style={{ marginBottom: "var(--space)" }}>
        <div className="metric">
          <b>{result.violationRowCount.toLocaleString()}</b>
          <span>Books with Exception</span>
        </div>
        <div className="metric">
          <b>{result.violationAttributeCount.toLocaleString()}</b>
          <span>Attributes with exception</span>
        </div>
      </div>
      {groupStats && groupStats.length > 0 && (
        <GroupStatisticsPanel stats={groupStats} columnLabels={aggregationColumnLabels} />
      )}
      <DetailTable
        rows={rowsWithIdentity}
        total={result.details.length}
        caption={`Detail rows for ${result.ruleIndex}`}
        keyColumnNames={keyColumnNames}
        emptyMessage="Nil exception detected under current rule."
        columnFilters={columnFilters}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        hideComparison={result.hideComparison ?? false}
        showExceptionId
        sequenceSource={result.details}
      />
    </section>
  );
}
