import { useState } from "react";
import type { DetailRow, NestedAggNode } from "../../api/domain";
import { buildNestedAggregationTree } from "./nestedAggregationTree";

interface Props {
  details: DetailRow[];
  aggregationColumns: string[];
  keyColumnNames?: string[];
}

function TreeNode({ node }: { node: NestedAggNode }) {
  const [expanded, setExpanded] = useState(node.kind === "group" && node.depth === 0);
  const [recordExpanded, setRecordExpanded] = useState(false);

  if (node.kind === "record") {
    return (
      <li className="nested-agg-item nested-agg-record">
        <button
          type="button"
          className="nested-agg-toggle"
          onClick={() => setRecordExpanded((v) => !v)}
          aria-expanded={recordExpanded}
        >
          <span className="nested-agg-toggle-icon" aria-hidden="true">
            {recordExpanded ? "▼" : "▶"}
          </span>
          <span className="nested-agg-label">
            {node.label} — {node.changeCount} attribute{node.changeCount !== 1 ? "s" : ""} changed
          </span>
        </button>
        {recordExpanded && (
          <div className="nested-agg-record-detail">
            <table className="nested-agg-table">
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
            </table>
          </div>
        )}
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
      >
        <span className="nested-agg-toggle-icon" aria-hidden="true">
          {expanded ? "▼" : "▶"}
        </span>
        <span className="nested-agg-label">
          {node.label}{" "}
          <span className="nested-agg-count">({node.children.length} sub-node{node.children.length !== 1 ? "s" : ""}, {node.aggregatedCount} change{node.aggregatedCount !== 1 ? "s" : ""})</span>
        </span>
      </button>
      {expanded && <ul className="nested-agg-children">{node.children.map((child, i) => <TreeNode key={i} node={child} />)}</ul>}
    </li>
  );
}

function displayValue(value: string | null): string {
  if (value === null) return "(null)";
  if (value === "") return "(empty)";
  return value;
}

export function NestedAggregationPanel({ details, aggregationColumns, keyColumnNames = [] }: Props) {
  const tree = buildNestedAggregationTree(details, aggregationColumns, keyColumnNames);

  if (tree.length === 0) return null;

  return (
    <div className="nested-agg-panel">
      <ul className="nested-agg-tree">
        {tree.map((node, i) => <TreeNode key={i} node={node} />)}
      </ul>
    </div>
  );
}
