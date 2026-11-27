import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExceptionTrackingPage } from "./ExceptionTrackingPage";
import { defaultAsOfDate } from "../lib/asOfDate";

afterEach(() => vi.restoreAllMocks());

const AS_OF = defaultAsOfDate();
const V1 = "CBR1_AAAAAAAAAAAAAAAAAAAA";
const V2 = "CBR1_BBBBBBBBBBBBBBBBBBBB";

const pendingException = {
  exception_id: `${V2}_id_7`,
  exception_rule_identifier: V2,
  rule_index: "R001",
  key_columns: { id: "7" },
  exception_timestamp: "2026-10-30T12:00:00Z",
  exception_commentary: "Known issue carried forward",
  exception_as_of_date: AS_OF,
  exception_first_seen_as_of_date: AS_OF,
  exception_last_seen_as_of_date: AS_OF,
  exception_first_seen_timestamp: "2026-10-30T12:00:00Z",
  exception_last_seen_timestamp: "2026-10-30T12:00:00Z",
  detail_values: {},
  status: "RecertificationRequired",
  recertification_required: true,
  recertification_reason: "Recertification due to rule change",
  carried_from_exception_id: `${V1}_id_7`,
  carried_from_as_of_date: "2026-09-30",
  carried_from_rule_identifier: V1,
  rule_evolution_event_id: "evt-1",
  recertified_at: null,
  revision_token: "evt-1",
};

const commentedException = {
  exception_id: `${V2}_id_9`,
  exception_rule_identifier: V2,
  rule_index: "R001",
  key_columns: { id: "9" },
  exception_timestamp: "2026-10-30T13:00:00Z",
  exception_commentary: "Accepted for v2",
  exception_as_of_date: AS_OF,
  exception_first_seen_as_of_date: AS_OF,
  exception_last_seen_as_of_date: AS_OF,
  detail_values: {},
  status: "Commented",
  revision_token: "",
};

