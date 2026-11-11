import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RuleEditor } from "./RuleEditor";
import type { GroupNode, LogicClause, Rule, RuleDraft } from "../../api/domain";
import { mapRuleToWireDraft } from "../../api/mapping";
import { ruleDraftRequestSchema } from "../../api/wire";

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
  const group = screen.getByRole("group", { name: `Expectation ${index}` });
  pickColumn(group, column);
  addValue(group, value);
}

function fillTwoOutcomes(): void {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Flag pairs" } });
  fillOutcome(1, "SA Contributory", "Y");
  fireEvent.click(screen.getByRole("button", { name: "+ Add expectation" }));
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
  it("creates a copy preserving conditions and both grouping trees without the source index", () => {
    const conditions = ["c1", "c2", "c3"].map((id) => ({
      id, column: COLUMNS[0]!, operator: "equals" as const, values: ["Y"], value: "Y",
    }));
    const conditionTree: GroupNode = { kind: "or", children: [
      { kind: "and", children: [{ kind: "leaf", conditionId: "c1" }, { kind: "leaf", conditionId: "c2" }] },
      { kind: "leaf", conditionId: "c3" },
    ] };
    const initialRule: Rule = {
      index: "R079", name: "", description: "", conditions,
      conditionJoin: "per_grouping", conditionGrouping: null, groupTree: conditionTree,
      logic: FOUR_OUTCOMES[0]!, logicClauses: FOUR_OUTCOMES,
      logicRelation: "or", logicGroupTree: TWO_GROUPS,
    };
    const before = JSON.stringify(initialRule);
    const { onSave } = setup({ initialRule });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New refinement" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).toHaveBeenCalledOnce();
    const draft = onSave.mock.calls[0]![0];
    expect(draft.index).toBeUndefined();
    expect(draft.conditions).toEqual(conditions);
    expect(draft.groupTree).toEqual(conditionTree);
    expect(draft.logicClauses).toEqual(FOUR_OUTCOMES);
    expect(draft.logicGroupTree).toEqual(TWO_GROUPS);
    expect(JSON.stringify(initialRule)).toBe(before);
  });

  it("requires an explicit relation for multiple outcomes and saves AND", () => {
    const { onSave } = setup();
    fillTwoOutcomes();

    expect(screen.getByTestId("rule-logic-preview").textContent).toContain("Expectation 1");

    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Choose AND, OR, or CUSTOM GROUPS to combine multiple expectations/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Combining expectations with"), {
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
    fireEvent.change(screen.getByLabelText("Combining expectations with"), {
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
    fireEvent.click(screen.getByRole("button", { name: "+ Add expectation" }));
    fillOutcome(2, "SA-CVA Hedge Book", "N");
    fireEvent.click(screen.getByRole("button", { name: "+ Add expectation" }));
    fillOutcome(3, "SA Contributory", "N");
    fireEvent.click(screen.getByRole("button", { name: "+ Add expectation" }));
    fillOutcome(4, "SA-CVA Hedge Book", "Y");

    fireEvent.change(screen.getByLabelText("Combining expectations with"), {
      target: { value: "custom" },
    });

    // Build the first AND group from Expectation 1 + Expectation 2.
    fireEvent.click(screen.getByLabelText(/Expectation 1:/));
    fireEvent.click(screen.getByLabelText(/Expectation 2:/));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    // Separate groups do not assume OR; saving stays blocked until the parent exists.
    fireEvent.click(screen.getByLabelText(/Expectation 3:/));
    fireEvent.click(screen.getByLabelText(/Expectation 4:/));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));
    expect(screen.queryByText("Group 3")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("pick-group:0"));
    fireEvent.click(screen.getByTestId("pick-group:1"));
    fireEvent.change(screen.getByLabelText("Group type"), { target: { value: "or" } });
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    expect(screen.getByText("Group 3")).toBeInTheDocument();
    expect(screen.getByTestId("logic-grouping-preview").textContent).toContain(
      "overall: group 1 OR group 2",
    );

    const preview = screen.getByTestId("rule-logic-preview").textContent ?? "";
    expect(preview).toContain(
      '(Expectation 1: SA Contributory must equal "Y" AND Expectation 2: SA-CVA Hedge Book must equal "N") OR (Expectation 3: SA Contributory must equal "N" AND Expectation 4: SA-CVA Hedge Book must equal "Y")',
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
    fireEvent.change(screen.getByLabelText("Combining expectations with"), {
      target: { value: "and" },
    });
    const previewBefore = screen.getByTestId("rule-logic-preview").textContent;

    fireEvent.click(screen.getByRole("radio", { name: /Column against column/ }));
    expect(
      within(screen.getByRole("status")).getByText(/Column against column supports one expectation/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(/Column against column supports one expectation/i).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("radio", { name: /Value against column/ }));
    expect(screen.getByTestId("rule-logic-preview").textContent).toBe(previewBefore);
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toMatchObject({ logicRelation: "and" });
  });

  it("removes R079's parent group while preserving both child groups for explicit regrouping", () => {
    const rule = {
      index: "R079", name: "Opposite flags", conditions: [], conditionJoin: null,
      conditionGrouping: null, groupTree: null, logic: FOUR_OUTCOMES[0]!,
      logicClauses: FOUR_OUTCOMES, logicRelation: "or", logicGroupTree: TWO_GROUPS,
    } as Rule;
    const { onSave } = setup({ rule });
    fireEvent.click(screen.getByRole("button", { name: "Remove Group 3" }));
    expect(screen.queryByTestId("tree-Group 3")).not.toBeInTheDocument();
    const first = screen.getByTestId("tree-Group 1");
    const second = screen.getByTestId("tree-Group 2");
    expect(first).toHaveTextContent('SA Contributory must equal "Y"');
    expect(first).toHaveTextContent('SA-CVA Hedge Book must equal "N"');
    expect(second).toHaveTextContent('SA Contributory must equal "N"');
    expect(second).toHaveTextContent('SA-CVA Hedge Book must equal "Y"');
    expect(screen.getByRole("checkbox", { name: "Group 1 (AND, 2 members)" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Group 2 (AND, 2 members)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/These groups are not joined/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pick-group:0"));
    fireEvent.click(screen.getByTestId("pick-group:1"));
    fireEvent.change(screen.getByLabelText("Group type"), { target: { value: "or" } });
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0].logicClauses).toEqual(FOUR_OUTCOMES);
    expect(onSave.mock.calls[0]![0].logicGroupTree).toEqual(TWO_GROUPS);
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

    expect(screen.getByTestId("logic-grouping-preview").textContent).toContain(
      "overall: group 1 OR group 2",
    );
    expect(screen.getByTestId("logic-grouping-preview").textContent).toContain(
      "group 1: expectation 1 AND expectation 2",
    );
    expect(screen.getByText("Group 3")).toBeInTheDocument();
    expect(screen.getByTestId("rule-logic-preview").textContent).toContain(
      '(Expectation 1: SA Contributory must equal "Y" AND Expectation 2: SA-CVA Hedge Book must equal "N") OR (Expectation 3: SA Contributory must equal "N" AND Expectation 4: SA-CVA Hedge Book must equal "Y")',
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

    const payload = mapRuleToWireDraft(draft);
    expect(ruleDraftRequestSchema.parse(payload)).toEqual(payload);
    expect(payload.logic_relation).toBe("or");
    expect(payload.logic_clauses).toHaveLength(4);
    expect(payload.logic_grouping_tree).toEqual({
      kind: "or",
      children: [
        { kind: "and", children: [
          { kind: "leaf", conditionId: "c0" },
          { kind: "leaf", conditionId: "c1" },
        ] },
        { kind: "and", children: [
          { kind: "leaf", conditionId: "c2" },
          { kind: "leaf", conditionId: "c3" },
        ] },
      ],
    });
  });

  it("removes all expectation groups, keeps the clauses and blocks save until explicit grouping", () => {
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

    expect(screen.queryByRole("button", { name: /Use single expectation/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove all groups" }));

    expect(screen.getByLabelText("Combining expectations with")).toHaveValue("");
    expect(screen.queryByTestId("logic-grouping-preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("rule-logic-preview").textContent).toContain("Expectation 4");
    expect(screen.getAllByRole("group", { name: /Expectation \d/ })).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Choose AND, OR, or CUSTOM GROUPS to combine multiple expectations/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Combining expectations with"), {
      target: { value: "or" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).toHaveBeenCalledTimes(1);

    const draft = onSave.mock.calls[0]![0] as RuleDraft & {
      logicClauses?: LogicClause[];
      logicRelation?: string;
      logicGroupTree?: GroupNode;
    };
    expect(draft.logicClauses).toEqual(FOUR_OUTCOMES);
    expect(draft.logicRelation).toBe("or");
    expect(draft.logicGroupTree).toBeUndefined();

    const payload = mapRuleToWireDraft(draft);
    expect(payload.logic_relation).toBe("or");
    expect(payload.logic_clauses).toHaveLength(4);
    expect(payload.logic_grouping_tree).toBeUndefined();
  });

  it("edits one R079 expectation and still saves all four clauses with both AND groups", () => {
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

    const firstOutcome = screen.getByRole("group", { name: "Expectation 1" });
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

  it("flags a removed expectation reference and repairs the grouping before saving", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Remove expectation 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/removed or unknown expectation/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove stale expectation references" }));
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
