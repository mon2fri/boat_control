import type { FilterRow, GroupNode, GroupRelation } from "../../api/domain";
import { buildFlatGroupTree, resolveGroupedExpression } from "../../lib/grouping";
import { formatFilterRow } from "../filters/formatFilterRow";
import { formatGroupTreeHierarchy } from "../rules/groupingTree";

export interface AppliedFilterSummaryInput {
  filtersApplied?: FilterRow[] | undefined;
  filtersRelation?: GroupRelation | null | undefined;
  filtersGroupTree?: GroupNode | null | undefined;
  /** Restore errors retained by the API mapper for a broken saved expression. */
  filtersGroupingErrors?: string[] | undefined;
}

export interface AppliedFilterSummary {
  /** Full parenthesized predicate; never synthesized for invalid grouping. */
  expression: string | null;
  /** Complete root/child expression lines; empty when no valid grouping exists. */
  hierarchy: string[];
  /** Every applied filter in order, never dropped when grouping is invalid. */
  clauses: string[];
  /** True when the saved grouping is incomplete/invalid and must not be flattened. */
  invalid: boolean;
  errors: string[];
}

/** Stable FILTER numbering shared by the hierarchy and the detail lines. */
export function filterClauseLabel(row: FilterRow, index: number): string {
  return `FILTER ${index + 1}: ${formatFilterRow(row)}`;
}

function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages.filter((message) => message.trim().length > 0))];
}

/**
 * Build the Overall Results applied-filter summary from the persisted run
 * fields. The current editor state is intentionally not accepted.
 *
 * A valid saved tree is authoritative. Without a tree, an explicit flat
 * relation is used; a legacy multi-filter run without a relation remains AND.
 * A malformed tree or a missing reference renders as an error and is never
 * replaced by a broader flat interpretation.
 */
export function summarizeAppliedFilters(
  input: AppliedFilterSummaryInput,
): AppliedFilterSummary {
  const rows = input.filtersApplied ?? [];
  const clauses = rows.map((row, index) => filterClauseLabel(row, index));
  const suppliedErrors = input.filtersGroupingErrors ?? [];

  if (rows.length === 0) {
    return {
      expression: null,
      hierarchy: [],
      clauses,
      invalid: suppliedErrors.length > 0,
      errors: uniqueMessages(suppliedErrors),
    };
  }

  const shortLabels = new Map(rows.map((row, index) => [row.id, `FILTER ${index + 1}`]));
  const labelFor = (id: string) => shortLabels.get(id) ?? `<missing FILTER ${id}>`;

  const resolved = resolveGroupedExpression(
    rows,
    input.filtersRelation ?? null,
    input.filtersGroupTree ?? null,
    { label: "applied filter grouping", allowLegacyAnd: true },
  );

  const errors = uniqueMessages([...suppliedErrors, ...resolved.errors]);
  if (errors.length > 0 || !resolved.valid) {
    return { expression: null, hierarchy: [], clauses, invalid: true, errors };
  }

  const tree =
    resolved.tree ?? buildFlatGroupTree(rows, resolved.relation ?? "and");
  if (!tree) {
    return { expression: null, hierarchy: [], clauses, invalid: false, errors: [] };
  }

  const fullLabels = new Map(rows.map((row, index) => [row.id, `Filter ${index + 1}: ${formatFilterRow(row)}`]));
  function render(node: GroupNode): string {
    if (node.kind === "leaf") return fullLabels.get(node.conditionId) ?? `<missing Filter ${node.conditionId}>`;
    return `(${node.children.map(render).join(` ${node.kind.toUpperCase()} `)})`;
  }
  const expression = render(tree);

  if (tree.kind === "leaf") {
    return {
      expression,
      hierarchy: [`overall: ${labelFor(tree.conditionId)}`],
      clauses,
      invalid: false,
      errors: [],
    };
  }

  return {
    expression,
    hierarchy: formatGroupTreeHierarchy(tree, labelFor, {
      rootLabel: "overall",
      groupLabel: (number) => `group ${number}`,
    }).split("\n"),
    clauses,
    invalid: false,
    errors: [],
  };
}
