import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
