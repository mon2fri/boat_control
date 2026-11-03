import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatIsoDate, isValidIsoDate, toIsoDate } from "../../lib/asOfDate";

interface Props {
  /** Currently selected ISO calendar date. */
  value: string;
  /** Every authoritative available date from the tracking API (any order). */
  availableDates: string[];
  onChange: (date: string) => void;
  disabled?: boolean;
  id?: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const LATEST_LIMIT = 10;

function dateFromIso(value: string): Date {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

function addDays(value: string, delta: number): string {
  const date = dateFromIso(value);
  date.setDate(date.getDate() + delta);
  return toIsoDate(date);
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function firstDayOffset(year: number, month: number): number {
  // Monday-first calendar (0 = Monday ... 6 = Sunday).
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function fullDateLabel(value: string): string {
  return dateFromIso(value).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function monthLabel(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

/**
 * One As-of Date selector for the Exception Tracking tab.
 *
 * The trigger opens a listbox of up to ten latest dates that actually have
 * tracking data, then an always-present "Other date" option. Other date opens
 * a custom calendar so dates with data can be marked (native date inputs
 * cannot expose per-day markers) while unrecorded dates remain selectable and
 * plain.
 */
export function AsOfDateSelector({
  value,
  availableDates,
  onChange,
  disabled = false,
  id,
}: Props) {
  const generatedId = useId();
  const triggerId = id ?? `as-of-date-selector-${generatedId.replace(/:/g, "")}`;
  const menuId = `${triggerId}-menu`;
  const calendarId = `${triggerId}-calendar`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dayRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const selectedDate = isValidIsoDate(value) ? value : toIsoDate(new Date());
  const selected = dateFromIso(selectedDate);

  const [menuOpen, setMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewMonth, setViewMonth] = useState({ year: selected.getFullYear(), month: selected.getMonth() });
  const [focusedDate, setFocusedDate] = useState(selectedDate);

  const availableSet = useMemo(
    () => new Set(availableDates.filter(isValidIsoDate)),
    [availableDates],
  );
  const latestDates = useMemo(
    () =>
      [...new Set(availableDates.filter(isValidIsoDate))]
        .sort((a, b) => b.localeCompare(a))
        .slice(0, LATEST_LIMIT),
    [availableDates],
  );
  const today = toIsoDate(new Date());

  const optionCount = latestDates.length + 1;
  const activeOption = Math.min(activeIndex, optionCount - 1);

  useEffect(() => {
    if (!menuOpen) return;
    optionRefs.current[activeOption]?.focus();
  }, [activeOption, menuOpen, latestDates.length]);

  useEffect(() => {
    if (!calendarOpen) return;
    dayRefs.current[focusedDate]?.focus();
  }, [calendarOpen, focusedDate, viewMonth]);

  useEffect(() => {
    if (!menuOpen && !calendarOpen) return;
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setMenuOpen(false);
      setCalendarOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [calendarOpen, menuOpen]);

  function toggleMenu(): void {
    if (disabled) return;
    setCalendarOpen(false);
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    const selectedIndex = latestDates.indexOf(selectedDate);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setMenuOpen(true);
  }

  function closeAll(restoreFocus = false): void {
    setMenuOpen(false);
    setCalendarOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function chooseDate(date: string): void {
    onChange(date);
    closeAll(true);
  }

  function openOtherDate(): void {
    const seed = selectedDate;
    const date = dateFromIso(seed);
    setMenuOpen(false);
    setViewMonth({ year: date.getFullYear(), month: date.getMonth() });
    setFocusedDate(seed);
    setCalendarOpen(true);
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAll(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((Math.min(activeIndex, optionCount - 1) + 1) % optionCount);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((Math.min(activeIndex, optionCount - 1) - 1 + optionCount) % optionCount);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(optionCount - 1);
    }
  }

  function changeMonth(delta: number): void {
    const next = addMonths(viewMonth.year, viewMonth.month, delta);
    setViewMonth(next);
    setFocusedDate(toIsoDate(new Date(next.year, next.month, 1)));
  }

  function handleDayKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, date: string): void {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key === "Escape") {
      event.preventDefault();
      closeAll(true);
      return;
    }
    const delta = moves[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const target = addDays(date, delta);
    const targetDate = dateFromIso(target);
    setFocusedDate(target);
    setViewMonth({ year: targetDate.getFullYear(), month: targetDate.getMonth() });
  }

  const offset = firstDayOffset(viewMonth.year, viewMonth.month);
  const totalDays = daysInMonth(viewMonth.year, viewMonth.month);
  const cells: Array<string | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: totalDays }, (_, index) =>
      toIsoDate(new Date(viewMonth.year, viewMonth.month, index + 1)),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="field as-of-date-selector" ref={rootRef}>
      <label htmlFor={triggerId}>As-of Date</label>
      <button
        id={triggerId}
        ref={triggerRef}
        type="button"
        className="as-of-date-selector__trigger"
        aria-label={`As-of Date, selected ${formatIsoDate(selectedDate)}`}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : calendarOpen ? calendarId : undefined}
        disabled={disabled}
        onClick={toggleMenu}
      >
        <span>{formatIsoDate(selectedDate)}</span>
        <span className="as-of-date-selector__chevron" aria-hidden="true">▾</span>
      </button>

      {menuOpen && (
        <div
          id={menuId}
          role="listbox"
          aria-label="Available As-of Dates"
          className="as-of-date-selector__menu"
          onKeyDown={handleMenuKeyDown}
        >
          {latestDates.map((date, index) => (
            <button
              key={date}
              ref={(node) => { optionRefs.current[index] = node; }}
              type="button"
              role="option"
              aria-selected={date === selectedDate}
              tabIndex={index === activeOption ? 0 : -1}
              className={`as-of-date-selector__option${date === selectedDate ? " is-selected" : ""}`}
              onFocus={() => setActiveIndex(index)}
              onClick={() => chooseDate(date)}
            >
              {formatIsoDate(date)}
            </button>
          ))}
          <button
            ref={(node) => { optionRefs.current[latestDates.length] = node; }}
            type="button"
            role="option"
            aria-selected={false}
            tabIndex={latestDates.length === activeOption ? 0 : -1}
            className="as-of-date-selector__option as-of-date-selector__option--other"
            onFocus={() => setActiveIndex(latestDates.length)}
            onClick={openOtherDate}
          >
            Other date…
          </button>
        </div>
      )}

      {calendarOpen && (
        <div
          id={calendarId}
          role="dialog"
          aria-label="Choose another As-of Date"
          className="date-picker"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeAll(true);
            }
          }}
        >
          <div className="date-picker__header">
            <button
              type="button"
              className="btn date-picker__nav"
              aria-label="Previous month"
              onClick={() => changeMonth(-1)}
            >
              ‹
            </button>
            <strong aria-live="polite">{monthLabel(viewMonth.year, viewMonth.month)}</strong>
            <button
              type="button"
              className="btn date-picker__nav"
              aria-label="Next month"
              onClick={() => changeMonth(1)}
            >
              ›
            </button>
          </div>

          <div className="date-picker__weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>

          <div className="date-picker__days">
            {cells.map((date, index) => {
              if (date === null) {
                return <span key={`blank-${index}`} className="date-picker__blank" aria-hidden="true" />;
              }
              const hasData = availableSet.has(date);
              const isSelected = date === selectedDate;
              const isToday = date === today;
              const label = [
                fullDateLabel(date),
                hasData ? "has tracking data" : "no tracking data",
                isSelected ? "selected" : null,
                isToday ? "today" : null,
              ].filter(Boolean).join(", ");
              const classes = [
                "date-picker__day",
                hasData ? "has-data" : "",
                isSelected ? "is-selected" : "",
                isToday ? "is-today" : "",
              ].filter(Boolean).join(" ");
              return (
                <button
                  key={date}
                  ref={(node) => { dayRefs.current[date] = node; }}
                  type="button"
                  className={classes}
                  tabIndex={date === focusedDate ? 0 : -1}
                  aria-label={label}
                  aria-pressed={isSelected}
                  onClick={() => chooseDate(date)}
                  onFocus={() => setFocusedDate(date)}
                  onKeyDown={(event) => handleDayKeyDown(event, date)}
                >
                  {Number(date.slice(-2))}
                  {hasData && <span className="date-picker__marker" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <div className="date-picker__legend">
            <span><span className="date-picker__marker date-picker__marker--static" aria-hidden="true" /> Has tracking data</span>
            <span><span className="date-picker__today-swatch" aria-hidden="true" /> Today</span>
            <span><span className="date-picker__selected-swatch" aria-hidden="true" /> Selected</span>
          </div>

          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => closeAll(true)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
