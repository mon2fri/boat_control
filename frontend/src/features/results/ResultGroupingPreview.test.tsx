import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RuleResult } from "../../api/domain";
import { OverallGroupingPreview, RuleResultGroupingPreview } from "./ResultGroupingPreview";

const result: RuleResult = {
  ruleIndex: "R079", ruleName: "Saved flags", logicSummary: "legacy expression",
  violationRowCount: 1, violationAttributeCount: 1, details: [],
  conditionClauses: ["Condition 1: status equals 'active'"],
  expectationClauses: ["Expectation 1: sa equals 'Y'", "Expectation 2: cva equals 'N'", "Expectation 3: cva equals 'Y'"],
  conditionGroupings: "",
  expectationGroupings: "Overall: Group 2\nGroup 1: Expectation 1 AND Expectation 2\nGroup 2: Group 1 OR Expectation 3",
};

describe("result grouping previews", () => {
  it("restores exact nested grouping from historical saved hierarchy metadata", () => {
    render(<RuleResultGroupingPreview result={result} />);
    fireEvent.mouseEnter(screen.getByRole("button"));
    const expectations = screen.getByRole("region", { name: "Expectations" });
    expect(within(expectations).getByText("AND")).toBeInTheDocument();
    expect(within(expectations).getByText("OR")).toBeInTheDocument();
    expect(within(expectations).getByText("Group 2")).toHaveClass("group-number");
    expect(within(expectations).getByText("Expectation 3")).toHaveClass("condition-number");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not replace broken historical groups with a flat expression", () => {
    render(<RuleResultGroupingPreview result={{ ...result, expectationGroupings: "Overall: Group 1\nGroup 1: Group 1" }} />);
    fireEvent.mouseEnter(screen.getByRole("button"));
    expect(screen.getByRole("alert")).toHaveTextContent("saved grouping tree is unavailable");
    expect(screen.getByText("Expectation 3")).toBeInTheDocument();
  });

  it("uses saved filter trees and emits compact per-heading data for export", () => {
    render(<OverallGroupingPreview filtersApplied={[
      { id: "f1", column: "status", operator: "equals", values: ["active"] },
      { id: "f2", column: "status", operator: "equals", values: ["inactive"] },
    ]} filtersGroupTree={{ kind: "or", children: [{ kind: "leaf", conditionId: "f1" }, { kind: "leaf", conditionId: "f2" }] }} />);
    const button = screen.getByRole("button");
    const data = JSON.parse(button.getAttribute("data-grouping-preview")!);
    expect(data.sections[0].tree.kind).toBe("or");
    fireEvent.focus(button);
    expect(screen.getByText("Filter 1")).toHaveClass("condition-number");
    expect(screen.getByText("OR")).toBeInTheDocument();
  });
});
