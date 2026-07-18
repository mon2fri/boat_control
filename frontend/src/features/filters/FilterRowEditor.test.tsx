import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithClient } from "../../test/utils";
import { FilterRowEditor } from "./FilterRowEditor";
import type { FilterRow } from "../../api/domain";

const row: FilterRow = { id: "f1", column: "region", operator: "equals", value: "" };

const columnValues = {
  region: [
    { value: "EMEA", starred: false },
    { value: "LEGACY", starred: true },
  ],
};

describe("FilterRowEditor", () => {
  it("blocks selecting a starred (single-file) value", () => {
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

    // Clicking the starred value does not commit it.
    fireEvent.mouseDown(screen.getByRole("option", { name: /LEGACY/ }));
    expect(onChange).not.toHaveBeenCalled();

    // A normal value does commit.
    fireEvent.mouseDown(screen.getByRole("option", { name: "EMEA" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: "EMEA" }));
  });
});
