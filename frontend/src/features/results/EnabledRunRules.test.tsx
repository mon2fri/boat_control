import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnabledRunRules } from "./EnabledRunRules";
import { useRules } from "../rules/useRules";

vi.mock("../rules/useRules", () => ({ useRules: vi.fn() }));
const mockedRules = vi.mocked(useRules);
function catalog(data: { index: string; name: string; enabled?: boolean }[], flags = {}) {
  mockedRules.mockReturnValue({ data, isPending: false, isError: false, ...flags } as ReturnType<typeof useRules>);
}

beforeEach(() => catalog([]));

describe("EnabledRunRules", () => {
  it("lists every selected rule, including enabled rules outside the visible catalog page", () => {
    catalog([
      { index: "R056", name: "Valid status", enabled: false },
      { index: "R057", name: "Low Score", enabled: true },
      { index: "R079", name: "Opposite flags", enabled: true },
      { index: "R999", name: "Pinned rule from a later page", enabled: true },
    ]);
    render(<EnabledRunRules ruleIndexes={["R079", "R057", "R999"]} />);
    expect(screen.getByRole("heading", { name: "Enabled rules (3)" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "R079 — Opposite flags", "R057 — Low Score", "R999 — Pinned rule from a later page",
    ]);
    expect(screen.queryByText("Valid status")).not.toBeInTheDocument();
  });

  it("explains zero enabled rules", () => {
    render(<EnabledRunRules ruleIndexes={[]} />);
    expect(screen.getByRole("heading", { name: "Enabled rules (0)" })).toBeInTheDocument();
    expect(screen.getByText(/without rule validation/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("retains every submitted index while names load or fail", () => {
    catalog([], { isPending: true });
    const { rerender } = render(<EnabledRunRules ruleIndexes={["R079"]} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("R079 — Loading rule name…");
    catalog([], { isError: true });
    rerender(<EnabledRunRules ruleIndexes={["R079"]} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("R079 — Rule name unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load rule names");
  });
});
