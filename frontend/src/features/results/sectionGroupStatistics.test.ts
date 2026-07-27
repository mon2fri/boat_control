import { describe, expect, it } from "vitest";
import type { DetailRow } from "../../api/domain";
import { buildSectionGroupStatistics } from "./sectionGroupStatistics";

function detail(rowKey: string, column: string, status: string): DetailRow {
  return {
    rowKey,
    keyColumns: { id: rowKey },
    column,
    file1Value: "before",
    file2Value: "after",
    aggregationValues: { status },
    kind: "changed",
  };
}

describe("buildSectionGroupStatistics", () => {
  it("counts records and attributes using only the section's detail rows", () => {
    expect(buildSectionGroupStatistics([
      detail("1", "name", "active"),
      detail("1", "score", "active"),
      detail("2", "name", "inactive"),
    ], ["status"])).toEqual([{
      column: "status",
      uniqueCount: 2,
      attributeCount: 3,
      rows: [
        { value: "Total", uniqueCount: 2, attributeCount: 3 },
        { value: "active", uniqueCount: 1, attributeCount: 2 },
        { value: "inactive", uniqueCount: 1, attributeCount: 1 },
      ],
    }]);
  });
});
