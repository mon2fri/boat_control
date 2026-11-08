/**
 * Visual/editor support for the shared grouping-tree interaction.
 *
 * This module is owned by Worker D and deliberately contains only pure
 * presentation and repair helpers used by the filter and rule editors. The
 * canonical grouping types and transport helpers remain owned by Worker C.
 *
 * Keeping these helpers separate from `groupingTree.ts` avoids duplicating
 * the executable tree type while giving both editors one unambiguous,
 * parenthesised preview formatter and one structural validator.
 */
import type { GroupNode } from "../../api/domain";

const MAX_GROUP_DEPTH = 8;
const MAX_GROUP_NODES = 200;

/** Explanatory copy shared by the filter, condition and outcome group editors. */
export const PER_GROUPING_HELP_TEXT =
  "Create groups of 2 or more items. Groups can contain other groups. " +
  "All clauses must be in a group. The tree keeps every nested group visible; " +
  "edit a group to remove one of its immediate children.";

export interface GroupingStructure {
  leafIds: string[];
  duplicateIds: string[];
  maxDepth: number;
  nodeCount: number;
  structuralErrors: string[];
}

/** Walk a tree once to collect leaf references and structural problems. */
export function inspectGroupingTree(tree: GroupNode): GroupingStructure {
  const leafIds: string[] = [];
  const seen = new Set<string>();
  const duplicateIds = new Set<string>();
  const structuralErrors: string[] = [];
  let maxDepth = 0;
  let nodeCount = 0;

  function walk(node: GroupNode, depth: number): void {
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, depth);
    if (node.kind === "leaf") {
      if (!node.conditionId) {
        structuralErrors.push("Grouping contains a leaf without a reference.");
      } else if (seen.has(node.conditionId)) {
        duplicateIds.add(node.conditionId);
      } else {
        seen.add(node.conditionId);
        leafIds.push(node.conditionId);
      }
      return;
    }
    if (node.children.length < 2) {
      structuralErrors.push(
        `Grouping contains an empty ${node.kind.toUpperCase()} group; every group needs at least two members.`,
      );
    }
    for (const child of node.children) walk(child, depth + 1);
  }

  walk(tree, 0);
  if (maxDepth > MAX_GROUP_DEPTH) {
    structuralErrors.push(
      `Grouping is nested more than ${MAX_GROUP_DEPTH} levels deep; simplify the expression.`,
    );
  }
  if (nodeCount > MAX_GROUP_NODES) {
    structuralErrors.push(
      `Grouping contains more than ${MAX_GROUP_NODES} nodes; simplify the expression.`,
    );
  }
  return { leafIds, duplicateIds: [...duplicateIds], maxDepth, nodeCount, structuralErrors };
}

export interface GroupingValidation {
  valid: boolean;
  errors: string[];
  missingIds: string[];
  unknownIds: string[];
  duplicateIds: string[];
  structuralErrors: string[];
}

/**
 * Validate that a custom grouping tree references every configured clause
 * exactly once and contains no removed/unknown references.
 */
export function validateCustomGrouping(
  tree: GroupNode | null,
  expectedIds: string[],
  noun: string,
): GroupingValidation {
  const expected = new Set(expectedIds);
  if (!tree) {
    return {
      valid: false,
      errors: [`Add at least one group when using custom ${noun} grouping.`],
      missingIds: [...expectedIds],
      unknownIds: [],
      duplicateIds: [],
      structuralErrors: [],
    };
  }

  const structure = inspectGroupingTree(tree);
  const seen = new Set(structure.leafIds);
  const missingIds = expectedIds.filter((id) => !seen.has(id));
  const unknownIds = structure.leafIds.filter((id) => !expected.has(id));
  const errors = [...structure.structuralErrors];

  if (missingIds.length > 0) {
    errors.push(
      `${missingIds.length} ${noun} clause${missingIds.length === 1 ? " is" : "s are"} not included in the grouping.`,
    );
  }
  if (unknownIds.length > 0) {
    errors.push(
      `Grouping references ${unknownIds.length} removed or unknown ${noun} clause${unknownIds.length === 1 ? "" : "s"}. Remove the stale references or reset the grouping.`,
    );
  }
  if (structure.duplicateIds.length > 0) {
    errors.push(
      `Grouping repeats ${structure.duplicateIds.length} ${noun} clause${structure.duplicateIds.length === 1 ? "" : "s"}; each clause must appear exactly once.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    missingIds,
    unknownIds,
    duplicateIds: structure.duplicateIds,
    structuralErrors: structure.structuralErrors,
  };
}

/**
 * Render a tree with explicit parentheses whenever precedence would otherwise
 * be ambiguous. This is the same expression the user configured, not a
 * vaguely ordered list of clauses.
 */
export function formatGroupingExpression(
  tree: GroupNode,
  labelForLeaf: (id: string) => string,
): string {
  function render(node: GroupNode): string {
    if (node.kind === "leaf") return labelForLeaf(node.conditionId);
    const parts = node.children.map((child) => {
      const text = render(child);
      return child.kind !== "leaf" && child.kind !== node.kind ? `(${text})` : text;
    });
    return parts.join(` ${node.kind.toUpperCase()} `);
  }
  return render(tree);
}

/** Build a flat AND/OR tree from ordered clause ids. */
export function buildFlatGroupingTree(
  ids: string[],
  kind: "and" | "or",
): GroupNode | null {
  if (ids.length === 0) return null;
  if (ids.length === 1) return { kind: "leaf", conditionId: ids[0]! };
  return {
    kind,
    children: ids.map((id) => ({ kind: "leaf" as const, conditionId: id })),
  };
}

/**
 * Remove references to deleted clauses, collapse single-member groups, and
 * return `null` when nothing usable remains. The user still has to review the
 * repaired expression; the editor never silently executes the old tree.
 */
export function pruneGroupingTree(
  tree: GroupNode | null,
  allowedIds: Set<string>,
): GroupNode | null {
  if (!tree) return null;

  function prune(node: GroupNode): GroupNode | null {
    if (node.kind === "leaf") {
      return allowedIds.has(node.conditionId) ? node : null;
    }
    const children = node.children
      .map(prune)
      .filter((child): child is GroupNode => child !== null);
    if (children.length === 0) return null;
    if (children.length === 1) return children[0]!;
    return { kind: node.kind, children };
  }

  return prune(tree);
}
