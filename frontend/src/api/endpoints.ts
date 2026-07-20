import { apiRequest } from "./client";
import {
  inspectResponseSchema,
  parseTargetsResponseSchema,
  prepareResponseSchema,
  ruleDraftRequestSchema,
  ruleMutationResponseSchema,
  rulesListResponseSchema,
  uploadResponseSchema,
  validateFilterResponseSchema,
  validateTargetsResponseSchema,
  wireColumnValuesPageSchema,
  wireDetailPageSchema,
  wirePresetListSchema,
  wireRunDocumentSchema,
  wireRunHistorySchema,
  wireRunMetadataSchema,
  wireRunRequestSchema,
  wireRuleSchema,
  wireSavedFilterListSchema,
  wireSavedFilterSchema,
  wireSettingsSchema,
  wireSourceFileListSchema,
} from "./wire";
import {
  mapColumnValue,
  mapPresetSource,
  mapRunDocumentToResult,
  mapRunMetadata,
  mapRunRequestToWire,
  mapRuleToWireDraft,
  mapSavedFilter,
  mapSavedFilterToWire,
  mapSettings,
  mapSettingsToWire,
  mapSourceFile,
  mapUploadToHeader,
  mapWireRule,
} from "./mapping";
import type {
  AppSettings,
  DetailRow,
  Rule as DomainRule,
  FilterRow,
  HeaderReport,
  PresetSource,
  RunResult,
  RunSummary,
  SavedFilter,
  SourceFile,
} from "./domain";
import { z } from "zod";

/** All API calls go through this module; the wire ↔ domain boundary lives here. */

// --- Files -----------------------------------------------------------------

export function uploadFiles(
  file1: File,
  file2: File,
  signal?: AbortSignal,
): Promise<HeaderReport> {
  const formData = new FormData();
  formData.append("file_a", file1);
  formData.append("file_b", file2);
  return apiRequest("/files/upload/", { method: "POST", formData, schema: uploadResponseSchema, signal }).then(
    mapUploadToHeader,
  );
}

export function reInspect(sessionId: string): Promise<HeaderReport> {
  return apiRequest("/files/inspect/", {
    method: "POST",
    body: { session_id: sessionId },
    schema: inspectResponseSchema,
  }).then((response) => mapUploadToHeader({ ...response, file_a_name: "", file_b_name: "" }));
}

/** Discard server-side copies of the two uploaded files. Local source files are never touched. */
export function clearUploadSession(sessionId: string): Promise<void> {
  return apiRequest(`/files/sessions/${encodeURIComponent(sessionId)}/`, {
    method: "DELETE",
    schema: z.null(),
  }).then(() => undefined);
}

export interface PrepareResult {
  columnValues: Record<string, { value: string; starred: boolean }[]>;
  totalRowsA: number;
  totalRowsB: number;
  requiresConfirmation: boolean;
}

export interface ColumnValuesPage {
  column: string;
  values: { value: string; starred: boolean }[];
  offset: number;
  total: number;
  hasMore: boolean;
  starredAvailability: boolean;
  search?: string;
}

/**
 * Fetch a single page of distinct values for `column`. The endpoint supports
 * a search term and pagination; the client accumulates pages by appending
 * values and re-issuing with an incremented `offset` while `hasMore` is true.
 */
export function fetchColumnValuesPage(
  sessionId: string,
  column: string,
  options: { search?: string; offset?: number; limit?: number; signal?: AbortSignal } = {},
): Promise<ColumnValuesPage> {
  const params = new URLSearchParams({ column });
  if (options.search) params.set("search", options.search);
  if (options.offset !== undefined) params.set("offset", String(options.offset));
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  return apiRequest(`/files/${encodeURIComponent(sessionId)}/values/?${params.toString()}`, {
    schema: wireColumnValuesPageSchema,
    ...(options.signal ? { signal: options.signal } : {}),
  }).then((r) => ({
    column: r.column,
    values: r.values.map(mapColumnValue),
    offset: r.offset,
    total: r.total,
    hasMore: r.has_more,
    starredAvailability: r.starred_availability,
    ...(r.search ? { search: r.search } : {}),
  }));
}

/**
 * Fetch a single page of detail rows for a saved run. The endpoint supports
 * either the change set (`section=changes`) or the violation set
 * (`section=violations`). The browser never holds the full detail row set in
 * memory; the DetailTable component fetches pages as the user scrolls.
 */
