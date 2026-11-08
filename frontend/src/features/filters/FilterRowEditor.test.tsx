import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithClient } from "../../test/utils";
import { FilterRowEditor } from "./FilterRowEditor";
import type { FilterRow } from "../../api/domain";

const row: FilterRow = { id: "f1", column: "region", operator: "equals", values: [] };

const columnValues = {
  region: [
    { value: "EMEA", starred: false },
    { value: "LEGACY", starred: true },
  ],
};

describe("FilterRowEditor", () => {
  it("shows a FILTER X label alongside the row controls", () => {
    renderWithClient(
      <FilterRowEditor
        row={row}
        index={1}
        columns={["region", "status"]}
        columnValues={columnValues}
        loadingValues={false}
        onChange={() => {}}
        onRemove={() => {}}
      />,
    );

    const group = screen.getByRole("group", { name: "Filter 2" });
    expect(within(group).getByText("Filter 2")).toBeVisible();
  });

  it("accepts free-text contains fragments that are not in the CSV values", () => {
    const onChange = vi.fn();
    const containsRow: FilterRow = {
      id: "f2",
      column: "region",
      operator: "contains",
      values: [],
    };
    renderWithClient(
      <FilterRowEditor
        row={containsRow}
        index={0}
        columns={["region", "status"]}
        columnValues={columnValues}
        loadingValues={false}
        onChange={onChange}
        onRemove={() => {}}
      />,
    );

    const input = screen.getByRole("searchbox", { name: "Value" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "oomber" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith({ ...containsRow, values: ["oomber"] });
  });

  it("blocks selecting a starred (single-file) value", async () => {
    const onChange = vi.fn();
    renderWithClient(
      <FilterRowEditor
        row={row}
        index={0}
        columns={["region", "status"]}
        columnValues={columnValues}
        loadingValues={false}
        onChange={onChange}
        onRemove={() => {}}
      />,
    );

    fireEvent.focus(screen.getByRole("searchbox", { name: "Value" }));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /LEGACY/ })).toBeInTheDocument();
    });

    const starredOption = screen.getByRole("option", { name: /LEGACY/ });
    expect(starredOption).toHaveAttribute("aria-disabled", "true");

    // Clicking the starred value does not commit it.
    fireEvent.mouseDown(starredOption);
    expect(onChange).not.toHaveBeenCalled();
  });
});
