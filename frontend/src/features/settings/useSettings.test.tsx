import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSaveSettings } from "./useSettings";
import type { AppSettings } from "../../api/domain";

const settings: AppSettings = {
  applicationName: "Boat Control",
  defaultRemotePath: "",
  ruleConfigPath: "config/rules",
  rowsAndColumnsConfigPath: "config/rows_and_columns",
  filterConfigPath: "config/filters",
  familyConfigPath: "config/families",
  fullSetConfirmationRows: 2000,
  runHistoryPath: "data/results",
  exceptionTrackingPath: "data/exception_tracking.db",
};

function json(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useSaveSettings — tracking database switching", () => {
  it("invalidates available dates, calendar markers and loaded tracking rows after save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({
      application_name: settings.applicationName,
      default_remote_path: settings.defaultRemotePath,
      rule_config_path: settings.ruleConfigPath,
      rows_and_columns_config_path: settings.rowsAndColumnsConfigPath,
      filter_config_path: settings.filterConfigPath,
      family_config_path: settings.familyConfigPath,
      full_set_confirmation_rows: settings.fullSetConfirmationRows,
      run_history_path: settings.runHistoryPath,
      exception_tracking_path: "data/other_tracking.db",
    })));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    const { result } = renderHook(() => useSaveSettings(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ ...settings, exceptionTrackingPath: "data/other_tracking.db" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["exception-tracking-dates"] }),
    );
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["exception-tracking"] }),
    );
  });
});
