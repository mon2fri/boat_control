import { describe, expect, it, vi, afterEach } from "vitest";
import { createElement } from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useRunExecution } from "./useRunExecution";
import type { RunRequest } from "../../api/domain";
import { WorkflowProvider } from "../../state/WorkflowContext";
import { makeClient } from "../../test/utils";

const request: RunRequest = {
  sessionId: "s1",
  filters: [],
  targetColumns: [],
  keyColumns: ["id"],
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
    const { result: hook } = renderHook(() => useRunExecution(() => {}), {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, createElement(WorkflowProvider, null, children)),
    });
    await act(async () => {
      await hook.current.run(request);
    });
    await waitFor(() => expect(hook.current.status).toBe("error"));
    expect(hook.current.error).toBe("bad filter");
    vi.unstubAllGlobals();
  });
});
