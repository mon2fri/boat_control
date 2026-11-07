import { useId } from "react";
import { defaultAsOfDate, isValidIsoDate } from "../../lib/asOfDate";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Available tracking dates, offered through a native datalist. */
  dates?: string[];
  label?: string;
  hint?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Shared calendar picker for the "As-of Date". Uses the browser's native
 * `<input type="date">` calendar UI and a datalist of dates that already have
 * tracking tables; users are still free to choose any valid date.
 */
export function AsOfDateField({
  value,
  onChange,
  dates = [],
  label = "As-of Date",
  hint,
  disabled = false,
  id,
}: Props) {
  const generatedId = useId();
  const inputId = id ?? `as-of-date-${generatedId.replace(/:/g, "")}`;
  const listId = `${inputId}-dates`;
  const invalid = value.length > 0 && !isValidIsoDate(value);

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className="as-of-date-row">
        <input
          id={inputId}
          type="date"
          value={value}
          list={dates.length > 0 ? listId : undefined}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={`${inputId}-hint`}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="btn"
          disabled={disabled}
          onClick={() => onChange(defaultAsOfDate())}
        >
          Use default
        </button>
      </div>
      {dates.length > 0 && (
        <datalist id={listId}>
          {dates.map((date) => (
            <option key={date} value={date} />
          ))}
        </datalist>
      )}
      <span className="field-hint" id={`${inputId}-hint`}>
        {invalid
          ? "Enter a real calendar date in YYYY-MM-DD form."
          : hint ?? "Default: the last weekday (Monday–Friday) of the previous month."}
      </span>
    </div>
  );
}
