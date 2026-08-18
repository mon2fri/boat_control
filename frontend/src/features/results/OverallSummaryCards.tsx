import type { OverallSummary } from "../../api/domain";

const METRICS: { key: keyof OverallSummary; label: string }[] = [
  { key: "recordsLoaded", label: "Books after filters" },
  { key: "ruleViolationRowCount", label: "Books with rule exception" },
  { key: "ruleViolationAttributeCount", label: "Attributes with rule exception" },
  { key: "changedRowCount", label: "Books with changes" },
  { key: "changedAttributeCount", label: "Attributes changed" },
  { key: "newBookCount", label: "New Books" },
];

/** The six required overall counts, rendered as labelled metric cards. */
export function OverallSummaryCards({ summary }: { summary: OverallSummary }) {
  return (
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
  );
}
