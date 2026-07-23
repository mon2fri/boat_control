import type { RuleResult } from "../../api/domain";

interface Props {
  rules: RuleResult[];
}

/** Compact per-rule summary using the backend's distinct exception-row count. */
export function ExceptionRuleSummary({ rules }: Props) {
  return (
    <section className="card" aria-labelledby="exception-rule-summary-title">
      <h3 id="exception-rule-summary-title">Exception Rule Summary</h3>
      {rules.length === 0 ? (
        <p role="status">No exception rules were selected.</p>
      ) : (
        <div className="detail-scroll exception-rule-summary-scroll">
          <div className="detail-grid exception-rule-summary-table" role="table">
            <div className="detail-grid-header results-layer-table-header" role="rowgroup">
              <div className="detail-grid-row" role="row">
                <div role="columnheader">Rule name</div>
                <div role="columnheader">Exception records</div>
              </div>
            </div>
            <div className="detail-grid-body" role="rowgroup">
              {rules.map((rule) => (
                <div className="detail-grid-row" role="row" key={rule.ruleIndex}>
                  <div role="cell">
                    <span className="exception-rule-id">{rule.ruleIndex}</span>
                    <span>{rule.ruleName}</span>
                  </div>
                  <div role="cell" className="exception-record-count">
                    {rule.violationRowCount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
