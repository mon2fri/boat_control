import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExceptionTrackingPage } from "./ExceptionTrackingPage";
import { defaultAsOfDate, formatIsoDate } from "../lib/asOfDate";

const AS_OF = defaultAsOfDate();

const trackedExceptions = [
  {
    exception_id: `CBR1_00000000000000000000_id_42`,
    exception_rule_identifier: "CBR1_00000000000000000000",
    rule_index: "R001",
    key_columns: { id: "42" },
    exception_timestamp: "2026-10-30T12:00:00Z",
    exception_commentary: "",
    exception_as_of_date: AS_OF,
    exception_first_seen_as_of_date: AS_OF,
    exception_last_seen_as_of_date: AS_OF,
    exception_first_seen_timestamp: "2026-10-30T12:00:00Z",
    exception_last_seen_timestamp: "2026-10-30T12:00:00Z",
    detail_values: { region: "EMEA" },
    status: "New",
  },
  {
    exception_id: `CBR1_11111111111111111111_id_7`,
    exception_rule_identifier: "CBR1_11111111111111111111",
    rule_index: "R002",
    key_columns: "id_7",
    exception_timestamp: "2026-10-30T13:00:00Z",
    exception_commentary: "Known issue",
    exception_as_of_date: AS_OF,
    exception_first_seen_as_of_date: "2026-09-30",
    exception_last_seen_as_of_date: AS_OF,
    detail_values: { region: "APAC" },
    status: "Commented",
  },
  {
    exception_id: `CBR1_22222222222222222222_id_9`,
    exception_rule_identifier: "CBR1_22222222222222222222",
    rule_index: "R003",
    key_columns: ["id", 9],
    exception_timestamp: "2026-10-30T14:00:00Z",
    exception_commentary: "",
    exception_as_of_date: AS_OF,
    exception_first_seen_as_of_date: "2026-09-30",
    exception_last_seen_as_of_date: AS_OF,
    detail_values: { region: "EMEA" },
    status: "NotCommented",
  },
];

