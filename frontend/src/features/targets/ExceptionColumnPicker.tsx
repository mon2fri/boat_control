import { useMemo } from "react";
import { SearchableMultiSelect } from "../../components/SearchableMultiSelect";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { withColumnFamilies } from "../families/familyOptions";
import type { Family } from "../../api/domain";
import type { ExtraColumnDisplay } from "../../api/domain";

interface Props {
  columns: string[];
  selected: string[];
  onChange: (columns: string[]) => void;
  families?: Family[];
  display: ExtraColumnDisplay;
  onDisplayChange: (display: ExtraColumnDisplay) => void;
}

/**
 * Exception column picker. Allows users to select extra columns to include
 * in the exception table beyond the key columns and aggregation columns.
 */
export function ExceptionColumnPicker({ columns, selected, onChange, families = [], display, onDisplayChange }: Props) {
  const available = useMemo(
    () => withColumnFamilies(columns, families),
    [columns, families],
  );

  function removeColumn(column: string): void {
    onChange(selected.filter((c) => c !== column));
  }

  function moveColumn(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= selected.length) return;
    const reordered = [...selected];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    onChange(reordered);
  }

  return (
    <CollapsibleCard
      id="exception-columns"
      title="Extra Columns"
      summary={selected.length === 0
        ? "No extra columns configured. Expand to change."
        : `${selected.length} extra column${selected.length === 1 ? "" : "s"} configured. Expand to change.`}
    >
      <p className="section-hint">
        Select extra columns. They always remain available in the Exception Table; choose the additional destinations below.
      </p>

      <SearchableMultiSelect
        label="Add extra columns"
        options={available}
        selected={selected}
        onChange={onChange}
        placeholder="Search columns…"
        hint="Pick columns from the comparison file."
      />

      <fieldset className="field" disabled={selected.length === 0}>
        <legend>Display Extra Columns In</legend>
        <Destination label="Overall Results" checked={display.overallResultPage} onChange={(checked) => onDisplayChange({ ...display, overallResultPage: checked, overallHtmlReport: checked, overallExcelReport: checked })} />
        <Destination label="New Books" checked={display.newBooksResultPage} onChange={(checked) => onDisplayChange({ ...display, newBooksResultPage: checked, newBooksHtmlReport: checked, newBooksExcelReport: checked })} />
        <Destination label="Exception Tables" checked={display.exceptionTables} onChange={(checked) => onDisplayChange({ ...display, exceptionTables: checked })} />
      </fieldset>

      {selected.length > 0 && (
        <ul aria-label="Selected exception columns" className="chip-list">
          {selected.map((column, index) => (
            <li key={column}>
              <span className="tag">{column}</span>
              <button
                type="button"
                className="btn chip-remove"
                onClick={() => moveColumn(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${column} up`}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn chip-remove"
                onClick={() => moveColumn(index, 1)}
                disabled={index === selected.length - 1}
                aria-label={`Move ${column} down`}
              >
                ↓
              </button>
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

function Destination({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="checkbox-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}</label>;
}