export function fetchDetailPage(
  runId: string,
  kind: "changed" | "violation",
  options: { offset?: number; limit?: number; signal?: AbortSignal } = {},
): Promise<{
  rows: DetailRow[];
  offset: number;
  total: number;
  hasMore: boolean;
}> {
  const params = new URLSearchParams({ section: kind === "changed" ? "changes" : "violations" });
  if (options.offset !== undefined) params.set("offset", String(options.offset));
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  return apiRequest(`/runs/${encodeURIComponent(runId)}/details/?${params.toString()}`, {
    schema: wireDetailPageSchema,
    ...(options.signal ? { signal: options.signal } : {}),
  }).then((r) => ({
    offset: r.offset,
    total: r.total,
    hasMore: r.has_more,
    rows: r.details.map((row) => ({
      rowKey: row.row_key,
      keyColumns: row.key_columns
        ? Object.fromEntries(Object.entries(row.key_columns).map(([k, v]) => [k, v === null ? null : String(v)]))
        : {},
      column: row.column,
      file1Value: row.file_a_value === null ? null : String(row.file_a_value),
      file2Value: row.file_b_value === null ? null : String(row.file_b_value),
      kind: kind === "violation" ? "exception" : kind,
      ...(row.violating_column ? { violatingColumn: row.violating_column } : {}),
      ...(row.violating_value !== undefined
        ? { violatingValue: row.violating_value === null ? null : String(row.violating_value) }
        : {}),
    })),
  }));
}

export function prepareFilters(
  sessionId: string,
  commonColumns?: string[],
): Promise<PrepareResult> {
  return apiRequest("/files/filters/prepare/", {
    method: "POST",
    body: { session_id: sessionId, ...(commonColumns ? { common_columns: commonColumns } : {}) },
    schema: prepareResponseSchema,
  }).then((response) => ({
    columnValues: Object.fromEntries(
      Object.entries(response.column_values).map(([column, values]) => [
        column,
        values.map(mapColumnValue),
      ]),
    ),
    totalRowsA: response.total_rows_a,
    totalRowsB: response.total_rows_b,
    requiresConfirmation: response.requires_confirmation,
  }));
}

export interface FilterValidation {
  valid: boolean;
  errors: string[];
}

export function validateFilter(
  column: string,
  operator: FilterRow["operator"],
  value: string,
  commonColumns: string[],
): Promise<FilterValidation> {
  return apiRequest("/files/filters/validate/", {
    method: "POST",
    body: {
      column,
      operator: mapOperatorForWire(operator),
      filter_value: value,
      common_columns: commonColumns,
    },
    schema: validateFilterResponseSchema,
  });
}

export function validateTargets(
  sessionId: string,
  targetColumns: string[],
): Promise<{ valid: string[]; invalid: string[]; allCommon: string[] }> {
  return apiRequest("/files/targets/validate/", {
    method: "POST",
    body: { session_id: sessionId, target_columns: targetColumns },
    schema: validateTargetsResponseSchema,
  }).then((r) => ({
    valid: r.valid_columns,
    invalid: r.invalid_columns,
    allCommon: r.all_common_columns,
  }));
}

export function parseTargetsInput(
  sessionId: string,
  input: string,
): Promise<{ parsed: string[]; valid: string[]; invalid: string[] }> {
  return apiRequest("/files/targets/input/", {
    method: "POST",
    body: { session_id: sessionId, input_str: input },
    schema: parseTargetsResponseSchema,
  }).then((r) => ({
    parsed: r.parsed_columns,
    valid: r.valid_columns,
    invalid: r.invalid_columns,
  }));
}

// --- Rules -----------------------------------------------------------------

export function loadRules(): Promise<DomainRule[]> {
  return apiRequest("/rules/", { schema: rulesListResponseSchema }).then((response) =>
    response.rules.map(mapWireRule),
  );
}

export function getRule(index: string): Promise<DomainRule> {
  return apiRequest(`/rules/${encodeURIComponent(index)}/`, { schema: wireRuleSchema }).then(mapWireRule);
}

export function createRule(
  draft: Omit<DomainRule, "index"> & { index?: string },
): Promise<{ ruleId: string; message: string }> {
  const body = ruleDraftRequestSchema.parse(mapRuleToWireDraft(draft));
  return apiRequest("/rules/", { method: "POST", body, schema: ruleMutationResponseSchema }).then(
    (r) => ({ ruleId: r.rule_id, message: r.message }),
  );
}

export function updateRule(
  index: string,
  draft: Omit<DomainRule, "index"> & { index?: string },
): Promise<{ ruleId: string; message: string }> {
  const body = ruleDraftRequestSchema.parse(mapRuleToWireDraft(draft));
  return apiRequest(`/rules/${encodeURIComponent(index)}/`, {
    method: "PUT",
    body,
    schema: ruleMutationResponseSchema,
  }).then((r) => ({ ruleId: r.rule_id, message: r.message }));
}

