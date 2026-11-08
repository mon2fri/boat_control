/**
 * Worker D adapter between the visual Row Filters editor and the shared
 * grouping-tree interaction.
 *
 * Worker C owns the persisted `filter_relation` / `filter_grouping_tree`
 * fields and their runtime-id mapping. The editor consumes the same logical
 * shape here so it can be wired to those fields without changing the tree
 * editor itself.
 */
import type { Condition, FilterRow, GroupNode } from "../../api/domain";
import { formatFilterRow } from "./formatFilterRow";
import {
  buildFlatGroupingTree,
  formatGroupingExpression,
  pruneGroupingTree,
  validateCustomGrouping,
  type GroupingValidation,
} from "../rules/groupingEditorSupport";

export type FilterGroupingMode = "and" | "or" | "custom";

export interface FilterGrouping {
  mode: FilterGroupingMode | null;
  /** Retained across flat/custom mode switches so switching back does not lose work. */
  tree: GroupNode | null;
}

export const EMPTY_FILTER_GROUPING: FilterGrouping = { mode: null, tree: null };

/** Legacy configurations with multiple filters retain their historical AND. */
export function defaultFilterGrouping(rows: FilterRow[]): FilterGrouping {
  return rows.length > 1
    ? { mode: "and", tree: null }
    : { ...EMPTY_FILTER_GROUPING };
}

export function filterRowLabel(row: FilterRow, index: number): string {
  const expression = formatFilterRow(row).trim();
  return expression
    ? `Filter ${index + 1}: ${expression}`
    : `Filter ${index + 1}: <incomplete filter>`;
}

/** Adapt filter rows to the condition shape consumed by GroupingTreeEditor. */
export function filterRowsAsConditions(rows: FilterRow[]): Condition[] {
  return rows.map((row) => ({
    id: row.id,
    column: row.column,
    operator: row.operator,
    values: row.values,
    value: row.values[0] ?? "",
  }));
}

export function formatFilterGroupingExpression(
  rows: FilterRow[],
  grouping: FilterGrouping,
): string {
  if (rows.length === 0) return "No filters — all rows are included.";
  const labels = new Map(rows.map((row, index) => [row.id, filterRowLabel(row, index)]));
  const labelFor = (id: string) => labels.get(id) ?? `<missing filter ${id}>`;

  if (rows.length === 1) return labelFor(rows[0]!.id);
  if (grouping.mode === "custom") {
    return grouping.tree
      ? formatGroupingExpression(grouping.tree, labelFor)
      : "<add groups to define the filter expression>";
  }
  if (grouping.mode === "and" || grouping.mode === "or") {
    return rows
      .map((row) => `(${labelFor(row.id)})`)
      .join(` ${grouping.mode.toUpperCase()} `);
  }
  return rows
    .map((row) => `(${labelFor(row.id)})`)
    .join(" [choose AND, OR, or CUSTOM GROUPS] ");
}

export interface FilterGroupingValidation extends GroupingValidation {
  rowErrors: string[];
}

/** Validate both the individual filter rows and their grouping expression. */
export function validateFilterGrouping(
  rows: FilterRow[],
  grouping: FilterGrouping,
): FilterGroupingValidation {
  const rowErrors: string[] = [];
  rows.forEach((row, index) => {
    if (!row.column.trim() || row.values.length === 0) {
      rowErrors.push(`Filter ${index + 1} needs a column and at least one value.`);
    }
  });

  if (rows.length <= 1) {
    return {
      valid: rowErrors.length === 0,
      errors: rowErrors,
      rowErrors,
      missingIds: [],
      unknownIds: [],
      duplicateIds: [],
      structuralErrors: [],
    };
  }

  let groupingResult: GroupingValidation;
  if (!grouping.mode) {
    groupingResult = {
      valid: false,
      errors: ["Choose AND, OR, or CUSTOM GROUPS to combine multiple row filters."],
      missingIds: [],
      unknownIds: [],
      duplicateIds: [],
      structuralErrors: [],
    };
  } else if (grouping.mode === "custom") {
    groupingResult = validateCustomGrouping(
      grouping.tree,
      rows.map((row) => row.id),
      "filter",
    );
  } else {
    // Flat modes always include every row in row order; the preview makes the
    // resulting expression explicit.
    groupingResult = {
      valid: true,
      errors: [],
      missingIds: [],
      unknownIds: [],
      duplicateIds: [],
      structuralErrors: [],
    };
  }

  const errors = [...rowErrors, ...groupingResult.errors];
  return { ...groupingResult, valid: errors.length === 0, errors, rowErrors };
}

export function repairFilterGroupingTree(
  rows: FilterRow[],
  grouping: FilterGrouping,
): FilterGrouping {
  const allowed = new Set(rows.map((row) => row.id));
  return { ...grouping, tree: pruneGroupingTree(grouping.tree, allowed) };
}

export function resetFilterGroupingTree(
  rows: FilterRow[],
  grouping: FilterGrouping,
  kind: "and" | "or" = "and",
): FilterGrouping {
  return {
    ...grouping,
    mode: "custom",
    tree: buildFlatGroupingTree(rows.map((row) => row.id), kind),
  };
}
