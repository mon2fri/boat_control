import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchableMultiSelect } from "./SearchableMultiSelect";

describe("SearchableMultiSelect family options", () => {
  it("expands and clears a marked family option without storing its synthetic id", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SearchableMultiSelect
        label="Columns"
        options={[
          { value: "id", label: "id" },
          {
            value: "column-family:Ownership",
            label: "Ownership (Column Family)",
            values: ["owner", "delegate"],
          },
        ]}
        selected={[]}
        onChange={onChange}
      />,
    );

    fireEvent.focus(screen.getByRole("searchbox", { name: "Columns" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: /Ownership \(Column Family\)/ }));
    expect(onChange).toHaveBeenLastCalledWith(["owner", "delegate"]);

    rerender(
      <SearchableMultiSelect
        label="Columns"
        options={[{
          value: "column-family:Ownership",
          label: "Ownership (Column Family)",
          values: ["owner", "delegate"],
        }]}
        selected={["owner", "delegate"]}
        onChange={onChange}
      />,
    );
    fireEvent.focus(screen.getByRole("searchbox", { name: "Columns" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: /Ownership \(Column Family\)/ }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
