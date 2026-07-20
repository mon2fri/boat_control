import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { RuleEditor } from "./RuleEditor";
import type { RuleDraft } from "../../api/domain";

function setup(props: Partial<React.ComponentProps<typeof RuleEditor>> = {}) {
  const onSave = vi.fn<(draft: RuleDraft) => void>();
  const onCancel = vi.fn();
  render(
    <RuleEditor
      columns={[]}
      saving={false}
      onSave={onSave}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onSave, onCancel };
}

describe("RuleEditor", () => {
  it("blocks saving and lists validation errors for an empty rule", () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(screen.getByText("Logic needs a column.")).toBeInTheDocument();
  });

  it("saves a valid value-against-column rule", () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Region set" } });
    fireEvent.change(screen.getByLabelText("Column"), { target: { value: "region" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "EMEA" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const draft = onSave.mock.calls[0]![0];
    expect(draft.name).toBe("Region set");
    expect(draft.logic).toMatchObject({ format: "value", column: "region", target: "EMEA" });
  });

  it("requires a join once there is more than one condition", () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "R" } });
    fireEvent.change(screen.getByLabelText("Column"), { target: { value: "a" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add condition" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add condition" }));
    // Fill both conditions.
    for (const n of [1, 2]) {
      const group = screen.getByRole("group", { name: `Condition ${n}` });
      fireEvent.change(within(group).getByLabelText("Column"), { target: { value: `c${n}` } });
      const valueInput = within(group).getByRole("searchbox", { name: "Value" });
      fireEvent.focus(valueInput);
      fireEvent.change(valueInput, { target: { value: `v${n}` } });
      fireEvent.keyDown(valueInput, { key: "Enter" });
    }
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Choose AND, OR, or PER GROUPING/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Combining above conditions with"), { target: { value: "and" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ conditionJoin: "and" }));
  });

  it("switches to the column-against-column format", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: /Column against column/ }));
    expect(screen.getByLabelText("Compared column")).toBeInTheDocument();
  });

  it("guards unsaved changes on cancel", () => {
    const { onCancel } = setup();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "dirty" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Discard dialog is shown; cancel is not fired yet.
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: /Discard unsaved changes/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("previews the logic clause in required-state language (must equal)", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Status must be active" } });
    fireEvent.change(screen.getByLabelText("Column"), { target: { value: "status" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "active" } });
    // The data-testid on the live preview pins the wording. If anyone rewords
    // the editor preview away from required-state phrasing, this assertion
    // fails before the wording reaches the rule list and history views.
    const preview = screen.getByTestId("rule-logic-preview");
    expect(preview.textContent).toMatch(/status must equal "active"/);
  });

  it("help text describes rules as required valid state, not invalid state", () => {
    setup();
    // The collapsed <details> opens on click so the paragraph is in the DOM.
    const details = screen.getByText(/How rules work/i).closest("details");
    expect(details).not.toBeNull();
    const helpText = details!.textContent ?? "";
    // Required-state language is the contract (docs/20260718_contract_rule_evaluation.md §1).
    expect(helpText).toMatch(/required (?:valid )?state/i);
    expect(helpText).toMatch(/must equal/i);
    // Invalid-state language would describe rules the wrong way around; pin
    // its absence so a regression to "matches are violations" wording fails
    // here rather than silently shipping inverted rules to users.
    expect(helpText).not.toMatch(/when (the )?expression (?:is )?true.*violation/i);
  });
});
