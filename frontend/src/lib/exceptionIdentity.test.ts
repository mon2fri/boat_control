import { describe, expect, it } from "vitest";
import { buildExceptionId, resolveExceptionId } from "./exceptionIdentity";

const RULE = "CBR1_0123456789ABCDEFGHJK";

describe("exceptionIdentity", () => {
  it("builds the literal backend exception ID from rule identifier and configured key order", () => {
    expect(
      buildExceptionId(RULE, ["id", "region"], { id: "1", region: "EMEA" }),
    ).toBe(`${RULE}_1_EMEA`);
  });

  it("uses the configured order, not object insertion order", () => {
    expect(
      buildExceptionId(RULE, ["region", "id"], { id: "1", region: "EMEA" }),
    ).toBe(`${RULE}_EMEA_1`);
  });

  it("keeps literal underscores and Unicode values without escaping", () => {
    expect(
      buildExceptionId(RULE, ["id"], { id: "A_B_東京" }),
    ).toBe(`${RULE}_A_B_東京`);
  });

  it("does not guess when identity data is incomplete", () => {
    expect(buildExceptionId(null, ["id"], { id: "1" })).toBeNull();
    expect(buildExceptionId(RULE, [], { id: "1" })).toBeNull();
    expect(buildExceptionId(RULE, ["id"], {})).toBeNull();
    expect(buildExceptionId(RULE, ["id"], { id: null })).toBeNull();
    expect(buildExceptionId(RULE, ["id"], { id: "" })).toBeNull();
  });

  it("prefers a backend-supplied exception ID", () => {
    expect(
      resolveExceptionId("BACKEND_ID", RULE, ["id"], { id: "1" }),
    ).toBe("BACKEND_ID");
    expect(
      resolveExceptionId(undefined, RULE, ["id"], { id: "1" }),
    ).toBe(`${RULE}_1`);
  });
});
