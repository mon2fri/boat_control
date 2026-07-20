import type { FilterRow } from "../../api/domain";
import { nextId } from "../../lib/id";
import { FilterRowEditor } from "./FilterRowEditor";

interface Props {
  columns: string[];
  rows: FilterRow[];
  columnValues: Record<string, { value: string; starred: boolean }[]>;
  loadingValues: boolean;
  onChange: (rows: FilterRow[]) => void;
}

function newFilterRow(): FilterRow {
  return { id: nextId("filter"), column: "", operator: "equals", values: [] };
}

/** Manages the ordered list of filter rows (add / edit / remove). */
export function FilterBuilder({ columns, rows, columnValues, loadingValues, onChange }: Props) {
  function updateRow(next: FilterRow): void {
    onChange(rows.map((r) => (r.id === next.id ? next : r)));
  }

  function removeRow(id: string): void {
    onChange(rows.filter((r) => r.id !== id));
  }

  return (
    <section aria-labelledby="filters-title" className="card">
      <h3 id="filters-title" className="section-heading">Filtering Rows</h3>
      <p className="section-hint">
        Each row applies one condition. Values within a row are OR-ed. Rows are combined with logical AND.
        Leave the list empty to run against the full set.
      </p>

      {rows.length === 0 ? (
        <p role="status">No filters added — the run will cover all rows.</p>
      ) : (
        rows.map((row, index) => (
          <FilterRowEditor
            key={row.id}
            row={row}
            index={index}
            columns={columns}
            columnValues={columnValues}
            loadingValues={loadingValues}
            onChange={updateRow}
            onRemove={() => removeRow(row.id)}
          />
        ))
      )}

      <button type="button" className="btn" onClick={() => onChange([...rows, newFilterRow()])}>
        + Add filter
      </button>
    </section>
  );
}
