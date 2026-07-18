import { z } from "zod";

/** Values originate in CSV cells and Django JSON serialization, so they can
 * legitimately be strings, numbers, booleans, or null.  Components render
 * them as text at the API boundary. */
export const wireScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * Wire-format schemas for the backend. All field names are snake_case as the
 * Django serializers emit them. Domain-level types (camelCase, used inside
 * React components) are derived from these in `domain.ts`; the mappers in
 * `mapping.ts` translate between the two.
 *
 * The contract mapped here is the one implemented by Worker A and described
 * end-to-end in `reviews/20260718_review_worker_convergence.md`.
 */

// --- Files ---------------------------------------------------------------

export const inspectionSchema = z.object({
  columns_a: z.array(z.string()),
  columns_b: z.array(z.string()),
  common_columns: z.array(z.string()),
  only_in_a: z.array(z.string()),
  only_in_b: z.array(z.string()),
});
export type WireInspection = z.infer<typeof inspectionSchema>;

export const uploadResponseSchema = z.object({
  session_id: z.string().min(1),
  file_a_name: z.string(),
  file_b_name: z.string(),
  inspection: inspectionSchema,
});
export type WireUploadResponse = z.infer<typeof uploadResponseSchema>;

export const inspectResponseSchema = z.object({
  session_id: z.string(),
  inspection: inspectionSchema,
});

export const wireColumnValueSchema = z.object({
  value: z.string(),
  in_file_a: z.boolean(),
  in_file_b: z.boolean(),
  display: z.string(),
});
export type WireColumnValue = z.infer<typeof wireColumnValueSchema>;

export const prepareResponseSchema = z.object({
  session_id: z.string(),
  columns: z.array(z.string()),
  column_values: z.record(z.string(), z.array(wireColumnValueSchema)),
  total_rows_a: z.number().int().nonnegative(),
  total_rows_b: z.number().int().nonnegative(),
  requires_confirmation: z.boolean(),
});
export type WirePrepareResponse = z.infer<typeof prepareResponseSchema>;

export const validateFilterResponseSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
});

export const validateTargetsResponseSchema = z.object({
  session_id: z.string(),
  valid_columns: z.array(z.string()),
  invalid_columns: z.array(z.string()),
  all_common_columns: z.array(z.string()),
});

export const parseTargetsResponseSchema = z.object({
  session_id: z.string(),
  parsed_columns: z.array(z.string()),
  valid_columns: z.array(z.string()),
  invalid_columns: z.array(z.string()),
});

// --- Rules ---------------------------------------------------------------

export const wireConditionSchema = z.object({
  column_name: z.string(),
  operator: z.string(),
  filter_value: z.string(),
});
export type WireCondition = z.infer<typeof wireConditionSchema>;

export const wireLogicSchema = z.object({
  format: z.enum(["value_vs_column", "column_vs_column"]),
  column_name: z.string(),
  operator: z.string(),
  target_value: z.string(),
});
export type WireLogic = z.infer<typeof wireLogicSchema>;

export const wireRuleSchema = z.object({
  rule_id: z.string().regex(/^R\d{3,}$/),
  name: z.string(),
  description: z.string().optional(),
  conditions: z.array(wireConditionSchema).optional(),
  condition_relation: z.enum(["and", "or"]).optional(),
  grouping: z.array(z.string()).optional(),
  logic: wireLogicSchema,
});
export type WireRule = z.infer<typeof wireRuleSchema>;

export const rulesListResponseSchema = z.object({
  version: z.number().int(),
  rules: z.array(wireRuleSchema),
});

export const ruleMutationResponseSchema = z.object({
  rule_id: z.string(),
  message: z.string(),
});

export const ruleDraftRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  conditions: z.array(wireConditionSchema).optional(),
  condition_relation: z.enum(["and", "or"]).optional(),
  grouping: z.array(z.string()).optional(),
  logic: wireLogicSchema,
});
export type WireRuleDraftRequest = z.infer<typeof ruleDraftRequestSchema>;