function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function binary(body = "xlsx-bytes") {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="exception_commentary_${AS_OF}.xlsx"`,
    }),
    blob: () => Promise.resolve(new Blob([body])),
    text: () => Promise.resolve(""),
  };
}

interface MockOptions {
  importResponse?: () => Promise<unknown>;
}

function installFetch(options: MockOptions = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const target = String(url);
    const method = init?.method ?? "GET";
    if (target.includes("/exception-tracking/dates/")) {
      return Promise.resolve(json({
        dates: [AS_OF, "2026-09-30"],
        default_as_of_date: AS_OF,
      }));
    }
    if (target.includes("/exception-tracking/export/")) {
      return Promise.resolve(binary());
    }
    if (target.includes("/exception-tracking/import/") && method === "POST") {
      return options.importResponse
        ? options.importResponse()
        : Promise.resolve(json({ as_of_date: AS_OF, updated: 2, message: "Updated 2 exceptions." }));
    }
    if (target.includes("/exception-tracking/?as_of_date=")) {
      return Promise.resolve(json({
        as_of_date: AS_OF,
        detail_columns: ["region"],
        exceptions: trackedExceptions,
      }));
    }
    return Promise.resolve(json({}));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ExceptionTrackingPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ExceptionTrackingPage", () => {
  it("loads the selected date and displays all requested columns plus status", async () => {
    installFetch();
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("table")).toBeInTheDocument(),
    );
    const table = screen.getByRole("table");
    // Leading column is the recertification-selection checkbox, then the data columns.
    const headerCells = within(table).getAllByRole("columnheader");
    expect(headerCells[0]?.querySelector("input[type='checkbox']")).not.toBeNull();
    expect(headerCells.slice(1).map((cell) =>
      cell.querySelector("span")?.textContent?.trim(),
    )).toEqual([
      "Exception ID",
      "Exception Status",
      "Commentary",
      "Rule Index",
    ]);
    expect(within(table).getByText("Known issue")).toBeInTheDocument();
    expect(within(table).getByText("NotCommented")).toBeInTheDocument();
    expect(within(table).getByText("Commented")).toBeInTheDocument();
    expect(within(table).getByText("New")).toBeInTheDocument();
    expect(within(table).getByText("R002")).toBeInTheDocument();
    // Formatting-only columns and selected detail columns start hidden.
    expect(within(table).queryByRole("columnheader", { name: "Key Columns" })).not.toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "region" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/Columns \(4 of 16 visible\)/));
    fireEvent.click(screen.getByRole("checkbox", { name: "Key Columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "region" }));
    expect(within(table).getByText("Key Columns")).toBeInTheDocument();
    expect(within(table).getByText("region")).toBeInTheDocument();
    expect(within(table).getByText("id=42")).toBeInTheDocument();
    expect(within(table).getAllByText("EMEA").length).toBeGreaterThan(0);
    // Standard metadata keeps its canonical order before appended detail columns.
    const headers = within(table).getAllByRole("columnheader").map((cell) =>
      cell.querySelector("span")?.textContent?.trim(),
    );
    expect(headers.indexOf("Rule Index")).toBeLessThan(headers.indexOf("Key Columns"));
    expect(headers.indexOf("Key Columns")).toBeLessThan(headers.indexOf("region"));
  });

  it("defaults to the backend-authoritative date", async () => {
    const fetchMock = installFetch();
    renderPage();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) =>
        String(url).includes(`/exception-tracking/?as_of_date=${AS_OF}`),
      )).toBe(true),
    );
    expect(
      screen.getByRole("button", { name: new RegExp(`As-of Date, selected`) }),
    ).toHaveTextContent(formatIsoDate(AS_OF));
  });

  it("downloads the selected-date commentary template", async () => {
    const fetchMock = installFetch();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:template");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    renderPage();
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Download commentary template" }));
    await waitFor(() =>
      expect(screen.getByText(/Downloaded exception_commentary/)).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/exception-tracking/export/?as_of_date=${AS_OF}`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(click).toHaveBeenCalled();
  });

  it("uploads a valid workbook and refreshes the list", async () => {
    const fetchMock = installFetch();
    renderPage();
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

    const input = screen.getByLabelText("Upload completed commentary template (.xlsx)");
    fireEvent.change(input, {
      target: { files: [new File(["xlsx"], "commentary.xlsx")] },
    });

    await waitFor(() =>
      expect(screen.getByText(/Updated 2 exceptions/)).toBeInTheDocument(),
    );
    const importCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/exception-tracking/import/"),
    );
    expect(importCall).toBeDefined();
    expect((importCall![1] as RequestInit).method).toBe("POST");
    const data = (importCall![1] as RequestInit).body as FormData;
    expect(data.get("as_of_date")).toBe(AS_OF);
    expect((data.get("file") as File).name).toBe("commentary.xlsx");
  });

  it("shows the server validation error and does not claim success", async () => {
    installFetch({
      importResponse: () =>
        Promise.resolve(json({ error: "Unknown exception ID: MISSING_ID" }, 400)),
    });
    renderPage();
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Upload completed commentary template (.xlsx)"), {
      target: { files: [new File(["xlsx"], "commentary.xlsx")] },
    });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /rejected: Unknown exception ID: MISSING_ID/,
      ),
    );
    expect(screen.queryByText(/Updated \d+ exceptions/)).not.toBeInTheDocument();
  });

  it("names each affected row for invalid Commentary Recertify values", async () => {
    installFetch({
      importResponse: () =>
        Promise.resolve(json({
          code: "invalid_recertification_selection",
          error: "Invalid Commentary Recertify selection.",
          details: {
            invalid_rows: [
              { row: 5, exception_id: "CBR1_00000000000000000000_id_42", value: "Bogus" },
              { row: 9, exception_id: "CBR1_11111111111111111111_id_7", value: "" },
            ],
          },
        }, 400)),
    });
    renderPage();
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Upload completed commentary template (.xlsx)"), {
      target: { files: [new File(["xlsx"], "commentary.xlsx")] },
    });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Invalid Commentary Recertify values: row 5 CBR1_00000000000000000000_id_42 value "Bogus"; row 9 CBR1_11111111111111111111_id_7 value ""/,
      ),
    );
    // The whole file is rejected: no success summary is shown.
    expect(screen.queryByText(/Updated \d+ exceptions/)).not.toBeInTheDocument();
  });

  it("rejects a non-XLSX selection before calling the backend", async () => {    const fetchMock = installFetch();
    renderPage();
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    const before = fetchMock.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Upload completed commentary template (.xlsx)"), {
      target: { files: [new File(["csv"], "commentary.csv")] },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/\.xlsx file/);
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("shows a clear empty state when the date has no exceptions", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const target = String(url);
      if (target.includes("/exception-tracking/dates/")) {
        return Promise.resolve(json({ dates: [], default_as_of_date: AS_OF }));
      }
      return Promise.resolve(json({ as_of_date: AS_OF, exceptions: [] }));
    }));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`No exceptions are recorded for ${AS_OF}`))).toBeInTheDocument(),
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });


  it("pages the complete date dataset with the allowed page sizes", async () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({
      exception_id: `CBR1_00000000000000000000_${String(index + 1).padStart(3, "0")}`,
      exception_rule_identifier: "CBR1_00000000000000000000",
      rule_index: "R001",
      key_columns: { id: String(index + 1) },
      exception_timestamp: "2026-10-30T12:00:00Z",
      exception_commentary: "",
      exception_as_of_date: AS_OF,
      exception_first_seen_as_of_date: AS_OF,
      exception_last_seen_as_of_date: AS_OF,
      status: "New",
    }));
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const target = String(url);
      if (target.includes("/exception-tracking/dates/")) {
        return Promise.resolve(json({ dates: [AS_OF], default_as_of_date: AS_OF }));
      }
      const params = new URL(target, "http://localhost").searchParams;
      const offset = Number(params.get("offset") ?? 0);
      const limit = Number(params.get("limit") ?? 50);
      const sort = params.get("sort");
      const order = params.get("order") ?? "asc";
      const filterId = params.get("filter_exception_id");
      let filtered = filterId
        ? rows.filter((row) => filterId.split(",").includes(row.exception_id))
        : rows;
      if (sort === "exception_id") {
        filtered = [...filtered].sort((a, b) => order === "desc"
          ? b.exception_id.localeCompare(a.exception_id)
          : a.exception_id.localeCompare(b.exception_id));
      }
      return Promise.resolve(json({
        as_of_date: AS_OF,
        total: filtered.length,
        unfiltered_total: rows.length,
        offset,
        limit,
        has_more: offset + limit < filtered.length,
        sort,
        order,
        detail_columns: [],
        exceptions: filtered.slice(offset, offset + limit),
        available_filters: { exception_id: rows.map((row) => row.exception_id) },
      }));
    }));
    renderPage();
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

    const pageSize = screen.getByLabelText("Rows per page");
    expect(pageSize).toHaveValue("50");
    expect(pageSize.querySelectorAll("option").length).toBe(4);
    expect([...pageSize.querySelectorAll("option")].map((option) => option.textContent)).toEqual([
      "50", "100", "200", "500",
    ]);
    expect(document.querySelectorAll(".exception-tracking-table tbody tr")).toHaveLength(50);
    expect(screen.getByText(/1–50 of 120/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(screen.getByText(/51–100 of 120/)).toBeInTheDocument(),
    );

    fireEvent.change(pageSize, { target: { value: "100" } });
    await waitFor(() =>
      expect(screen.getByText(/1–100 of 120/)).toBeInTheDocument(),
    );

    // Sorting is requested from the server over the complete dataset.
    fireEvent.click(screen.getByRole("button", { name: "Sort by Exception ID" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sort by Exception ID" })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sort by Exception ID" }));
    await waitFor(() => {
      const firstRow = document.querySelector(".exception-tracking-table tbody tr");
      expect(firstRow).toHaveTextContent("_120");
    });

    // Filtering is also server-side over all 120 rows before paging.
    // Column header [0] is the recertification-selection checkbox column.
    const idHeader = screen.getAllByRole("columnheader")[1]!;
    fireEvent.click(within(idHeader).getByText("Filter"));
    fireEvent.click(screen.getByRole("checkbox", {
      name: `CBR1_00000000000000000000_119`,
    }));
    await waitFor(() =>
      expect(document.querySelectorAll(".exception-tracking-table tbody tr")).toHaveLength(1),
    );
    expect(document.querySelector(".exception-tracking-table tbody tr")).toHaveTextContent("_119");
  });

  it("restores the four default columns when requested", async () => {
    installFetch();
    renderPage();
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Columns \(4 of 16 visible\)/));
    fireEvent.click(screen.getByRole("checkbox", { name: "Exception Rule Identifier" }));
    fireEvent.click(screen.getByText(/Columns \(5 of 16 visible\)/));
    fireEvent.click(screen.getByRole("button", { name: "Show default columns" }));
    const restored = screen.getAllByRole("columnheader").map((cell) =>
      cell.querySelector("span")?.textContent?.trim(),
    );
    // Leading selection checkbox column carries no labelled header text.
    expect(restored.slice(1)).toEqual([
      "Exception ID", "Exception Status", "Commentary", "Rule Index",
    ]);
  });

  it("selects an older marked date through Other date and loads its no-data state", async () => {
    const dates = Array.from({ length: 12 }, (_, index) => {
      const day = String(30 - index).padStart(2, "0");
      return `2026-10-${day}`;
    });
    const fetchMock = vi.fn((url: string) => {
      const target = String(url);
      if (target.includes("/exception-tracking/dates/")) {
        return Promise.resolve(json({ dates, default_as_of_date: "2026-10-30" }));
      }
      if (target.includes("as_of_date=2026-10-19")) {
        return Promise.resolve(json({ as_of_date: "2026-10-19", exceptions: [] }));
      }
      return Promise.resolve(json({ as_of_date: "2026-10-30", exceptions: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    const trigger = await screen.findByRole("button", { name: /As-of Date, selected/ });
    await waitFor(() => expect(trigger).toHaveTextContent(formatIsoDate("2026-10-30")));
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: /Other date/ }));

    const olderDay = await screen.findByRole("button", {
      name: /19, 2026, has tracking data/,
    });
    fireEvent.click(olderDay);

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/exception-tracking/?as_of_date=2026-10-19"),
      )).toBe(true),
    );
    expect(trigger).toHaveTextContent(formatIsoDate("2026-10-19"));
    await waitFor(() =>
      expect(
        screen.getByText(/No exceptions are recorded for 2026-10-19/),
      ).toBeInTheDocument(),
    );
  });
});