function json(body: unknown, status = 200, ok?: boolean) {
  const resolvedOk = ok ?? (status >= 200 && status < 300);
  return {
    ok: resolvedOk,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function installFetch(options: {
  recertify?: (body: { as_of_date: string; exception_ids: string[] }) => unknown;
  recertifyStatus?: number;
  carryWarnings?: string[];
} = {}) {
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const target = String(url);
    const method = init?.method ?? "GET";
    const body = (
      init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {}
    );
    calls.push({ url: target, method, body });
    if (target.includes("/exception-tracking/dates/")) {
      return Promise.resolve(json({ dates: [AS_OF], default_as_of_date: AS_OF }));
    }
    if (target.includes("/exception-tracking/recertify/")) {
      const status = options.recertifyStatus ?? 200;
      return Promise.resolve(
        json(
          options.recertify
            ? options.recertify(body as { as_of_date: string; exception_ids: string[] })
            : {
                as_of_date: AS_OF,
                accepted: [`${V2}_id_7`],
                already_accepted: [],
                total: 1,
                exceptions: [pendingException],
              },
          status,
        ),
      );
    }
    if (target.includes("/exception-tracking/")) {
      return Promise.resolve(
        json({
          as_of_date: AS_OF,
          exceptions: [pendingException, commentedException],
          total: 2,
          ...(options.carryWarnings ? { carry_warnings: options.carryWarnings } : {}),
        }),
      );
    }
    return Promise.resolve(json({ error: `unexpected ${target}` }, 500));
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExceptionTrackingPage />
    </QueryClientProvider>,
  );
}

describe("ExceptionTrackingPage recertification", () => {
  it("shows a single status with the R marker beside the exception ID", async () => {
    installFetch();
    renderPage();

    const pendingRow = await screen.findByRole("row", { name: new RegExp(`${V2}_id_7`) });
    // The status cell carries exactly one status presentation...
    expect(within(pendingRow).getByText("RecertificationRequired")).toBeInTheDocument();
    expect(within(pendingRow).queryByText("Recertification due to rule change")).not.toBeInTheDocument();
    // ...with the small purple R beside the exception ID. The exact label stays
    // available to assistive tech, with source provenance in the tooltip.
    const markers = within(pendingRow).getAllByRole("img", { name: /Recertification due to rule change/ });
    expect(markers).toHaveLength(1);
    expect(markers[0]).toHaveTextContent("R");
    expect(markers[0]?.getAttribute("title")).toContain("2026-09-30");
    expect(markers[0]?.getAttribute("title")).toContain(`${V1}_id_7`);
    // ...while the commentary column keeps only the carried text.
    const commentaryCell = within(pendingRow).getByText("Known issue carried forward");
    expect(commentaryCell.closest("td")?.textContent).not.toContain("Recertification due to rule change");
    // Nonblank carried text does not hide the pending row or flip it to Commented.
    expect(within(pendingRow).queryByText("Commented")).not.toBeInTheDocument();
  });

  it("supports selection and explicit recertification of unchanged text", async () => {
    const calls = installFetch();
    renderPage();

    const pendingRow = await screen.findByRole("row", { name: new RegExp(`${V2}_id_7`) });
    fireEvent.click(within(pendingRow).getByRole("checkbox", { name: `Select exception ${V2}_id_7` }));
    const recertify = screen.getByRole("button", { name: /Recertify selected \(1\)/ });
    fireEvent.click(recertify);

    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.url === "/api/exception-tracking/recertify/" &&
            call.method === "POST" &&
            JSON.stringify((call.body as { exception_ids: string[] }).exception_ids) === JSON.stringify([`${V2}_id_7`]),
        ),
      ).toBe(true),
    );
    // The request carries IDs plus frozen revision tokens; unchanged text is
    // accepted by selection, never by editing the text.
    const recertifyCall = calls.find((call) => call.url === "/api/exception-tracking/recertify/");
    expect(recertifyCall?.body).toEqual({
      as_of_date: AS_OF,
      exception_ids: [`${V2}_id_7`],
      revision_tokens: { [`${V2}_id_7`]: "evt-1" },
    });
    await waitFor(() => expect(screen.getByText(/Recertified 1 exception/)).toBeInTheDocument());
  });

  it("reports already-accepted repeats without losing them", async () => {
    installFetch({
      recertify: () => ({
        as_of_date: AS_OF,
        accepted: [],
        already_accepted: [`${V2}_id_7`],
        total: 1,
        exceptions: [],
      }),
    });
    renderPage();

    const pendingRow = await screen.findByRole("row", { name: new RegExp(`${V2}_id_7`) });
    fireEvent.click(within(pendingRow).getByRole("checkbox", { name: `Select exception ${V2}_id_7` }));
    fireEvent.click(screen.getByRole("button", { name: /Recertify selected \(1\)/ }));

    await waitFor(() =>
      expect(screen.getByText(/0 exception\(s\) \(1 already accepted\)/)).toBeInTheDocument(),
    );
  });

  it("keeps the selection on a failed recertification and reports the failure", async () => {
    installFetch({
      recertifyStatus: 400,
      recertify: () => ({ error: "Unknown exception IDs." }),
    });
    renderPage();

    const pendingRow = await screen.findByRole("row", { name: new RegExp(`${V2}_id_7`) });
    fireEvent.click(within(pendingRow).getByRole("checkbox", { name: `Select exception ${V2}_id_7` }));
    fireEvent.click(screen.getByRole("button", { name: /Recertify selected \(1\)/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/rejected and nothing was accepted/));
    // Selection retained so the user can retry after fixing the cause.
    expect(screen.getByRole("button", { name: /Recertify selected \(1\)/ })).toBeInTheDocument();
  });

  it("names the affected IDs for frozen atomic failures", async () => {
    installFetch({
      recertifyStatus: 409,
      recertify: () => ({
        code: "stale_revision_token",
        details: { stale_ids: [`${V2}_id_7`] },
      }),
    });
    renderPage();

    const pendingRow = await screen.findByRole("row", { name: new RegExp(`${V2}_id_7`) });
    fireEvent.click(within(pendingRow).getByRole("checkbox", { name: `Select exception ${V2}_id_7` }));
    fireEvent.click(screen.getByRole("button", { name: /Recertify selected \(1\)/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(new RegExp(`${V2}_id_7`)),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/reload the list/);
    // Atomic failure: the selection is kept for correction and retry.
    expect(screen.getByRole("button", { name: /Recertify selected \(1\)/ })).toBeInTheDocument();
  });

  it("surfaces carry warnings instead of guessing ambiguous predecessors", async () => {
    installFetch({ carryWarnings: ["Ambiguous predecessor for R001; carried nothing."] });
    renderPage();
    await screen.findByRole("row", { name: new RegExp(`${V2}_id_7`) });
    expect(screen.getByText(/Carry warnings:/)).toBeInTheDocument();
    expect(screen.getByText(/Ambiguous predecessor for R001/)).toBeInTheDocument();
  });

  it("explains that uploads never recertify and keeps filename conventions", async () => {    installFetch();
    renderPage();
    await screen.findByRole("row", { name: new RegExp(`${V2}_id_7`) });
    expect(
      screen.getByText(/Uploading commentary text never recertifies carried commentary/),
    ).toBeInTheDocument();
    expect(screen.getByText(/including unchanged text/)).toBeInTheDocument();
  });

  it("describes the Commentary Recertify column semantics", async () => {
    installFetch();
    renderPage();
    await screen.findByRole("row", { name: new RegExp(`${V2}_id_7`) });
    expect(screen.getByText("Commentary Recertify", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/Keep Current accepts the stored/)).toBeInTheDocument();
    expect(screen.getByText(/unchanged text\s*counts as acceptance/)).toBeInTheDocument();
    expect(screen.getByText(/rejects the whole file/)).toBeInTheDocument();
    expect(screen.getByText(/names each affected row/)).toBeInTheDocument();
    expect(screen.getByText(/pending recertification shows via/)).toBeInTheDocument();
  });
});
