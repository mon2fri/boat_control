import { describe, expect, it } from "vitest";
import { valueFamilyOptions, withColumnFamilies } from "./familyOptions";
import type { Family } from "../../api/domain";

const families: Family[] = [
  { kind: "column", name: "Ownership", columns: ["owner", "delegate", "missing"] },
  {
    kind: "value",
    name: "Internal owners",
    owners: [{ kind: "column_family", name: "Ownership" }],
    values: ["Ops", "Finance"],
  },
];

describe("family multi-select options", () => {
  it("marks column families and limits expansion to available columns", () => {
    expect(withColumnFamilies(["owner", "delegate"], families)[0]).toEqual({
      value: "column-family:Ownership",
      label: "Ownership (Column Family)",
      values: ["owner", "delegate"],
    });
  });

  it("marks value families inherited through a column-family owner", () => {
    expect(valueFamilyOptions("owner", families)).toEqual([{
      value: "value-family:Internal owners",
      label: "Internal owners (Value Family)",
      values: ["Ops", "Finance"],
    }]);
  });
});
