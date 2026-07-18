import { describe, expect, it } from "vitest";
import { fullSetGuard } from "./useFullSetGuard";
import type { WorkflowState } from "../../state/WorkflowContext";

const baseState: WorkflowState = {
  header: null,
  filters: [],
  targetColumns: [],
  keyColumns: [],
  selectedRuleIndexes: [],
  confirmFullSet: false,
  result: null,
  serverRequiresConfirmation: false,
  sessionExpired: false,
};

describe("fullSetGuard (server-owned flag)", () => {
  it("does not require confirmation when the server says so", () => {
    expect(fullSetGuard(baseState).requiresConfirmation).toBe(false);
  });

  it("requires confirmation when the server requires it", () => {
    expect(
      fullSetGuard({ ...baseState, serverRequiresConfirmation: true }).requiresConfirmation,
    ).toBe(true);
  });
});
