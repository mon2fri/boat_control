import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RuleEditor } from "./RuleEditor";
import type { GroupNode, LogicClause, Rule, RuleDraft } from "../../api/domain";

const COLUMNS = ["SA Contributory", "SA-CVA Hedge Book"];

function renderWithQuery(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function setup(props: Partial<React.ComponentProps<typeof RuleEditor>> = {}) {
  const onSave = vi.fn<(draft: RuleDraft) => void>();
  const onCancel = vi.fn();
  renderWithQuery(
    <RuleEditor
      columns={COLUMNS}
      saving={false}
      onSave={onSave}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onSave, onCancel };
}

function pickColumn(group: HTMLElement, column: string): void {
  const input = within(group).getByRole("searchbox", { name: /COLUMN in COMPARISON/ });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: column } });
  fireEvent.mouseDown(within(group).getByRole("option", { name: column }));
}

function addValue(group: HTMLElement, value: string): void {
  const input = within(group).getByRole("searchbox", { name: "Value" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

function fillOutcome(index: number, column: string, value: string): void {
  const group = screen.getByRole("group", { name: `Outcome ${index}` });
  pickColumn(group, column);
  addValue(group, value);
}

function fillTwoOutcomes(): void {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Flag pairs" } });
  fillOutcome(1, "SA Contributory", "Y");
  fireEvent.click(screen.getByRole("button", { name: "+ Add outcome" }));
  fillOutcome(2, "SA-CVA Hedge Book", "N");
}

function clause(id: string, column: string, value: string): LogicClause {
  return { id, format: "value", column, operator: "equals", target: value, values: [value] };
}

const FOUR_OUTCOMES = [
  clause("l0", "SA Contributory", "Y"),
  clause("l1", "SA-CVA Hedge Book", "N"),
  clause("l2", "SA Contributory", "N"),
  clause("l3", "SA-CVA Hedge Book", "Y"),
];

const TWO_GROUPS: GroupNode = {
  kind: "or",
  children: [
    {
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "l0" },
        { kind: "leaf", conditionId: "l1" },
      ],
    },
    {
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "l2" },
        { kind: "leaf", conditionId: "l3" },
      ],
    },
  ],
};

