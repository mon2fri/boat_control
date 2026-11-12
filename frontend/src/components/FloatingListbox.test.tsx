import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchableSelect } from "./SearchableSelect";
import { SearchableMultiSelect } from "./SearchableMultiSelect";

describe("shared dropdown dismissal", () => {
  it.each(["single", "multi"] as const)("dismisses a %s menu on outside pointer, focus, and Escape", (kind) => {
    const change = vi.fn();
    render(<>
      {kind === "single"
        ? <SearchableSelect label="Picker" options={[{ value: "A", label: "Alpha" }]} value={null} onChange={change} />
        : <SearchableMultiSelect label="Picker" options={[{ value: "A", label: "Alpha" }]} selected={[]} onChange={change} />}
      <div data-testid="outside">Non-focusable outside area</div><button>Outside button</button>
    </>);
    const input = screen.getByRole("searchbox");
    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toHaveAttribute("popover", "manual");
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.focus(input);
    fireEvent.focusIn(screen.getByRole("button", { name: "Outside button" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.focus(input);
    fireEvent.pointerDown(screen.getByRole("option", { name: /Alpha/ }));
    fireEvent.mouseDown(screen.getByRole("option", { name: /Alpha/ }));
    expect(change).toHaveBeenCalledWith(kind === "single" ? "A" : ["A"]);
    if (kind === "multi") expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});