export function deleteRule(index: string): Promise<{ ruleId: string; message: string }> {
  return apiRequest(`/rules/${encodeURIComponent(index)}/`, {
    method: "DELETE",
    schema: ruleMutationResponseSchema,
  }).then((r) => ({ ruleId: r.rule_id, message: r.message }));
}

// --- Runs ------------------------------------------------------------------

export function executeRun(
  request: {
    sessionId: string;
    comparisonColumns: string[];
    filters: FilterRow[];
    targetColumns: string[];
    keyColumns: string[];
    ruleIndexes: string[];
  },
  signal?: AbortSignal,
): Promise<RunResult> {
  const body = wireRunRequestSchema.parse(mapRunRequestToWire(request));
  return apiRequest("/runs/execute/", { method: "POST", body, schema: wireRunDocumentSchema, signal }).then(
    mapRunDocumentToResult,
  );
}

export function loadRunHistory(): Promise<RunSummary[]> {
  return apiRequest("/runs/", { schema: wireRunHistorySchema }).then((items) =>
    items.map(mapRunMetadata),
  );
}

export function loadRun(id: string): Promise<RunResult> {
  return apiRequest(`/runs/${encodeURIComponent(id)}/`, { schema: wireRunDocumentSchema }).then(
    mapRunDocumentToResult,
  );
}

export function deleteRun(id: string): Promise<void> {
  return apiRequest(`/runs/${encodeURIComponent(id)}/`, {
    method: "DELETE",
    schema: z.object({ run_id: z.string(), deleted: z.literal(true) }),
  }).then(() => undefined);
}

export function renameRun(id: string, reportName: string): Promise<RunSummary> {
  return apiRequest(`/runs/${encodeURIComponent(id)}/rename/`, {
    method: "PUT",
    body: { report_name: reportName },
    schema: wireRunMetadataSchema,
  }).then(mapRunMetadata);
}

export interface ExportResult {
  filename: string;
  blob: Blob;
  contentType: string;
  /** Bytes reported by the server via `Content-Length`, or the byte length of the received blob. */
  size: number;
}

/**
 * Classify export failures so the UI can show the user a meaningful message.
 * `status` is the HTTP status (or 0 when the request never received a status,
 * e.g. aborted or a network error).
 */
export class ExportError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ExportError";
  }
}

/**
 * POSTs to the export endpoint and returns the downloaded file as a Blob with
 * its server-supplied filename. The backend does not yet expose a GET-style
 * download URL, so the client performs the POST and packages the response
 * for a save-as flow. The UI then triggers a hidden-anchor download using
 * the `filename` and `blob`.
 *
 * The response body is streamed so the UI can show a real progress bar
 * while the server emits the export.
 */
export async function downloadExport(
  runId: string,
  format: "html" | "csv",
  fallbackName = "export",
  options: {
    onProgress?: (received: number, total: number | null) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ExportResult> {
  // The export endpoint is the only one whose response is not JSON; bypass
  // `apiRequest` and use a manual fetch with the same guards.
  const headers: Record<string, string> = { Accept: "*/*" };
  const csrf = readCookie("csrftoken");
  if (csrf) headers["X-CSRFToken"] = csrf;
  // eslint-disable-next-line no-restricted-globals -- export is a download, not a JSON request
  const response = await fetch("/api/reports/export/", {
    method: "POST",
    credentials: "same-origin",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId, format }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok) {
    const text = await response.text();
    const parsed: unknown = safeJson(text);
    const message =
      parsed && typeof parsed === "object" && "error" in parsed
        ? String(parsed.error)
        : parsed && typeof parsed === "object" && "detail" in parsed
          ? String(parsed.detail)
          : text || `Export failed (${response.status})`;
    throw new ExportError(message, response.status);
  }
  if (!response.body) {
    throw new ExportError("Server returned an empty response body.", 0);
  }

  const declaredTotal = response.headers.get("Content-Length");
  const total: number | null = declaredTotal ? Number(declaredTotal) : null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      options.onProgress?.(received, total);
    }
  }
  const contentType = response.headers.get("Content-Type") ?? "application/octet-stream";
  const blob = new Blob(chunks as BlobPart[], { type: contentType });
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = parseFilename(disposition) ?? `${fallbackName}.${format}`;
  return { filename, blob, contentType, size: blob.size };
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseFilename(disposition: string): string | null {
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) return decodeURIComponent(utf8[1]!);
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain?.[1] ?? null;
}

function mapOperatorForWire(op: FilterRow["operator"]): string {
  const map: Record<FilterRow["operator"], string> = {
    equals: "eq",
    not_equals: "neq",
    contains: "contains",
    not_contains: "ncontains",
  };
  return map[op];
}

