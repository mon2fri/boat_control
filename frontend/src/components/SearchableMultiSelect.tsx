import { useCallback, useId, useMemo, useRef, useState } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Real values selected when this option represents a family. */
  values?: string[];
}

interface Props {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  /** Permit comma/Enter input that is not present in the option list. */
  freeText?: boolean;
}

/**
 * Accessible multi-select combobox with checkboxes. Users can search and
 * select multiple items. Follows the ARIA combobox pattern with a listbox
 * of checkable options.
 */
export function SearchableMultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "Type to search…",
  hint,
  disabled = false,
  freeText = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const baseId = useId();
  const listId = `${baseId}-list`;
  const hintId = hint ? `${baseId}-hint` : undefined;
  const blurTimer = useRef<number | undefined>(undefined);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const optionValues = useCallback((option: MultiSelectOption) => option.values ?? [option.value], []);
  const optionSelected = useCallback(
    (option: MultiSelectOption) => optionValues(option).every((value) => selectedSet.has(value)),
    [optionValues, selectedSet],
  );
  const allVisibleSelected = filtered.length > 0 && filtered.every(optionSelected);

  const toggle = useCallback(
    (option: MultiSelectOption) => {
      const values = optionValues(option);
      const valuesSet = new Set(values);
      const next = optionSelected(option)
        ? selected.filter((value) => !valuesSet.has(value))
        : [...new Set([...selected, ...values])];
      onChange(next);
    },
    [selected, optionValues, optionSelected, onChange],
  );

  const toggleAll = useCallback(() => {
    if (allVisibleSelected) {
      const visibleValues = new Set(filtered.flatMap(optionValues));
      onChange(selected.filter((v) => !visibleValues.has(v)));
    } else {
      const merged = new Set(selected);
      for (const o of filtered) {
        for (const value of optionValues(o)) merged.add(value);
      }
      onChange([...merged]);
    }
  }, [allVisibleSelected, filtered, selected, onChange, optionValues]);

  const addCommaSeparated = useCallback((text = query) => {
    const names = text
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);
    if (names.length === 0) return;

    const matchingValues = options
      .filter((option) => names.includes(option.label.toLowerCase()))
      .flatMap(optionValues);
    const customValues = freeText
      ? text.split(",").map((name) => name.trim()).filter((name) =>
          name.length > 0 && !options.some((option) => option.label.toLowerCase() === name.toLowerCase()),
        )
      : [];
    const nextValues = [...matchingValues, ...customValues];
    if (nextValues.length > 0) {
      onChange([...new Set([...selected, ...nextValues])]);
    }
    setQuery("");
  }, [options, onChange, query, selected, freeText, optionValues]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addCommaSeparated();
    }
  }

  const selectedCount = selected.length;

  return (
    <div className="field">
      <label id={`${baseId}-label`} htmlFor={`${baseId}-input`}>
        {label}
      </label>
      {hint && (
        <span id={hintId} className="field-hint-inline">
          {hint}
        </span>
      )}
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
          aria-describedby={hintId}
          disabled={disabled}
          placeholder={selectedCount > 0 ? `${selectedCount} selected — ${placeholder}` : placeholder}
          value={open ? query : ""}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => { window.clearTimeout(blurTimer.current); setOpen(true); }}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (text.includes(",")) {
              event.preventDefault();
              addCommaSeparated(text);
            }
          }}
        />
        {open && (
          <ul id={listId} role="listbox" aria-label={label} className="combobox-list">
            <li
              role="option"
              aria-selected={allVisibleSelected}
              className={"combobox-option" + (allVisibleSelected ? " is-active" : "")}
              onMouseDown={(e) => {
                e.preventDefault();
                window.clearTimeout(blurTimer.current);
                toggleAll();
              }}
            >
              <span className="multi-check">{allVisibleSelected ? "☑" : "☐"}</span>
              {filtered.length === options.length ? "Select all" : `Select visible (${filtered.length})`}
            </li>
            {filtered.length === 0 && (
              <li role="option" aria-disabled="true" aria-selected="false" className="combobox-empty">
                {freeText && query.trim() ? `Press Enter to add “${query.trim()}”` : "No matches"}
              </li>
            )}
            {filtered.map((option) => {
              const isChecked = optionSelected(option);
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isChecked}
                  aria-disabled={option.disabled ? "true" : undefined}
                  className={
                    "combobox-option" +
                    (isChecked ? " is-active" : "") +
                    (option.disabled ? " is-starred" : "")
                  }
                  onMouseDown={(e) => {
                    e.preventDefault();
                    window.clearTimeout(blurTimer.current);
                    if (!option.disabled) toggle(option);
                  }}
                >
                  <span className="multi-check">{isChecked ? "☑" : "☐"}</span>
                  {option.label}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
