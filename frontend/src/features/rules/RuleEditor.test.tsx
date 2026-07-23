import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RuleEditor } from "./RuleEditor";
import type { RuleDraft } from "../../api/domain";

function renderWithQuery(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function setup(props: Partial<React.ComponentProps<typeof RuleEditor>> = {}) {
  const onSave = vi.fn<(draft: RuleDraft) => void>();
  const onCancel = vi.fn();
  renderWithQuery(
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
    const { onSave } = setup({ columns: ["region"] });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Region set" } });
    const logicColumn = screen.getByRole("searchbox", { name: "COLUMN in COMPARISON" });
    fireEvent.focus(logicColumn);
    fireEvent.change(logicColumn, { target: { value: "region" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: "region" }));
    const valueSearch = screen.getByRole("searchbox", { name: "Value" });
    fireEvent.focus(valueSearch);
    fireEvent.change(valueSearch, { target: { value: "EMEA" } });
    fireEvent.keyDown(valueSearch, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const draft = onSave.mock.calls[0]![0];
    expect(draft.name).toBe("Region set");
    expect(draft.logic).toMatchObject({ format: "value", column: "region" });
  });

  it("requires a join once there is more than one condition", () => {
    const { onSave } = setup({ columns: ["a", "c1", "c2", "v1", "v2"] });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "R" } });
    const logicColumn = screen.getByRole("searchbox", { name: "COLUMN in COMPARISON" });
    fireEvent.focus(logicColumn);
    fireEvent.change(logicColumn, { target: { value: "a" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: "a" }));
    const logicValue = screen.getByRole("searchbox", { name: "Value" });
    fireEvent.focus(logicValue);
    fireEvent.change(logicValue, { target: { value: "1" } });
    fireEvent.keyDown(logicValue, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "+ Add condition" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add condition" }));
    // Fill both conditions.
    for (const n of [1, 2]) {
      const group = screen.getByRole("group", { name: `Condition ${n}` });
      const colInput = within(group).getByRole("searchbox", { name: "Column" });
      fireEvent.focus(colInput);
      fireEvent.change(colInput, { target: { value: `c${n}` } });
      fireEvent.mouseDown(within(group).getByRole("option", { name: `c${n}` }));
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

  it("selects multiple values in one condition and keeps them as OR alternatives", () => {
    const { onSave } = setup({
      columns: ["status", "result"],
      columnValues: {
        status: [
          { value: "active", starred: false },
          { value: "pending", starred: false },
        ],
      },
    });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Multiple statuses" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add condition" }));
    const condition = screen.getByRole("group", { name: "Condition 1" });
    const conditionColumn = within(condition).getByRole("searchbox", { name: "Column" });
    fireEvent.focus(conditionColumn);
    fireEvent.change(conditionColumn, { target: { value: "status" } });
    fireEvent.mouseDown(within(condition).getByRole("option", { name: "status" }));
    const valueSearch = within(condition).getByRole("searchbox", { name: "Value" });
    fireEvent.focus(valueSearch);
    fireEvent.mouseDown(within(condition).getByRole("option", { name: /active/ }));
    fireEvent.mouseDown(within(condition).getByRole("option", { name: /pending/ }));

    const logicColumn = screen.getByRole("searchbox", { name: "COLUMN in COMPARISON" });
    fireEvent.focus(logicColumn);
    fireEvent.change(logicColumn, { target: { value: "result" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: "result" }));
    const logicRow = logicColumn.closest(".filter-row")!;
    const logicValueSearch = within(logicRow as HTMLElement).getByRole("searchbox", { name: "Value" });
    fireEvent.focus(logicValueSearch);
    fireEvent.change(logicValueSearch, { target: { value: "ok" } });
    fireEvent.keyDown(logicValueSearch, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));

    expect(onSave.mock.calls[0]![0].conditions[0]!.values).toEqual(["active", "pending"]);
    expect(within(condition).getByText(/joined with OR/i)).toBeInTheDocument();
  });

  it("uses unrestricted numeric inputs for greater-than and less-than values", () => {
    setup({ columns: ["score"] });
    fireEvent.click(screen.getByRole("button", { name: "+ Add condition" }));
    const condition = screen.getByRole("group", { name: "Condition 1" });
    const condCol = within(condition).getByRole("searchbox", { name: "Column" });
    fireEvent.focus(condCol);
    fireEvent.change(condCol, { target: { value: "score" } });
    fireEvent.mouseDown(within(condition).getByRole("option", { name: "score" }));
    fireEvent.change(within(condition).getByLabelText("Operator"), { target: { value: "greater_than" } });
    const conditionValue = within(condition).getByLabelText("Value");
    expect(conditionValue).toHaveAttribute("type", "number");
    expect(conditionValue).toHaveAttribute("step", "any");
    fireEvent.change(conditionValue, { target: { value: "-12.5" } });
    expect(conditionValue).toHaveValue(-12.5);

    const logicOperator = screen.getAllByLabelText("Operator").at(-1)!;
    fireEvent.change(logicOperator, { target: { value: "less_than" } });
    expect(document.querySelector("#logic-value")).toHaveAttribute("type", "number");
    expect(document.querySelector("#logic-value")).toHaveAttribute("step", "any");
  });

  it("switches to the column-against-column format", () => {
    setup({ columns: ["col_a"] });
    fireEvent.click(screen.getByRole("radio", { name: /Column against column/ }));
    expect(screen.getByRole("searchbox", { name: "BASELINE COLUMN" })).toBeInTheDocument();
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
    setup({ columns: ["status"] });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Status must be active" } });
    const logicColumn = screen.getByRole("searchbox", { name: "COLUMN in COMPARISON" });
    fireEvent.focus(logicColumn);
    fireEvent.change(logicColumn, { target: { value: "status" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: "status" }));
    const logicValue = screen.getByRole("searchbox", { name: "Value" });
    fireEvent.focus(logicValue);
    fireEvent.change(logicValue, { target: { value: "active" } });
    fireEvent.keyDown(logicValue, { key: "Enter" });
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
