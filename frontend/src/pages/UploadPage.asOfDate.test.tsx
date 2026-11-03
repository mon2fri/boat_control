import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { UploadPage } from "./UploadPage";
import { WorkflowProvider } from "../state/WorkflowContext";
import { defaultAsOfDate } from "../lib/asOfDate";

const settings = {
  application_name: "Boat Control",
  default_remote_path: "",
  rule_config_path: "config/rules",
  rows_and_columns_config_path: "config/rows_and_columns",
  filter_config_path: "config/filters",
  family_config_path: "config/families",
  full_set_confirmation_rows: 2000,
  run_history_path: "data/results",
  exception_tracking_path: "data/exception_tracking.db",
};

const uploadResponse = {
  session_id: "s1",
  file_a_name: "baseline.csv",
  file_b_name: "candidate.csv",
  file_a_deduplicated: false,
  file_b_deduplicated: false,
  inspection: {
    columns_a: ["id"],
    columns_b: ["id"],
    common_columns: ["id"],
    only_in_a: [],
    only_in_b: [],
  },
};

function json(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function renderUpload() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WorkflowProvider>
        <MemoryRouter>
          <UploadPage />
        </MemoryRouter>
      </WorkflowProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("UploadPage As-of Date", () => {
  it("defaults to the last weekday of the previous month and sends the chosen date with upload", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      void init;
      const target = String(url);
      if (target.includes("/files/upload/")) return Promise.resolve(json(uploadResponse));
      if (target.includes("/settings/")) return Promise.resolve(json(settings));
      if (target.includes("/files/presets/")) return Promise.resolve(json([]));
      if (target.includes("/families/")) return Promise.resolve(json([]));
      if (target.includes("/exception-tracking/dates/")) {
        return Promise.resolve(json({ dates: [], default_as_of_date: defaultAsOfDate() }));
      }
      return Promise.resolve(json({}));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderUpload();

    const dateInput = screen.getByLabelText("As-of Date");
    expect(dateInput).toHaveValue(defaultAsOfDate());

    fireEvent.change(dateInput, { target: { value: "2026-09-30" } });
    expect(dateInput).toHaveValue("2026-09-30");

    fireEvent.change(screen.getByLabelText("First file (baseline)"), {
      target: { files: [new File(["a"], "baseline.csv")] },
    });
    fireEvent.change(screen.getByLabelText("Second file (candidate)"), {
      target: { files: [new File(["b"], "candidate.csv")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect headers" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/files/upload/"))).toBe(true),
    );
    const uploadCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/files/upload/"),
    );
    const formData = (uploadCall![1] as RequestInit).body as FormData;
    expect(formData.get("as_of_date")).toBe("2026-09-30");
  });

  it("blocks upload when the date is empty", () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(json({}))));
    renderUpload();
    const dateInput = screen.getByLabelText("As-of Date");
    fireEvent.change(dateInput, { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("First file (baseline)"), {
      target: { files: [new File(["a"], "baseline.csv")] },
    });
    fireEvent.change(screen.getByLabelText("Second file (candidate)"), {
      target: { files: [new File(["b"], "candidate.csv")] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/valid As-of Date/);
    expect(screen.getByRole("button", { name: "Inspect headers" })).toBeDisabled();
  });
});
