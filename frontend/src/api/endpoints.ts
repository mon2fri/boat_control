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
  wireRunDocumentSchema,
  wireRunHistorySchema,
  wireRunRequestSchema,
  wireRuleSchema,
} from "./wire";
import {
  mapColumnValue,
  mapRunDocumentToResult,
  mapRunMetadata,
  mapRunRequestToWire,
  mapRuleToWireDraft,
  mapUploadToHeader,
  mapWireRule,
} from "./mapping";
import type { Rule as DomainRule, FilterRow, HeaderReport, RunResult, RunSummary } from "./domain";
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

export interface PrepareResult {
  columnValues: Record<string, { value: string; starred: boolean }[]>;
  totalRowsA: number;
  totalRowsB: number;
  requiresConfirmation: boolean;
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
    filters: FilterRow[];
    targetColumns: string[];
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

export function renameRun(id: string, reportName: string): Promise<RunSummary> {
  const metadataSchema = z
    .object({
      run_id: z.string(),
      report_name: z.string(),
      file_a_name: z.string(),
      file_b_name: z.string(),
      created_at: z.string(),
      file_path: z.string(),
    });
  return apiRequest(`/runs/${encodeURIComponent(id)}/rename/`, {
    method: "PUT",
    body: { report_name: reportName },
    schema: metadataSchema,
  }).then(mapRunMetadata);
}

export interface ExportResult {
  filename: string;
  blob: Blob;
  contentType: string;
}

/**
 * POSTs to the export endpoint and returns the downloaded file as a Blob with
 * its server-supplied filename. The backend does not yet expose a GET-style
 * download URL, so the client performs the POST and packages the response
 * for a save-as flow. The UI then triggers a hidden-anchor download using
 * the `filename` and `blob`.
 */
export async function downloadExport(
  runId: string,
  format: "html" | "csv",
  fallbackName = "export",
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
    throw new Error(message);
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = parseFilename(disposition) ?? `${fallbackName}.${format}`;
  const blob = await response.blob();
  return { filename, blob, contentType: response.headers.get("Content-Type") ?? "" };
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
