import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SaveDecisionDialog } from "./SaveDecisionDialog";
import type { Rule, RuleDraft } from "../../api/domain";

const original: Rule = {
  index: "R001",
  identifier: "CBR1_AAAAAAAAAAAAAAAAAAAA",
  name: "Region check",
  description: "",
  conditions: [{ id: "c0", column: "region", operator: "equals", values: ["EMEA"], value: "EMEA" }],
  conditionJoin: null,
  conditionGrouping: null,
  groupTree: null,
  logic: { id: "l0", format: "value", column: "status", operator: "equals", target: "active", values: ["active"] },
  extraColumns: [],
  hideComparison: false,
};

const draft: RuleDraft = {
  index: "R001",
  name: "Region check",
  conditions: [{ id: "c0", column: "region", operator: "equals", values: ["APAC"], value: "APAC" }],
  conditionJoin: null,
  conditionGrouping: null,
  groupTree: null,
  logic: { id: "l0", format: "value", column: "status", operator: "equals", target: "active", values: ["active"] },
  extraColumns: [],
  hideComparison: false,
};

const conflict = {
  originalRuleId: "R001",
  originalIdentifier: "CBR1_AAAAAAAAAAAAAAAAAAAA",
  proposedIdentifier: "CBR1_BBBBBBBBBBBBBBBBBBBB",
  extremeChanges: ["conditions_replaced", "expectations_replaced"],
  serverMessage: "Choose whether to modify the current rule or save as new.",
};

function renderDialog(overrides: Partial<Parameters<typeof SaveDecisionDialog>[0]> = {}) {
  const handlers = {
    onModifyCurrent: vi.fn(),
    onSaveAsNew: vi.fn(),
    onBackToEditing: vi.fn(),
    ...overrides,
  };
  render(
    <SaveDecisionDialog
      original={original}
      draft={draft}
      conflict={conflict}
      retrying={false}
      {...handlers}
    />,
  );
  return handlers;
}

describe("SaveDecisionDialog", () => {
  it("shows before/after context, identifiers, and all three choices", () => {
    renderDialog();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Choose whether to modify the current rule or save as new.")).toBeInTheDocument();
    expect(screen.getByText(/None of the original conditions remains/)).toBeInTheDocument();
    expect(screen.getByText(/None of the original expectations remains/)).toBeInTheDocument();
    expect(screen.getByText("CBR1_AAAAAAAAAAAAAAAAAAAA")).toBeInTheDocument();
    expect(screen.getByText("CBR1_BBBBBBBBBBBBBBBBBBBB")).toBeInTheDocument();
    // Before/after clause context.
    expect(screen.getByText(/EMEA/)).toBeInTheDocument();
    expect(screen.getByText(/APAC/)).toBeInTheDocument();
    // Commentary consequence of each choice.
    expect(screen.getByText(/Recertification due to rule change/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Modify current" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as new" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to editing" })).toBeInTheDocument();
  });

  it("retries with the selected decision and keeps the draft on failure", () => {
    const handlers = renderDialog({ retryError: "Source changed meanwhile." });
    expect(screen.getByRole("alert")).toHaveTextContent("Source changed meanwhile.");
    fireEvent.click(screen.getByRole("button", { name: "Modify current" }));
    expect(handlers.onModifyCurrent).toHaveBeenCalledTimes(1);
    expect(handlers.onSaveAsNew).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save as new" }));
    expect(handlers.onSaveAsNew).toHaveBeenCalledTimes(1);
    // The dialog stays open with the draft context intact on failure.
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/APAC/)).toBeInTheDocument();
  });

  it("returns to editing without saving on cancel", () => {
    const handlers = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Back to editing" }));
    expect(handlers.onBackToEditing).toHaveBeenCalledTimes(1);
    expect(handlers.onModifyCurrent).not.toHaveBeenCalled();
    expect(handlers.onSaveAsNew).not.toHaveBeenCalled();
  });

  it("returns to editing on backdrop click or Escape", () => {
    const handlers = renderDialog();
    fireEvent.click(document.querySelector(".dialog-backdrop-hit")!);
    expect(handlers.onBackToEditing).toHaveBeenCalledTimes(1);
  });

  it("returns to editing on Escape", () => {
    const handlers = renderDialog();
    fireEvent.keyDown(document.querySelector(".dialog-backdrop")!, { key: "Escape" });
    expect(handlers.onBackToEditing).toHaveBeenCalledTimes(1);
    expect(handlers.onModifyCurrent).not.toHaveBeenCalled();
    expect(handlers.onSaveAsNew).not.toHaveBeenCalled();
  });

  it("disables decisions while a retry is in flight", () => {
    renderDialog({ retrying: true });
    const saving = screen.getAllByRole("button", { name: "Saving…" });
    expect(saving).toHaveLength(2);
    for (const button of saving) expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back to editing" })).toBeDisabled();
  });
});
