import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithClient } from "../../test/utils";
import { NewExceptionsOnlyToggle } from "./NewExceptionsOnlyToggle";
import { TableOfContents } from "./TableOfContents";
import fixture from "../../api/__fixtures__/r079GroupedRunResponse.json";
import { mapRunDocumentToResult } from "../../api/mapping";
import { wireRunDocumentResponseSchema } from "../../api/wire";

describe("round 3 result presentation", () => {
  it("keeps scope interaction but places help beside a result-style title", () => {
    const change = vi.fn();
    renderWithClient(<NewExceptionsOnlyToggle checked onChange={change} />);
    const checkbox = screen.getByRole("checkbox", { name: "New Exceptions Only" });
    expect(checkbox.closest(".scope-title-row")).toHaveClass("results-card-title");
    const hint = screen.getByRole("img", { name: "New Exceptions Only help" });
    expect(hint.parentElement).toBe(checkbox.closest(".scope-title-row"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("commented exceptions are hidden");
    hint.focus();
    expect(hint).toHaveFocus();
    fireEvent.click(checkbox);
    expect(change).toHaveBeenCalledWith(false);
  });

  it("sorts mapped rules and contents links numerically without changing the input", () => {
    const doc = structuredClone(fixture);
    const sample = doc.result.validation.violations_by_rule.R079[0]!;
    doc.result.validation.violations_by_rule = Object.fromEntries(
      ["R100", "R10", "R2"].map((id) => [id, [{ ...sample, rule_id: id }]]),
    ) as typeof doc.result.validation.violations_by_rule;
    const result = mapRunDocumentToResult(wireRunDocumentResponseSchema.parse(doc));
    expect(result.ruleResults.map((r) => r.ruleIndex)).toEqual(["R2", "R10", "R100"]);
    result.ruleResults.reverse(); // Contents also works for a caller with unsorted data.
    renderWithClient(<TableOfContents result={result} />);
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "#overall", "#changes", "#rule-R2", "#rule-R10", "#rule-R100",
    ]);
    expect(result.ruleResults[0]!.ruleIndex).toBe("R100");
  });
});
