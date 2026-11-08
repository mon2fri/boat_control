import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithClient } from "../../test/utils";
import { FilterBuilder } from "./FilterBuilder";
import { defaultFilterGrouping, type FilterGrouping } from "./filterGrouping";
import type { FilterRow, GroupNode } from "../../api/domain";

function row(id: string, column: string, value: string): FilterRow {
  return { id, column, operator: "equals", values: [value] };
}

const rows = [
  row("f1", "Book type", "MO"),
  row("f2", "SYSTEM", "Traded Risk"),
  row("f3", "Book type", "FO"),
];

function ControlledBuilder({
  initialRows,
  initialGrouping,
}: {
  initialRows: FilterRow[];
  initialGrouping?: FilterGrouping;
}) {
  const [currentRows, setCurrentRows] = useState(initialRows);
  const [grouping, setGrouping] = useState<FilterGrouping | null>(
    initialGrouping ?? defaultFilterGrouping(initialRows),
  );
  return (
    <FilterBuilder
      columns={["Book type", "SYSTEM"]}
      rows={currentRows}
      columnValues={{}}
      loadingValues={false}
      onChange={setCurrentRows}
      grouping={grouping}
      onGroupingChange={setGrouping}
    />
  );
}

function openFilters() {
  fireEvent.click(screen.getByRole("button", { name: /Row filters/ }));
}

describe("FilterBuilder grouping", () => {
  it("shows the full AND/OR expression and switches relation without losing rows", () => {
    renderWithClient(<ControlledBuilder initialRows={rows.slice(0, 2)} />);
    openFilters();

    const preview = screen.getByTestId("filter-grouping-preview");
    expect(preview.textContent).toContain('Filter 1: Book type equals "MO"');
    expect(preview.textContent).toContain('Filter 2: SYSTEM equals "Traded Risk"');
    expect(preview.textContent).toContain(" AND ");

    fireEvent.change(screen.getByLabelText("Filter grouping"), { target: { value: "or" } });
    expect(screen.getByTestId("filter-grouping-preview").textContent).toContain(" OR ");
    expect(screen.getByTestId("filter-grouping-preview").textContent).toContain("Book type");
  });

  it("requires an explicit relation when a second filter is newly added", () => {
    renderWithClient(
      <ControlledBuilder
        initialRows={rows.slice(0, 1)}
        initialGrouping={{ mode: null, tree: null }}
      />,
    );
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "+ Add filter" }));

    expect(
      screen.getByText(/Choose AND, OR, or CUSTOM GROUPS to combine multiple row filters/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter grouping"), { target: { value: "and" } });
    expect(
      screen.queryByText(/Choose AND, OR, or CUSTOM GROUPS to combine multiple row filters/i),
    ).not.toBeInTheDocument();
  });

  it("flags a removed filter reference and repairs the tree explicitly", () => {
    const tree: GroupNode = {
      kind: "and",
      children: rows.map((item) => ({ kind: "leaf" as const, conditionId: item.id })),
    };
    renderWithClient(
      <ControlledBuilder
        initialRows={rows}
        initialGrouping={{ mode: "custom", tree }}
      />,
    );
    openFilters();

    fireEvent.click(screen.getByRole("button", { name: "Remove filter 2" }));
    expect(
      screen.getByText(/removed or unknown filter clause/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove stale filter references" }));
    const preview = screen.getByTestId("filter-grouping-preview").textContent ?? "";
    expect(preview).toContain('Book type equals "MO"');
    expect(preview).toContain('Book type equals "FO"');
    expect(preview).not.toContain("SYSTEM");
    expect(screen.queryByText(/removed or unknown filter clause/i)).not.toBeInTheDocument();
  });

  it("keeps grouping valid when filters are reordered and updates the flat expression", () => {
    renderWithClient(<ControlledBuilder initialRows={rows.slice(0, 2)} />);
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "Move filter 2 up" }));

    const text = screen.getByTestId("filter-grouping-preview").textContent ?? "";
    expect(text.indexOf("SYSTEM")).toBeLessThan(text.indexOf("Book type"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retains a custom tree across relation mode switches", () => {
    const tree: GroupNode = {
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "f1" },
        { kind: "leaf", conditionId: "f2" },
      ],
    };
    renderWithClient(
      <ControlledBuilder
        initialRows={rows.slice(0, 2)}
        initialGrouping={{ mode: "custom", tree }}
      />,
    );
    openFilters();
    const initialPreview = screen.getByTestId("filter-grouping-preview").textContent;

    fireEvent.change(screen.getByLabelText("Filter grouping"), { target: { value: "and" } });
    fireEvent.change(screen.getByLabelText("Filter grouping"), { target: { value: "custom" } });

    expect(screen.getByTestId("filter-grouping-preview").textContent).toBe(initialPreview);
    expect(screen.getByText("Group 1")).toBeInTheDocument();
  });

  it("documents null and blank semantics for all four filter operators", () => {
    renderWithClient(<ControlledBuilder initialRows={rows.slice(0, 1)} />);
    openFilters();
    const hint = screen.getByText(/Null or blank cells never satisfy/i);
    expect(hint.textContent).toMatch(/equals/);
    expect(hint.textContent).toMatch(/contains/);
    expect(hint.textContent).toMatch(/not equal to/);
    expect(hint.textContent).toMatch(/not contains/);
  });
});
