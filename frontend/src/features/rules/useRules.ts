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

/** Human-readable one-line summary of a rule's logic clause. */
export function describeLogic(rule: Rule): string {
  const { logic } = rule;
  const rhs = logic.format === "column" ? `[${logic.target}]` : `"${logic.target}"`;
  return `${logic.column} ${logic.operator.replace(/_/g, " ")} ${rhs}`;
}
