import { useNavigate } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext";
import { RequireSession } from "../components/RequireSession";
import { useRunExecution } from "../features/results/useRunExecution";
import { OverallSummaryCards } from "../features/results/OverallSummaryCards";
import { RuleResultSection } from "../features/results/RuleResultSection";
import { DetailTable } from "../features/results/DetailTable";
import { TableOfContents } from "../features/results/TableOfContents";
import { ReportName } from "../features/reports/ReportName";
import { ExportControls } from "../features/reports/ExportControls";
import type { FilterRow, RunRequest } from "../api/domain";
import type { WorkflowState } from "../state/WorkflowContext";

/** Keep only fully-specified filter rows for the run request. */
function completeFilters(filters: FilterRow[]): FilterRow[] {
  return filters.filter((f) => f.column.trim() !== "" && f.value.trim() !== "");
}

function buildRunRequest(state: WorkflowState): RunRequest | null {
  if (!state.header) return null;
  return {
    sessionId: state.header.sessionId,
    filters: completeFilters(state.filters),
    targetColumns: state.targetColumns,
    ruleIndexes: state.selectedRuleIndexes,
    confirmFullSet: state.confirmFullSet,
  };
}

export function ResultsPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useWorkflow();
  const execution = useRunExecution((result) => dispatch({ type: "setResult", result }));

  if (!state.header && !state.result) {
    return <RequireSession>Upload files and configure a run to see results.</RequireSession>;
  }

  const request = buildRunRequest(state);

  return (
    <section aria-labelledby="results-title">
      <h2 id="results-title">Results</h2>

      {!state.result && (
        <div className="card">
          <h3>Run comparison &amp; validation</h3>
          <ul className="run-summary">
            <li>{completeFilters(state.filters).length} filter(s)</li>
            <li>
              {state.targetColumns.length === 0
                ? "All common columns"
                : `${state.targetColumns.length} target column(s)`}
            </li>
            <li>{state.selectedRuleIndexes.length} rule(s) selected</li>
          </ul>
          {execution.status === "running" ? (
            <p role="status" aria-live="polite" className="busy-row">
              <span className="spinner" aria-hidden="true" /> Running…{" "}
              <button type="button" className="btn" onClick={execution.cancel}>
                Cancel
              </button>
            </p>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              disabled={!request}
              onClick={() => request && void execution.run(request)}
            >
              Run now
            </button>
          )}
          {execution.status === "error" && execution.error && (
            <p className="alert alert--error" role="alert">
              {execution.error}
            </p>
          )}
        </div>
      )}

      {state.result && (
        <div className="result-layout">
          <TableOfContents result={state.result} />
          <div className="result-content">
            <ReportName
              runId={state.result.id}
              name={state.result.reportName}
              onRenamed={(result) => dispatch({ type: "setResult", result })}
            />
            <p className="field-hint">
              {state.result.file1Name} vs {state.result.file2Name}
            </p>
            <ExportControls runId={state.result.id} reportName={state.result.reportName} />

            <section id="overall" aria-labelledby="overall-title" className="card">
              <h3 id="overall-title">Overall result</h3>
              <p className="section-logic">
                Comparison across{" "}
                {state.targetColumns.length === 0
                  ? "all common columns"
                  : `${state.targetColumns.length} target columns`}{" "}
                with {completeFilters(state.filters).length} filter(s).
              </p>
              <OverallSummaryCards summary={state.result.overall} />
            </section>

            <section id="changes" aria-labelledby="changes-title" className="card">
              <h3 id="changes-title">Attribute changes</h3>
              <p className="section-logic">
                <code>file1 value ≠ file2 value</code> on shared target columns.
              </p>
              <DetailTable rows={state.result.changeDetails} caption="Attribute change details" />
            </section>

            {state.result.ruleResults.map((rule) => (
              <RuleResultSection key={rule.ruleIndex} result={rule} />
            ))}

            <div className="card">
              <button type="button" className="btn" onClick={() => void navigate("/history")}>
                View run history
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
