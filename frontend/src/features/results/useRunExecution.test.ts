import { describe, expect, it, vi, afterEach } from "vitest";
import { createElement } from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useRunExecution } from "./useRunExecution";
import type { RunRequest } from "../../api/domain";
import { WorkflowProvider } from "../../state/WorkflowContext";
import { makeClient } from "../../test/utils";
import {
  EXCEPTION_TRACKING_DATES_KEY,
  EXCEPTION_TRACKING_KEY,
} from "../tracking/queryKeys";

const request: RunRequest = {
  sessionId: "s1",
  comparisonColumns: ["id"],
  filters: [],
  targetColumns: [],
  keyColumns: ["id"],
  aggregationColumns: [],
  ruleIndexes: ["R001"],
  confirmFullSet: true,
};

const wireRunDoc = {
  run_id: "run-1",
  report_name: "a_vs_b",
  file_a_name: "a.csv",
  file_b_name: "b.csv",
  created_at: "2026-07-18T00:00:00Z",
  result: {
    comparison: {
      total_rows_a: 1,
      total_rows_b: 1,
      rows_with_changes: 0,
      total_attribute_changes: 0,
      row_details: [],
    },
    validation: {
      total_violations: 0,
      violations_by_rule: {},
      violation_count_by_rule: {},
    },
    common_columns: ["id"],
    target_columns: null,
    filters_applied: [],
  },
};

afterEach(() => vi.restoreAllMocks());

describe("useRunExecution", () => {
  it("runs and reports the mapped result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(wireRunDoc)),
      }),
    );
    const onSuccess = vi.fn();
    const client = makeClient();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    const { result: hook } = renderHook(() => useRunExecution(onSuccess), {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, createElement(WorkflowProvider, null, children)),
    });
    await act(async () => {
      await hook.current.run(request);
    });
    await waitFor(() => expect(hook.current.status).toBe("success"));
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: "run-1", reportName: "a_vs_b" }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: EXCEPTION_TRACKING_DATES_KEY }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: EXCEPTION_TRACKING_KEY }),
    );
    vi.unstubAllGlobals();
  });

  it("blocks an invalid restored filter grouping before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result: hook } = renderHook(() => useRunExecution(() => {}), {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client: makeClient() }, createElement(WorkflowProvider, null, children)),
    });
    await act(async () => {
      await hook.current.run({
        ...request,
        filters: [
          { id: "fl-0", column: "book", operator: "equals", values: ["MO"] },
          { id: "fl-1", column: "status", operator: "equals", values: ["Active"] },
        ],
        filterRelation: "or",
        filterGroupTree: {
          kind: "or",
          children: [
            { kind: "leaf", conditionId: "fl-0" },
            { kind: "leaf", conditionId: "removed" },
          ],
        },
      });
    });
    expect(hook.current.status).toBe("error");
    expect(hook.current.error).toMatch(/unknown or removed/i);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("blocks stale restoration errors even when the tree looks structurally valid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result: hook } = renderHook(() => useRunExecution(() => {}), {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client: makeClient() }, createElement(WorkflowProvider, null, children)),
    });
    await act(async () => {
      await hook.current.run({
        ...request,
        filterGroupingErrors: ["Saved filter grouping references a removed filter."],
      });
    });
    expect(hook.current.status).toBe("error");
    expect(hook.current.error).toMatch(/removed filter/i);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("sends indexed filter references for a valid nested grouping", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(wireRunDoc)),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result: hook } = renderHook(() => useRunExecution(() => {}), {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client: makeClient() }, createElement(WorkflowProvider, null, children)),
    });
    await act(async () => {
      await hook.current.run({
        ...request,
        filters: [
          { id: "runtime-book", column: "id", operator: "equals", values: ["A"] },
          { id: "runtime-id", column: "id", operator: "not_equals", values: ["B"] },
        ],
        filterRelation: "or",
        filterGroupTree: {
          kind: "or",
          children: [
            { kind: "leaf", conditionId: "runtime-book" },
            { kind: "leaf", conditionId: "runtime-id" },
          ],
        },
      });
    });
    await waitFor(() => expect(hook.current.status).toBe("success"));
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    ) as {
      filter_relation: string;
      filter_grouping_tree: unknown;
    };
    expect(body.filter_relation).toBe("or");
    expect(body.filter_grouping_tree).toEqual({
      kind: "or",
      children: [
        { kind: "leaf", conditionId: "c0" },
        { kind: "leaf", conditionId: "c1" },
      ],
    });
    vi.unstubAllGlobals();
  });

  it("surfaces a server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({ error: "bad filter" })),
      }),
    );
    const client = makeClient();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    const { result: hook } = renderHook(() => useRunExecution(() => {}), {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, createElement(WorkflowProvider, null, children)),
    });
    await act(async () => {
      await hook.current.run(request);
    });
    await waitFor(() => expect(hook.current.status).toBe("error"));
    expect(hook.current.error).toBe("bad filter");
    expect(invalidateQueries).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
