import { useMemo } from "react";
import type { FilterOperator, FilterRow } from "../../api/domain";
import { SearchableSelect, type SelectOption } from "../../components/SearchableSelect";
import { SearchableMultiSelect } from "../../components/SearchableMultiSelect";
import { FILTER_OPERATORS } from "./constants";
import { ValueFamilyAddButton } from "../families/ValueFamilyAddButton";

interface Props {
  row: FilterRow;
  index: number;
  columns: string[];
  /** Column values keyed by column name, from the prepare response. */
  columnValues: Record<string, { value: string; starred: boolean }[]>;
  /** True while the prepare request is in flight. */
  loadingValues: boolean;
  onChange: (row: FilterRow) => void;
  onRemove: () => void;
}

/**
 * One filter row: `{column} {operator} {values}`. Column uses the
 * searchable combobox; values use a searchable multi-select. Values come
 * from the prepare response (fetched once at the Prepare page level) and
 * carry a star marker when present in only one file (not selectable).
 * Multiple values within a row are OR-ed; rows are AND-ed.
 */
export function FilterRowEditor({
  row,
  index,
  columns,
  columnValues,
  loadingValues,
  onChange,
  onRemove,
}: Props) {
  const columnOptions = useMemo<SelectOption[]>(
    () => columns.map((c) => ({ value: c, label: c })),
    [columns],
  );

  const valueOptions = useMemo(
    () =>
      (columnValues[row.column] ?? []).map((v) => ({
        value: v.value,
        label: v.starred ? `${v.value} *` : v.value,
        disabled: v.starred,
      })),
    [columnValues, row.column],
  );

  const operatorId = `filter-op-${index}`;

  return (
    <div className="filter-row" role="group" aria-label={`Filter ${index + 1}`}>
      <SearchableSelect
        label="Column"
        options={columnOptions}
        value={row.column || null}
        onChange={(column) => onChange({ ...row, column, values: [] })}
        placeholder="Search columns…"
      />
      <div className="field">
        <label htmlFor={operatorId}>Operator</label>
        <select
          id={operatorId}
          value={row.operator}
          onChange={(e) => onChange({ ...row, operator: e.target.value as FilterOperator })}
        >
          {FILTER_OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
      </div>
      <SearchableMultiSelect
        label="Value"
        options={valueOptions}
        selected={row.values}
        onChange={(values) => onChange({ ...row, values })}
        placeholder={row.column ? "Search values…" : "Pick a column first"}
        disabled={!row.column || loadingValues}
        hint={
          loadingValues
            ? "Loading values…"
            : "Starred (*) values exist in only one file and cannot be chosen."
        }
      />
      {row.column && (
        <ValueFamilyAddButton
          column={row.column}
          selectedValues={row.values}
          onAddValues={(values) => onChange({ ...row, values })}
        />
      )}
      <button type="button" className="btn btn--danger" onClick={onRemove}>
        Remove
        <span className="visually-hidden"> filter {index + 1}</span>
      </button>
    </div>
  );
}
