import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithClient } from "../../test/utils";
import { TargetSelector } from "./TargetSelector";

const COLUMNS = ["region", "status", "amount"];

function Harness({ initial = [] as string[] }) {
  const [selected, setSelected] = useState<string[]>(initial);
  return (
    <TargetSelector
      columns={COLUMNS}
      selected={selected}
      onChange={setSelected}
    />
  );
}

describe("TargetSelector", () => {
  it("renders a searchable multi-select for comparing columns", () => {
    renderWithClient(<Harness />);
    expect(screen.getByText("Comparing Columns")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Add columns to compare values" })).toBeInTheDocument();
  });

  it("shows selected columns as removable chips", () => {
    renderWithClient(<Harness initial={["region", "status"]} />);
    const list = screen.getByRole("list", { name: "Selected comparing columns" });
    expect(within(list).getByText("region")).toBeInTheDocument();
    expect(within(list).getByText("status")).toBeInTheDocument();
  });

  it("allows deselecting columns via checkbox multi-select", () => {
    renderWithClient(<Harness initial={["region"]} />);
    fireEvent.focus(screen.getByRole("searchbox", { name: "Add columns to compare values" }));
    // The already-selected column should be checked
    const list = screen.getByRole("listbox", { name: "Add columns to compare values" });
    expect(within(list).getByText("region").closest("[role=option]")).toHaveAttribute("aria-selected", "true");
  });

  it("empty selection means all comparison columns are used", () => {
    renderWithClient(<Harness />);
    expect(screen.queryByRole("list", { name: "Selected comparing columns" })).not.toBeInTheDocument();
    expect(screen.getByText(/all selected comparison columns/)).toBeInTheDocument();
  });
});
