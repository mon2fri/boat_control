/**
 * Pure layout helper for distributing group-statistic cards across rows.
 * At most `maxPerRow` cards per row; rows differ by at most 1 item.
 */
export function distributeEvenly<T>(items: T[], maxPerRow = 4): T[][] {
  if (items.length === 0) return [];
  if (items.length <= maxPerRow) return [items];

  // Find row count n such that ceil(items.length / n) <= maxPerRow
  // and rows differ by at most 1.
  const n = Math.ceil(items.length / maxPerRow);
  const baseSize = Math.floor(items.length / n);
  const remainder = items.length % n;

  const rows: T[][] = [];
  let offset = 0;
  for (let i = 0; i < n; i++) {
    const size = baseSize + (i < remainder ? 1 : 0);
    rows.push(items.slice(offset, offset + size));
    offset += size;
  }
  return rows;
}
