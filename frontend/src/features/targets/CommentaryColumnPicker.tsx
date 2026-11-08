import { useMemo } from "react";
import { SearchableMultiSelect } from "../../components/SearchableMultiSelect";
import { SectionHint } from "../../components/SectionHint";
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
 * Ordered selection of source columns appended to the commentary template and
 * shown as additional columns in Exception Tracking. This selection is
 * intentionally independent of the existing "Extra Columns" setting, attribute
 * comparison sections and any exception-table display choices.
 */
export function CommentaryColumnPicker({ columns, selected, onChange, families = [] }: Props) {
  const available = useMemo(
    () => withColumnFamilies(columns, families),
    [columns, families],
  );

  function removeColumn(column: string): void {
    onChange(selected.filter((item) => item !== column));
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
      id="commentary-columns"
      title="Extra Columns for Commentary Template"
      summary={selected.length === 0
        ? "No commentary-template columns configured. Expand to change."
        : `${selected.length} commentary-template column${selected.length === 1 ? "" : "s"} configured. Expand to change.`}
    showSummary={false}
      hint={<SectionHint label="Extra Columns for Commentary Template help">Ordered additional columns appended to the commentary template and shown in the
        Exception Tracking tab. This selection is independent of the Extra Columns setting
        and attribute comparison sections.</SectionHint>}
    >

      <SearchableMultiSelect
        label="Add columns for commentary template"
        options={available}
        selected={selected}
        onChange={onChange}
        placeholder="Search columns…"
        hintTooltip
        hint="Only columns selected here become additional commentary/tracking columns."
      />

      {selected.length > 0 && (
        <ul aria-label="Selected commentary-template columns" className="chip-list">
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
