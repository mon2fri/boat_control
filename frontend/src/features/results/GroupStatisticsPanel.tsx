import type { GroupStat } from "../../api/domain";
import { distributeEvenly } from "./groupLayout";

interface Props {
  stats: GroupStat[];
}

const VISIBLE_DATA_ROWS = 5;
const ROW_HEIGHT = 32;

/**
 * Renders group-statistic cards for one section (overall, attribute changes,
 * or a single rule). Each grouping column is a collapsible `<details>` card
 * showing a summary line and a table of per-value counts. When expanded,
 * the table shows at most 5 data rows and is scrollable if there are more.
 */
export function GroupStatisticsPanel({ stats }: Props) {
  if (stats.length === 0) return null;

  const rows = distributeEvenly(stats);

  return (
    <div className="group-stats-panel">
      {rows.map((row, ri) => (
        <div
          key={ri}
          className={`group-stats-row group-stats-row--${Math.min(row.length, 4)}`}
        >
          {row.map((stat) => (
            <details key={stat.column} className="card group-stats-card">
              <summary className="group-stats-summary">
                <span className="group-stats-col-name">{stat.column}</span>
                <span className="group-stats-counts">
                  Unique: {stat.uniqueCount} | Attribute: {stat.attributeCount}
                </span>
              </summary>
              <div
                className="group-stats-scroll"
                style={{ maxHeight: (VISIBLE_DATA_ROWS + 1) * ROW_HEIGHT }}
              >
                <table className="group-stats-table">
                  <thead>
                    <tr>
                      <th>Value</th>
                      <th>Unique Count</th>
                      <th>Attribute Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stat.rows.map((row) => (
                      <tr key={String(row.value)} className={row.value === "Total" ? "group-stats-total" : ""}>
                        <td>{row.value === "Total" ? <strong>Total</strong> : String(row.value)}</td>
                        <td>{row.uniqueCount}</td>
                        <td>{row.attributeCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      ))}
    </div>
  );
}
