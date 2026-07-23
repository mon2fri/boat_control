import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext";
import { RequireSession } from "../components/RequireSession";
import { useRunExecution } from "../features/results/useRunExecution";
import { OverallSummaryCards } from "../features/results/OverallSummaryCards";
import { RuleResultSection } from "../features/results/RuleResultSection";
import { ReportName } from "../features/reports/ReportName";
import { ExportControls } from "../features/reports/ExportControls";
import { PaginatedDetailSection } from "../features/results/PaginatedDetailSection";
import { GroupStatisticsPanel } from "../features/results/GroupStatisticsPanel";
import { clearUploadSession, loadRun } from "../api/endpoints";
import { formatDateTime } from "../utils/format";
import type { FilterRow, RunRequest } from "../api/domain";
import { formatFilterRow } from "../features/filters/formatFilterRow";
import type { WorkflowState } from "../state/WorkflowContext";

/** Keep only fully-specified filter rows for the run request. */
function completeFilters(filters: FilterRow[]): FilterRow[] {
  return filters.filter((f) => f.column.trim() !== "" && f.values.length > 0);
}

function buildRunRequest(state: WorkflowState): RunRequest | null {
  if (!state.header) return null;
  return {
    sessionId: state.header.sessionId,
    comparisonColumns: state.comparisonColumns,
    filters: completeFilters(state.filters),
    targetColumns: state.targetColumns,
    keyColumns: state.keyColumns,
    aggregationColumns: state.aggregationColumns,
    ruleIndexes: state.selectedRuleIndexes,
    confirmFullSet: state.confirmFullSet,
  };
}

export function ResultsPage() {
  const navigate = useNavigate();
  const { runId } = useParams<{ runId?: string }>();
  const { state, dispatch, reset, clearResult } = useWorkflow();
  const execution = useRunExecution((result) => dispatch({ type: "setResult", result }));

  const handleRunAnother = useCallback(() => {
    if (state.header) {
      void clearUploadSession(state.header.sessionId).catch(() => undefined);
    }
    reset();
    void navigate("/");
  }, [state.header, reset, navigate]);

  const handleEditFiltersOrRules = useCallback(() => {
    clearResult();
    void navigate("/prepare");
  }, [clearResult, navigate]);

  // Deep-link refresh: when the URL is /results/<runId> and the in-memory
  // workflow state does not yet hold that result, fetch the persisted run
  // document from the backend and seed the workflow state from it. This is
  // the path that makes History links shareable and refresh-safe.
  useEffect(() => {
    if (!runId) return;
    if (state.result && state.result.id === runId) return;
    let cancelled = false;
    loadRun(runId)
      .then((result) => {
        if (cancelled) return;
        dispatch({ type: "setResult", result });
      })
      .catch(() => {
        // Surface a quiet failure by leaving the result empty; the page's
        // existing empty-state branch will tell the user to upload.
      });
    return () => {
      cancelled = true;
    };
  }, [runId, state.result, dispatch]);

  if (!state.header && !state.result && !runId) {
    return <RequireSession>Upload files and configure a run to see results.</RequireSession>;
  }

  if (runId && !state.result) {
    return (
      <section aria-labelledby="results-title">
        <h2 id="results-title">Results</h2>
        <p role="status" aria-live="polite" className="busy-row">
          <span className="spinner" aria-hidden="true" /> Loading run {runId}…
        </p>
      </section>
    );
  }

  const request = buildRunRequest(state);

  return (
    <section aria-labelledby="results-title">
      <h2 id="results-title" className="section-heading">3. Results</h2>

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
        <>
          <div className="result-content">
            <div className="results-header">
                <div className="results-title-row">
                  <ReportName
                    runId={state.result.id}
                    name={state.result.reportName}
                    onRenamed={(result) => dispatch({ type: "setResult", result })}
                  />
                  <span className="field-hint results-run-time">
                    Ran on {formatDateTime(state.result.createdAt)}
                  </span>
                </div>
                <ExportControls runId={state.result.id} reportName={state.result.reportName} />
              </div>
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
                <p className="field-hint" data-testid="applied-filters-statement">
                  {state.result.filtersApplied && state.result.filtersApplied.length > 0
                    ? `Filtering: ${state.result.filtersApplied.map(formatFilterRow).join("; ")}`
                    : "No filtering rows applied"}
                </p>
                {state.result.groupStatistics?.overall && state.result.groupStatistics.overall.length > 0 && (
                  <GroupStatisticsPanel stats={state.result.groupStatistics.overall} />
                )}
              </section>

              <section id="changes" aria-labelledby="changes-title" className="card" style={{ marginTop: "var(--space)" }}>
                <h3 id="changes-title">Attribute changes</h3>
                <p className="section-logic">
                  <code>In Baseline ≠ In Comparison</code> on shared target columns.
                </p>
                {state.result.groupStatistics?.attributeChanges && state.result.groupStatistics.attributeChanges.length > 0 && (
                  <GroupStatisticsPanel stats={state.result.groupStatistics.attributeChanges} />
                )}
                <PaginatedDetailSection runId={state.result.id} kind="changed" caption="Attribute change details" keyColumnNames={state.keyColumns} />
              </section>

              {state.result.ruleResults.map((rule) => {
                const ruleGroupStats = state.result!.groupStatistics?.validationRules?.[rule.ruleIndex];
                return (
                  <RuleResultSection
                    key={rule.ruleIndex}
                    result={rule}
                    keyColumnNames={state.keyColumns}
                    {...(ruleGroupStats ? { groupStats: ruleGroupStats } : {})}
                  />
                );
              })}

              <div className="card">
                <div className="config-inline-row">
                  <button type="button" className="btn btn--primary" onClick={handleRunAnother}>
                    Run another report
                  </button>
                  <button type="button" className="btn" onClick={handleEditFiltersOrRules}>
                    Edit filters or rules
                  </button>
                  <button type="button" className="btn" onClick={() => void navigate("/history")}>
                    View run history
                  </button>
                </div>
              </div>
            </div>
        </>
      )}
    </section>
  );
}
