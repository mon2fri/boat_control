/**
 * Settings page tests. The page must always render something useful, even
 * before Worker A ships the editable `/settings/` endpoint: in that case it
 * shows a clear "not yet available" message and a read-only default view.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsPage } from "./SettingsPage";

function withQuery(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const okSettings = {
  application_name: "Boat Control",
  default_remote_path: "",
  rule_config_path: "config/rules",
  rows_and_columns_config_path: "config/rows_and_columns",
  filter_config_path: "config/filters",
  family_config_path: "config/families",
  full_set_confirmation_rows: 2000,
  run_history_path: "data/results",
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve(JSON.stringify(body)) };
}

afterEach(() => vi.restoreAllMocks());

describe("SettingsPage", () => {
  it("renders a loading state while the settings are loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    withQuery(<SettingsPage />);
    expect(screen.getByRole("status")).toHaveTextContent(/Loading settings/);
    vi.unstubAllGlobals();
  });

  it("shows an error when the settings file cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ detail: "Not found" }, 404)),
    );
    withQuery(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Could not load settings/i),
    );
    vi.unstubAllGlobals();
  });

  it("renders an editable form with the loaded settings", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(okSettings)));
    withQuery(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Application name")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Application name")).toHaveValue("Boat Control");
    expect(screen.getByLabelText("Default Remote Path")).toHaveValue("");
    expect(screen.getByLabelText("Rule Config Path")).toHaveValue("config/rules");
    expect(screen.getByLabelText("Rows and Columns Config Path")).toHaveValue("config/rows_and_columns");
    expect(screen.getByLabelText("Filter Config Path")).toHaveValue("config/filters");
    expect(screen.getByLabelText("Column/Value Family Config Path")).toHaveValue("config/families");
    expect(screen.getByLabelText("Full set confirmation (Rows)")).toHaveValue(2000);
    expect(screen.getByLabelText("Run history Path")).toHaveValue("data/results");
    vi.unstubAllGlobals();
  });

  it("disables Save when nothing has changed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(okSettings)));
    withQuery(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save settings" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
    vi.unstubAllGlobals();
  });

  it("enables Save after the user edits a field and shows an unsaved-changes hint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(okSettings)));
    withQuery(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Application name")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText("Application name"), {
      target: { value: "My Comparator" },
    });
    expect(screen.getByRole("button", { name: "Save settings" })).toBeEnabled();
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("saves all eight settings using the root config wire fields", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(okSettings))
      .mockResolvedValueOnce(jsonResponse({ ...okSettings, application_name: "My Comparator" }));
    vi.stubGlobal("fetch", fetchMock);
    withQuery(<SettingsPage />);
    await waitFor(() => expect(screen.getByLabelText("Application name")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Application name"), {
      target: { value: "My Comparator" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(screen.getByText("Settings saved.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/settings/",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ ...okSettings, application_name: "My Comparator" }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("validates a non-positive threshold and blocks save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(okSettings)));
    withQuery(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Full set confirmation (Rows)")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText("Full set confirmation (Rows)"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(
      screen.getByText(/Full set confirmation \(Rows\) must be a positive integer/),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
