import { useId, useMemo, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  /** Present-in-one-file-only marker; starred options are not selectable. */
  starred?: boolean;
  disabled?: boolean;
}

interface Props {
  label: string;
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Optional hint rendered under the control and wired via aria-describedby. */
  hint?: string;
  disabled?: boolean;
}

/**
 * Accessible, type-to-filter combobox built entirely with React state and
 * keyboard handlers — no native `<datalist>` and no direct DOM manipulation.
 * Follows the ARIA combobox (listbox popup) interaction pattern.
 */
export function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  hint,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const hintId = hint ? `${baseId}-hint` : undefined;
  const blurTimer = useRef<number | undefined>(undefined);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? "",
    [options, value],
  );

  function commit(option: SelectOption): void {
    if (option.starred || option.disabled) return;
    onChange(option.value);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      const option = filtered[activeIndex];
      if (open && option) {
        event.preventDefault();
        commit(option);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="field">
      <label id={`${baseId}-label`} htmlFor={`${baseId}-input`}>
        {label}
      </label>
      <div
        role="combobox"
        aria-expanded={open}
        aria-owns={listId}
        aria-haspopup="listbox"
      >
        <input
          id={`${baseId}-input`}
          type="text"
          role="searchbox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={open && filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          aria-describedby={hintId}
          disabled={disabled}
          placeholder={placeholder}
          value={open ? query : selectedLabel}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so an option click registers before the list closes.
            blurTimer.current = window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={handleKeyDown}
        />
        {open && (
          <ul id={listId} role="listbox" aria-label={label} className="combobox-list">
            {filtered.length === 0 && (
              <li role="option" aria-disabled="true" aria-selected="false" className="combobox-empty">
                No matches
              </li>
            )}
            {filtered.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.starred || option.disabled ? "true" : undefined}
                className={
                  "combobox-option" +
                  (index === activeIndex ? " is-active" : "") +
                  (option.starred ? " is-starred" : "")
                }
                onMouseDown={() => {
                  window.clearTimeout(blurTimer.current);
                  commit(option);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {option.label}
                {option.starred && (
                  <span className="tag tag--star" title="Present in only one file — not selectable">
                    {" "}
                    *
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {hint && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
    </div>
  );
}
