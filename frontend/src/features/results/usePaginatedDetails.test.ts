/**
 * Tests for the paginated details hook. The hook is the bridge between the
 * server-paginated detail endpoint and the virtualized DetailTable — these
 * tests cover reset-on-change, accumulation across pages, error surfacing,
 * and the empty state.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { usePaginatedDetails } from "./usePaginatedDetails";

function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function pageWith(rows: Array<{ row_key: string }>, offset: number, total: number, hasMore: boolean) {
  return {
    run_id: "run-1",
    section: "changes",
    offset,
    total,
    has_more: hasMore,
    details: rows.map((r) => ({
      row_key: r.row_key,
      column: "region",
      file_a_value: "EMEA",
      file_b_value: "APAC",
    })),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("usePaginatedDetails", () => {
  it("loads the first page on mount", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json(pageWith([{ row_key: "1" }, { row_key: "2" }], 0, 4, true))),
    );
    const { result } = renderHook(() => usePaginatedDetails("run-1", "changed"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows.map((r) => r.rowKey)).toEqual(["1", "2"]);
    expect(result.current.total).toBe(4);
    expect(result.current.hasMore).toBe(true);
    vi.unstubAllGlobals();
  });

  it("accumulates pages when loadMore is called", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(pageWith([{ row_key: "1" }, { row_key: "2" }], 0, 4, true)))
      .mockResolvedValueOnce(json(pageWith([{ row_key: "3" }, { row_key: "4" }], 2, 4, false)));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => usePaginatedDetails("run-1", "changed"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.hasMore).toBe(false));
    expect(result.current.rows.map((r) => r.rowKey)).toEqual(["1", "2", "3", "4"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("derives stable exception IDs from existing API rule identifiers across violation pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({
        run_id: "run-1",
        section: "violations",
        offset: 0,
        total: 2,
        has_more: true,
        details: [{
          row_key: "id=1",
          key_columns: { id: "1", region: "EMEA" },
          rule_identifier: "CBR1_00000000000000000001",
          column: "status",
          file_a_value: "old",
          file_b_value: "new",
        }],
      }))
      .mockResolvedValueOnce(json({
        run_id: "run-1",
        section: "violations",
        offset: 1,
        total: 2,
        has_more: false,
        details: [{
          row_key: "id=2",
          key_columns: { id: "2", region: "APAC" },
          rule_identifier: "CBR1_00000000000000000001",
          column: "status",
          file_a_value: "old",
          file_b_value: "new",
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      usePaginatedDetails("run-1", "violation", {}, undefined, ["id", "region"]),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.hasMore).toBe(false));
    expect(result.current.rows.map((row) => row.exceptionId)).toEqual([
      "CBR1_00000000000000000001_1_EMEA",
      "CBR1_00000000000000000001_2_APAC",
    ]);
    vi.unstubAllGlobals();
  });

  it("resets when the runId changes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(pageWith([{ row_key: "1" }], 0, 1, false)))
      .mockResolvedValueOnce(json(pageWith([{ row_key: "2" }], 0, 1, false)));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ id }) => usePaginatedDetails(id, "changed"), {
      initialProps: { id: "run-1" },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows.map((r) => r.rowKey)).toEqual(["1"]);
    rerender({ id: "run-2" });
    await waitFor(() => expect(result.current.rows.map((r) => r.rowKey)).toEqual(["2"]));
    vi.unstubAllGlobals();
  });

  it("surfaces an error message when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "boom" }, 500)));
    const { result } = renderHook(() => usePaginatedDetails("run-1", "changed"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/boom/i);
    vi.unstubAllGlobals();
  });

  it("reports isEmpty when the first page has no rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(pageWith([], 0, 0, false))));
    const { result } = renderHook(() => usePaginatedDetails("run-1", "changed"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isEmpty).toBe(true);
    vi.unstubAllGlobals();
  });

  it("forwards sectionColumns to the run details endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(pageWith([], 0, 0, false)));
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => usePaginatedDetails("run-1", "changed", {}, ["region", "status"]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("columns=region%2Cstatus");
    vi.unstubAllGlobals();
  });
});
