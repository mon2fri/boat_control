import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExceptionTrackingPage } from "./ExceptionTrackingPage";
import { defaultAsOfDate } from "../lib/asOfDate";

const AS_OF = defaultAsOfDate();

const trackedExceptions = [
  {
    exception_id: `CBR1_00000000000000000000_id_42`,
    exception_rule_identifier: "CBR1_00000000000000000000",
    key_columns: { id: "42" },
    exception_timestamp: "2026-10-30T12:00:00Z",
    exception_commentary: "",
    exception_as_of_date: AS_OF,
    exception_first_seen_as_of_date: AS_OF,
    exception_last_seen_as_of_date: AS_OF,
    exception_first_seen_timestamp: "2026-10-30T12:00:00Z",
    exception_last_seen_timestamp: "2026-10-30T12:00:00Z",
    status: "New",
  },
  {
    exception_id: `CBR1_11111111111111111111_id_7`,
    exception_rule_identifier: "CBR1_11111111111111111111",
    key_columns: "id_7",
    exception_timestamp: "2026-10-30T13:00:00Z",
    exception_commentary: "Known issue",
    exception_as_of_date: AS_OF,
    exception_first_seen_as_of_date: "2026-09-30",
    exception_last_seen_as_of_date: AS_OF,
    status: "Commented",
  },
  {
    exception_id: `CBR1_22222222222222222222_id_9`,
    exception_rule_identifier: "CBR1_22222222222222222222",
    key_columns: ["id", 9],
    exception_timestamp: "2026-10-30T14:00:00Z",
    exception_commentary: "",
    exception_as_of_date: AS_OF,
    exception_first_seen_as_of_date: "2026-09-30",
    exception_last_seen_as_of_date: AS_OF,
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
    for (const header of [
      "Exception ID",
      "Exception Rule Identifier",
      "Key Columns",
      "Exception Timestamp",
      "Exception Commentary",
      "Exception As-of Date",
      "Exception First Seen As-of Date",
      "Exception Last Seen As-of Date",
      "Status",
    ]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(within(table).getByText("id=42")).toBeInTheDocument();
    expect(within(table).getByText("Known issue")).toBeInTheDocument();
    expect(within(table).getByText("NotCommented")).toBeInTheDocument();
    expect(within(table).getByText("Commented")).toBeInTheDocument();
    expect(within(table).getByText("New")).toBeInTheDocument();
  });

  it("defaults to the backend-authoritative date", async () => {
    const fetchMock = installFetch();
    renderPage();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) =>
        String(url).includes(`/exception-tracking/?as_of_date=${AS_OF}`),
      )).toBe(true),
    );
    expect(screen.getByLabelText("As-of Date")).toHaveValue(AS_OF);
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
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  });

  it("rejects a non-XLSX selection before calling the backend", async () => {
    const fetchMock = installFetch();
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
});
