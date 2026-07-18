/**
 * Accessible key-column selector.
 *
 * The backend will not run a comparison without at least one validated key
 * column (record-identity column). The selector here mirrors the target
 * selector so users have a consistent mental model, and it surfaces the
 * validation state through `aria-invalid` and a live region so screen readers
 * announce errors as they happen.
 */
import { useId, useMemo } from "react";
import { SearchableSelect, type SelectOption } from "../../components/SearchableSelect";

interface Props {
  columns: string[];
  selected: string[];
  /**
   * Server-side validation result for the currently-selected columns.
   * `undefined` means "not yet validated"; `null` means "no validation
   * attempted" (e.g. when fewer than two columns are picked).
   */
  validation?: { valid: string[]; invalid: string[] } | null;
  onChange: (columns: string[]) => void;
  onValidate?: () => void;
  validating?: boolean;
}

export function KeyColumnSelector({
  columns,
  selected,
  validation,
  onChange,
  onValidate,
  validating,
}: Props) {
  const headingId = useId();
  const helpId = useId();
  const statusId = useId();

  const available = useMemo<SelectOption[]>(
    () =>
      columns
        .filter((c) => !selected.includes(c))
        .map((c) => ({ value: c, label: c })),
    [columns, selected],
  );

  const hasSelection = selected.length > 0;
  const hasInvalid = (validation?.invalid.length ?? 0) > 0;

  function add(column: string): void {
    if (!selected.includes(column)) onChange([...selected, column]);
  }

  function remove(column: string): void {
    onChange(selected.filter((c) => c !== column));
  }

  return (
    <section aria-labelledby={headingId} className="card">
      <h3 id={headingId}>Key columns (record identity)</h3>
      <p id={helpId} className="field-hint">
        Pick one or more columns that uniquely identify a record across the two
        files. Without a key column, the comparison cannot match rows and will
        be rejected.
      </p>

      <SearchableSelect
        label="Add a key column"
        options={available}
        value={null}
        onChange={add}
        placeholder="Search common columns…"
      />

      {selected.length === 0 ? (
        <p className="field-hint" role="status">
          No key columns selected yet — pick at least one before continuing.
        </p>
      ) : (
        <ul aria-label="Selected key columns" className="chip-list">
          {selected.map((column) => (
            <li key={column}>
              <span className="tag">{column}</span>
              <button
                type="button"
                className="btn chip-remove"
                onClick={() => remove(column)}
                aria-label={`Remove key column ${column}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasSelection && onValidate && (
        <div className="busy-row">
          <button
            type="button"
            className="btn"
            onClick={onValidate}
            disabled={validating}
          >
            Validate key columns
          </button>
          <span id={statusId} role="status" aria-live="polite">
            {validating && "Validating…"}
            {validation && !validating && validation.invalid.length === 0 && (
              <span className="alert alert--success">All key columns are present in both files.</span>
            )}
            {validation && !validating && validation.invalid.length > 0 && (
              <span className="alert alert--error">
                Not present in both files: {validation.invalid.join(", ")}
              </span>
            )}
          </span>
        </div>
      )}

      <input
        type="hidden"
        form="run-form"
        value={hasInvalid ? "invalid" : "ok"}
        aria-hidden="true"
        readOnly
      />
    </section>
  );
}