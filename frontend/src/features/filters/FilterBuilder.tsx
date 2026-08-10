import type { FilterRow } from "../../api/domain";
import { nextId } from "../../lib/id";
import { CollapsibleCard } from "../../components/CollapsibleCard";
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
    <CollapsibleCard
      id="filters"
      title="Row filters"
      summary={rows.length === 0
        ? "No filters configured. Expand to change."
        : `${rows.length} filter${rows.length === 1 ? "" : "s"} configured. Expand to change.`}
    >
      <p className="section-hint">
        Each row applies one condition. Multiple values within a row are combined with OR for
        <code> equals</code>/<code>contains</code> (matches if any value matches) and with AND for
        <code> not equals</code>/<code>not contains</code> (matches if the value is not equal to /
        does not contain any of the selected values). Rows are combined with logical AND. Leave the
        list empty to run against the full set.
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
    </CollapsibleCard>
  );
}
