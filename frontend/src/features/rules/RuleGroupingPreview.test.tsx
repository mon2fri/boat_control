import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Rule } from "../../api/domain";
import { RuleGroupingPreview } from "./RuleGroupingPreview";

const rule: Rule = {
  index: "R001", name: "Flags", description: "Opposite flags",
  conditions: [
    { id: "c1", column: "system", operator: "equals", values: ["Bloomberg"] },
    { id: "c2", column: "status", operator: "equals", values: ["active"] },
  ],
  conditionJoin: "or", conditionGrouping: null,
  groupTree: { kind: "or", children: [{ kind: "leaf", conditionId: "c1" }, { kind: "leaf", conditionId: "c2" }] },
  logic: { id: "e1", format: "value", column: "sa_flag", operator: "equals", target: "Yes" },
  logicClauses: [
    { id: "e1", format: "value", column: "sa_flag", operator: "equals", target: "Yes" },
    { id: "e2", format: "value", column: "cva_flag", operator: "equals", target: "No" },
  ],
  logicRelation: "and",
  logicGroupTree: { kind: "and", children: [{ kind: "leaf", conditionId: "e1" }, { kind: "leaf", conditionId: "e2" }] },
};

describe("RuleGroupingPreview", () => {
  it("previews both saved trees on hover without exposing editing controls", async () => {
    const before = JSON.stringify(rule);
    render(<RuleGroupingPreview rule={rule} />);
    const eye = screen.getByRole("button", { name: /Preview grouping/ });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(eye);
    const preview = screen.getByRole("tooltip");
    const conditions = within(preview).getByRole("region", { name: "Conditions" });
    const expectations = within(preview).getByRole("region", { name: "Expectations" });
    expect(within(conditions).getByText("OR")).toBeInTheDocument();
    expect(within(conditions).getByText("Condition 1")).toHaveClass("condition-number");
    expect(within(conditions).getByText('system equals "Bloomberg"')).toBeInTheDocument();
    expect(within(conditions).getByText("Group 1")).toHaveClass("group-number");
    expect(within(expectations).getByText("AND")).toBeInTheDocument();
    expect(within(expectations).getByText("Expectation 2")).toHaveClass("condition-number");
    expect(within(expectations).getByText('cva_flag must equal "No"')).toBeInTheDocument();
    expect(within(preview).queryByRole("button")).not.toBeInTheDocument();
    fireEvent.mouseLeave(eye);
    fireEvent.mouseEnter(preview);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseLeave(preview);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    expect(JSON.stringify(rule)).toBe(before);
  });

  it("supports focus and Escape, with an explicit message for an unconditional rule", () => {
    render(<RuleGroupingPreview rule={{ ...rule, conditions: [], conditionJoin: null, groupTree: null }} />);
    const eye = screen.getByRole("button");
    fireEvent.focus(eye);
    expect(screen.getByText("No conditions — applies to all records.")).toBeInTheDocument();
    fireEvent.keyDown(eye, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows broken saved grouping instead of inventing a replacement tree", () => {
    render(<RuleGroupingPreview rule={{ ...rule, groupTree: { kind: "leaf", conditionId: "removed" } }} />);
    fireEvent.mouseEnter(screen.getByRole("button"));
    expect(within(screen.getByRole("region", { name: "Conditions" })).getByRole("alert")).toHaveTextContent(/unknown|removed/i);
  });

  it("describes column comparisons without treating their target as a literal value", () => {
    render(<RuleGroupingPreview rule={{ ...rule, logicClauses: [], logicGroupTree: null,
      logic: { id: "e1", format: "column", column: "score", operator: "equals", target: "score", columnComparisonMode: "comparison_vs_baseline" },
    }} />);
    fireEvent.mouseEnter(screen.getByRole("button"));
    expect(screen.getByText(/same column \[score\] in Baseline/)).toBeInTheDocument();
  });
});
