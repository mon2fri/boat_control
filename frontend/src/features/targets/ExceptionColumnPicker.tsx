import { useMemo } from "react";
import { SearchableMultiSelect } from "../../components/SearchableMultiSelect";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { withColumnFamilies } from "../families/familyOptions";
import type { Family } from "../../api/domain";

interface Props {
  columns: string[];
  selected: string[];
  onChange: (columns: string[]) => void;
  families?: Family[];
}

/**
 * Exception column picker. Allows users to select extra columns to include
 * in the exception table beyond the key columns and aggregation columns.
 */
export function ExceptionColumnPicker({ columns, selected, onChange, families = [] }: Props) {
  const available = useMemo(
    () => withColumnFamilies(columns, families),
    [columns, families],
  );

  function removeColumn(column: string): void {
    onChange(selected.filter((c) => c !== column));
  }

  return (
    <CollapsibleCard
      id="exception-columns"
      title="Extra Columns in Exception Table"
      summary={selected.length === 0
        ? "No extra columns configured. Expand to change."
        : `${selected.length} extra column${selected.length === 1 ? "" : "s"} configured. Expand to change.`}
    >
      <p className="section-hint">
        Select extra columns to appear in the exception table, which lists all records across exception rows. Key columns and aggregation columns are always included.
      </p>

      <SearchableMultiSelect
        label="Add columns to exception table"
        options={available}
        selected={selected}
        onChange={onChange}
        placeholder="Search columns…"
        hint="Pick extra columns for the exception table."
      />

      {selected.length > 0 && (
        <ul aria-label="Selected exception columns" className="chip-list">
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
    </CollapsibleCard>
  );
}
