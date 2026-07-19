/**
 * Structured grouping-tree editor for the rule editor.
 *
 * The editor only produces an executable tree — never a free-text expression
 * that would have to be tokenised. Each node is either a leaf referencing a
 * condition by id, or an AND/OR group with structural children. Precedence
 * is implicit in the tree shape; `(A and B) or C` is just one tree, not a
 * string to be parsed.
 *
 * Helper functions live in `./groupingTree` so this module only exports a
 * component, which keeps React fast-refresh happy (no warnings).
 */
import { useId } from "react";
import type { GroupNode } from "../../api/domain";
import type { Condition } from "../../api/domain";
import {
  defaultGroupTree,
  findConditionId,
  pickUnusedConditionId,
} from "./groupingTree";

interface Props {
  conditions: Condition[];
  value: GroupNode | null;
  onChange: (next: GroupNode | null) => void;
  /** When "per_grouping", group kind is fixed at creation (no per-group dropdown). */
  groupingMode?: "and_or" | "per_grouping";
}

export function GroupingTreeEditor({ conditions, value, onChange, groupingMode = "and_or" }: Props) {
  const helpId = useId();
  if (conditions.length === 0) {
    return <p className="field-hint">Add conditions to enable grouping.</p>;
  }
  const root: GroupNode = value ?? defaultGroupTree(conditions)!;
  const ungrouped = conditions
    .filter((c) => !findConditionId(root, c.id))
    .map((c) => c.id);

  return (
    <div className="group-tree" aria-describedby={helpId}>
      <p id={helpId} className="field-hint">
        Build the grouping structurally — precedence is set by the tree shape, not
        by parentheses in a string.
      </p>
      <TreeNodeEditor
        node={root}
        conditions={conditions}
        depth={0}
        onChange={(next) => onChange(next)}
        onRemove={null}
        availableConditionIds={new Set(conditions.map((c) => c.id))}
        groupingMode={groupingMode}
      />
      {ungrouped.length > 0 && (
        <p className="field-hint" role="status">
          {ungrouped.length} condition(s) not yet included in the grouping.
        </p>
      )}
    </div>
  );
}

interface NodeEditorProps {
  node: GroupNode;
  conditions: Condition[];
  depth: number;
  onChange: (next: GroupNode) => void;
  onRemove: (() => void) | null;
  availableConditionIds: Set<string>;
  groupingMode: "and_or" | "per_grouping";
}

function TreeNodeEditor({ node, conditions, depth, onChange, onRemove, availableConditionIds, groupingMode }: NodeEditorProps) {
  const label = useId();
  if (node.kind === "leaf") {
    const cond = conditions.find((c) => c.id === node.conditionId);
    return (
      <div className="group-tree-leaf" role="treeitem" aria-level={depth + 1}>
        <span>
          Condition: <strong>{cond ? `${cond.column || "<column>"} ${cond.operator} ${cond.value || "<value>"}` : `<missing:${node.conditionId}>`}</strong>
        </span>
        {onRemove && (
          <button type="button" className="btn btn--danger" onClick={onRemove} aria-label="Remove this condition slot">
            Remove
          </button>
        )}
      </div>
    );
  }
  const setKind = (kind: "and" | "or") => onChange({ ...node, kind });
  const updateChild = (i: number, next: GroupNode) =>
    onChange({ ...node, children: node.children.map((c, idx) => (idx === i ? next : c)) });
  const removeChild = (i: number) => {
    const next = node.children.filter((_, idx) => idx !== i);
    if (next.length === 1) {
      // Collapse a degenerate single-child group into its remaining child.
      onChange(next[0]!);
    } else if (next.length === 0) {
      onChange({ kind: "leaf", conditionId: "__empty__" });
    } else {
      onChange({ ...node, children: next });
    }
  };
  const addLeaf = () =>
    onChange({
      ...node,
      children: [
        ...node.children,
        { kind: "leaf", conditionId: pickUnusedConditionId(availableConditionIds, node) },
      ],
    });
  const addGroup = (kind: "and" | "or") =>
    onChange({
      ...node,
      children: [
        ...node.children,
        { kind, children: [{ kind: "leaf", conditionId: "__empty__" }, { kind: "leaf", conditionId: "__empty__" }] },
      ],
    });

  return (
    <fieldset
      className="group-tree-group"
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded="true"
      style={{ marginLeft: depth * 16 }}
    >
      <legend>
        {groupingMode === "per_grouping" ? (
          <span>
            Combined with <strong>{node.kind === "and" ? "AND" : "OR"}</strong>
          </span>
        ) : (
          <>
            <label htmlFor={label}>Combine with</label>{" "}
            <select id={label} value={node.kind} onChange={(e) => setKind(e.target.value as "and" | "or")}>
              <option value="and">AND — all must match</option>
              <option value="or">OR — any may match</option>
            </select>
          </>
        )}
        {onRemove && (
          <button type="button" className="btn btn--danger" onClick={onRemove} aria-label="Remove this group">
            Remove group
          </button>
        )}
      </legend>
      <ol className="group-tree-children">
        {node.children.map((child, i) => (
          <li key={i}>
            <TreeNodeEditor
              node={child}
              conditions={conditions}
              depth={depth + 1}
              onChange={(next) => updateChild(i, next)}
              onRemove={() => removeChild(i)}
              availableConditionIds={availableConditionIds}
              groupingMode={groupingMode}
            />
          </li>
        ))}
      </ol>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={addLeaf}>
          + Add condition
        </button>
        <button type="button" className="btn" onClick={() => addGroup("and")}>
          + Add AND group
        </button>
        <button type="button" className="btn" onClick={() => addGroup("or")}>
          + Add OR group
        </button>
      </div>
    </fieldset>
  );
}