// --- Runs ----------------------------------------------------------------

export const wireFilterRowSchema = z.object({
  column: z.string(),
  operator: z.string(),
  filter_value: z.string(),
});
export type WireFilterRow = z.infer<typeof wireFilterRowSchema>;

export const wireRunRequestSchema = z.object({
  session_id: z.string(),
  target_columns: z.array(z.string()).nullable().optional(),
  key_columns: z.array(z.string()).nullable().optional(),
  filters: z.array(wireFilterRowSchema).optional(),
  rule_ids: z.array(z.string()).nullable().optional(),
});
export type WireRunRequest = z.infer<typeof wireRunRequestSchema>;

export const wireAttributeChangeSchema = z.object({
  column: z.string(),
  file_a_value: wireScalarSchema,
  file_b_value: wireScalarSchema,
});
export type WireAttributeChange = z.infer<typeof wireAttributeChangeSchema>;

export const wireRowDetailSchema = z.object({
  row_index: z.number().int(),
  key_columns: z.record(z.string(), wireScalarSchema),
  attribute_changes: z.array(wireAttributeChangeSchema),
  change_count: z.number().int().nonnegative(),
});
export type WireRowDetail = z.infer<typeof wireRowDetailSchema>;

export const wireComparisonSchema = z.object({
  total_rows_a: z.number().int().nonnegative(),
  total_rows_b: z.number().int().nonnegative(),
  rows_with_changes: z.number().int().nonnegative(),
  total_attribute_changes: z.number().int().nonnegative(),
  row_details: z.array(wireRowDetailSchema),
});

export const wireViolationSchema = z.object({
  row_index: z.number().int(),
  rule_id: z.string(),
  rule_name: z.string(),
  key_columns: z.record(z.string(), wireScalarSchema),
  details: z.string(),
});
export type WireViolation = z.infer<typeof wireViolationSchema>;

export const wireValidationSchema = z.object({
  total_violations: z.number().int().nonnegative(),
  violations_by_rule: z.record(z.string(), z.array(wireViolationSchema)),
  violation_count_by_rule: z.record(z.string(), z.number().int().nonnegative()),
});

export const wireRunResultSchema = z.object({
  comparison: wireComparisonSchema,
  validation: wireValidationSchema,
  common_columns: z.array(z.string()),
  target_columns: z.array(z.string()).nullable(),
  filters_applied: z.array(wireFilterRowSchema),
});

export const wireRunDocumentSchema = z.object({
  run_id: z.string(),
  report_name: z.string(),
  file_a_name: z.string(),
  file_b_name: z.string(),
  created_at: z.string(),
  result: wireRunResultSchema,
});
export type WireRunDocument = z.infer<typeof wireRunDocumentSchema>;

export const wireRunMetadataSchema = z.object({
  run_id: z.string(),
  report_name: z.string(),
  file_a_name: z.string(),
  file_b_name: z.string(),
  created_at: z.string(),
  file_path: z.string(),
});
export type WireRunMetadata = z.infer<typeof wireRunMetadataSchema>;
export const wireRunHistorySchema = z.array(wireRunMetadataSchema);

// --- Export --------------------------------------------------------------

export const wireExportRequestSchema = z.object({
  run_id: z.string().optional(),
  result_data: wireRunResultSchema.optional(),
  report_name: z.string().optional(),
  format: z.enum(["html", "csv"]),
});
export type WireExportRequest = z.infer<typeof wireExportRequestSchema>;

// --- Error envelope ------------------------------------------------------

/**
 * Backend errors take two shapes: legacy `{"error": "..."}` from business
 * views, and DRF's default `{"detail": "..."}` from serializers. We treat
 * both as a single normalized error message.
 */
export const wireErrorSchema = z
  .object({ error: z.string() })
  .or(z.object({ detail: z.string() }))
  .or(z.string());
export type WireError = z.infer<typeof wireErrorSchema>;
