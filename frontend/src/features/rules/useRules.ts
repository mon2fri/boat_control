import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRule, deleteRule, loadRules, updateRule } from "../../api/endpoints";
import type { Rule, RuleDraft } from "../../api/domain";

const RULES_KEY = ["rules"] as const;

export function useRules() {
  return useQuery({ queryKey: RULES_KEY, queryFn: () => loadRules() });
}

export function useCreateRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: RuleDraft) => createRule(draft),
    onSuccess: () => client.invalidateQueries({ queryKey: RULES_KEY }),
  });
}

export function useUpdateRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ index, draft }: { index: string; draft: RuleDraft }) => updateRule(index, draft),
    onSuccess: () => client.invalidateQueries({ queryKey: RULES_KEY }),
  });
}

export function useDeleteRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (index: string) => deleteRule(index),
    onSuccess: () => client.invalidateQueries({ queryKey: RULES_KEY }),
  });
}

/**
 * Map a logic operator to its required-state English wording.
 * The rule describes the *required* value for the column; a row that
 * matches the operator's positive form is valid, a row that doesn't
 * match is flagged. The phrasing here makes that intent explicit.
 */
const OPERATOR_PHRASE: Record<string, string> = {
  equals: "must equal",
  not_equals: "must not equal",
  contains: "must contain",
  not_contains: "must not contain",
  greater_than: "must be greater than",
  less_than: "must be less than",
};

/**
 * Human-readable one-line summary of a rule's logic clause in required-state
 * language ("status must equal active"). This is the wording surfaced in the
 * rule list and result sections so users can read intent at a glance.
 */
export function describeLogic(rule: Rule): string {
  const { logic } = rule;
  const phrase = OPERATOR_PHRASE[logic.operator] ?? logic.operator.replace(/_/g, " ");
  const rhs = logic.format === "column"
    ? (logic.columnComparisonMode ?? "comparison_vs_baseline") === "comparison_vs_baseline"
      ? `the same column [${logic.column}] in Baseline`
      : `column [${logic.target}] in Comparison`
    : `"${logic.target}"`;
  return `${logic.column} ${phrase} ${rhs}`;
}
