import { SearchableMultiSelect } from "../../components/SearchableMultiSelect";

interface Props {
  keyColumnNames: string[];
  availableFilters: Record<string, string[]>;
  activeFilters: Record<string, string[]>;
  onChange: (filters: Record<string, string[]>) => void;
}

/**
 * Independent filter bar for a detail table section. Each key column and
 * COLUMN gets a searchable multi-select. Selected values are OR-ed within
 * a field; separate fields are AND-ed. Filter state is local to this bar
 * (independent across sections).
 */
export function DetailFilterBar({
  keyColumnNames,
  availableFilters,
  activeFilters,
  onChange,
}: Props) {
  function updateField(field: string, values: string[]) {
    const next = { ...activeFilters };
    if (values.length === 0) {
      delete next[field];
    } else {
      next[field] = values;
    }
    onChange(next);
  }

  const fields = [
    ...keyColumnNames.map((kc) => ({ key: `key_${kc}`, label: kc })),
    { key: "column", label: "COLUMN" },
  ];

  return (
    <div className="detail-filter-bar" role="group" aria-label="Filter details">
      {fields.map(({ key, label }) => (
        <SearchableMultiSelect
          key={key}
          label={label}
          options={(availableFilters[key] ?? []).map((v) => ({ value: v, label: v }))}
          selected={activeFilters[key] ?? []}
          onChange={(values) => updateField(key, values)}
          placeholder={`Filter ${label}…`}
        />
      ))}
    </div>
  );
}
