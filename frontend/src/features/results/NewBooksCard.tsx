import type { DetailRow, GroupStat } from "../../api/domain";
import { GroupStatisticsPanel } from "./GroupStatisticsPanel";

interface Props {
  newBookCount: number;
  newBookDetails: DetailRow[];
  aggregationColumns: string[];
  aggregationColumnLabels: Record<string, string>;
  keyColumnNames: string[];
  groupStatistics?: GroupStat[];
}

export function NewBooksCard({
  newBookCount,
  newBookDetails,
  aggregationColumns,
  aggregationColumnLabels,
  keyColumnNames,
  groupStatistics,
}: Props) {
  if (newBookCount === 0) return null;

  return (
    <section id="new-books" aria-labelledby="new-books-title" className="card">
      <h3 id="new-books-title" className="results-card-title">New Books</h3>
      <p className="metric">
        <b>{newBookCount.toLocaleString()}</b>
        <span>Books only in comparison file</span>
      </p>

      {aggregationColumns.length > 0 && groupStatistics && groupStatistics.length > 0 && (
        <GroupStatisticsPanel stats={groupStatistics} columnLabels={aggregationColumnLabels} />
      )}

      {newBookDetails.length > 0 && (
        <div className="new-books-table">
          <table>
            <thead>
              <tr>
                {keyColumnNames.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {newBookDetails.map((row) => (
                <tr key={row.rowKey}>
                  {keyColumnNames.map((col) => (
                    <td key={col}>{row.keyColumns[col] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
