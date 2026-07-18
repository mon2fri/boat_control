/**
 * Tests for the on-demand column-values loader.
 *
 * The hook is the only place where the filter row editor reads values, so
 * these tests cover the contract: it requests a page when a column is
 * chosen, accumulates pages across calls, surfaces loading/error states,
 * and falls back to the prepare-supplied snapshot when the paginated
 * endpoint is not yet shipped.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useColumnValues } from "./useColumnValues";

function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

const pageOne = {
  session_id: "s1",
  column: "region",
  values: [{ value: "EMEA", in_file_a: true, in_file_b: true, display: "EMEA" }],
  offset: 0,
  total: 3,
  has_more: true,
  starred_availability: true,
};

const pageTwo = {
  session_id: "s1",
  column: "region",
  values: [{ value: "APAC", in_file_a: true, in_file_b: false, display: "APAC*" }],
  offset: 1,
  total: 3,
  has_more: false,
  starred_availability: true,
};

afterEach(() => vi.restoreAllMocks());

describe("useColumnValues", () => {
  it("loads the first page when the column is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(pageOne));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useColumnValues("s1", "region", ""));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.values.map((v) => v.value)).toEqual(["EMEA"]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.total).toBe(3);
    vi.unstubAllGlobals();
  });

  it("accumulates pages when loadMore is called", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(pageOne))
      .mockResolvedValueOnce(json(pageTwo));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useColumnValues("s1", "region", ""));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.hasMore).toBe(false));
    expect(result.current.values.map((v) => v.value)).toEqual(["EMEA", "APAC"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("surfaces loadingMore while the next page is in flight", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(pageOne))
      .mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useColumnValues("s1", "region", ""));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.loadMore();
    });
    expect(result.current.loadingMore).toBe(true);
    vi.unstubAllGlobals();
  });

  it("falls back to the prepare-supplied values when the endpoint returns 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ detail: "Not found" }, 404)),
    );
    const fallback = [{ value: "snapshot1", starred: false }];
    const { result } = renderHook(() =>
      useColumnValues("s1", "region", "", { fallbackValues: fallback }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.usingFallback).toBe(true);
    expect(result.current.values).toEqual(fallback);
    vi.unstubAllGlobals();
  });

  it("reports isEmpty when the server returned no values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({
          session_id: "s1",
          column: "region",
          values: [],
          offset: 0,
          total: 0,
          has_more: false,
          starred_availability: true,
        }),
      ),
    );
    const { result } = renderHook(() => useColumnValues("s1", "region", ""));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isEmpty).toBe(true);
    vi.unstubAllGlobals();
  });

  it("surfaces an error string when the endpoint fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ detail: "boom" }, 500)),
    );
    const { result } = renderHook(() => useColumnValues("s1", "region", ""));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/boom|Response failed/i);
    vi.unstubAllGlobals();
  });
});
