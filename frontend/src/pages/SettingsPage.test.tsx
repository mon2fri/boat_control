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
  preset_source_paths: ["/var/data/presets"],
  rules_config_path: "/var/data/rules.yaml",
  filters_config_path: "/var/data/filters.yaml",
  full_set_threshold: 2000,
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

  it("shows a clear 'not yet available' view when the endpoint is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ detail: "Not found" }, 404)),
    );
    withQuery(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/not yet/i),
    );
    expect(screen.getByText(/Editable settings are not available/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("renders an editable form with the loaded settings", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(okSettings)));
    withQuery(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Preset source path")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Preset source path")).toHaveValue("/var/data/presets");
    expect(screen.getByLabelText("Rules config path")).toHaveValue("/var/data/rules.yaml");
    expect(screen.getByLabelText("Filters config path")).toHaveValue("/var/data/filters.yaml");
    expect(screen.getByLabelText("Full-set confirmation threshold (rows)")).toHaveValue(2000);
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
      expect(screen.getByLabelText("Preset source path")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText("Preset source path"), {
      target: { value: "/var/data/other-presets" },
    });
    expect(screen.getByRole("button", { name: "Save settings" })).toBeEnabled();
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("validates a non-positive threshold and blocks save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(okSettings)));
    withQuery(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Full-set confirmation threshold (rows)")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText("Full-set confirmation threshold (rows)"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(
      screen.getByText(/Full-set confirmation threshold must be a positive integer/),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});