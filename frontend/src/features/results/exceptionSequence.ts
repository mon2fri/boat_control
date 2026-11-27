import type { DetailRow } from "../../api/domain";

/**
 * Presentation-only per-rule sequence for exception tables.
 *
 * The numbers are 1-based positions over the rule's ordered violation set.
 * They are never persistent identity and never used for import matching:
 * lookups always join on the row's stable `rowKey` (which identity
 * resolution never rewrites), so a row keeps its number across pagination,
 * filtering, sorting, and export — every view numbers from the same
 * ordered set.
 */

/** Stable join key for one row within its rule's ordered violation set. */
export function violationSequenceKey(row: DetailRow): string {
  return row.rowKey;
}

/**
 * Build the 1-based position index over the rule's ordered violation set.
 * Duplicate keys keep their first position; rows never share a `rowKey`
 * from the mapper (`rowKeyOf(...)#<index>`), so this is a fallback only.
 */
export function buildViolationSequenceIndex(
  orderedRows: DetailRow[],
): Map<string, number> {
  const index = new Map<string, number>();
  orderedRows.forEach((row, position) => {
    const key = violationSequenceKey(row);
    if (!index.has(key)) index.set(key, position + 1);
  });
  return index;
}

/** Look up a rendered row's sequence number; `null` when not in the set. */
export function violationSequenceNumber(
  index: Map<string, number>,
  row: DetailRow,
): number | null {
  return index.get(violationSequenceKey(row)) ?? null;
}

/** Sort key for the per-rule "#" sequence column (never a DetailRow field). */
export const SEQUENCE_SORT_KEY = "__rule_sequence";

/**
 * Order rows by their per-rule sequence number. Rows missing from the index
 * sort last, mirroring empty-last behavior; ties (which cannot occur for
 * mapper-built rowKeys) keep input order.
 */
export function sortBySequence(
  rows: DetailRow[],
  index: Map<string, number>,
  direction: "asc" | "desc",
): DetailRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return rows
    .map((row, position) => ({ row, position }))
    .sort((left, right) => {
      const a = index.get(left.row.rowKey);
      const b = index.get(right.row.rowKey);
      if (a == null && b == null) return left.position - right.position;
      if (a == null) return 1;
      if (b == null) return -1;
      return a === b ? left.position - right.position : (a - b) * factor;
    })
    .map(({ row }) => row);
}
