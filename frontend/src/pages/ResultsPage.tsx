import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext";
import { RequireSession } from "../components/RequireSession";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useRunExecution } from "../features/results/useRunExecution";
import { OverallSummaryCards } from "../features/results/OverallSummaryCards";
import { RuleResultSection } from "../features/results/RuleResultSection";
import { ExceptionTable } from "../features/results/ExceptionTable";
import { ReportName } from "../features/reports/ReportName";
import { ExportControls } from "../features/reports/ExportControls";
import { PaginatedDetailSection } from "../features/results/PaginatedDetailSection";
import { GroupStatisticsPanel } from "../features/results/GroupStatisticsPanel";
import { NestedAggregationPanel } from "../features/results/NestedAggregationPanel";
import { ExceptionRuleSummary } from "../features/results/ExceptionRuleSummary";
import { NewBooksCard } from "../features/results/NewBooksCard";
import { ComparisonColumnList } from "../features/results/ComparisonColumnList";
import { buildSectionGroupStatistics } from "../features/results/sectionGroupStatistics";
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
  const request: RunRequest = {
    sessionId: state.header.sessionId,
    comparisonColumns: state.comparisonColumns,
    filters: completeFilters(state.filters),
    targetColumns: state.targetColumns,
    keyColumns: state.keyColumns,
    aggregationColumns: state.aggregationColumns,
    aggregationColumnLabels: state.aggregationColumnLabels,
    ruleIndexes: state.selectedRuleIndexes,
    confirmFullSet: state.confirmFullSet,
  };
  if (state.nestedAggregationEnabled) {
    request.nestedAggregationEnabled = true;
  }
  if (state.comparisonSections.length > 0) {
    request.comparisonSections = state.comparisonSections;
  }
  if (state.exceptionColumns.length > 0) {
    request.exceptionColumns = state.exceptionColumns;
  }
  return request;
}

export function ResultsPage() {
  const navigate = useNavigate();
  const { runId } = useParams<{ runId?: string }>();
  const { state, dispatch, reset, clearResult } = useWorkflow();
  const [showStartOverConfirm, setShowStartOverConfirm] = useState(false);
  const execution = useRunExecution((result) => dispatch({ type: "setResult", result }));

  const handleStartOver = useCallback(() => {
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
        // Restore the configuration that produced this run so subsequent
        // renders (e.g. nested aggregation tree) match the persisted state.
        dispatch({ type: "setResult", result });
        // Always restore nested-aggregation flag (including false).
        dispatch({ type: "setNestedAggregationEnabled", enabled: result.nestedAggregationEnabled ?? false });
        // Always restore aggregation columns (including empty array).
        dispatch({ type: "setAggregationColumns", columns: result.aggregationColumns ?? [] });
        dispatch({ type: "setAggregationColumnLabels", labels: result.aggregationColumnLabels ?? {} });
        // Always restore key columns (including empty array).
        dispatch({ type: "setKeyColumns", columns: result.keyColumns ?? [] });
        // Always restore exception columns (including empty array).
        dispatch({ type: "setExceptionColumns", columns: result.exceptionColumns ?? [] });
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
          <h3 className="results-card-title">Run comparison &amp; validation</h3>
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
        <ResultView
          result={state.result}
          targetColumns={state.targetColumns}
          filters={state.filters}
          keyColumns={state.keyColumns}
          aggregationColumns={state.aggregationColumns}
          aggregationColumnLabels={state.aggregationColumnLabels}
          exceptionColumns={state.exceptionColumns}
          nestedAggregationEnabled={state.nestedAggregationEnabled}
          commonColumns={state.header?.common ?? []}
          onRunAnother={() => setShowStartOverConfirm(true)}
          onEditFilters={handleEditFiltersOrRules}
          onViewHistory={() => void navigate("/history")}
          onRename={(result) => dispatch({ type: "setResult", result })}
        />
      )}
      <ConfirmDialog
        title="Start over with new uploads?"
        open={showStartOverConfirm}
        confirmLabel="Start over"
        confirmTone="danger"
        onCancel={() => setShowStartOverConfirm(false)}
        onConfirm={handleStartOver}
      >
        <p>This will clear all current config and reload all data.</p>
      </ConfirmDialog>
    </section>
  );
}

