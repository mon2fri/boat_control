import { useQuery } from "@tanstack/react-query";
import { loadRuleHistory } from "../../api/endpoints";

export const RULE_HISTORY_KEY = ["rule-history"] as const;

/**
 * Persisted rule-evolution history for one rule (Worker A, frozen
 * `GET /api/rules/<id>/history/`). Rendered from the configuration
 * database, never reconstructed from the mutable catalog.
 */
export function useRuleHistory(ruleId: string, enabled = true) {
  return useQuery({
    queryKey: [...RULE_HISTORY_KEY, ruleId],
    queryFn: () => loadRuleHistory(ruleId),
    enabled: enabled && ruleId.length > 0,
    retry: false,
    staleTime: 30_000,
  });
}
