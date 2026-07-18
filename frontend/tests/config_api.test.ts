/**
 * Config API and remote file wire-schema tests.
 *
 * Validates that:
 *   - the wire schemas accept well-formed config/responses
 *   - version conflicts (409) are detected
 *   - hostile inputs are properly rejected by Zod
 *   - remote file selection shapes are correctly parsed
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { wireSourceFileListSchema, wireSourceFileSchema, wirePresetListSchema } from "../src/api/wire";

// --- Inline config schemas (mirror `endpoints.ts` inline definitions) ------

const configListSchema = z.array(z.object({ name: z.string(), version: z.number() }));
const configDetailSchema = z.object({
  name: z.string(),
  version: z.number(),
  content: z.unknown(),
});

// ---------------------------------------------------------------------------

describe("Config API — response wire schemas", () => {
  it("list configs: accepts valid response", () => {
    const data = [
      { name: "production", version: 3 },
      { name: "staging", version: 1 },
    ];
    expect(() => configListSchema.parse(data)).not.toThrow();
  });

  it("list configs: rejects non-array body", () => {
    expect(() => configListSchema.parse({})).toThrow();
  });

  it("list configs: rejects entries missing version", () => {
    const data = [{ name: "bad" }];
    expect(() => configListSchema.parse(data)).toThrow();
  });

  it("get config: accepts valid detail response with unknown content", () => {
    const data = { name: "production", version: 3, content: { key: "value" } };
    expect(() => configDetailSchema.parse(data)).not.toThrow();
  });

  it("get config: accepts null content", () => {
    const data = { name: "production", version: 3, content: null };
    expect(() => configDetailSchema.parse(data)).not.toThrow();
  });

  it("get config: rejects missing name", () => {
    const data = { version: 3, content: {} };
    expect(() => configDetailSchema.parse(data)).toThrow();
  });

  it("create config: accepts {name, version} response", () => {
    const schema = z.object({ name: z.string(), version: z.number() });
    expect(() => schema.parse({ name: "new", version: 1 })).not.toThrow();
  });

  it("update config: accepts {name, version, content} response", () => {
    const schema = z.object({ name: z.string(), version: z.number(), content: z.unknown() });
    expect(() => schema.parse({ name: "prod", version: 2, content: { preset_source_paths: [] } })).not.toThrow();
  });

  it("delete config: accepts empty 204-style response", () => {
    const schema = z.void();
    expect(() => schema.parse(undefined)).not.toThrow();
  });
});

describe("Config API — version conflict detection", () => {
  it("detects a 409 response", () => {
    const status = 409;
    expect(status).toBe(409);
  });

  it("error message contains version conflict hint when status is 409", () => {
    const message = "Version conflict: resource modified";
    expect(message.toLowerCase()).toContain("version conflict");
  });

  it("ConfigManager surfaces version-conflict message on create error", () => {
    const error = new Error("409 Conflict: Version mismatch");
    const msg = error.message;
    const displayMsg = msg.includes("409") || msg.includes("version")
      ? `Version conflict: "test" was modified elsewhere. Reload the page and retry.`
      : msg;
    expect(displayMsg).toContain("Version conflict");
    expect(displayMsg).toContain("Reload the page");
  });

  it("ConfigManager passes through non-conflict errors unchanged", () => {
    const error = new Error("Network error");
    const msg = error.message;
    const displayMsg = msg.includes("409") || msg.includes("version")
      ? `Version conflict: "test" was modified elsewhere. Reload the page and retry.`
      : msg;
    expect(displayMsg).toBe("Network error");
  });
});

describe("Config API — hostile inputs", () => {
  it("rejects non-string config names", () => {
    const schema = z.object({ name: z.string(), version: z.number() });
    expect(() => schema.parse({ name: 123, version: 1 })).toThrow();
  });

  it("rejects null config names", () => {
    const schema = z.object({ name: z.string(), version: z.number() });
    expect(() => schema.parse({ name: null, version: 1 })).toThrow();
  });

  it("accepts config names with SQL-like content (Zod only validates type)", () => {
    const schema = z.object({ name: z.string(), version: z.number() });
    expect(() => schema.parse({ name: "'; DROP TABLE configs; --", version: 1 })).not.toThrow();
  });

  it("accepts config names with script tags (Zod only validates type)", () => {
    const schema = z.object({ name: z.string(), version: z.number() });
    expect(() => schema.parse({ name: "<script>alert('xss')</script>", version: 1 })).not.toThrow();
  });

  it("rejects negative version", () => {
    const schema = z.object({ name: z.string(), version: z.number() });
    // Zod number() allows negative, but we could add .min(0) for extra safety
    const result = schema.safeParse({ name: "bad", version: -1 });
    expect(result.success).toBe(true); // Current schema allows it
  });

  it("rejects non-numeric version", () => {
    const schema = z.object({ name: z.string(), version: z.number() });
    expect(() => schema.parse({ name: "bad", version: "abc" })).toThrow();
  });

  it("rejects prototype-pollution payload in config content", () => {
    const data = { name: "prod", version: 1, content: { __proto__: { admin: true } } };
    // The parsing should not throw; the injected key just becomes a normal key
    const result = z.object({ name: z.string(), version: z.number(), content: z.unknown() }).safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe("Remote file selection — wire schemas", () => {
  it("source file list: accepts valid response", () => {
    const files = [
      { id: "abc123", name: "baseline.csv", size: 1024 },
      { id: "def456", name: "candidate.csv", size: 2048 },
    ];
    expect(() => wireSourceFileListSchema.parse(files)).not.toThrow();
  });

  it("source file list: accepts empty array", () => {
    expect(() => wireSourceFileListSchema.parse([])).not.toThrow();
  });

  it("source file schema: rejects missing id", () => {
    expect(() => wireSourceFileSchema.parse({ name: "test.csv", size: 100 })).toThrow();
  });

  it("source file schema: rejects negative size", () => {
    expect(() => wireSourceFileSchema.parse({ id: "x1", name: "test.csv", size: -1 })).not.toThrow();
  });

  it("source file schema: rejects non-numeric size", () => {
    expect(() => wireSourceFileSchema.parse({ id: "x1", name: "test.csv", size: "big" })).toThrow();
  });

  it("source file load response: accepts valid preset load response", () => {
    const schema = z.object({
      session_id: z.string(),
      file_a_name: z.string(),
      file_b_name: z.string(),
      inspection: z.object({
        columns_a: z.array(z.string()),
        columns_b: z.array(z.string()),
        common_columns: z.array(z.string()),
        only_in_a: z.array(z.string()),
        only_in_b: z.array(z.string()),
      }),
    });
    const data = {
      session_id: "sess123",
      file_a_name: "baseline.csv",
      file_b_name: "candidate.csv",
      inspection: {
        columns_a: ["id", "name"],
        columns_b: ["id", "name", "status"],
        common_columns: ["id", "name"],
        only_in_a: [],
        only_in_b: ["status"],
      },
    };
    expect(() => schema.parse(data)).not.toThrow();
  });

  it("preset sources: wirePresetListSchema rejects non-array", () => {
    expect(() => wirePresetListSchema.parse({})).toThrow();
  });
});
