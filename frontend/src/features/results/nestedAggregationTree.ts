import type { DetailRow, NestedAggNode } from "../../api/domain";

/**
 * Build a nested aggregation tree from flat detail rows.
 *
 * Groups rows hierarchically by the ordered aggregation columns. The final
 * level contains unique records (identified by their key columns) with the
 * count of changed attributes and the individual change details.
 */
export function buildNestedAggregationTree(
  details: DetailRow[],
  aggregationColumns: string[],
  keyColumnNames: string[],
): NestedAggNode[] {
  if (aggregationColumns.length === 0 || details.length === 0) return [];

  // Defensive filter: exclude rule-exception rows. Only genuine attribute
  // changes (kind === "changed") should appear in the change tree.
  const changedDetails = details.filter((d) => d.kind === "changed");
  if (changedDetails.length === 0) return [];

  // Group detail rows by their record key. Each record yields one entry
  // with its key-column values, aggregation-column values, and the list of
  // changed attributes.
  const recordMap = new Map<string, {
    keyColumns: Record<string, string | null>;
    aggregationValues: Record<string, string | null>;
    attributes: { column: string; old: string | null; new: string | null }[];
  }>();

  for (const row of changedDetails) {
    const recKey = row.rowKey.split("#")[0] ?? row.rowKey;
    let entry = recordMap.get(recKey);
    if (!entry) {
      entry = {
        keyColumns: row.keyColumns,
        aggregationValues: row.aggregationValues ?? {},
        attributes: [],
      };
      recordMap.set(recKey, entry);
    }
    entry.attributes.push({
      column: row.column,
      old: row.file1Value,
      new: row.file2Value,
    });
  }

  // Build the hierarchy level by level
  const records = Array.from(recordMap.entries()).map(([recKey, entry]) => ({
    recKey,
    ...entry,
  }));

  return buildTreeLevel(records, aggregationColumns, 0, keyColumnNames);
}

function aggregationLabel(value: string | null | undefined): string {
  if (value === null) return "(null)";
  if (value === "") return "(empty)";
  if (value === undefined) return "(missing)";
  return value;
}

function buildTreeLevel(
  records: {
    recKey: string;
    keyColumns: Record<string, string | null>;
    aggregationValues: Record<string, string | null>;
    attributes: { column: string; old: string | null; new: string | null }[];
  }[],
  aggregationColumns: string[],
  depth: number,
  keyColumnNames: string[],
): NestedAggNode[] {
  if (depth >= aggregationColumns.length) {
    // Final level: create record leaf nodes
    return records.map((rec) => {
      const keyParts = keyColumnNames
        .map((k) => rec.keyColumns[k])
        .filter((v): v is string => v != null);
      const label = keyParts.length > 0 ? keyParts.join("/") : rec.recKey;
      return {
        kind: "record",
        label,
        rowKey: rec.recKey,
        keyColumns: rec.keyColumns,
        changeCount: rec.attributes.length,
        attributes: rec.attributes,
      };
    });
  }

  const column = aggregationColumns[depth]!;
  const groups = new Map<string, typeof records>();

  for (const rec of records) {
    const raw = rec.aggregationValues[column];
    const val = aggregationLabel(raw);
    const existing = groups.get(val);
    if (existing) {
      existing.push(rec);
    } else {
      groups.set(val, [rec]);
    }
  }

  const nodes: NestedAggNode[] = [];
  for (const [value, groupRecords] of groups) {
    const children = buildTreeLevel(groupRecords, aggregationColumns, depth + 1, keyColumnNames);
    const aggregatedCount = children.reduce(
      (sum, child) => sum + (child.kind === "record" ? child.changeCount : child.aggregatedCount),
      0,
    );
    nodes.push({
      kind: "group",
      label: value,
      column,
      depth,
      children,
      aggregatedCount,
    });
  }

  // Sort groups by label for deterministic display
  nodes.sort((a, b) => {
    if (a.label < b.label) return -1;
    if (a.label > b.label) return 1;
    return 0;
  });

  return nodes;
}