describe("RuleEditor grouped outcomes", () => {
  it("requires an explicit relation for multiple outcomes and saves AND", () => {
    const { onSave } = setup();
    fillTwoOutcomes();

    expect(screen.getByTestId("rule-logic-preview").textContent).toContain("Outcome 1");

    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Choose AND, OR, or CUSTOM GROUPS to combine multiple expected outcomes/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Combining expected outcomes with"), {
      target: { value: "and" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const draft = onSave.mock.calls[0]![0] as RuleDraft & {
      logicClauses?: LogicClause[];
      logicRelation?: string;
    };
    expect(draft.logicClauses).toHaveLength(2);
    expect(draft.logicClauses?.[0]).toMatchObject({ column: "SA Contributory", values: ["Y"] });
    expect(draft.logicClauses?.[1]).toMatchObject({ column: "SA-CVA Hedge Book", values: ["N"] });
    expect(draft.logicRelation).toBe("and");
    expect(draft.logic).toMatchObject({ column: "SA Contributory", values: ["Y"] });
  }, 15000);

  it("saves a simple OR expression", () => {
    const { onSave } = setup();
    fillTwoOutcomes();
    fireEvent.change(screen.getByLabelText("Combining expected outcomes with"), {
      target: { value: "or" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("rule-logic-preview").textContent).toContain(" OR ");
    expect(onSave.mock.calls[0]![0]).toMatchObject({ logicRelation: "or" });
  });

  it("configures two AND groups joined by OR", () => {
    const { onSave } = setup();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Flag pair groups" } });
    fillOutcome(1, "SA Contributory", "Y");
    fireEvent.click(screen.getByRole("button", { name: "+ Add outcome" }));
    fillOutcome(2, "SA-CVA Hedge Book", "N");
    fireEvent.click(screen.getByRole("button", { name: "+ Add outcome" }));
    fillOutcome(3, "SA Contributory", "N");
    fireEvent.click(screen.getByRole("button", { name: "+ Add outcome" }));
    fillOutcome(4, "SA-CVA Hedge Book", "Y");

    fireEvent.change(screen.getByLabelText("Combining expected outcomes with"), {
      target: { value: "custom" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use all outcomes in an AND group" }));

    // Split the seeded four-member AND group into Outcome 1+2 and Outcome 3+4.
    fireEvent.click(screen.getByRole("button", { name: "Edit Group 1" }));
    fireEvent.click(screen.getByRole("button", { name: /Remove Outcome 4:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Group 1" }));
    fireEvent.click(screen.getByRole("button", { name: /Remove Outcome 3:/ }));

    fireEvent.click(screen.getByLabelText(/Outcome 3:/));
    fireEvent.click(screen.getByLabelText(/Outcome 4:/));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    // Now combine the two existing AND groups into an OR group.
    fireEvent.change(screen.getByLabelText("Group type"), { target: { value: "or" } });
    fireEvent.click(screen.getByTestId("pick-group:0"));
    fireEvent.click(screen.getByTestId("pick-group:1"));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    const preview = screen.getByTestId("rule-logic-preview").textContent ?? "";
    expect(preview).toContain(
      '(Outcome 1: SA Contributory must equal "Y" AND Outcome 2: SA-CVA Hedge Book must equal "N") OR (Outcome 3: SA Contributory must equal "N" AND Outcome 4: SA-CVA Hedge Book must equal "Y")',
    );

    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const draft = onSave.mock.calls[0]![0] as RuleDraft & {
      logicClauses?: LogicClause[];
      logicGroupTree?: GroupNode;
    };
    expect(draft.logicClauses).toHaveLength(4);
    const ids = draft.logicClauses!.map((item) => item.id);
    expect(draft.logicGroupTree).toEqual({
      kind: "or",
      children: [
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: ids[0] },
            { kind: "leaf", conditionId: ids[1] },
          ],
        },
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: ids[2] },
            { kind: "leaf", conditionId: ids[3] },
          ],
        },
      ],
    });
  }, 15000);

  it("blocks column mode with retained outcomes and restores them when switching back", () => {
    const { onSave } = setup();
    fillTwoOutcomes();
    fireEvent.change(screen.getByLabelText("Combining expected outcomes with"), {
      target: { value: "and" },
    });
    const previewBefore = screen.getByTestId("rule-logic-preview").textContent;

    fireEvent.click(screen.getByRole("radio", { name: /Column against column/ }));
    expect(
      within(screen.getByRole("status")).getByText(/Column against column supports one outcome/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(/Column against column supports one outcome/i).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("radio", { name: /Value against column/ }));
    expect(screen.getByTestId("rule-logic-preview").textContent).toBe(previewBefore);
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toMatchObject({ logicRelation: "and" });
  });

  it("loads the existing R079 custom-group rule and saves it unchanged", () => {
    const rule = {
      index: "R079",
      identifier: "CBR1_00000000000000000000",
      name: "UI Flags - opposite Yes No",
      description: "",
      conditions: [],
      conditionJoin: null,
      conditionGrouping: null,
      groupTree: null,
      logic: FOUR_OUTCOMES[0]!,
      logicClauses: FOUR_OUTCOMES,
      logicRelation: "or",
      logicGroupTree: TWO_GROUPS,
    } as Rule;
    const { onSave } = setup({ rule });

    expect(screen.getByTestId("rule-logic-preview").textContent).toContain(
      '(Outcome 1: SA Contributory must equal "Y" AND Outcome 2: SA-CVA Hedge Book must equal "N") OR (Outcome 3: SA Contributory must equal "N" AND Outcome 4: SA-CVA Hedge Book must equal "Y")',
    );
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const draft = onSave.mock.calls[0]![0] as RuleDraft & {
      logicClauses?: LogicClause[];
      logicRelation?: string;
      logicGroupTree?: GroupNode;
    };
    expect(draft.logicClauses).toEqual(FOUR_OUTCOMES);
    expect(draft.logicRelation).toBe("or");
    expect(draft.logicGroupTree).toEqual(TWO_GROUPS);
  });

  it("edits one R079 outcome and still saves all four clauses with both AND groups", () => {
    const rule = {
      index: "R079",
      identifier: "CBR1_00000000000000000000",
      name: "UI Flags - opposite Yes No",
      description: "",
      conditions: [],
      conditionJoin: null,
      conditionGrouping: null,
      groupTree: null,
      logic: FOUR_OUTCOMES[0]!,
      logicClauses: FOUR_OUTCOMES,
      logicRelation: "or",
      logicGroupTree: TWO_GROUPS,
    } as Rule;
    const { onSave } = setup({ rule });

    const firstOutcome = screen.getByRole("group", { name: "Outcome 1" });
    fireEvent.change(within(firstOutcome).getByLabelText("Operator"), {
      target: { value: "not_equals" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const draft = onSave.mock.calls[0]![0] as RuleDraft & {
      logicClauses?: LogicClause[];
      logicRelation?: string;
      logicGroupTree?: GroupNode;
    };
    expect(draft.logicClauses).toHaveLength(4);
    expect(draft.logicClauses?.[0]).toMatchObject({
      column: "SA Contributory",
      operator: "not_equals",
      values: ["Y"],
    });
    expect(draft.logicClauses?.map((clause) => clause.column)).toEqual([
      "SA Contributory",
      "SA-CVA Hedge Book",
      "SA Contributory",
      "SA-CVA Hedge Book",
    ]);
    expect(draft.logicRelation).toBe("or");
    expect(draft.logicGroupTree).toEqual(TWO_GROUPS);
  });

  it("flags a removed outcome reference and repairs the grouping before saving", () => {
    const rule = {
      index: "R011",
      identifier: "CBR1_00000000000000000000",
      name: "Restored groups",
      description: "",
      conditions: [],
      conditionJoin: null,
      conditionGrouping: null,
      groupTree: null,
      logic: FOUR_OUTCOMES[0]!,
      logicClauses: FOUR_OUTCOMES,
      logicRelation: null,
      logicGroupTree: TWO_GROUPS,
    } as Rule;
    const { onSave } = setup({ rule });

    fireEvent.click(screen.getByRole("button", { name: "Remove outcome 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/removed or unknown outcome/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove stale outcome references" }));
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const draft = onSave.mock.calls[0]![0] as RuleDraft & {
      logicClauses?: LogicClause[];
      logicGroupTree?: GroupNode;
    };
    expect(draft.logicClauses).toHaveLength(3);
    expect(draft.logicGroupTree).toEqual({
      kind: "or",
      children: [
        { kind: "leaf", conditionId: "l0" },
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "l2" },
            { kind: "leaf", conditionId: "l3" },
          ],
        },
      ],
    });
  });

  it("documents null and blank semantics for outcomes", () => {
    setup();
    const details = screen.getByText(/How rules work/i).closest("details");
    expect(details?.textContent).toMatch(/Null and blank values/i);
    expect(details?.textContent).toMatch(/never match/i);
    expect(details?.textContent).toMatch(/not equal to/i);
  });
});
