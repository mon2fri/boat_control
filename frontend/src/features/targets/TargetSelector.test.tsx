import { describe, expect, it, vi, afterEach } from "vitest";
import { useState } from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithClient } from "../../test/utils";
import { TargetSelector } from "./TargetSelector";

const COLUMNS = ["region", "status", "amount"];

function Harness({ initial = [] as string[] }) {
  const [selected, setSelected] = useState<string[]>(initial);
  return (
    <TargetSelector
      sessionId="s1"
      columns={COLUMNS}
      selected={selected}
      onChange={setSelected}
    />
  );
}

afterEach(() => vi.restoreAllMocks());

describe("TargetSelector", () => {
  it("excludes already-selected columns from the add list (no duplicates)", () => {
    renderWithClient(<Harness initial={["region"]} />);
    fireEvent.focus(screen.getByRole("searchbox", { name: "Add a target column" }));
    const list = screen.getByRole("listbox", { name: "Add a target column" });
    expect(within(list).queryByRole("option", { name: "region" })).not.toBeInTheDocument();
    expect(within(list).getByRole("option", { name: "status" })).toBeInTheDocument();
  });

  it("reports comma-separated names that are not common columns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              session_id: "s1",
              parsed_columns: ["region", "bogus"],
              valid_columns: ["region"],
              invalid_columns: ["bogus"],
            }),
          ),
      }),
    );
    renderWithClient(<Harness />);
    fireEvent.change(screen.getByLabelText(/comma-separated/), {
      target: { value: "region, bogus" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Validate/ }));

    await waitFor(() =>
      expect(screen.getByText(/Not in common columns: bogus/)).toBeInTheDocument(),
    );
    // The valid column was added as a chip.
    expect(screen.getByRole("list", { name: "Selected target columns" })).toHaveTextContent("region");
    vi.unstubAllGlobals();
  });
});
