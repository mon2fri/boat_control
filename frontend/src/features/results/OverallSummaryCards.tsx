import type {
  FilterRow,
  GroupNode,
  GroupRelation,
  OverallSummary,
} from "../../api/domain";
import { summarizeAppliedFilters } from "./appliedFilterSummary";

const METRICS: { key: keyof OverallSummary; label: string }[] = [
  { key: "ruleViolationRowCount", label: "Books with rule exception" },
  { key: "ruleViolationAttributeCount", label: "Attributes with rule exception" },
  { key: "changedRowCount", label: "Books with changes" },
  { key: "changedAttributeCount", label: "Attributes changed" },
  { key: "newBookCount", label: "New Books" },
];

export interface OverallSummaryCardsProps {
  summary: OverallSummary;
  /** Persisted applied rows for this run; never the live editor state. */
  filtersApplied?: FilterRow[] | undefined;
  /** Persisted flat relation; null/absent means legacy AND without a tree. */
  filtersRelation?: GroupRelation | null | undefined;
  /** Persisted grouping tree already remapped to the applied rows' runtime IDs. */
  filtersGroupTree?: GroupNode | null | undefined;
  /** Restore errors retained by the API mapper for an incomplete saved expression. */
  filtersGroupingErrors?: string[] | undefined;
}

/**
 * The five headline counts and a discreet filtered-book count.
 *
 * The filter block is rendered from the persisted run fields so a saved result
 * never reflects unsaved editor changes. A broken saved expression is shown as
 * an error and is never flattened into a broader AND/OR interpretation.
 */
export function OverallSummaryCards({
  summary,
  filtersApplied,
  filtersRelation,
  filtersGroupTree,
  filtersGroupingErrors,
}: OverallSummaryCardsProps) {
  const filterSummary = summarizeAppliedFilters({
    filtersApplied,
    filtersRelation,
    filtersGroupTree,
    filtersGroupingErrors,
  });
  const hasFilters = (filtersApplied?.length ?? 0) > 0;

  return (
    <div className="overall-summary">
      <div className="summary-grid" aria-label="Overall result summary">
        {METRICS.map((metric) => {
          const value = summary[metric.key];
          if (value === undefined || (value === 0 && metric.key !== "newBookCount")) return null;
          return (
            <div className="metric" key={metric.key}>
              <b>{value.toLocaleString()}</b>
              <span>{metric.label}</span>
            </div>
          );
        })}
      </div>
      <div className="applied-filter-summary" aria-label="Applied filter grouping">
        {!hasFilters && (
          <p className="field-hint" data-testid="applied-filters-statement">
            No filtering rows applied
          </p>
        )}
        {filterSummary.invalid && (
          <p className="alert alert--error" role="alert" data-testid="applied-filters-error">
            Filter grouping could not be restored: {filterSummary.errors.join(" ")}
          </p>
        )}
      </div>
      <p className="field-hint">
        Books after filters: {summary.recordsLoaded.toLocaleString()}
      </p>
    </div>
  );
}
