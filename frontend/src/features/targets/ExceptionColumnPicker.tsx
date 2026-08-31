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
        <legend>Display extra columns in</legend>
        <Destination label="Overall Results — Result page" checked={display.overallResultPage} onChange={(checked) => onDisplayChange({ ...display, overallResultPage: checked })} />
        <Destination label="Overall Results — Exported HTML Report" checked={display.overallHtmlReport} onChange={(checked) => onDisplayChange({ ...display, overallHtmlReport: checked })} />
        <Destination label="Overall Results — Exported Excel Report" checked={display.overallExcelReport} onChange={(checked) => onDisplayChange({ ...display, overallExcelReport: checked })} />
        <Destination label="New Books — Result page" checked={display.newBooksResultPage} onChange={(checked) => onDisplayChange({ ...display, newBooksResultPage: checked })} />
        <Destination label="New Books — Exported HTML Report" checked={display.newBooksHtmlReport} onChange={(checked) => onDisplayChange({ ...display, newBooksHtmlReport: checked })} />
        <Destination label="New Books — Exported Excel Report" checked={display.newBooksExcelReport} onChange={(checked) => onDisplayChange({ ...display, newBooksExcelReport: checked })} />
      </fieldset>

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

function Destination({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="checkbox-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}</label>;
}
