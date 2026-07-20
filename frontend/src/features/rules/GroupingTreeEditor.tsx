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
import { useId, useMemo, useState } from "react";
import type { GroupNode } from "../../api/domain";
import type { Condition } from "../../api/domain";
import {
  collectConditionIds,
  defaultGroupTree,
  findConditionId,
} from "./groupingTree";

interface Props {
  conditions: Condition[];
  value: GroupNode | null;
  onChange: (next: GroupNode | null) => void;
  /** When "per_grouping", groups are enforced to have exactly 2 members. */
  groupingMode?: "and_or" | "per_grouping";
}

export function GroupingTreeEditor({ conditions, value, onChange, groupingMode = "and_or" }: Props) {
  const helpId = useId();
  if (conditions.length === 0) {
    return <p className="field-hint">Add conditions to enable grouping.</p>;
  }

  if (groupingMode === "per_grouping") {
    return (
      <PerGroupingEditor
        conditions={conditions}
        value={value}
        onChange={onChange}
        helpId={helpId}
      />
    );
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
        groupingMode="and_or"
      />
      {ungrouped.length > 0 && (
        <p className="field-hint" role="status">
          {ungrouped.length} condition(s) not yet included in the grouping.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-grouping editor: flexible group creation with nested group support
// ---------------------------------------------------------------------------

/**
 * Each root-level group is an AND or OR node with 2+ children.
 * Children can be leaf conditions or other groups (nested).
 * All conditions must be grouped before saving.
 * When a group is selected as a member of a new group, it is removed from
 * root and placed inside the new group (nested).
 */
function PerGroupingEditor({
  conditions,
  value,
  onChange,
  helpId,
}: {
  conditions: Condition[];
  value: GroupNode | null;
  onChange: (next: GroupNode | null) => void;
  helpId: string;
}) {
  // More than one independent group needs a transport-only OR wrapper. Keep
  // that wrapper state locally so an explicit OR group made only of groups is
  // not mistaken for the wrapper and flattened out of the preview.
  const [forestMode, setForestMode] = useState(
    () => value?.kind === "or" && value.children.length > 1 && value.children.every((child) => child.kind !== "leaf"),
  );
  const rootGroups = useMemo(() => groupForest(value, forestMode), [value, forestMode]);

  /**
   * Stable, post-order numeric IDs for every group in the tree.
   *
   * The deepest group gets `1`, then its parent, and so on up to the root.
   * This matches the labels already produced by `formatGroupTreeHierarchy`
   * (which renders `overall: ...`, `group 2: ...`, `group 1: ...`) and gives
   * every group the same identifier whether the user is reading the legend,
   * the picker checklist, or the preview — so a group that was `Group 1`
   * when it was first created remains `Group 1` after it gets nested.
   *
   * Without this memo, the fieldset legend would reuse the rootGroups array
   * index and silently swap labels around when a group is added as a member
   * of a new group, which is the bug that broke the user's mental model.
   */
  const groupIds = useMemo(() => {
    const ids = new Map<GroupNode, number>();
    let counter = 0;
    function walk(node: GroupNode | null | undefined): void {
      if (!node || node.kind === "leaf") return;
      for (const child of node.children) walk(child);
      ids.set(node, ++counter);
    }
    for (const group of rootGroups) walk(group);
    return ids;
  }, [rootGroups]);

  function idOf(node: GroupNode): number {
    return groupIds.get(node) ?? 0;
  }

  function groupTitle(node: GroupNode): string {
    return `Group ${idOf(node)}`;
  }

  function groupFullLabel(node: GroupNode): string {
    if (node.kind === "leaf") return condLabel(node.conditionId);
    return `${groupTitle(node)} (${node.kind.toUpperCase()}, ${node.children.length} member${node.children.length !== 1 ? "s" : ""})`;
  }

  // Collect all condition ids used anywhere in the tree
  const usedConditionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const child of rootGroups) {
      for (const id of collectConditionIds(child)) {
        ids.add(id);
      }
    }
    return ids;
  }, [rootGroups]);

  const ungrouped = useMemo(
    () => conditions.filter((c) => !usedConditionIds.has(c.id)),
    [conditions, usedConditionIds],
  );

  // Available items for new group members: ungrouped conditions + root-level groups
  const availableItems: AvailableItem[] = useMemo(() => {
    const items: AvailableItem[] = [];
    for (const c of ungrouped) {
      items.push({ kind: "condition", id: c.id, label: condLabel(c.id) });
    }
    for (let i = 0; i < rootGroups.length; i++) {
      const group = rootGroups[i];
      if (group) {
        items.push({ kind: "group", index: i, label: groupFullLabel(group) });
      }
    }
    return items;
  }, [ungrouped, rootGroups, conditions, idOf]); // eslint-disable-line react-hooks/exhaustive-deps

  // New-group builder state
  const [newGroupKind, setNewGroupKind] = useState<"and" | "or">("and");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // A path addresses any group in the rendered tree. Unlike a root-array
  // index, it can identify Group 1 after it is nested inside Group 2/3.
  const [editingPath, setEditingPath] = useState<number[] | null>(null);

  const canCreateGroup = selectedMembers.length >= 2;

  /** Emit root value, unwrapping the OR wrapper when only 1 group remains. */
  function emitRoot(children: GroupNode[]): void {
    setForestMode(children.length > 1);
    if (children.length === 0) {
      onChange(null);
    } else if (children.length === 1) {
      onChange(children[0]!);
    } else {
      onChange({ kind: "or", children });
    }
  }

  function createGroup(): void {
    if (!canCreateGroup) return;
    const children: GroupNode[] = [];
    const removedIndices = new Set<number>();
    for (const key of selectedMembers) {
      if (key.startsWith("cond:")) {
        children.push({ kind: "leaf", conditionId: key.slice(5) });
      } else if (key.startsWith("group:")) {
        const idx = parseInt(key.slice(6), 10);
        const group = rootGroups[idx];
        if (group) {
          children.push(group);
          removedIndices.add(idx);
        }
      }
    }
    const newGroup: GroupNode = { kind: newGroupKind, children };
    const remaining = rootGroups.filter((_, i) => !removedIndices.has(i));
    emitRoot([...remaining, newGroup]);
    setSelectedMembers([]);
  }

  function removeGroup(index: number): void {
    const next = rootGroups.filter((_, i) => i !== index);
    setSelectedMembers([]);
    setEditingPath(null);
    emitRoot(next);
  }

  function updateGroupKind(path: number[], kind: "and" | "or"): void {
    emitRoot(updateGroupAtPath(rootGroups, path, (group) => ({ ...group, kind })));
  }

  function removeImmediateMember(path: number[], memberIndex: number): void {
    const next = updateGroupAtPath(rootGroups, path, (group) => {
      const children = group.children.filter((_, index) => index !== memberIndex);
      // A one-member branch is not a group. Removing it also releases its
      // remaining subtree back to the available-member pool.
      return children.length < 2 ? null : { ...group, children };
    });
    setEditingPath(null);
    setSelectedMembers([]);
    emitRoot(next);
  }

  function toggleMember(key: string): void {
    setSelectedMembers((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function condLabel(id: string): string {
    const c = conditions.find((cc) => cc.id === id);
    const values = c ? (c.values ?? (c.value ? [c.value] : [])) : [];
    return c ? `${c.column || "<column>"} ${c.operator} ${values.join(" OR ") || "<value>"}` : `<missing:${id}>`;
  }

  return (
    <div className="group-tree" aria-describedby={helpId}>
      <p id={helpId} className="field-hint">
        Create groups of 2 or more items. Groups can contain other groups.
        All conditions must be in a group. The tree keeps every nested group
        visible; edit a group to remove one of its immediate children.
      </p>

      {rootGroups.length > 0 && (
        <ol className="group-tree-children group-tree-children--root">
          {rootGroups.map((child, i) => (
            <GroupTreeItem
              key={idOf(child)}
              group={child}
              path={[i]}
              editingPath={editingPath}
              groupTitle={groupTitle}
              condLabel={condLabel}
              onToggleEdit={(path) =>
                setEditingPath(samePath(editingPath, path) ? null : path)
              }
              onKindChange={updateGroupKind}
              onRemoveMember={removeImmediateMember}
              onRemoveRoot={() => removeGroup(i)}
            />
          ))}
        </ol>
      )}

      {availableItems.length >= 2 && (
        <fieldset style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--space)", marginTop: "var(--space)" }}>
          <legend>Create new group</legend>
          <div className="field">
            <label htmlFor="new-group-kind">Group type</label>
            <select
              id="new-group-kind"
              value={newGroupKind}
              onChange={(e) => setNewGroupKind(e.target.value as "and" | "or")}
            >
              <option value="and">AND — all must match</option>
              <option value="or">OR — any may match</option>
            </select>
          </div>
          <div className="field">
            <span className="field-label" id="select-members-label">Select members (2 or more)</span>
            <div
              role="group"
              aria-labelledby="select-members-label"
              style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "220px", overflowY: "auto", padding: "4px", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}
            >
              {/*
                Split the checklist into two visually distinct sections so a
                user cannot accidentally nest an existing group while
                intending to combine conditions. Conditions live under one
                heading; existing groups live under another, with an explicit
                warning that ticking a group removes it from the root list.
              */}
              {ungrouped.length > 0 && (
                <div className="group-tree-picklist-section" data-testid="picklist-conditions">
                  <p className="group-tree-picklist-heading">Conditions</p>
                  {ungrouped.map((c) => {
                    const key = `cond:${c.id}`;
                    return (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "2px 4px" }}>
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(key)}
                          onChange={() => toggleMember(key)}
                          data-testid={`pick-${key}`}
                        />
                        <span style={{ fontSize: "0.9rem" }}>{condLabel(c.id)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {rootGroups.length > 0 && (
                <div className="group-tree-picklist-section" data-testid="picklist-groups" style={{ borderTop: "1px solid var(--border)", marginTop: "6px", paddingTop: "6px" }}>
                  <p className="group-tree-picklist-heading">Existing groups</p>
                  <p
                    className="field-hint"
                    data-testid="picklist-groups-hint"
                    style={{ margin: "2px 4px 6px" }}
                  >
                    Selecting a group nests it inside the new group — the group
                    is removed from the root list.
                  </p>
                  {rootGroups.map((group, i) => {
                    const key = `group:${i}`;
                    return (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "2px 4px" }}>
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(key)}
                          onChange={() => toggleMember(key)}
                          data-testid={`pick-${key}`}
                        />
                        <span style={{ fontSize: "0.9rem" }}>{groupFullLabel(group)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {ungrouped.length === 0 && rootGroups.length === 0 && (
                <span style={{ fontSize: "0.85rem", color: "var(--color-muted)", padding: "4px" }}>No members available.</span>
              )}
            </div>
            {selectedMembers.length > 0 && selectedMembers.length < 2 && (
              <p className="field-hint" role="status">
                Select at least {2 - selectedMembers.length} more member(s).
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn"
            disabled={!canCreateGroup}
            onClick={createGroup}
          >
            + Create group
          </button>
        </fieldset>
      )}

      {/*
        Surface the "not enough members" hint only when the Create-new-group
        fieldset itself cannot render (i.e., fewer than two items are
        available across conditions AND groups combined).
      */}
      {availableItems.length === 1 && (
        <p className="field-hint" role="status">
          1 item remaining — need at least 2 to form a group.
        </p>
      )}
    </div>
  );
}

interface AvailableItem {
  kind: "condition" | "group";
  id?: string;
  index?: number;
  label: string;
}

function GroupTreeItem({
  group,
  path,
  editingPath,
  groupTitle,
  condLabel,
  onToggleEdit,
  onKindChange,
  onRemoveMember,
  onRemoveRoot,
  parentEditing = false,
  onRemoveFromParent,
}: {
  group: GroupNode;
  path: number[];
  editingPath: number[] | null;
  groupTitle: (node: GroupNode) => string;
  condLabel: (id: string) => string;
  onToggleEdit: (path: number[]) => void;
  onKindChange: (path: number[], kind: "and" | "or") => void;
  onRemoveMember: (path: number[], memberIndex: number) => void;
  onRemoveRoot?: () => void;
  parentEditing?: boolean;
  onRemoveFromParent?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (group.kind === "leaf") return null;
  const editing = samePath(editingPath, path);

  return (
    <li className="group-tree-node group-tree-node--group" data-testid={`tree-${groupTitle(group)}`}>
      <div className="group-tree-member-row">
          <button
            type="button"
            className="group-tree-collapse group-tree-label group-tree-label--group"
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${groupTitle(group)}`}
            onClick={() => setCollapsed((current) => !current)}
          >
            <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
            {groupTitle(group)}
          </button>
          <span className="group-tree-type group-tree-type--group">Group</span>
          {editing ? (
            <select
              aria-label={`${groupTitle(group)} operator`}
              value={group.kind}
              onChange={(event) => onKindChange(path, event.target.value as "and" | "or")}
            >
              <option value="and">AND</option>
              <option value="or">OR</option>
            </select>
          ) : (
            <strong>{group.kind.toUpperCase()}</strong>
          )}
          <button
            type="button"
            className="btn group-tree-edit"
            aria-label={`${editing ? "Done editing" : "Edit"} ${groupTitle(group)}`}
            onClick={() => onToggleEdit(path)}
          >
            {editing ? "Done" : "Edit"}
          </button>
          {onRemoveRoot && (
            <button
              type="button"
              className="btn btn--danger group-tree-remove"
              onClick={onRemoveRoot}
              aria-label={`Remove ${groupTitle(group)}`}
            >
              Remove group
            </button>
          )}
          {parentEditing && onRemoveFromParent && (
            <button
              type="button"
              className="btn btn--danger group-tree-member-remove"
              onClick={onRemoveFromParent}
              aria-label={`Remove ${groupTitle(group)} from its parent group`}
            >
              ×
            </button>
          )}
      </div>

        {!collapsed && <ol className="group-tree-children">
          {group.children.map((child, index) => (
            child.kind === "leaf" ? (
              <li key={`leaf-${child.conditionId}`} className="group-tree-node group-tree-node--condition">
                <div className="group-tree-member-row">
                  <span className="group-tree-type group-tree-type--condition">Condition</span>
                  <span className="group-tree-label group-tree-label--condition">{condLabel(child.conditionId)}</span>
                  {editing && (
                  <button
                    type="button"
                    className="btn btn--danger group-tree-member-remove"
                    onClick={() => onRemoveMember(path, index)}
                    aria-label={`Remove ${child.kind === "leaf" ? condLabel(child.conditionId) : groupTitle(child)} from ${groupTitle(group)}`}
                  >
                    ×
                  </button>
                  )}
                </div>
              </li>
            ) : (
              <GroupTreeItem
                key={`group-${idOfForKey(child, groupTitle)}`}
                group={child}
                path={[...path, index]}
                editingPath={editingPath}
                groupTitle={groupTitle}
                condLabel={condLabel}
                onToggleEdit={onToggleEdit}
                onKindChange={onKindChange}
                onRemoveMember={onRemoveMember}
                parentEditing={editing}
                onRemoveFromParent={() => onRemoveMember(path, index)}
              />
            )
          ))}
        </ol>}
    </li>
  );
}

function groupForest(value: GroupNode | null, forestMode: boolean): GroupNode[] {
  if (!value) return [];
  if (forestMode && value.kind === "or") {
    return value.children;
  }
  return [value];
}

function samePath(left: number[] | null, right: number[]): boolean {
  return left !== null && left.length === right.length && left.every((part, index) => part === right[index]);
}

function updateGroupAtPath(
  roots: GroupNode[],
  path: number[],
  update: (group: Exclude<GroupNode, { kind: "leaf" }>) => GroupNode | null,
): GroupNode[] {
  function visit(node: GroupNode, depth: number): GroupNode | null {
    if (node.kind === "leaf") return node;
    if (depth === path.length) return update(node);
    const childIndex = path[depth]!;
    const children = node.children.flatMap((child, index) => {
      if (index !== childIndex) return [child];
      const next = visit(child, depth + 1);
      return next ? [next] : [];
    });
    return children.length < 2 ? null : { ...node, children };
  }

  const rootIndex = path[0];
  if (rootIndex === undefined) return roots;
  return roots.flatMap((root, index) => {
    if (index !== rootIndex) return [root];
    const next = path.length === 1
      ? (root.kind === "leaf" ? root : update(root))
      : visit(root, 1);
    return next ? [next] : [];
  });
}

function idOfForKey(node: GroupNode, groupTitle: (node: GroupNode) => string): string {
  return node.kind === "leaf" ? node.conditionId : groupTitle(node);
}

// ---------------------------------------------------------------------------
// And/or tree editor (original recursive editor)
// ---------------------------------------------------------------------------

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
          Condition: <strong>{cond ? `${cond.column || "<column>"} ${cond.operator} ${(cond.values ?? (cond.value ? [cond.value] : [])).join(" OR ") || "<value>"}` : `<missing:${node.conditionId}>`}</strong>
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

function pickUnusedConditionId(available: Set<string>, node: GroupNode): string {
  const used = collectConditionIds(node);
  for (const id of available) if (!used.has(id)) return id;
  return "__empty__";
}
