import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AsOfDateSelector } from "./AsOfDateSelector";
import { formatIsoDate, toIsoDate } from "../../lib/asOfDate";

const MANY_DATES = Array.from({ length: 12 }, (_, index) => {
  const day = String(30 - index).padStart(2, "0");
  return `2026-10-${day}`;
});

function renderSelector(
  value = "2026-10-30",
  availableDates: string[] = MANY_DATES,
  onChange = vi.fn(),
) {
  const view = render(
    <AsOfDateSelector value={value} availableDates={availableDates} onChange={onChange} />,
  );
  return { ...view, onChange };
}

function trigger(): HTMLElement {
  return screen.getByRole("button", { name: /As-of Date, selected/ });
}

function openMenu(): HTMLElement {
  fireEvent.click(trigger());
  return screen.getByRole("listbox", { name: "Available As-of Dates" });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AsOfDateSelector — available-date dropdown", () => {
  it("lists only the ten latest available dates, newest first, then Other date", () => {
    const availableDates = [...MANY_DATES].reverse().concat("2026-10-30", "2026-10-19");
    renderSelector("2026-10-30", availableDates);
    const listbox = openMenu();
    const options = within(listbox).getAllByRole("option");
    const expectedDates = [...new Set(availableDates)]
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 10);
    expect(options).toHaveLength(11);
    expect(options.slice(0, 10).map((option) => option.textContent?.trim())).toEqual(
      expectedDates.map(formatIsoDate),
    );
    expect(options[10]).toHaveTextContent(/Other date/);
  });

  it("shows all available dates when fewer than ten exist and keeps Other date last", () => {
    const dates = ["2026-10-30", "2026-09-30", "2026-08-31"];
    renderSelector("2026-10-30", dates);
    const options = within(openMenu()).getAllByRole("option");
    expect(options).toHaveLength(4);
    expect(options.slice(0, 3).map((option) => option.textContent?.trim())).toEqual(
      dates.map(formatIsoDate),
    );
    expect(options[3]).toHaveTextContent(/Other date/);
  });

  it("keeps Other date available when the database has no recorded dates", () => {
    renderSelector("2026-10-30", []);
    const options = within(openMenu()).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent(/Other date/);
  });

  it("selects an available date and closes the menu", () => {
    const { onChange } = renderSelector();
    const listbox = openMenu();
    fireEvent.click(
      within(listbox).getByRole("option", { name: formatIsoDate("2026-10-28") }),
    );
    expect(onChange).toHaveBeenCalledWith("2026-10-28");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports keyboard navigation and Escape without changing the selection", () => {
    const { onChange } = renderSelector();
    const listbox = openMenu();
    const options = within(listbox).getAllByRole("option");
    expect(document.activeElement).toBe(options[0]);

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(options[1]);

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(options[10]);

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger());
  });
});

describe("AsOfDateSelector — calendar via Other date", () => {
  function openCalendar(value = "2026-10-30", availableDates = MANY_DATES) {
    const result = renderSelector(value, availableDates);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("option", { name: /Other date/ }));
    return result;
  }

  it("marks every recorded date, including dates older than the latest ten", async () => {
    openCalendar();
    expect(await screen.findByRole("dialog", { name: "Choose another As-of Date" })).toBeInTheDocument();

    const older = screen.getByRole("button", { name: /19, 2026, has tracking data/ });
    expect(older).toHaveClass("has-data");
    expect(older.querySelector(".date-picker__marker")).not.toBeNull();

    const unrecorded = screen.getByRole("button", { name: /15, 2026, no tracking data/ });
    expect(unrecorded).not.toHaveClass("has-data");
    expect(unrecorded.querySelector(".date-picker__marker")).toBeNull();
  });

  it("distinguishes data, selected and today markers for assistive technology", async () => {
    const today = toIsoDate(new Date());
    openCalendar(today, [today]);
    const day = await screen.findByRole("button", {
      name: /has tracking data, selected, today/,
    });
    expect(day).toHaveClass("has-data", "is-selected", "is-today");
    expect(screen.getByText("Has tracking data")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Selected")).toBeInTheDocument();
  });

  it("selects an older marked date through the calendar", async () => {
    const { onChange } = openCalendar();
    const older = await screen.findByRole("button", {
      name: /19, 2026, has tracking data/,
    });
    fireEvent.click(older);
    expect(onChange).toHaveBeenCalledWith("2026-10-19");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("allows selecting a plain date with no recorded data", async () => {
    const { onChange } = openCalendar();
    const plain = await screen.findByRole("button", {
      name: /15, 2026, no tracking data/,
    });
    fireEvent.click(plain);
    expect(onChange).toHaveBeenCalledWith("2026-10-15");
  });

  it("cancels without changing the selected date", async () => {
    const { onChange } = openCalendar();
    await screen.findByRole("dialog");
    expect(trigger()).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent(formatIsoDate("2026-10-30"));
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes with Escape without changing the selected date", async () => {
    const { onChange } = openCalendar();
    await screen.findByRole("dialog");
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves day focus with arrow keys", async () => {
    openCalendar();
    await screen.findByRole("dialog");
    const selectedDay = screen.getByRole("button", {
      name: /30, 2026, has tracking data, selected/,
    });
    await waitFor(() => expect(document.activeElement).toBe(selectedDay));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /29, 2026, has tracking data/ }),
    );

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    await waitFor(() => {
      expect(document.activeElement).toHaveTextContent(/^5$/);
      expect(document.activeElement).toHaveAttribute(
        "aria-label",
        expect.stringMatching(/no tracking data/),
      );
    });
  });

  it("refreshes calendar markers when the authoritative date list changes", async () => {
    const { rerender } = openCalendar("2026-10-30", ["2026-10-30", "2026-10-19"]);
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: /19, 2026, has tracking data/ })).toBeInTheDocument();

    rerender(
      <AsOfDateSelector
        value="2026-10-30"
        availableDates={["2026-10-30", "2026-10-20"]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /19, 2026, no tracking data/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /20, 2026, has tracking data/ })).toBeInTheDocument();
  });
});
