/**
 * Calendar helpers for the exception-tracking "As-of Date".
 *
 * The as-of date is a calendar date, not an instant.  All conversions below
 * use the browser's local calendar components so a date selected at 23:30 on
 * a UTC boundary cannot jump to the previous/next day.  The wire format is the
 * strictly validated ISO `YYYY-MM-DD` form.
 */

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Format a Date's *local* calendar components as `YYYY-MM-DD`. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The default As-of Date: the last Monday–Friday of the previous calendar
 * month (including January → December of the previous year). Weekends are
 * skipped; public holidays are intentionally not modelled.
 */
export function defaultAsOfDate(now: Date = new Date()): string {
  // Day 0 of the current month is the last day of the previous month. This
  // avoids month-length and leap-year special cases (31/30/29/28).
  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
  let candidate = lastDay;
  while (candidate.getDay() === 0 || candidate.getDay() === 6) {
    candidate = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate() - 1);
  }
  return toIsoDate(candidate);
}

/** True when `value` is a real calendar date in strict ISO `YYYY-MM-DD` form. */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Round-trip through UTC so 2026-02-30 or 2025-02-29 are rejected.
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Normalise an untrusted wire date. Returns `null` for anything that is not a
 * real ISO calendar date; callers should surface the backend value rather than
 * silently inventing a date.
 */
export function normaliseIsoDate(value: unknown): string | null {
  return typeof value === "string" && isValidIsoDate(value) ? value : null;
}

/** Human-friendly date for read-only labels; leaves invalid values untouched. */
export function formatIsoDate(value: string): string {
  if (!isValidIsoDate(value)) return value;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}
