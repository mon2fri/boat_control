import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SearchableSelect, type SelectOption } from "./SearchableSelect";

const OPTIONS: SelectOption[] = [
  { value: "region", label: "region" },
  { value: "status", label: "status" },
  { value: "amount", label: "amount", starred: true },
];

function open() {
  const input = screen.getByRole("searchbox");
  fireEvent.focus(input);
  return input;
}

describe("SearchableSelect", () => {
  it("filters options by typed query", () => {
    render(<SearchableSelect label="Column" options={OPTIONS} value={null} onChange={() => {}} />);
    const input = open();
    fireEvent.change(input, { target: { value: "stat" } });
    expect(screen.getByRole("option", { name: /status/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /region/ })).not.toBeInTheDocument();
  });

  it("selects an option via keyboard", () => {
    const onChange = vi.fn();
    render(<SearchableSelect label="Column" options={OPTIONS} value={null} onChange={onChange} />);
    const input = open();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("status");
  });

  it("does not select a starred (single-file) value", () => {
    const onChange = vi.fn();
    render(<SearchableSelect label="Value" options={OPTIONS} value={null} onChange={onChange} />);
    const input = open();
    fireEvent.change(input, { target: { value: "amount" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: /amount/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("marks starred options as disabled for assistive tech", () => {
    render(<SearchableSelect label="Value" options={OPTIONS} value={null} onChange={() => {}} />);
    const input = open();
    fireEvent.change(input, { target: { value: "amount" } });
    expect(screen.getByRole("option", { name: /amount/ })).toHaveAttribute("aria-disabled", "true");
  });
});
