import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaginatedDetailSection } from "./PaginatedDetailSection";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PaginatedDetailSection exception identity", () => {
  it("shows fallback IDs from the real paginated detail wire shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              run_id: "run-1",
              section: "violations",
              offset: 0,
              total: 1,
              has_more: false,
              available_filters: {},
              details: [
                {
                  row_key: "id=A,region=EMEA",
                  key_columns: { id: "A", region: "EMEA" },
                  rule_id: "R001",
                  rule_identifier: "CBR1_00000000000000000001",
                  column: "STATUS",
                  file_a_value: "active",
                  file_b_value: "inactive",
                  violating_column: "STATUS",
                  violating_value: "inactive",
                  extra_values: {},
                  grouping_values: {},
                },
              ],
            }),
          ),
      }),
    );

    render(
      <PaginatedDetailSection
        runId="run-1"
        kind="violation"
        caption="Exception detail rows"
        keyColumnNames={["id", "region"]}
      />,
    );

    expect(await screen.findByRole("columnheader", { name: "Exception ID" })).toBeInTheDocument();
    expect(await screen.findByText("CBR1_00000000000000000001_A_EMEA")).toBeInTheDocument();
  });
});
