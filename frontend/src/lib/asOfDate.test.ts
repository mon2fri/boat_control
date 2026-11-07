import { describe, expect, it } from "vitest";
import {
  defaultAsOfDate,
  formatIsoDate,
  isValidIsoDate,
  normaliseIsoDate,
  toIsoDate,
} from "./asOfDate";

describe("defaultAsOfDate — last weekday of the previous month", () => {
  it("uses the last weekday when the month ends on a weekday", () => {
    // 2026-11-03 → previous month October 2026 ends Saturday 31st → Friday 30th.
    expect(defaultAsOfDate(new Date(2026, 10, 3))).toBe("2026-10-30");
  });

  it("walks back over a weekend at month end", () => {
    // August 2026 ends Monday 31st, so the answer is Monday 31st.
    expect(defaultAsOfDate(new Date(2026, 8, 15))).toBe("2026-08-31");
    // May 2026 ends Sunday 31st → Friday 29th.
    expect(defaultAsOfDate(new Date(2026, 5, 1))).toBe("2026-05-29");
  });

  it("handles January by rolling back into December of the previous year", () => {
    // January 2027: December 2026 ends Thursday 31st.
    expect(defaultAsOfDate(new Date(2027, 0, 1))).toBe("2026-12-31");
    // January 2026: December 2025 ends Wednesday 31st.
    expect(defaultAsOfDate(new Date(2026, 0, 31))).toBe("2025-12-31");
  });

  it("handles a December year-end weekend rollover", () => {
    // January 2022: December 2021 ends Friday 31st.
    expect(defaultAsOfDate(new Date(2022, 0, 1))).toBe("2021-12-31");
    // January 2023: December 2022 ends Saturday 31st → Friday 30th.
    expect(defaultAsOfDate(new Date(2023, 0, 1))).toBe("2022-12-30");
  });

  it("handles leap years and short months", () => {
    // March 2024: February 2024 ends Thursday 29th (leap year).
    expect(defaultAsOfDate(new Date(2024, 2, 10))).toBe("2024-02-29");
    // March 2023: February 2023 ends Tuesday 28th.
    expect(defaultAsOfDate(new Date(2023, 2, 10))).toBe("2023-02-28");
  });

  it("does not depend on the time of day", () => {
    expect(defaultAsOfDate(new Date(2026, 9, 31, 23, 59, 59))).toBe("2026-09-30");
    expect(defaultAsOfDate(new Date(2026, 10, 1, 0, 0, 0))).toBe("2026-10-30");
  });
});

describe("ISO date validation", () => {
  it("accepts real dates and rejects malformed or impossible ones", () => {
    expect(isValidIsoDate("2026-10-30")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("2023-02-29")).toBe(false);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-1-01")).toBe(false);
    expect(isValidIsoDate("30/10/2026")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });

  it("normalises only valid string dates", () => {
    expect(normaliseIsoDate("2026-10-30")).toBe("2026-10-30");
    expect(normaliseIsoDate("2026-10-30T00:00:00Z")).toBeNull();
    expect(normaliseIsoDate(20261030)).toBeNull();
    expect(normaliseIsoDate(null)).toBeNull();
  });

  it("round-trips local calendar dates without a UTC shift", () => {
    expect(toIsoDate(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(toIsoDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("formats valid ISO dates for display", () => {
    expect(formatIsoDate("2026-10-30")).toContain("2026");
    expect(formatIsoDate("not-a-date")).toBe("not-a-date");
  });
});
