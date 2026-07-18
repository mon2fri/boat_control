import { useId, useMemo } from "react";
import { SearchableSelect } from "./SearchableSelect";

interface Props {
  label: string;
  columns: string[];
  value: string;
  onChange: (value: string) => void;
}

/**
 * Picks a column. When the set of known columns is available (an upload
 * session exists) it renders the searchable combobox; otherwise it degrades to
 * a plain text input so rules can still be authored from the config tab.
 */
export function ColumnField({ label, columns, value, onChange }: Props) {
  const id = useId();
  const options = useMemo(() => columns.map((c) => ({ value: c, label: c })), [columns]);

  if (columns.length > 0) {
    return (
      <SearchableSelect
        label={label}
        options={options}
        value={value || null}
        onChange={onChange}
        placeholder="Search columns…"
      />
    );
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Column name" />
    </div>
  );
}
