import { useState, type ReactNode } from "react";
import type { DetailRow, NestedAggNode } from "../../api/domain";
import { buildNestedAggregationTree } from "./nestedAggregationTree";

interface Props {
  details: DetailRow[];
  aggregationColumns: string[];
  keyColumnNames?: string[];
  aggregationColumnLabels?: Record<string, string>;
  detailKinds?: DetailRow["kind"][];
  recordSummary?: (count: number) => string;
  renderRecordDetail?: (node: Extract<NestedAggNode, { kind: "record" }>) => ReactNode;
}

/**
 * Single node in the nested aggregation tree.
 *
 * Default state is fully collapsed — both groups and records start closed.
 *
 * The full subtree is always rendered into the DOM so that the exported HTML
 * has a complete structure for the inline script to toggle. Visibility is
 * controlled by the `hidden` HTML attribute, which gives the browser's
 * native `display: none` for free and matches what the export JS toggles.
 */
function TreeNode({
  node,
  columnLabels,
  recordSummary,
  renderRecordDetail,
}: {
  node: NestedAggNode;
  columnLabels: Record<string, string>;
  recordSummary: (count: number) => string;
  renderRecordDetail?: (node: Extract<NestedAggNode, { kind: "record" }>) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [recordExpanded, setRecordExpanded] = useState(false);

  if (node.kind === "record") {
    return (
      <li className="nested-agg-item nested-agg-record">
        <button
          type="button"
          className="nested-agg-toggle"
          onClick={() => setRecordExpanded((v) => !v)}
          aria-expanded={recordExpanded}
          data-agg-toggle="record"
        >
          <span className="nested-agg-toggle-icon" aria-hidden="true">
            {recordExpanded ? "▼" : "▶"}
          </span>
          <span className="nested-agg-label">
            {node.label} — {recordSummary(node.changeCount)}
          </span>
        </button>
        <div className="nested-agg-record-detail" data-agg-detail="record" hidden={!recordExpanded}>
          {renderRecordDetail ? renderRecordDetail(node) : <table className="nested-agg-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Old</th>
                <th>New</th>
              </tr>
            </thead>
            <tbody>
              {node.attributes.map((attr, i) => (
                <tr key={i}>
                  <td>{attr.column}</td>
                  <td>{displayValue(attr.old)}</td>
                  <td>{displayValue(attr.new)}</td>
                </tr>
              ))}
            </tbody>
          </table>}
        </div>
      </li>
    );
  }

  return (
    <li className={`nested-agg-item nested-agg-group depth-${node.depth}`}>
      <button
        type="button"
        className="nested-agg-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-agg-toggle="group"
      >
        <span className="nested-agg-toggle-icon" aria-hidden="true">
          {expanded ? "▼" : "▶"}
        </span>
        <span className="nested-agg-label">
          {columnLabels[node.column]?.trim()
            ? `${columnLabels[node.column]!.trim()}: ${node.label}`
            : node.label}{" "}
          <span className="nested-agg-count">({node.children.length} sub-node{node.children.length !== 1 ? "s" : ""}, {node.aggregatedCount} change{node.aggregatedCount !== 1 ? "s" : ""})</span>
        </span>
      </button>
      <ul className="nested-agg-children" data-agg-detail="group" hidden={!expanded}>
        {node.children.map((child, i) => (
          <TreeNode
            key={i}
            node={child}
            columnLabels={columnLabels}
            recordSummary={recordSummary}
            {...(renderRecordDetail ? { renderRecordDetail } : {})}
          />
        ))}
      </ul>
    </li>
  );
}

function displayValue(value: string | null): string {
  if (value === null) return "(null)";
  if (value === "") return "(empty)";
  return value;
}

export function NestedAggregationPanel({
  details,
  aggregationColumns,
  keyColumnNames = [],
  aggregationColumnLabels = {},
  detailKinds,
  recordSummary = (count) => `${count} attribute${count !== 1 ? "s" : ""} changed`,
  renderRecordDetail,
}: Props) {
  const tree = buildNestedAggregationTree(details, aggregationColumns, keyColumnNames, detailKinds);

  if (tree.length === 0) return null;

  return (
    <div className="nested-agg-panel">
      <ul className="nested-agg-tree">
        {tree.map((node, i) => (
          <TreeNode
            key={i}
            node={node}
            columnLabels={aggregationColumnLabels}
            recordSummary={recordSummary}
            {...(renderRecordDetail ? { renderRecordDetail } : {})}
          />
        ))}
      </ul>
    </div>
  );
}
