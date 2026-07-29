import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
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

function renderList(
  suppliedRules = rules,
  options: Partial<ComponentProps<typeof SortableRuleList>> = {},
) {
  const props = {
    onReorder: vi.fn(),
    onToggle: vi.fn(),
    onToggleAll: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...options,
  };
  const view = render(
    <SortableRuleList
      rules={suppliedRules}
      selected={suppliedRules.map((item) => item.index)}
      validColumns={["status"]}
      {...props}
    />,
  );
  return { ...view, ...props };
}

describe("SortableRuleList", () => {
  it("reorders rules with pointer drag and drop", () => {
    const { onReorder } = renderList();
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
    const { onReorder } = renderList();
    const handle = screen.getByRole("button", { name: "Drag to reorder R002 Second" });

    fireEvent.keyDown(handle, { key: " " });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    fireEvent.keyDown(handle, { key: " " });

    expect(onReorder).toHaveBeenCalledWith(["R002", "R001", "R003"]);
  });

  it("paginates rules in groups of ten and navigates between pages", () => {
    const manyRules = Array.from({ length: 12 }, (_, index) =>
      rule(`R${String(index + 1).padStart(3, "0")}`, `Rule ${index + 1}`),
    );
    renderList(manyRules);

    expect(screen.getByText("R010")).toBeInTheDocument();
    expect(screen.queryByText("R011")).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("R011")).toBeInTheDocument();
    expect(screen.queryByText("R001")).not.toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("clamps the active page when the rule list shrinks", () => {
    const manyRules = Array.from({ length: 12 }, (_, index) =>
      rule(`R${String(index + 1).padStart(3, "0")}`, `Rule ${index + 1}`),
    );
    const { rerender } = renderList(manyRules);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    rerender(
      <SortableRuleList
        rules={manyRules.slice(0, 3)}
        selected={[]}
        validColumns={["status"]}
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByText("R001")).toBeInTheDocument();
    expect(screen.queryByText(/Page 2 of 1/)).not.toBeInTheDocument();
  });

  it("selects and deselects every rule, including rules on other pages", () => {
    const manyRules = Array.from({ length: 12 }, (_, index) =>
      rule(`R${String(index + 1).padStart(3, "0")}`, `Rule ${index + 1}`),
    );
    const onToggleAll = vi.fn();
    const { rerender } = renderList(manyRules, { selected: [], onToggleAll });

    const checkbox = screen.getByRole("checkbox", { name: "Select all" });
    fireEvent.click(checkbox);
    expect(onToggleAll).toHaveBeenLastCalledWith(manyRules.map((item) => item.index));

    // Rerender in the fully selected state to exercise the inverse action.
    rerender(
      <SortableRuleList
        rules={manyRules}
        selected={manyRules.map((item) => item.index)}
        validColumns={["status"]}
        onToggle={vi.fn()}
        onToggleAll={onToggleAll}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(onToggleAll).toHaveBeenLastCalledWith([]);
  });
});
