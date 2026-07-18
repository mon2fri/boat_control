import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useHeaderReport } from "./useHeaderReport";
import type { HeaderReport } from "../../api/domain";

const report: HeaderReport = {
  sessionId: "s1",
  file1Name: "a.csv",
  file2Name: "b.csv",
  common: ["id"],
  file1Only: [],
  file2Only: [],
};

afterEach(() => vi.restoreAllMocks());

describe("useHeaderReport", () => {
  it("reports success and invokes the callback", async () => {
    const wireResponse = {
      session_id: report.sessionId,
      file_a_name: report.file1Name,
      file_b_name: report.file2Name,
      inspection: {
        columns_a: report.common,
        columns_b: report.common,
        common_columns: report.common,
        only_in_a: report.file1Only,
        only_in_b: report.file2Only,
      },
    };
    const okResponse = {
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(wireResponse)),
    } as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useHeaderReport(onSuccess));

    await act(async () => {
      await result.current.submitUpload(new File(["a"], "a.csv"), new File(["b"], "b.csv"));
    });

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(onSuccess).toHaveBeenCalledWith(report);
    vi.unstubAllGlobals();
  });

  it("returns to idle when the request is cancelled", async () => {
    // fetch rejects with an AbortError once aborted.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const { result } = renderHook(() => useHeaderReport(() => {}));

    let pending: Promise<void>;
    act(() => {
      pending = result.current.submitUpload(new File(["a"], "a.csv"), new File(["b"], "b.csv"));
    });
    await waitFor(() => expect(result.current.status).toBe("loading"));
    await act(async () => {
      result.current.cancel();
      await pending;
    });
    expect(result.current.status).toBe("idle");
    vi.unstubAllGlobals();
  });
});
