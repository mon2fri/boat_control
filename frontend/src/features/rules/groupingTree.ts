/**
 * Helpers for the executable grouping tree.
 *
 * Splitting these helpers out of `GroupingTreeEditor.tsx` keeps the editor
 * module as a pure component so Vite's React fast-refresh works without
 * warnings (mixing non-component exports with a component export confuses
 * fast-refresh and breaks HMR for the editor).
 */
import type { Condition, GroupNode } from "../../api/domain";

/**
 * Default grouping when the user has not edited the tree yet: all conditions
 * joined with AND. Rendered as a single AND node so the editor starts in a
 * valid state.
 */
export function defaultGroupTree(conditions: Condition[]): GroupNode | null {
  if (conditions.length === 0) return null;
  if (conditions.length === 1) return { kind: "leaf", conditionId: conditions[0]!.id };
  return {
    kind: "and",
    children: conditions.map((c) => ({ kind: "leaf" as const, conditionId: c.id })),
  };
}

/** Pretty-print a tree into a precedence-respecting string for previews. */
export function formatGroupTree(node: GroupNode, conditionLabel: (id: string) => string): string {
  if (node.kind === "leaf") return conditionLabel(node.conditionId);
  return node.children.map((c) => formatGroupTree(c, conditionLabel)).join(` ${node.kind.toUpperCase()} `);
}

/**
 * Pretty-print a tree as a hierarchical breakdown, one line per branch node.
 *
 * Example output for `(cond1 OR cond2) AND cond4` nested inside an overall
 * `OR` with `cond3`:
 *
 * ```
 * overall: group 1 OR cond 3
 * group 1: cond 1 OR cond 2 AND cond 4
 * ```
 *
 * Group numbers are assigned bottom-up (deepest groups get the lowest
 * numbers). The root is always labelled "overall".
 */
export function formatGroupTreeHierarchy(
  node: GroupNode,
  conditionLabel: (id: string) => string,
): string {
  if (node.kind === "leaf") return conditionLabel(node.conditionId);

  const names = new Map<GroupNode, string>();
  let counter = 0;

  // Post-order: assign group numbers bottom-up, skip root.
  function assignNames(n: GroupNode, isRoot: boolean): void {
    if (n.kind === "leaf") return;
    for (const child of n.children) assignNames(child, false);
    if (!isRoot) names.set(n, `group ${++counter}`);
  }
  assignNames(node, true);

  function formatBranch(n: GroupNode): string {
    if (n.kind === "leaf") return conditionLabel(n.conditionId);
    const label = n === node ? "overall" : names.get(n)!;
    const parts = n.children.map((c) =>
      c.kind === "leaf" ? conditionLabel(c.conditionId) : names.get(c)!,
    );
    return `${label}: ${parts.join(` ${n.kind.toUpperCase()} `)}`;
  }

  // Pre-order: root first, then children.
  const lines: string[] = [];
  function walk(n: GroupNode): void {
    if (n.kind === "leaf") return;
    lines.push(formatBranch(n));
    for (const child of n.children) walk(child);
  }
  walk(node);

  return lines.join("\n");
}

/** Recursive search for a condition id within the tree. */
export function findConditionId(node: GroupNode, conditionId: string): boolean {
  if (node.kind === "leaf") return node.conditionId === conditionId;
  return node.children.some((c) => findConditionId(c, conditionId));
}

/** Collect every condition id referenced by the tree. */
export function collectConditionIds(node: GroupNode): Set<string> {
  const used = new Set<string>();
  const walk = (n: GroupNode) => {
    if (n.kind === "leaf") used.add(n.conditionId);
    else n.children.forEach(walk);
  };
  walk(node);
  return used;
}

/** Pick the first condition id in `available` that is not already in `node`. */
export function pickUnusedConditionId(available: Set<string>, node: GroupNode): string {
  const used = collectConditionIds(node);
  for (const id of available) if (!used.has(id)) return id;
  return "__empty__";
}