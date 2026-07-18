/**
 * Behavioural tests for the accessible key-column selector. The selector is
 * the only UI surface that lets the user pick record-identity columns; the
 * backend refuses a run when no key columns are supplied, so the UI must
 * make the requirement obvious and guide the user to a valid selection.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { KeyColumnSelector } from "./KeyColumnSelector";

describe("KeyColumnSelector", () => {
  it("prompts the user to pick a key column when none is selected", () => {
    render(
      <KeyColumnSelector columns={["id", "region", "status"]} selected={[]} onChange={() => {}} />,
    );
    expect(screen.getByText(/pick at least one/i)).toBeInTheDocument();
  });

  it("renders selected columns as removable chips with accessible labels", () => {
    render(
      <KeyColumnSelector
        columns={["id", "region", "status"]}
        selected={["id"]}
        onChange={() => {}}
      />,
    );
    const removeBtn = screen.getByRole("button", { name: "Remove key column id" });
    expect(removeBtn).toBeInTheDocument();
  });

  it("invokes onChange with the new array when a column is removed", () => {
    const onChange = vi.fn();
    render(
      <KeyColumnSelector
        columns={["id", "region", "status"]}
        selected={["id", "region"]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove key column id" }));
    expect(onChange).toHaveBeenCalledWith(["region"]);
  });

  it("shows a live validation result for an invalid column", async () => {
    const onValidate = vi.fn();
    render(
      <KeyColumnSelector
        columns={["id", "region"]}
        selected={["id", "missing_col"]}
        onChange={() => {}}
        validation={{ valid: ["id"], invalid: ["missing_col"] }}
        onValidate={onValidate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Validate key columns" }));
    expect(onValidate).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/missing_col/),
    );
  });
});