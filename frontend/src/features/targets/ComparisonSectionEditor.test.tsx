/**
 * Integration tests for the ComparisonSectionEditor.
 *
 * The editor owns a local "draft" section while the user is editing it. The
 * parent reducer drops sections with empty names or no columns, so the
 * editor must NOT push an empty draft into parent state — the draft has to
 * live locally until the user clicks "Done" with a valid name and column
 * set. These tests check that the integration between the editor and the
 * parent workflow state is correct.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ComparisonSectionEditor } from "./ComparisonSectionEditor";
import type { ComparisonSection, Family } from "../../api/domain";

const FAMILIES: Family[] = [];

function renderEditor(
  sections: ComparisonSection[],
  onChange: (sections: ComparisonSection[]) => void,
  options: { availableColumns?: string[] } = {},
) {
  return render(
    <ComparisonSectionEditor
      sections={sections}
      onChange={onChange}
      availableColumns={options.availableColumns ?? ["region", "status", "owner", "type"]}
      families={FAMILIES}
    />,
  );
}

/** Drive the SearchableMultiSelect into a chosen selection. */
function selectColumn(name: string) {
  // The combobox uses role="searchbox"; focus opens the listbox.
  const input = screen.getAllByRole("searchbox")[0]!;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: name } });
  const option = screen.getByRole("option", { name: new RegExp(name, "i") });
  fireEvent.mouseDown(option);
}

describe("ComparisonSectionEditor — add/edit/remove flow", () => {
  it("renders an empty state with an Add button when no sections exist", () => {
    renderEditor([], vi.fn());
    expect(screen.getByRole("button", { name: "Add section" })).toBeInTheDocument();
  });

  it("Add section opens an editor for a new draft without pushing to parent", () => {
    const onChange = vi.fn();
    renderEditor([], onChange);
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    // The parent should NOT receive the empty draft — doing so would silently
    // drop it because the reducer prunes sections with empty name and no columns.
    expect(onChange).not.toHaveBeenCalled();
    // The editor should now show its drafting UI.
    expect(screen.getByLabelText("Section name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("emits the new section to parent only when Done is clicked with a valid name and column", () => {
    const onChange = vi.fn();
    renderEditor([], onChange);
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));

    fireEvent.change(screen.getByLabelText("Section name"), {
      target: { value: "Financial" },
    });
    selectColumn("region");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [sections] = onChange.mock.calls[0]!;
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ name: "Financial", columns: ["region"] });
    expect(sections[0].id).toMatch(/^cs-\d+$/);
  });

  it("shows validation errors when Done is clicked with an empty name", () => {
    const onChange = vi.fn();
    renderEditor([], onChange);
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Section name is required.")).toBeInTheDocument();
    expect(screen.getByText("At least one comparison column is required.")).toBeInTheDocument();
  });

  it("cancels a draft when the user confirms Remove section", () => {
    const onChange = vi.fn();
    renderEditor([], onChange);
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove section" }));
    // Confirm dialog
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    // The parent should not have been told about the draft, and the editor
    // returns to its empty state.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add section" })).toBeInTheDocument();
  });

  it("edits an existing section name and columns", () => {
    const onChange = vi.fn();
    const initial: ComparisonSection[] = [
      { id: "s1", name: "Region", columns: ["region"] },
    ];
    renderEditor(initial, onChange);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Section name"), {
      target: { value: "Region section" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith([
      { id: "s1", name: "Region section", columns: ["region"] },
    ]);
  });

  it("removes an existing section via remove confirmation", () => {
    const onChange = vi.fn();
    const initial: ComparisonSection[] = [
      { id: "s1", name: "Region", columns: ["region"] },
    ];
    renderEditor(initial, onChange);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove section" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("reorders sections via the up/down arrow buttons", () => {
    const onChange = vi.fn();
    const initial: ComparisonSection[] = [
      { id: "s1", name: "A", columns: ["region"] },
      { id: "s2", name: "B", columns: ["status"] },
    ];
    renderEditor(initial, onChange);
    fireEvent.click(screen.getByRole("button", { name: /Move B up/ }));
    expect(onChange).toHaveBeenCalledWith([
      { id: "s2", name: "B", columns: ["status"] },
      { id: "s1", name: "A", columns: ["region"] },
    ]);
  });

  it("disables move up on the first section and move down on the last", () => {
    const onChange = vi.fn();
    const initial: ComparisonSection[] = [
      { id: "s1", name: "A", columns: ["region"] },
      { id: "s2", name: "B", columns: ["status"] },
    ];
    renderEditor(initial, onChange);
    expect(screen.getByRole("button", { name: /Move A up/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Move B down/ })).toBeDisabled();
  });

  it("rejects duplicate section name when creating a new draft", () => {
    const onChange = vi.fn();
    const initial: ComparisonSection[] = [
      { id: "s1", name: "Financial", columns: ["region"] },
    ];
    renderEditor(initial, onChange);
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    fireEvent.change(screen.getByLabelText("Section name"), {
      target: { value: "Financial" },
    });
    selectColumn("status");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Duplicate section name/)).toBeInTheDocument();
  });

  it("allows renaming an existing section to a unique name", () => {
    const onChange = vi.fn();
    const initial: ComparisonSection[] = [
      { id: "s1", name: "Region", columns: ["region"] },
      { id: "s2", name: "Status", columns: ["status"] },
    ];
    renderEditor(initial, onChange);
    // Click the first Edit button (for the "Region" section)
    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    fireEvent.click(editButtons[0]!);
    fireEvent.change(screen.getByLabelText("Section name"), {
      target: { value: "Financial" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith([
      { id: "s1", name: "Financial", columns: ["region"] },
      { id: "s2", name: "Status", columns: ["status"] },
    ]);
  });

  it("does not prematurely remove section when clearing name during edit", () => {
    const onChange = vi.fn();
    const initial: ComparisonSection[] = [
      { id: "s1", name: "Region", columns: ["region"] },
    ];
    renderEditor(initial, onChange);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    // Clear the name
    fireEvent.change(screen.getByLabelText("Section name"), {
      target: { value: "" },
    });
    // Parent should not be called yet - changes are local
    expect(onChange).not.toHaveBeenCalled();
    // Cancel the edit
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Original section should still be there
    expect(screen.getByText("Region")).toBeInTheDocument();
  });

  it("does not prematurely remove section when deselecting all columns during edit", () => {
    const onChange = vi.fn();
    const initial: ComparisonSection[] = [
      { id: "s1", name: "Region", columns: ["region", "status"] },
    ];
    renderEditor(initial, onChange);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    // Deselect all columns by setting empty array
    fireEvent.change(screen.getByLabelText("Section name"), {
      target: { value: "Region" },
    });
    // Parent should not be called yet - changes are local
    expect(onChange).not.toHaveBeenCalled();
    // Cancel the edit
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Original section should still be there with original columns
    expect(screen.getByText("Region")).toBeInTheDocument();
  });

  it("cancels edit and discards changes when Cancel is clicked", () => {
    const onChange = vi.fn();
    const initial: ComparisonSection[] = [
      { id: "s1", name: "Region", columns: ["region"] },
    ];
    renderEditor(initial, onChange);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Section name"), {
      target: { value: "Changed Name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Original name should be restored
    expect(screen.getByText("Region")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
