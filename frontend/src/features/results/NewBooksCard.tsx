import type { DetailRow, GroupStat } from "../../api/domain";
import { GroupStatisticsPanel } from "./GroupStatisticsPanel";
import { NestedAggregationPanel } from "./NestedAggregationPanel";

interface Props {
  newBookCount: number;
  newBookDetails: DetailRow[];
  aggregationColumns: string[];
  aggregationColumnLabels: Record<string, string>;
  keyColumnNames: string[];
  nestedAggregationEnabled: boolean;
  groupStatistics?: GroupStat[];
  extraColumnNames?: string[];
}

export function NewBooksCard({
  newBookCount,
  newBookDetails,
  aggregationColumns,
  aggregationColumnLabels,
  keyColumnNames,
  nestedAggregationEnabled,
  groupStatistics,
  extraColumnNames = [],
}: Props) {
  return (
    <section id="new-books" aria-labelledby="new-books-title" className="card">
      <h3 id="new-books-title" className="results-card-title">New Books</h3>
      <p className="metric">
        <b>{newBookCount.toLocaleString()}</b>{" "}
        <span>new books found</span>
      </p>

      {nestedAggregationEnabled && aggregationColumns.length > 0 ? (
        <NestedAggregationPanel
          details={newBookDetails}
          aggregationColumns={aggregationColumns}
          aggregationColumnLabels={aggregationColumnLabels}
          keyColumnNames={keyColumnNames}
          detailKinds={["added"]}
          recordSummary={(count) => `${count} new book${count !== 1 ? "s" : ""}`}
          renderRecordDetail={(node) => (
            <table className="nested-agg-table">
              <thead><tr>{keyColumnNames.map((col) => <th key={col}>{col}</th>)}{extraColumnNames.map((col) => <th key={col}>{col}</th>)}</tr></thead>
              <tbody><tr>{keyColumnNames.map((col) => <td key={col}>{node.keyColumns[col] ?? ""}</td>)}{extraColumnNames.map((col) => <td key={col}>{node.extraValues?.[col] ?? ""}</td>)}</tr></tbody>
            </table>
          )}
        />
      ) : aggregationColumns.length > 0 && groupStatistics && groupStatistics.length > 0 && (
        <GroupStatisticsPanel stats={groupStatistics} columnLabels={aggregationColumnLabels} />
      )}

      {!nestedAggregationEnabled && newBookDetails.length > 0 && (
        <div className="new-books-table">
          <table>
            <thead>
              <tr>
                {keyColumnNames.map((col) => (
                  <th key={col}>{col}</th>
                ))}
                {extraColumnNames.map((col) => <th key={col}>{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {newBookDetails.map((row) => (
                <tr key={row.rowKey}>
                  {keyColumnNames.map((col) => (
                    <td key={col}>{row.keyColumns[col] ?? ""}</td>
                  ))}
                  {extraColumnNames.map((col) => <td key={col}>{row.extraValues?.[col] ?? ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
