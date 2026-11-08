/**
 * Pure, transport-agnostic helpers for the executable grouping tree.
 *
 * The same tree shape is used for overall row filters, rule conditions and
 * grouped rule outcomes:
 *
 *   { kind: "leaf", conditionId: "<runtime id>" }
 *   { kind: "and" | "or", children: [...] }
 *
 * Runtime IDs are what the editor holds in memory. Persisted documents always
 * use indexed references (`c0`, `c1`, ...) within the owning ordered clause
 * list; callers must remap at the save/load boundary. These helpers never
 * silently repair an expression: an invalid tree is returned with errors so
 * the caller can block execution or ask the user to repair it.
 */
import type { GroupNode, GroupRelation } from "../api/domain";

/** Guard rail against malicious/accidentally enormous saved expressions. */
export const MAX_GROUPING_DEPTH = 32;
export const MAX_GROUPING_LEAVES = 512;

export interface GroupingClauseLike {
  id: string;
}

export interface GroupingValidation {
  valid: boolean;
  errors: string[];
  referencedIds: string[];
  unknownIds: string[];
  duplicateIds: string[];
  missingIds: string[];
  depth: number;
  leafCount: number;
}

export interface GroupedExpressionOptions {
  /** Human label used in error messages, e.g. "filter grouping". */
  label?: string;
  /**
   * When true, multiple clauses without a relation/tree are invalid. Newly
   * authored rule outcomes set this; legacy filter configurations leave it
   * false so absent grouping continues to mean AND.
   */
  requireExplicitForMultiple?: boolean;
  /** Treat an omitted relation/tree over multiple clauses as legacy AND. */
  allowLegacyAnd?: boolean;
}

export interface ResolvedGroupedExpression {
  valid: boolean;
  errors: string[];
  tree: GroupNode | null;
  relation: GroupRelation | null;
  /** True when the flat AND relation was inferred from a legacy payload. */
  legacy: boolean;
  validation: GroupingValidation | null;
}

/** A validation failure callers can surface instead of running broadened logic. */
export class GroupingValidationError extends Error {
  errors: string[];

