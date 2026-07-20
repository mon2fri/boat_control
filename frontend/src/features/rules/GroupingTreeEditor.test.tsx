import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { GroupingTreeEditor } from "./GroupingTreeEditor";
import type { Condition, GroupNode } from "../../api/domain";

function cond(id: string, value: string): Condition {
  return { id, column: `col_${id}`, operator: "equals", value };
}

const ALL_CONDITIONS: Condition[] = [
  cond("c0", "v0"),
  cond("c1", "v1"),
  cond("c2", "v2"),
  cond("c3", "v3"),
];

/**
 * Wraps the editor so onChange calls flow back into `value`, just as the
 * parent RuleEditor would after each interaction. Without this wrapper, the
 * second click in a single test would operate on a stale closure value
 * because the editor is controlled.
 */
function ControlledEditor({ initial = null }: { initial?: GroupNode | null }) {
  const [value, setValue] = useState<GroupNode | null>(initial);
  return (
    <GroupingTreeEditor
      conditions={ALL_CONDITIONS}
      value={value}
      onChange={setValue}
      groupingMode="per_grouping"
    />
  );
}

describe("GroupingTreeEditor (per_grouping) — multi-group behaviour", () => {
  it("renders both root groups when the value already contains two root groups", () => {
    const tree: GroupNode = {
      kind: "or",
      children: [
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "c0" },
            { kind: "leaf", conditionId: "c1" },
          ],
        },
        {
          kind: "and",
          children: [
            { kind: "leaf", conditionId: "c2" },
            { kind: "leaf", conditionId: "c3" },
          ],
        },
      ],
    };
    render(<ControlledEditor initial={tree} />);
    expect(screen.getByText("Group 1")).toBeInTheDocument();
    expect(screen.getByText("Group 2")).toBeInTheDocument();
    // No sibling group was nested into the other: both top-level groups are
    // listed as root fieldsets.
    expect(screen.getAllByRole("list")[0]!.querySelectorAll("fieldset")).toHaveLength(2);
  });

  it("keeps both groups at root after the user creates two disjoint groups", () => {
    render(<ControlledEditor />);

    // Step 1: create Group 1 with c0 + c1
    fireEvent.click(screen.getByLabelText("col_c0 equals v0"));
    fireEvent.click(screen.getByLabelText("col_c1 equals v1"));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    // After step 1, only Group 1 should exist at root.
    expect(screen.getByText("Group 1")).toBeInTheDocument();
    expect(screen.queryByText("Group 2")).not.toBeInTheDocument();

    // Step 2: create Group 2 with c2 + c3
    fireEvent.click(screen.getByLabelText("col_c2 equals v2"));
    fireEvent.click(screen.getByLabelText("col_c3 equals v3"));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    // Both groups now coexist at root — Group 1 must NOT have been
    // silently dropped, nested, or otherwise hidden.
    expect(screen.getByText("Group 1")).toBeInTheDocument();
    expect(screen.getByText("Group 2")).toBeInTheDocument();
  });

  it("splits the create-new-group checklist into Conditions and Existing groups sections", () => {
    const tree: GroupNode = {
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "c0" },
        { kind: "leaf", conditionId: "c1" },
      ],
    };
    render(<ControlledEditor initial={tree} />);

    // Two root-level sections inside the picklist: conditions + existing groups.
    expect(screen.getByTestId("picklist-conditions")).toBeInTheDocument();
    expect(screen.getByTestId("picklist-groups")).toBeInTheDocument();

    // Conditions section lists only the ungrouped conditions (c2, c3).
    const condSection = screen.getByTestId("picklist-conditions");
    expect(within(condSection).getByLabelText("col_c2 equals v2")).toBeInTheDocument();
    expect(within(condSection).getByLabelText("col_c3 equals v3")).toBeInTheDocument();

    // Existing groups section lists the one root group with a nesting warning.
    const groupSection = screen.getByTestId("picklist-groups");
    expect(
      within(groupSection).getByText(/Selecting a group nests it inside the new group/i),
    ).toBeInTheDocument();
    expect(within(groupSection).getByText(/Group 1 \(AND, 2 members\)/)).toBeInTheDocument();
  });

  it("nests an existing group into a new group only when the user explicitly ticks the group checkbox", () => {
    // User explicitly wants to nest: pick one condition + one existing group,
    // both visible side-by-side thanks to the visual separation.
    const tree: GroupNode = {
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "c0" },
        { kind: "leaf", conditionId: "c1" },
      ],
    };
    render(<ControlledEditor initial={tree} />);

    // Tick the existing group checkbox (now in its own section) plus c2.
    fireEvent.click(screen.getByTestId("pick-group:0"));
    fireEvent.click(screen.getByLabelText("col_c2 equals v2"));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    // After nesting, exactly one root fieldset remains at the top of the
    // tree (the new outer wrapper). The original group survives as a nested
    // fieldset inside it, retaining its stable "Group 1" identity.
    const rootList = screen.getAllByRole("list")[0]!;
    const rootFieldsets = rootList.querySelectorAll(":scope > li > fieldset");
    expect(rootFieldsets).toHaveLength(1);
    expect(within(rootFieldsets[0] as HTMLElement).getByTestId("tree-Group 1")).toBeInTheDocument();
    expect(
      within(rootFieldsets[0] as HTMLElement).getByText(/col_c2 equals v2/),
    ).toBeInTheDocument();
    // The outer wrapper now uses the next post-order id ("Group 2"), not the
    // reused "Group 1" — that reassignment was the root of the original bug.
    expect(within(rootFieldsets[0] as HTMLElement).getByText("Group 2")).toBeInTheDocument();
  });

  it("keeps stable group identities across sequential nesting (Group 1 stays Group 1, outer picks up Group 2 / Group 3)", () => {
    // Step 1: create Group 1 (c0 + c1)
    render(<ControlledEditor />);
    fireEvent.click(screen.getByLabelText("col_c0 equals v0"));
    fireEvent.click(screen.getByLabelText("col_c1 equals v1"));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    // After step 1, only Group 1 exists at root.
    expect(screen.getByText("Group 1")).toBeInTheDocument();
    expect(screen.queryByText("Group 2")).not.toBeInTheDocument();

    // Step 2: nest Group 1 with c3 to produce a new outer Group 2.
    fireEvent.click(screen.getByTestId("pick-group:0"));
    fireEvent.click(screen.getByLabelText("col_c2 equals v2"));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    // The picker labelled "Group 1" now refers to the ORIGINAL group (c0+c1),
    // so the picklist entry uses that name. The new outer wrapper is "Group 2".
    expect(screen.getByText("Group 1")).toBeInTheDocument();
    expect(screen.getByText("Group 2")).toBeInTheDocument();

    // Step 3: pick Group 2 (the outer) + c4 to create Group 3, sealing the chain.
    // The picklist is still rooted at the only top-level fieldset, which the
    // user now sees correctly as "Group 2".
    fireEvent.click(screen.getByTestId("pick-group:0"));
    fireEvent.click(screen.getByLabelText("col_c3 equals v3"));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    // All three group identities coexist in the DOM.
    expect(screen.getByText("Group 1")).toBeInTheDocument();
    expect(screen.getByText("Group 2")).toBeInTheDocument();
    expect(screen.getByText("Group 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Group 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Group 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Group 3" })).toBeInTheDocument();

    // Step 4 sanity: with every condition used, the only root fieldset is
    // labelled "Group 3" — not the reused "Group 1" the previous build
    // produced. The picklist itself hides because no further groups are
    // possible, but the fieldset name still tells the user which outer
    // wrapper they're looking at.
    const rootList = screen.getAllByRole("list")[0]!;
    const rootFieldsets = rootList.querySelectorAll(":scope > li > fieldset");
    expect(rootFieldsets).toHaveLength(1);
    expect(within(rootFieldsets[0] as HTMLElement).getByText("Group 3")).toBeInTheDocument();
  });

  it("edits only immediate children and removes a group when fewer than two remain", () => {
    const tree: GroupNode = {
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "c0" },
        { kind: "leaf", conditionId: "c1" },
        { kind: "leaf", conditionId: "c2" },
      ],
    };
    render(<ControlledEditor initial={tree} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Group 1" }));
    const group = screen.getByTestId("tree-Group 1");
    expect(within(group).getByRole("button", { name: /Remove col_c0 equals v0 from Group 1/ })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: /Remove col_c1 equals v1 from Group 1/ })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: /Remove col_c2 equals v2 from Group 1/ })).toBeInTheDocument();

    fireEvent.click(within(group).getByRole("button", { name: /Remove col_c0 equals v0 from Group 1/ }));
    expect(screen.getByText("Group 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Group 1" }));
    fireEvent.click(screen.getByRole("button", { name: /Remove col_c1 equals v1 from Group 1/ }));
    expect(screen.queryByText("Group 1")).not.toBeInTheDocument();
  });
});
