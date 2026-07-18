import { z } from "zod";

/**
 * The single sanctioned network boundary for the app.
 *
 * All traffic is same-origin and relative (prefixed with `/api`); the dev
 * server proxies it to the local Django backend and the production build is
 * served by Django itself. No absolute or external URLs are ever constructed
 * here, which keeps the runtime fully offline.
 */
const API_ROOT = "/api";

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, message: string, detail: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** Reject any URL that is not a same-origin relative path. */
function assertRelativePath(path: string): void {
  if (/^[a-z]+:\/\//i.test(path) || path.startsWith("//")) {
    throw new ApiError(0, "Refusing to call an external URL", path);
  }
}

interface RequestOptions<TResponse> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** FormData is passed through untouched (used for file uploads). */
  formData?: FormData;
  schema: z.ZodType<TResponse>;
  signal?: AbortSignal | undefined;
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Perform a request and validate the response body with a Zod schema.
 * Every payload that crosses the boundary is parsed — unvalidated data
 * never reaches the UI.
 */
export async function apiRequest<TResponse>(
  path: string,
  { method = "GET", body, formData, schema, signal }: RequestOptions<TResponse>,
): Promise<TResponse> {
  assertRelativePath(path);

  const headers: Record<string, string> = { Accept: "application/json" };
  const csrf = readCookie("csrftoken");
  if (csrf && method !== "GET") headers["X-CSRFToken"] = csrf;

  let payload: BodyInit | undefined;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers,
    body: payload ?? null,
    signal: signal ?? null,
    credentials: "same-origin",
  });

  const raw = await response.text();
  const parsedJson: unknown = raw.length ? safeJsonParse(raw) : null;

  if (!response.ok) {
    const message =
      isRecord(parsedJson) && typeof parsedJson.detail === "string"
        ? parsedJson.detail
        : isRecord(parsedJson) && typeof parsedJson.error === "string"
          ? parsedJson.error
          : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, parsedJson);
  }

  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    throw new ApiError(response.status, "Response failed validation", result.error.issues);
  }
  return result.data;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