  constructor(errors: string[], message?: string) {
    const first = message ?? errors[0] ?? "Invalid grouping expression";
    super(first);
    this.name = "GroupingValidationError";
    this.errors = errors.length > 0 ? [...errors] : [first];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normaliseLabel(label: string | undefined): string {
  return label && label.trim().length > 0 ? label.trim() : "grouping";
}

/**
 * Validate a tree's shape and its references against the owning clause list.
 * Every configured clause must occur exactly once. Empty branches, malformed
 * kinds, unsafe depth/size, unknown references and duplicates are rejected.
 */
export function validateGroupingTree(
  tree: unknown,
  availableIds: Iterable<string>,
  options: { label?: string; requireAll?: boolean } = {},
): GroupingValidation {
  const label = normaliseLabel(options.label);
  const available = new Set(availableIds);
  const errors: string[] = [];
  const referenced: string[] = [];
  const unknown: string[] = [];
  const duplicates: string[] = [];
  let depth = 0;
  let leafCount = 0;
  let tooDeep = false;
  let tooLarge = false;

  const walk = (node: unknown, currentDepth: number): void => {
    if (currentDepth > MAX_GROUPING_DEPTH) {
      if (!tooDeep) {
        errors.push(`${label} is too deeply nested (maximum depth ${MAX_GROUPING_DEPTH}).`);
        tooDeep = true;
      }
      return;
    }
    depth = Math.max(depth, currentDepth);

    if (!isRecord(node)) {
      errors.push(`${label} contains a malformed node.`);
      return;
    }
    if (node.kind === "leaf") {
      if (typeof node.conditionId !== "string" || node.conditionId.length === 0) {
        errors.push(`${label} contains a leaf without a clause reference.`);
        return;
      }
      leafCount += 1;
      if (leafCount > MAX_GROUPING_LEAVES) {
        if (!tooLarge) {
          errors.push(`${label} contains too many clause references (maximum ${MAX_GROUPING_LEAVES}).`);
          tooLarge = true;
        }
        return;
      }
      referenced.push(node.conditionId);
      return;
    }
    if (node.kind !== "and" && node.kind !== "or") {
      errors.push(`${label} contains an unsupported node kind.`);
      return;
    }
    if (!Array.isArray(node.children) || node.children.length < 2) {
      errors.push(`${label} contains a group with fewer than two children.`);
      return;
    }
    node.children.forEach((child) => walk(child, currentDepth + 1));
  };

  if (tree === null || tree === undefined) {
    if (options.requireAll !== false && available.size > 1) {
      // Callers decide whether omitted grouping is legacy AND or invalid.
      // Report the omission here so they can choose.
      for (const id of available) {
        // No tree means none of the clauses are explicitly referenced.
        // Keep the array stable for callers/tests.
        referenced.push(id);
      }
      referenced.length = 0;
    }
    return {
      valid: true,
      errors: [],
      referencedIds: [],
      unknownIds: [],
      duplicateIds: [],
      missingIds: [],
      depth: 0,
      leafCount: 0,
    };
  }

  walk(tree, 1);

  const seen = new Set<string>();
  for (const id of referenced) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
    if (!available.has(id)) unknown.push(id);
  }
  if (duplicates.length > 0) {
    errors.push(
      `${label} references the same clause more than once: ${[...new Set(duplicates)].join(", ")}.`,
    );
  }
  if (unknown.length > 0) {
    errors.push(
      `${label} references unknown or removed clauses: ${[...new Set(unknown)].join(", ")}.`,
    );
  }
  const missing =
    options.requireAll === false ? [] : [...available].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    errors.push(
      `${label} omits configured clauses: ${missing.join(", ")}.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    referencedIds: [...new Set(referenced)],
    unknownIds: [...new Set(unknown)],
    duplicateIds: [...new Set(duplicates)],
    missingIds: missing,
    depth,
    leafCount,
  };
}

/** Build a flat tree from runtime clause IDs. */
export function buildFlatGroupTree(
  clauses: GroupingClauseLike[],
  relation: GroupRelation,
): GroupNode | null {
  if (clauses.length === 0) return null;
  if (clauses.length === 1) return { kind: "leaf", conditionId: clauses[0]!.id };
  return {
    kind: relation,
    children: clauses.map((clause) => ({ kind: "leaf" as const, conditionId: clause.id })),
  };
}

/** Map every leaf through `idMap`; missing IDs are left untouched so validation catches them. */
export function remapGroupingTree(
  tree: GroupNode,
  idMap: Map<string, string>,
): GroupNode {
  if (tree.kind === "leaf") {
    return { kind: "leaf", conditionId: idMap.get(tree.conditionId) ?? tree.conditionId };
  }
  return {
    kind: tree.kind,
    children: tree.children.map((child) => remapGroupingTree(child, idMap)),
  };
}

/** Parse an indexed persisted reference such as `c0`, `c12`. */
export function persistedClauseIndex(reference: string): number | null {
  const match = /^c(\d+)$/.exec(reference);
  return match ? Number(match[1]) : null;
}

/**
 * Convert a runtime tree into the persisted indexed form. The clause list order
 * defines the index, so reordering clauses must be accompanied by a rebuild of
 * this map by the caller.
 */
export function toPersistedGroupingTree(
  tree: GroupNode,
  clauses: GroupingClauseLike[],
): GroupNode {
  const runtimeToIndex = new Map(
    clauses.map((clause, index) => [clause.id, `c${index}`]),
  );
  return remapGroupingTree(tree, runtimeToIndex);
}

/**
 * Convert a persisted indexed tree into runtime IDs. Missing/out-of-range
 * references are preserved as `__missing_cN__` markers rather than dropped so
 * validation fails and the user sees a repair state.
 */
export function fromPersistedGroupingTree(
  tree: GroupNode,
  clauses: GroupingClauseLike[],
): GroupNode {
  const indexToRuntime = new Map(
    clauses.map((clause, index) => [`c${index}`, clause.id]),
  );
  const map = new Map<string, string>();
  const seen = new Set<string>();
  const collect = (node: GroupNode): void => {
    if (node.kind === "leaf") {
      if (!seen.has(node.conditionId)) {
        seen.add(node.conditionId);
        const runtime = indexToRuntime.get(node.conditionId);
        if (runtime !== undefined) map.set(node.conditionId, runtime);
        else map.set(node.conditionId, `__missing_${node.conditionId}__`);
      }
      return;
    }
    node.children.forEach(collect);
  };
  collect(tree);
  return remapGroupingTree(tree, map);
}

/**
 * Resolve a grouping configuration against its actual clause list.
 *
 * - A present tree is authoritative. An invalid tree is never replaced by the
 *   flat relation, so a broken saved expression cannot silently broaden.
 * - With no tree, an explicit relation is used.
 * - With neither, multiple clauses use legacy AND only when allowed.
 */
export function resolveGroupedExpression(
  clauses: GroupingClauseLike[],
  relation: GroupRelation | null | undefined,
  tree: GroupNode | null | undefined,
  options: GroupedExpressionOptions = {},
): ResolvedGroupedExpression {
  const label = normaliseLabel(options.label ?? "grouping");
  const explicitRelation = relation === "and" || relation === "or" ? relation : null;
  const clauseIds = clauses.map((clause) => clause.id);

  if (tree) {
    const validation = validateGroupingTree(tree, clauseIds, { label });
    if (!validation.valid) {
      return {
        valid: false,
        errors: validation.errors,
        tree,
        relation: explicitRelation,
        legacy: false,
        validation,
      };
    }
    return {
      valid: true,
      errors: [],
      tree,
      relation: explicitRelation,
      legacy: false,
      validation,
    };
  }

  if (clauseIds.length === 0) {
    // No clauses impose no row restriction; a stale relation must not block
    // an otherwise unrestricted run.
    return {
      valid: true,
      errors: [],
      tree: null,
      relation: null,
      legacy: false,
      validation: null,
    };
  }

  if (clauseIds.length === 1) {
    if (options.requireExplicitForMultiple) {
      return {
        valid: true,
        errors: [],
        tree: null,
        relation: explicitRelation ?? "and",
        legacy: false,
        validation: null,
      };
    }
    return {
      valid: true,
      errors: [],
      tree: null,
      relation: explicitRelation ?? "and",
      legacy: false,
      validation: null,
    };
  }

  if (explicitRelation) {
    return {
      valid: true,
      errors: [],
      tree: null,
      relation: explicitRelation,
      legacy: false,
      validation: null,
    };
  }

  if (options.requireExplicitForMultiple || options.allowLegacyAnd === false) {
    return {
      valid: false,
      errors: [
        `${label} must choose AND, OR, or a custom grouping expression when multiple clauses are configured.`,
      ],
      tree: null,
      relation: null,
      legacy: false,
      validation: null,
    };
  }

  return {
    valid: true,
    errors: [],
    tree: null,
    relation: "and",
    legacy: true,
    validation: null,
  };
}

/** Collect every referenced clause ID (duplicates are ignored by the Set). */
export function collectGroupingIds(tree: GroupNode | null | undefined): Set<string> {
  const used = new Set<string>();
  const walk = (node: GroupNode): void => {
    if (node.kind === "leaf") used.add(node.conditionId);
    else node.children.forEach(walk);
  };
  if (tree) walk(tree);
  return used;
}