// --- Settings, saved filters, presets ----------------------------------
//
// These endpoints are part of the Priority 1 follow-ups and depend on
// Worker A shipping the server-side implementation. The client surface is
// finalised here so the UI can call these routes as soon as they exist;
// the Settings page degrades gracefully to a read-only view when the
// backend returns 404.

export function loadSettings(): Promise<AppSettings> {
  return apiRequest("/settings/", { schema: wireSettingsSchema }).then(mapSettings);
}

export function saveSettings(next: AppSettings): Promise<AppSettings> {
  return apiRequest("/settings/", {
    method: "PUT",
    body: mapSettingsToWire(next),
    schema: wireSettingsSchema,
  }).then(mapSettings);
}

export function listSavedFilters(): Promise<SavedFilter[]> {
  return apiRequest("/filters/", { schema: wireSavedFilterListSchema }).then((items) =>
    items.map(mapSavedFilter),
  );
}

export function createSavedFilter(filter: Omit<SavedFilter, "id">): Promise<SavedFilter> {
  return apiRequest("/filters/", {
    method: "POST",
    body: mapSavedFilterToWire(filter),
    schema: wireSavedFilterSchema,
  }).then(mapSavedFilter);
}

export function updateSavedFilter(filter: SavedFilter): Promise<SavedFilter> {
  return apiRequest(`/filters/${encodeURIComponent(filter.id)}/`, {
    method: "PUT",
    body: mapSavedFilterToWire(filter),
    schema: wireSavedFilterSchema,
  }).then(mapSavedFilter);
}

export function deleteSavedFilter(id: string): Promise<{ id: string }> {
  return apiRequest(`/filters/${encodeURIComponent(id)}/`, {
    method: "DELETE",
    schema: z.unknown(),
  }).then(() => ({ id }));
}

export function listPresetSources(): Promise<PresetSource[]> {
  return apiRequest("/files/presets/", { schema: wirePresetListSchema }).then((items) =>
    items.map(mapPresetSource),
  );
}

export function listSourceFiles(sourceId: string): Promise<SourceFile[]> {
  return apiRequest(`/files/presets/${encodeURIComponent(sourceId)}/files/`, {
    schema: wireSourceFileListSchema,
  }).then((items) => items.map(mapSourceFile));
}

export function loadPresetSource(id: string): Promise<HeaderReport> {
  return apiRequest("/files/presets/load/", {
    method: "POST",
    body: { preset_id: id },
    schema: uploadResponseSchema,
  }).then(mapUploadToHeader);
}

export function loadPresetFiles(
  fileAId: string,
  fileBId: string | null,
  signal?: AbortSignal,
): Promise<HeaderReport> {
  return apiRequest("/files/presets/load/", {
    method: "POST",
    body: { file_a_id: fileAId, file_b_id: fileBId },
    schema: uploadResponseSchema,
    signal,
  }).then(mapUploadToHeader);
}

// --- Named configuration files --------------------------------------------

export function listConfigs(
  configType: "rules" | "filters" | "rows-and-columns",
): Promise<Array<{ name: string; version: number }>> {
  return apiRequest(`/${configType}/configs/`, {
    schema: z.array(z.object({ name: z.string(), version: z.number() })),
  });
}

export function getConfig(
  configType: "rules" | "filters" | "rows-and-columns",
  name: string,
): Promise<{ name: string; version: number; content: unknown }> {
  return apiRequest(`/${configType}/configs/${name}/`, {
    schema: z.object({
      name: z.string(),
      version: z.number(),
      content: z.unknown(),
    }),
  });
}

export function createConfig(
  configType: "rules" | "filters" | "rows-and-columns",
  name: string,
  content: unknown,
): Promise<{ name: string; version: number }> {
  return apiRequest(`/${configType}/configs/`, {
    method: "POST",
    body: { name, content },
    schema: z.object({ name: z.string(), version: z.number() }),
  });
}

export function updateConfig(
  configType: "rules" | "filters" | "rows-and-columns",
  name: string,
  content: unknown,
  version: number,
): Promise<{ name: string; version: number; content: unknown }> {
  return apiRequest(`/${configType}/configs/${name}/`, {
    method: "PUT",
    body: { content, version },
    schema: z.object({
      name: z.string(),
      version: z.number(),
      content: z.unknown(),
    }),
  });
}

export function deleteConfig(
  configType: "rules" | "filters" | "rows-and-columns",
  name: string,
): Promise<void> {
  return apiRequest(`/${configType}/configs/${name}/`, {
    method: "DELETE",
    schema: z.void(),
  });
}
