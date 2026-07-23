import { useMemo } from "react";
import { SearchableMultiSelect } from "../../components/SearchableMultiSelect";
import { withColumnFamilies } from "../families/familyOptions";
import type { Family } from "../../api/domain";

interface Props {
  columns: string[];
  selected: string[];
  onChange: (columns: string[]) => void;
  families?: Family[];
}

/**
 * Comparing-columns picker. A single searchable checkbox multi-select
 * limited to the comparison columns. An empty selection means "compare all
 * comparison columns".
 */
export function TargetSelector({ columns, selected, onChange, families = [] }: Props) {
  const available = useMemo(
    () => withColumnFamilies(columns, families),
    [columns, families],
  );

  function removeColumn(column: string): void {
    onChange(selected.filter((c) => c !== column));
  }

  return (
    <section aria-labelledby="targets-title" className="card">
      <h3 id="targets-title" className="section-heading">Comparing Columns</h3>
      <p className="section-hint">
        Choose the columns to compare and validate. If none are chosen, all selected comparison columns are used.
      </p>

      <SearchableMultiSelect
        label="Add columns to compare values"
        options={available}
        selected={selected}
        onChange={onChange}
        placeholder="Search comparison columns…"
        hint="Pick columns for comparison. Leave empty to use all."
      />

      {selected.length > 0 && (
        <ul aria-label="Selected comparing columns" className="chip-list">
          {selected.map((column) => (
            <li key={column}>
              <span className="tag">{column}</span>
              <button
                type="button"
                className="btn chip-remove"
                onClick={() => removeColumn(column)}
                aria-label={`Remove ${column}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
