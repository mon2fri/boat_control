import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AggregationColumnList } from "./AggregationColumnList";

describe("AggregationColumnList", () => {
  it("renders drag handles with accessible labels", () => {
    render(<AggregationColumnList columns={["status", "region"]} onChange={vi.fn()} />);
    const handles = screen.getAllByRole("button", { name: /Drag to reorder/ });
    expect(handles).toHaveLength(2);
    expect(handles[0]).toHaveAccessibleName("Drag to reorder status");
    expect(handles[1]).toHaveAccessibleName("Drag to reorder region");
  });

  it("renders numbered position labels", () => {
    render(<AggregationColumnList columns={["status", "region"]} onChange={vi.fn()} />);
    expect(screen.getByText("1.")).toBeInTheDocument();
    expect(screen.getByText("2.")).toBeInTheDocument();
  });

  it("renders remove buttons for each column", () => {
    const onChange = vi.fn();
    render(<AggregationColumnList columns={["status", "region"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Remove aggregation column status/ }));
    expect(onChange).toHaveBeenCalledWith(["region"]);
  });

  it("keyboard Space picks up an item", () => {
    render(<AggregationColumnList columns={["status", "region"]} onChange={vi.fn()} />);
    const handle = screen.getAllByRole("button", { name: /Drag to reorder/ })[0]!;
    fireEvent.keyDown(handle, { key: " " });
    expect(handle).toHaveAttribute("aria-pressed", "true");
  });

  it("keyboard Escape cancels dragging", () => {
    render(<AggregationColumnList columns={["status", "region"]} onChange={vi.fn()} />);
    const handle = screen.getAllByRole("button", { name: /Drag to reorder/ })[0]!;
    fireEvent.keyDown(handle, { key: " " });
    expect(handle).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(handle, { key: "Escape" });
    expect(handle).toHaveAttribute("aria-pressed", "false");
  });

  it("keyboard ArrowDown + Space moves an item down", () => {
    const onChange = vi.fn();
    render(<AggregationColumnList columns={["status", "region"]} onChange={onChange} />);
    const handle = screen.getAllByRole("button", { name: /Drag to reorder/ })[0]!;
    fireEvent.keyDown(handle, { key: " " });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    fireEvent.keyDown(handle, { key: " " });
    expect(onChange).toHaveBeenCalledWith(["region", "status"]);
  });

  it("keyboard ArrowUp + Space moves an item up", () => {
    const onChange = vi.fn();
    render(<AggregationColumnList columns={["status", "region"]} onChange={onChange} />);
    const handle = screen.getAllByRole("button", { name: /Drag to reorder/ })[1]!;
    fireEvent.keyDown(handle, { key: " " });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    fireEvent.keyDown(handle, { key: " " });
    expect(onChange).toHaveBeenCalledWith(["region", "status"]);
  });

  it("does not reorder on click without meaningful movement", () => {
    const onChange = vi.fn();
    render(<AggregationColumnList columns={["status", "region"]} onChange={onChange} />);
    const handle = screen.getAllByRole("button", { name: /Drag to reorder/ })[0]!;
    // Just a click, no Space/Enter to pick up
    fireEvent.click(handle);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders aria-live region for announcements", () => {
    const { container } = render(<AggregationColumnList columns={["status"]} onChange={vi.fn()} />);
    const liveRegion = container.querySelector("[aria-live='assertive']");
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveAttribute("aria-atomic", "true");
  });

  it("pointer drag moves last column to first position", () => {
    const onChange = vi.fn();
    render(<AggregationColumnList columns={["status", "region"]} onChange={onChange} />);

    const handles = screen.getAllByRole("button", { name: /Drag to reorder/ });
    const fromHandle = handles[1]!; // region
    const toLi = fromHandle.closest("li")!.parentElement!.children[0] as HTMLElement;

    // Simulate drag start on region, drop on status's position
    fireEvent.dragStart(fromHandle, { dataTransfer: { setData: vi.fn(), effectAllowed: "move" } });
    fireEvent.dragOver(toLi, { dataTransfer: { dropEffect: "move" } });
    fireEvent.drop(toLi, { dataTransfer: { setData: vi.fn() } });

    expect(onChange).toHaveBeenCalledWith(["region", "status"]);
  });

  it("drag handles have correct drag-and-drop attributes", () => {
    render(<AggregationColumnList columns={["status"]} onChange={vi.fn()} />);
    const handle = screen.getByRole("button", { name: /Drag to reorder status/ });
    expect(handle).toHaveAttribute("draggable", "true");
    expect(handle).toHaveAttribute("aria-roledescription", "sortable");
    expect(handle).toHaveAttribute("aria-dropeffect", "move");
  });
});
