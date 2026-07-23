import type { Family, ValueFamily } from "../../api/domain";
import type { MultiSelectOption } from "../../components/SearchableMultiSelect";

export function withColumnFamilies(columns: string[], families: Family[]): MultiSelectOption[] {
  const available = new Set(columns);
  return [
    ...families
      .filter((family) => family.kind === "column")
      .map((family) => ({
        value: `column-family:${family.name}`,
        label: `${family.name} (Column Family)`,
        values: family.columns.filter((column) => available.has(column)),
      }))
      .filter((option) => option.values.length > 0),
    ...columns.map((column) => ({ value: column, label: column })),
  ];
}

export function valueFamilyOptions(column: string, families: Family[]): MultiSelectOption[] {
  return families
    .filter((family): family is ValueFamily => family.kind === "value")
    .filter((family) => family.owners.some((owner) => {
      if (owner.kind === "column") return owner.name === column;
      const columnFamily = families.find(
        (candidate) => candidate.kind === "column" && candidate.name === owner.name,
      );
      return columnFamily?.kind === "column" && columnFamily.columns.includes(column);
    }))
    .map((family) => ({
      value: `value-family:${family.name}`,
      label: `${family.name} (Value Family)`,
      values: family.values,
    }));
}
