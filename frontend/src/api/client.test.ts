import { describe, expect, it, vi, afterEach } from "vitest";
import { z } from "zod";
import { apiRequest, ApiError } from "./client";

const schema = z.object({ ok: z.boolean() });

function mockFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: () => Promise.resolve(text),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiRequest", () => {
  it("rejects absolute/external URLs without calling fetch", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(
      apiRequest("https://evil.example.com/steal", { schema }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("rejects protocol-relative URLs", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(apiRequest("//evil.example.com", { schema })).rejects.toBeInstanceOf(ApiError);
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("validates the response body against the schema", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true }));
    await expect(apiRequest("/health/", { schema })).resolves.toEqual({ ok: true });
    vi.unstubAllGlobals();
  });

  it("throws ApiError when the response fails validation", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: "not-a-boolean" }));
    await expect(apiRequest("/health/", { schema })).rejects.toMatchObject({
      message: "Response failed validation",
    });
    vi.unstubAllGlobals();
  });

  it("surfaces a server error detail message", async () => {
    vi.stubGlobal("fetch", mockFetch({ detail: "boom" }, { ok: false, status: 500 }));
    await expect(apiRequest("/health/", { schema })).rejects.toMatchObject({
      status: 500,
      message: "boom",
    });
    vi.unstubAllGlobals();
  });
});
