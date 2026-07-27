import type { DetailRow, GroupStat } from "../../api/domain";

function recordId(detail: DetailRow): string {
  const keys = Object.entries(detail.keyColumns).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(keys.length > 0 ? keys : [["rowKey", detail.rowKey.split("#")[0]]]);
}

function displayValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return "Null";
  return value === "" ? "Empty" : value;
}

/** Build ordinary aggregation cards using only one comparison section's changes. */
export function buildSectionGroupStatistics(
  details: DetailRow[],
  aggregationColumns: string[],
): GroupStat[] {
  return aggregationColumns.map((column) => {
    const groups = new Map<string, { records: Set<string>; count: number }>();
    const allRecords = new Set<string>();
    for (const detail of details) {
      const id = recordId(detail);
      const value = displayValue(detail.aggregationValues?.[column]);
      const group = groups.get(value) ?? { records: new Set<string>(), count: 0 };
      group.records.add(id);
      group.count += 1;
      groups.set(value, group);
      allRecords.add(id);
    }
    const rows = [...groups.entries()]
      .sort(([a], [b]) => {
        const rank = (v: string) => v === "Empty" ? 1 : v === "Null" ? 2 : 0;
        return rank(a) - rank(b) || a.localeCompare(b);
      })
      .map(([value, group]) => ({
        value,
        uniqueCount: group.records.size,
        attributeCount: group.count,
      }));
    return {
      column,
      uniqueCount: allRecords.size,
      attributeCount: details.length,
      rows: [
        { value: "Total", uniqueCount: allRecords.size, attributeCount: details.length },
        ...rows,
      ],
    };
  });
}
