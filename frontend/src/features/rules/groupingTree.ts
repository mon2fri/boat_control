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