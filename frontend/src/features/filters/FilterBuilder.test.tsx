import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
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

/** Exposes the row state so persistence can be checked without the wire layer. */
function BuilderProbe({ initialRows }: { initialRows: FilterRow[] }) {
  const [currentRows, setCurrentRows] = useState(initialRows);
  const [grouping, setGrouping] = useState<FilterGrouping | null>(
    initialGroupingOrDefault(initialRows),
  );
  return (
    <>
      <FilterBuilder
        columns={["Book type", "SYSTEM"]}
        rows={currentRows}
        columnValues={{}}
        loadingValues={false}
        onChange={setCurrentRows}
        grouping={grouping}
        onGroupingChange={setGrouping}
      />
      <output data-testid="rows-probe">{JSON.stringify(currentRows)}</output>
    </>
  );
}

function initialGroupingOrDefault(currentRows: FilterRow[]): FilterGrouping {
  return defaultFilterGrouping(currentRows);
}

function openFilters() {
  fireEvent.click(screen.getByRole("button", { name: /Row filters/ }));
}

describe("FilterBuilder grouping", () => {
  it("shows hierarchical AND/OR hints and switches relation without losing rows", () => {
    renderWithClient(<ControlledBuilder initialRows={rows.slice(0, 2)} />);
    openFilters();

    const preview = screen.getByTestId("filter-grouping-preview");
    expect(preview.textContent).toContain("overall: filter 1 AND filter 2");
    expect(screen.getByRole("group", { name: "Filter 1" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filter 2" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter grouping"), { target: { value: "or" } });
    expect(screen.getByTestId("filter-grouping-preview").textContent).toContain(
      "overall: filter 1 OR filter 2",
    );
    expect(screen.getByRole("group", { name: "Filter 2" })).toBeInTheDocument();
  });

  it("shows the overall and numbered group lines for a nested custom tree", () => {
    const tree: GroupNode = {
      kind: "or",
      children: [
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "f1" },
            { kind: "leaf", conditionId: "f2" },
          ],
        },
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "f3" },
            { kind: "leaf", conditionId: "f4" },
          ],
        },
      ],
    };
    renderWithClient(
      <ControlledBuilder
        initialRows={[...rows, row("f4", "SYSTEM", "Risk")]}
        initialGrouping={{ mode: "custom", tree }}
      />,
    );
    openFilters();

    expect(screen.getByTestId("filter-grouping-preview").textContent).toContain(
      "overall: group 1 OR group 2",
    );
    expect(screen.getByTestId("filter-grouping-preview").textContent).toContain(
      "group 1: filter 1 AND filter 2",
    );
    expect(screen.getByTestId("filter-grouping-preview").textContent).toContain(
      "group 2: filter 3 AND filter 4",
    );
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
    expect(preview).toContain("overall: filter 1 AND filter 2");
    // The remaining rows are renumbered; the stale SYSTEM reference is gone
    // while the two surviving expressions are still present in the tree.
    expect(screen.getByText(/Book type equals "MO"/)).toBeInTheDocument();
    expect(screen.getByText(/Book type equals "FO"/)).toBeInTheDocument();
    expect(screen.queryByText(/SYSTEM equals/)).not.toBeInTheDocument();
    expect(screen.queryByText(/removed or unknown filter clause/i)).not.toBeInTheDocument();
  });

  it("keeps grouping valid when filters are reordered", () => {
    renderWithClient(<ControlledBuilder initialRows={rows.slice(0, 2)} />);
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "Move filter 2 up" }));

    expect(screen.getByTestId("filter-grouping-preview").textContent).toContain(
      "overall: filter 1 AND filter 2",
    );
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

  it("removes all groups while preserving filters and blocking an implicit AND", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Remove all groups" }));

    expect(screen.getByLabelText("Filter grouping")).toHaveValue("");
    expect(screen.getByTestId("filter-grouping-preview").textContent).toContain(
      "choose AND, OR, or CUSTOM GROUPS",
    );
    expect(
      screen.getByText(/Choose AND, OR, or CUSTOM GROUPS to combine multiple row filters/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filter 1" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filter 2" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filter 3" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("searchbox", { name: "Value" })[0],
    ).toHaveAttribute("placeholder", expect.stringContaining("1 selected"));

    fireEvent.change(screen.getByLabelText("Filter grouping"), { target: { value: "and" } });
    expect(
      screen.queryByText(/Choose AND, OR, or CUSTOM GROUPS to combine multiple row filters/i),
    ).not.toBeInTheDocument();
  });

  it("keeps a free-text contains value through add, save and reload", () => {
    const initialRows: FilterRow[] = [
      { id: "f1", column: "SYSTEM", operator: "contains", values: [] },
    ];
    const first = renderWithClient(<BuilderProbe initialRows={initialRows} />);
    openFilters();

    const valueSearch = screen.getByRole("searchbox", { name: "Value" });
    fireEvent.focus(valueSearch);
    fireEvent.change(valueSearch, { target: { value: "oomber" } });
    fireEvent.keyDown(valueSearch, { key: "Enter" });

    const persisted = JSON.parse(
      screen.getByTestId("rows-probe").textContent ?? "[]",
    ) as FilterRow[];
    expect(persisted).toEqual([
      { id: "f1", column: "SYSTEM", operator: "contains", values: ["oomber"] },
    ]);

    first.unmount();
    renderWithClient(<BuilderProbe initialRows={persisted} />);
    openFilters();
    expect(screen.getByRole("searchbox", { name: "Value" })).toHaveAttribute(
      "placeholder",
      expect.stringContaining("1 selected"),
    );
  });

  it("hides explanatory section hints behind keyboard-accessible icons", () => {
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

    const rowHint = screen.getByLabelText("Row filters help");
    expect(rowHint).toHaveAttribute("tabindex", "0");
    expect(within(rowHint).getByRole("tooltip")).toHaveTextContent(/Null or blank cells never satisfy/i);
    rowHint.focus();
    expect(rowHint).toHaveFocus();

    const groupHint = screen.getByLabelText("Filter groups help");
    expect(groupHint).toHaveAttribute("tabindex", "0");
    expect(within(groupHint).getByRole("tooltip")).toHaveTextContent(/Groups can contain other groups/i);
    expect(document.querySelector(".section-hint")).toBeNull();
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