interface ResultViewProps {
  result: NonNullable<ReturnType<typeof useWorkflow>["state"]["result"]>;
  targetColumns: string[];
  filters: FilterRow[];
  keyColumns: string[];
  aggregationColumns: string[];
  aggregationColumnLabels: Record<string, string>;
  exceptionColumns: string[];
  nestedAggregationEnabled: boolean;
  commonColumns: string[];
  onRunAnother: () => void;
  onEditFilters: () => void;
  onViewHistory: () => void;
  onRename: (result: NonNullable<ReturnType<typeof useWorkflow>["state"]["result"]>) => void;
}

function ResultView({
  result,
  targetColumns,
  filters,
  keyColumns,
  aggregationColumns,
  aggregationColumnLabels,
  exceptionColumns,
  nestedAggregationEnabled,
  commonColumns,
  onRunAnother,
  onEditFilters,
  onViewHistory,
  onRename,
}: ResultViewProps) {
  return (
    <div className="result-content results-layer-content" data-export-source="result">
      <div className="results-header results-layer-header">
        <div className="results-title-row">
          <ReportName
            runId={result.id}
            name={result.reportName}
            onRenamed={onRename}
          />
          <span className="field-hint results-run-time">
            Ran on {formatDateTime(result.createdAt)}
          </span>
        </div>
        <ExportControls runId={result.id} reportName={result.reportName} />
      </div>
      <section id="overall" aria-labelledby="overall-title" className="card">
        <h3 id="overall-title" className="results-card-title">Overall result</h3>
        <p className="section-logic">
          Comparison across{" "}
          {targetColumns.length === 0
            ? "all common columns"
            : `${targetColumns.length} target columns`}{" "}
          with {completeFilters(filters).length} filter(s).
        </p>
        <OverallSummaryCards summary={result.overall} />
        <p className="field-hint" data-testid="applied-filters-statement">
          {result.filtersApplied && result.filtersApplied.length > 0
            ? `Filtering: ${result.filtersApplied.map(formatFilterRow).join("; ")}`
            : "No filtering rows applied"}
        </p>
        {nestedAggregationEnabled && aggregationColumns.length > 0 ? (
          <NestedAggregationPanel
            details={result.changeDetails}
            aggregationColumns={aggregationColumns}
            aggregationColumnLabels={aggregationColumnLabels}
            keyColumnNames={keyColumns}
          />
        ) : result.groupStatistics?.overall && result.groupStatistics.overall.length > 0 ? (
          <GroupStatisticsPanel stats={result.groupStatistics.overall} columnLabels={aggregationColumnLabels} />
        ) : null}
      </section>

      {result.overall.newBookCount && result.overall.newBookCount > 0 ? (
        <NewBooksCard
          newBookCount={result.overall.newBookCount}
          newBookDetails={result.changeDetails.filter((d) => d.kind === "added")}
          aggregationColumns={aggregationColumns}
          aggregationColumnLabels={aggregationColumnLabels}
          keyColumnNames={keyColumns}
          {...(result.groupStatistics?.newBooks && { groupStatistics: result.groupStatistics.newBooks })}
        />
      ) : null}

      <ExceptionRuleSummary rules={result.ruleResults} />

      {result.comparisonSections && result.comparisonSections.length > 0
        ? result.comparisonSections.map((section) => {
            const sectionChanges = result.changeDetails.filter(
              (d) => section.columns.includes(d.column),
            );
            const sectionGroupStatistics = buildSectionGroupStatistics(
              sectionChanges,
              aggregationColumns,
            );
            return (
              <section
                key={section.id}
                id={`changes-${section.id}`}
                aria-labelledby={`changes-title-${section.id}`}
                className="card"
                style={{ marginTop: "var(--space)" }}
              >
                <h3 id={`changes-title-${section.id}`} className="results-card-title">{section.name}</h3>
                <p className="section-logic">
                  <code>In Baseline ≠ In Comparison</code> — {section.columns.length} column
                  {section.columns.length !== 1 ? "s" : ""}
                </p>
                <ComparisonColumnList columns={section.columns} />
                {nestedAggregationEnabled && aggregationColumns.length > 0 && sectionChanges.length > 0 ? (
                  <NestedAggregationPanel
                    details={sectionChanges}
                    aggregationColumns={aggregationColumns}
                    aggregationColumnLabels={aggregationColumnLabels}
                    keyColumnNames={keyColumns}
                  />
                ) : !nestedAggregationEnabled && sectionGroupStatistics.length > 0 ? (
                  <GroupStatisticsPanel stats={sectionGroupStatistics} columnLabels={aggregationColumnLabels} />
                ) : null}
                <PaginatedDetailSection
                  runId={result.id}
                  kind="changed"
                  caption={`Attribute changes — ${section.name}`}
                  keyColumnNames={keyColumns}
                  exportRows={sectionChanges}
                  sectionColumns={section.columns}
                  extraColumnNames={section.extraColumns ?? []}
                />
              </section>
            );
          })
        : (
          <section id="changes" aria-labelledby="changes-title" className="card" style={{ marginTop: "var(--space)" }}>
            <h3 id="changes-title" className="results-card-title">Attribute changes</h3>
            <p className="section-logic">
              <code>In Baseline ≠ In Comparison</code> on shared target columns.
            </p>
            <ComparisonColumnList
              columns={
                result.comparisonColumns
                ?? (targetColumns.length > 0 ? targetColumns : commonColumns)
              }
            />
            {nestedAggregationEnabled && aggregationColumns.length > 0 ? (
              <NestedAggregationPanel
                details={result.changeDetails}
                aggregationColumns={aggregationColumns}
                aggregationColumnLabels={aggregationColumnLabels}
                keyColumnNames={keyColumns}
              />
            ) : result.groupStatistics?.attributeChanges && result.groupStatistics.attributeChanges.length > 0 ? (
              <GroupStatisticsPanel stats={result.groupStatistics.attributeChanges} columnLabels={aggregationColumnLabels} />
            ) : null}
            <PaginatedDetailSection
              runId={result.id}
              kind="changed"
              caption="Attribute change details"
              keyColumnNames={keyColumns}
              exportRows={result.changeDetails}
            />
          </section>
        )}

      {result.ruleResults.map((rule) => {
        const ruleGroupStats = result.groupStatistics?.validationRules?.[rule.ruleIndex];
        return (
          <RuleResultSection
            key={rule.ruleIndex}
            result={rule}
            keyColumnNames={keyColumns}
            aggregationColumnLabels={aggregationColumnLabels}
            {...(ruleGroupStats ? { groupStats: ruleGroupStats } : {})}
          />
        );
      })}

      <ExceptionTable
        ruleResults={result.ruleResults}
        keyColumnNames={keyColumns}
        aggregationColumnLabels={aggregationColumnLabels}
        exceptionColumns={exceptionColumns}
      />

      <div className="card results-actions results-layer-actions" data-export-exclude>
        <div className="config-inline-row">
          <button type="button" className="btn btn--primary" onClick={onRunAnother}>
            Start over with new uploads
          </button>
          <button type="button" className="btn" onClick={onEditFilters}>
            Edit filters or rules
          </button>
          <button type="button" className="btn" onClick={onViewHistory}>
            View run history
          </button>
        </div>
      </div>
    </div>
  );
}
