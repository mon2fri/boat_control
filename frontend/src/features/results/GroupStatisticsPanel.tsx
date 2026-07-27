import { useState } from "react";
import type { GroupStat } from "../../api/domain";
import { distributeEvenly } from "./groupLayout";

interface Props {
  stats: GroupStat[];
}

const VISIBLE_DATA_ROWS = 5;
const ROW_HEIGHT = 32;
const MAX_PER_ROW = 5;

/**
 * Single grouping column's exception breakdown. Renders the same collapsible
 * pattern as the nested aggregation tree: a serif heading, a small chevron,
 * the grouping column name plus an "Exception records: N" count, and on
 * expand a scrollable table of per-value counts. Default state is collapsed
 * so the section stays compact until the user opens it.
 *
 * The table is always rendered into the DOM so the exported HTML has the
 * structure for the inline script to toggle; visibility is controlled by the
 * `hidden` HTML attribute.
 */
function GroupStatCard({ stat }: { stat: GroupStat }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="group-stat-item">
      <button
        type="button"
        className="nested-agg-toggle group-stat-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-agg-toggle="group"
      >
        <span className="nested-agg-toggle-icon" aria-hidden="true">
          {expanded ? "▼" : "▶"}
        </span>
        <span className="nested-agg-label">
          {stat.column}
          <span className="nested-agg-count">
            {" "}
            (Exception records: {stat.uniqueCount})
          </span>
        </span>
      </button>
      <div className="group-stat-detail" data-agg-detail="group" hidden={!expanded}>
        <div
          className="group-stat-scroll"
          style={{ maxHeight: (VISIBLE_DATA_ROWS + 1) * ROW_HEIGHT }}
        >
          <table className="group-stat-table">
            <thead>
              <tr>
                <th>Value</th>
                <th>Exception records</th>
              </tr>
            </thead>
            <tbody>
              {stat.rows.map((row) => (
                <tr
                  key={String(row.value)}
                  className={row.value === "Total" ? "group-stat-total" : ""}
                >
                  <td>
                    {row.value === "Total" ? <strong>Total</strong> : String(row.value)}
                  </td>
                  <td>{row.uniqueCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </li>
  );
}

/**
 * Renders group-statistic breakdowns for one section (overall, attribute
 * changes, or a single rule). Each grouping column is a borderless collapsible
 * row styled to match the nested aggregation tree.
 *
 * Layout: cards are arranged in a CSS grid with up to {@link MAX_PER_ROW}
 * cards per row. When the total count exceeds that, items are distributed as
 * evenly as possible — for example, 7 stats become a row of 4 plus a row of 3
 * (never 5 + 2), so every row stays close to the same width.
 *
 * When expanded, each card's table shows at most 5 data rows and scrolls if
 * there are more.
 */
export function GroupStatisticsPanel({ stats }: Props) {
  if (stats.length === 0) return null;

  const rows = distributeEvenly(stats, MAX_PER_ROW);

  return (
    <div className="group-stats-panel">
      {rows.map((row, ri) => (
        <ul
          key={ri}
          className={`group-stats-row group-stats-row--${Math.min(row.length, MAX_PER_ROW)}`}
        >
          {row.map((stat) => (
            <GroupStatCard key={stat.column} stat={stat} />
          ))}
        </ul>
      ))}
    </div>
  );
}