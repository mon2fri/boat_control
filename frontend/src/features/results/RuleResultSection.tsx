import type { RuleResult } from "../../api/domain";
import { DetailTable } from "./DetailTable";
import { sectionId } from "./anchors";

/**
 * One rule's result: heading with its identifier, the rule logic shown under
 * the title, its violation counts, and a virtualized detail table.
 */
export function RuleResultSection({ result }: { result: RuleResult }) {
  const headingId = `heading-${result.ruleIndex}`;
  return (
    <section id={sectionId(result.ruleIndex)} aria-labelledby={headingId} className="card">
      <h3 id={headingId}>
        {result.ruleIndex} — {result.ruleName}
      </h3>
      <p className="section-logic">
        <span className="visually-hidden">Rule logic: </span>
        <code>{result.logicSummary}</code>
      </p>
      <div className="summary-grid">
        <div className="metric">
          <b>{result.violationRowCount.toLocaleString()}</b>
          <span>Rows violating</span>
        </div>
        <div className="metric">
          <b>{result.violationAttributeCount.toLocaleString()}</b>
          <span>Attributes violating</span>
        </div>
      </div>
      <DetailTable rows={result.details} caption={`Detail rows for ${result.ruleIndex}`} />
    </section>
  );
}
