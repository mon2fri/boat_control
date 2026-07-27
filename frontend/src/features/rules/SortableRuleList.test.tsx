import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Rule } from "../../api/domain";
import { SortableRuleList } from "./SortableRuleList";

function rule(index: string, name: string): Rule {
  return {
    index,
    name,
    conditions: [],
    conditionJoin: null,
    conditionGrouping: null,
    groupTree: null,
    logic: {
      id: "l0",
      format: "value",
      column: "status",
      operator: "equals",
      target: "active",
    },
  };
}

const rules = [
  rule("R001", "First"),
  rule("R002", "Second"),
  rule("R003", "Third"),
];

function renderList(onReorder = vi.fn()) {
  render(
    <SortableRuleList
      rules={rules}
      selected={rules.map((item) => item.index)}
      validColumns={["status"]}
      onToggle={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onReorder={onReorder}
    />,
  );
  return onReorder;
}

describe("SortableRuleList", () => {
  it("reorders rules with pointer drag and drop", () => {
    const onReorder = renderList();
    const source = screen.getByRole("button", { name: "Drag to reorder R003 Third" });
    const target = screen.getByText("R001").closest("li")!;

    fireEvent.dragStart(source, {
      dataTransfer: { setData: vi.fn(), effectAllowed: "move" },
    });
    fireEvent.dragOver(target, {
      dataTransfer: { dropEffect: "move" },
    });
    fireEvent.drop(target, {
      dataTransfer: { dropEffect: "move" },
    });

    expect(onReorder).toHaveBeenCalledWith(["R003", "R001", "R002"]);
  });

  it("supports keyboard pickup, movement, and drop", () => {
    const onReorder = renderList();
    const handle = screen.getByRole("button", { name: "Drag to reorder R002 Second" });

    fireEvent.keyDown(handle, { key: " " });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    fireEvent.keyDown(handle, { key: " " });

    expect(onReorder).toHaveBeenCalledWith(["R002", "R001", "R003"]);
  });
});
