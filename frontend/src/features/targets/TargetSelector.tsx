import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { parseTargetsInput } from "../../api/endpoints";
import { SearchableSelect, type SelectOption } from "../../components/SearchableSelect";
import { useSessionExpiryDispatcher } from "../session/useSessionExpiry";

interface Props {
  sessionId: string;
  columns: string[];
  selected: string[];
  onChange: (columns: string[]) => void;
}

/**
 * Target column picker. Columns can be added one at a time via the searchable
 * dropdown or pasted as a comma-separated list. The backend parses the input,
 * validates each name against the common columns, and returns the breakdown.
 * An empty selection means "compare all common columns".
 */
export function TargetSelector({ sessionId, columns, selected, onChange }: Props) {
  const [raw, setRaw] = useState("");
  const handleSessionError = useSessionExpiryDispatcher();

  const available = useMemo<SelectOption[]>(
    () =>
      columns
        .filter((c) => !selected.includes(c))
        .map((c) => ({ value: c, label: c })),
    [columns, selected],
  );

  const validation = useMutation({
    mutationFn: (input: string) => parseTargetsInput(sessionId, input),
    onError: handleSessionError,
  });

  function addColumn(column: string): void {
    if (!selected.includes(column)) onChange([...selected, column]);
  }

  function removeColumn(column: string): void {
    onChange(selected.filter((c) => c !== column));
  }

  function commitRaw(): void {
    if (raw.trim().length === 0) return;
    validation.mutate(raw, {
      onSuccess: (result) => {
        const merged = [...selected];
        for (const name of result.valid) if (!merged.includes(name)) merged.push(name);
        onChange(merged);
        setRaw(result.invalid.join(", "));
      },
    });
  }

  return (
    <section aria-labelledby="targets-title" className="card">
      <h3 id="targets-title">Target columns</h3>
      <p className="field-hint">
        Choose the columns to compare and validate. If none are chosen, all common columns are used.
      </p>

      <SearchableSelect
        label="Add a target column"
        options={available}
        value={null}
        onChange={addColumn}
        placeholder="Search common columns…"
      />

      <div className="field">
        <label htmlFor="target-raw">Or paste comma-separated column names</label>
        <input
          id="target-raw"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="region, status, amount"
          aria-describedby="target-raw-status"
        />
        <div className="busy-row">
          <button
            type="button"
            className="btn"
            onClick={commitRaw}
            disabled={validation.isPending || raw.trim().length === 0}
          >
            Validate &amp; add
          </button>
          <span id="target-raw-status" role="status">
            {validation.isPending && "Validating…"}
            {validation.isSuccess && validation.data.invalid.length > 0 && (
              <span className="alert alert--warn">
                Not in common columns: {validation.data.invalid.join(", ")}
              </span>
            )}
            {validation.isSuccess && validation.data.invalid.length === 0 && "All columns valid."}
            {validation.isError && (
              <span className="alert alert--error">Validation request failed.</span>
            )}
          </span>
        </div>
      </div>

      {selected.length > 0 && (
        <ul aria-label="Selected target columns" className="chip-list">
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
