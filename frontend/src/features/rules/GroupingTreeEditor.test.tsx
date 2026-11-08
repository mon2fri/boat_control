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
  it.each(["and", "or"] as const)("removes any %s parent without deleting its child groups", (kind) => {
    const tree: GroupNode = { kind, children: [
      { kind: "or", children: [{ kind: "leaf", conditionId: "c0" }, { kind: "leaf", conditionId: "c1" }] },
      { kind: "and", children: [{ kind: "leaf", conditionId: "c2" }, { kind: "leaf", conditionId: "c3" }] },
    ] };
    render(<ControlledEditor initial={tree} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Group 3" }));
    expect(screen.queryByTestId("tree-Group 3")).not.toBeInTheDocument();
    expect(screen.getByTestId("tree-Group 1")).toHaveTextContent("OR");
    expect(screen.getByTestId("tree-Group 2")).toHaveTextContent("AND");
    expect(screen.getByTestId("tree-Group 1")).toHaveTextContent("col_c0 equals v0");
    expect(screen.getByTestId("tree-Group 2")).toHaveTextContent("col_c3 equals v3");
    expect(screen.getByRole("checkbox", { name: "Group 1 (OR, 2 members)" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Group 2 (AND, 2 members)" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("These groups are not joined");
    // A second removal affects only that selected group; the unrelated group remains.
    fireEvent.click(screen.getByRole("button", { name: "Remove Group 1" }));
    expect(screen.getByTestId("tree-Group 1")).toHaveTextContent("col_c2 equals v2");
    expect(screen.getByRole("checkbox", { name: "Condition 1: col_c0 equals v0" })).toBeInTheDocument();
  });

  it("renders the persisted overall OR root above its nested groups", () => {
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
    expect(screen.getAllByText("Group 1")[0]!).toBeInTheDocument();
    expect(screen.getAllByText("Group 2")[0]!).toBeInTheDocument();
    expect(screen.getAllByText("Group 3")[0]!).toBeInTheDocument();

    // The root is rendered, not flattened into a two-group forest: both
    // child groups sit under the overall Group 3 OR node.
    const rootList = screen.getAllByRole("list")[0]!;
    expect(rootList.querySelectorAll(":scope > .group-tree-node--group")).toHaveLength(1);
    const rootNode = rootList.querySelector(":scope > .group-tree-node--group") as HTMLElement;
    expect(rootNode).toHaveAttribute("data-testid", "tree-Group 3");
    expect(within(rootNode).getByRole("button", { name: "Collapse Group 3" }).querySelector(".group-number")).toHaveTextContent("Group 3");
    expect(within(rootNode).getByText("OR")).toBeInTheDocument();
    expect(within(rootNode).getByTestId("tree-Group 1")).toBeInTheDocument();
    expect(within(rootNode).getByTestId("tree-Group 2")).toBeInTheDocument();
    expect(rootList.querySelector("fieldset")).not.toBeInTheDocument();
  });

  it("shows the overall root once two disjoint groups are created", () => {
    render(<ControlledEditor />);

    // Step 1: create Group 1 with c0 + c1
    fireEvent.click(screen.getByLabelText("Condition 1: col_c0 equals v0"));
    fireEvent.click(screen.getByLabelText("Condition 2: col_c1 equals v1"));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    // After step 1, only Group 1 should exist at root.
    expect(screen.getAllByText("Group 1")[0]!).toBeInTheDocument();
    expect(screen.queryByText("Group 2")).not.toBeInTheDocument();

    // Step 2: create Group 2 with c2 + c3
    fireEvent.click(screen.getByLabelText("Condition 3: col_c2 equals v2"));
    fireEvent.click(screen.getByLabelText("Condition 4: col_c3 equals v3"));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    // No implicit parent: both groups remain drafts until explicitly joined.
    expect(screen.getAllByText("Group 1")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Group 2")[0]).toBeInTheDocument();
    expect(screen.queryByText("Group 3")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("These groups are not joined");
    const rootList = screen.getAllByRole("list")[0]!;
    expect(rootList.querySelectorAll(":scope > .group-tree-node--group")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("pick-group:0"));
    fireEvent.click(screen.getByTestId("pick-group:1"));
    fireEvent.change(screen.getByLabelText("Group type"), { target: { value: "or" } });
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));
    expect(screen.getByText("Group 3")).toBeInTheDocument();
    expect(screen.queryByText(/These groups are not joined/)).not.toBeInTheDocument();
    expect(rootList.querySelectorAll(":scope > .group-tree-node--group")).toHaveLength(1);
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
    expect(within(condSection).getByLabelText("Condition 3: col_c2 equals v2")).toBeInTheDocument();
    expect(within(condSection).getByLabelText("Condition 4: col_c3 equals v3")).toBeInTheDocument();

    // Existing groups section lists the one root group with a nesting warning.
    const groupSection = screen.getByTestId("picklist-groups");
    expect(
      within(groupSection).getByText(/Selecting a group nests it inside the new group/i),
    ).toBeInTheDocument();
    expect(within(groupSection).getByRole("checkbox", { name: "Group 1 (AND, 2 members)" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByLabelText("Condition 3: col_c2 equals v2"));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    // After nesting, exactly one root tree node remains at the top. The
    // original group survives as a nested node with its stable identity.
    const rootList = screen.getAllByRole("list")[0]!;
    const rootNodes = rootList.querySelectorAll(":scope > .group-tree-node--group");
    expect(rootNodes).toHaveLength(1);
    expect(within(rootNodes[0] as HTMLElement).getByTestId("tree-Group 1")).toBeInTheDocument();
    expect(
      within(rootNodes[0] as HTMLElement).getByText(/col_c2 equals v2/),
    ).toBeInTheDocument();
    // The outer wrapper now uses the next post-order id ("Group 2"), not the
    // reused "Group 1" — that reassignment was the root of the original bug.
    expect(within(rootNodes[0] as HTMLElement).getByText("Group 2")).toBeInTheDocument();
  });

  it("keeps stable group identities across sequential nesting (Group 1 stays Group 1, outer picks up Group 2 / Group 3)", () => {
    // Step 1: create Group 1 (c0 + c1)
    render(<ControlledEditor />);
    fireEvent.click(screen.getByLabelText("Condition 1: col_c0 equals v0"));
    fireEvent.click(screen.getByLabelText("Condition 2: col_c1 equals v1"));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    // After step 1, only Group 1 exists at root.
    expect(screen.getAllByText("Group 1")[0]!).toBeInTheDocument();
    expect(screen.queryByText("Group 2")).not.toBeInTheDocument();

    // Step 2: nest Group 1 with c3 to produce a new outer Group 2.
    fireEvent.click(screen.getByTestId("pick-group:0"));
    fireEvent.click(screen.getByLabelText("Condition 3: col_c2 equals v2"));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    // The picker labelled "Group 1" now refers to the ORIGINAL group (c0+c1),
    // so the picklist entry uses that name. The new outer wrapper is "Group 2".
    expect(screen.getAllByText("Group 1")[0]!).toBeInTheDocument();
    expect(screen.getAllByText("Group 2")[0]!).toBeInTheDocument();

    // Step 3: pick Group 2 (the outer) + c4 to create Group 3, sealing the chain.
    // The picklist is still rooted at the only top-level fieldset, which the
    // user now sees correctly as "Group 2".
    fireEvent.click(screen.getByTestId("pick-group:0"));
    fireEvent.click(screen.getByLabelText("Condition 4: col_c3 equals v3"));
    fireEvent.click(screen.getByRole("button", { name: /\+\s*Create group/ }));

    // All three group identities coexist in the DOM.
    expect(screen.getAllByText("Group 1")[0]!).toBeInTheDocument();
    expect(screen.getAllByText("Group 2")[0]!).toBeInTheDocument();
    expect(screen.getAllByText("Group 3")[0]!).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Group 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Group 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Group 3" })).toBeInTheDocument();

    // Step 4 sanity: with every condition used, the only root tree node is
    // labelled "Group 3" — not the reused "Group 1" the previous build
    // produced. The picklist itself hides because no further groups are
    // possible, but the fieldset name still tells the user which outer
    // wrapper they're looking at.
    const rootList = screen.getAllByRole("list")[0]!;
    const rootNodes = rootList.querySelectorAll(":scope > .group-tree-node--group");
    expect(rootNodes).toHaveLength(1);
    expect(within(rootNodes[0] as HTMLElement).getByText("Group 3")).toBeInTheDocument();
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
    expect(within(group).getByRole("button", { name: /Remove Condition 1: col_c0 equals v0 from Group 1/ })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: /Remove Condition 2: col_c1 equals v1 from Group 1/ })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: /Remove Condition 3: col_c2 equals v2 from Group 1/ })).toBeInTheDocument();

    fireEvent.click(within(group).getByRole("button", { name: /Remove Condition 1: col_c0 equals v0 from Group 1/ }));
    expect(screen.getAllByText("Group 1")[0]!).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Group 1" }));
    fireEvent.click(screen.getByRole("button", { name: /Remove Condition 2: col_c1 equals v1 from Group 1/ }));
    expect(screen.queryByText("Group 1")).not.toBeInTheDocument();
  });

  it("collapses and expands a group by clicking its name", () => {
    const tree: GroupNode = {
      kind: "and",
      children: [
        { kind: "leaf", conditionId: "c0" },
        { kind: "leaf", conditionId: "c1" },
      ],
    };
    render(<ControlledEditor initial={tree} />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse Group 1" }));
    expect(screen.queryByText(/col_c0 equals v0/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand Group 1" }));
    expect(screen.getByText(/col_c0 equals v0/)).toBeInTheDocument();
  });

  it("shows an overall OR root and disables Remove group for nested groups", () => {
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

    const rootNode = screen.getByTestId("tree-Group 3");
    expect(within(rootNode).getByRole("button", { name: "Remove Group 3" })).toBeEnabled();

    for (const number of [1, 2]) {
      const nested = screen.getByTestId(`tree-Group ${number}`);
      expect(within(nested).getByRole("button", { name: `Remove Group ${number}` })).toBeDisabled();

      const tooltip = `This group is part of group 3, please remove group 3 first to remove this group.`;
      const hint = screen.getByTestId(`nested-remove-hint-Group ${number}`);
      expect(hint).toHaveAttribute("title", tooltip);
      expect(hint).toHaveAttribute("tabindex", "0");
      hint.focus();
      expect(hint).toHaveFocus();
      expect(within(hint).getByRole("tooltip")).toHaveTextContent(tooltip);
    }
  });
});
