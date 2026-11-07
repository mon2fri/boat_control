import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CommentaryColumnPicker } from "./CommentaryColumnPicker";

describe("CommentaryColumnPicker", () => {
  it("uses the required label and keeps the ordered selection", () => {
    const onChange = vi.fn();
    render(
      <CommentaryColumnPicker
        columns={["id", "name", "status"]}
        selected={["status", "name"]}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Extra Columns for Commentary Template")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Extra Columns for Commentary Template/ }));
    const selected = screen.getByRole("list", { name: "Selected commentary-template columns" });
    expect(selected).toHaveTextContent("status");
    expect(selected).toHaveTextContent("name");

    fireEvent.click(screen.getByRole("button", { name: "Move name up" }));
    expect(onChange).toHaveBeenCalledWith(["name", "status"]);

    fireEvent.click(screen.getByRole("button", { name: "Move status down" }));
    expect(onChange).toHaveBeenCalledWith(["name", "status"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove name" }));
    expect(onChange).toHaveBeenCalledWith(["status"]);
  });

  it("explains that the selection is independent from the Extra Column setting", () => {
    render(
      <CommentaryColumnPicker columns={["id"]} selected={[]} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Extra Columns for Commentary Template/ }));
    expect(screen.getByText(/independent of the Extra Columns setting/i)).toBeInTheDocument();
  });
});
