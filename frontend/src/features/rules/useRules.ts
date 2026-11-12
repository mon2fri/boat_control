import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createRule, deleteRule, loadRulesPage, reorderRules, setRulesEnabled, updateRule } from "../../api/endpoints";
import type { LogicClause, Rule, RuleDraft, SaveDecision } from "../../api/domain";
import { resolveGroupedExpression } from "../../lib/grouping";
import { formatGroupTreeHierarchy } from "./groupingTree";

const RULES_KEY = ["rules"] as const;

export function useRules() {
  const query = useInfiniteQuery({
    queryKey: RULES_KEY,
    queryFn: ({ pageParam }) => loadRulesPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.hasMore ? page.nextCursor : undefined,
  });
  const pages = query.data?.pages ?? [];
  const rules = [...new Map(pages.flatMap((page) => page.rules).map((rule) => [rule.index, rule])).values()];
  const first = pages[0];
  return {
    ...query,
    data: rules,
    pages,
    total: first?.total ?? 0,
    revision: first?.revision ?? 0,
    pinnedRuleIds: first?.pinnedRuleIds ?? [],
  };
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
    mutationFn: ({
      index,
      draft,
      saveDecision,
      sourceIdentifier,
    }: {
      index: string;
      draft: RuleDraft;
      saveDecision?: SaveDecision;
      sourceIdentifier?: string;
    }) => updateRule(index, draft, { ...(saveDecision ? { saveDecision } : {}), ...(sourceIdentifier !== undefined ? { sourceIdentifier } : {}) }),
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

export function useSetRulesEnabled() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleIds, enabled }: { ruleIds: string[]; enabled: boolean }) =>
      setRulesEnabled(ruleIds, enabled),
    onMutate: async ({ ruleIds, enabled }) => {
      await client.cancelQueries({ queryKey: RULES_KEY });
      const previous = client.getQueryData(RULES_KEY);
      client.setQueryData(RULES_KEY, (current: any) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page: any) => ({
            ...page,
            rules: page.rules.map((rule: Rule) =>
              ruleIds.includes(rule.index) ? { ...rule, enabled } : rule,
            ),
          })),
        };
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(RULES_KEY, context.previous);
    },
    onSuccess: (updated) => {
      client.setQueryData(RULES_KEY, (current: any) => {
        if (!current) return current;
        const byId = new Map(updated.map((rule) => [rule.index, rule]));
        return {
          ...current,
          pages: current.pages.map((page: any) => ({
            ...page,
            rules: page.rules.map((rule: Rule) => byId.get(rule.index) ?? rule),
          })),
        };
      });
    },
    onSettled: () => client.invalidateQueries({ queryKey: RULES_KEY }),
  });
}

export function useReorderRules() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ruleIds: string[]) => reorderRules(ruleIds),
    onMutate: async (ruleIds) => {
      await client.cancelQueries({ queryKey: RULES_KEY });
      const previous = client.getQueryData<Rule[]>(RULES_KEY);
      if (previous) {
        const byId = new Map(previous.map((rule) => [rule.index, rule]));
        client.setQueryData(
          RULES_KEY,
          ruleIds.map((ruleId) => byId.get(ruleId)).filter((rule): rule is Rule => Boolean(rule)),
        );
      }
      return { previous };
    },
    onError: (_error, _ruleIds, context) => {
      if (context?.previous) client.setQueryData(RULES_KEY, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: RULES_KEY }),
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

/** Normalised outcome clauses: legacy single outcome or the grouped list. */
export function ruleLogicClauses(rule: Pick<Rule, "logic" | "logicClauses">): LogicClause[] {
  return rule.logicClauses && rule.logicClauses.length > 0
    ? rule.logicClauses
    : [rule.logic];
}

function describeLogicClause(logic: LogicClause): string {
  const phrase = OPERATOR_PHRASE[logic.operator] ?? logic.operator.replace(/_/g, " ");
  const rhs = logic.format === "column"
    ? (logic.columnComparisonMode ?? "comparison_vs_baseline") === "comparison_vs_baseline"
      ? `the same column [${logic.column}] in Baseline`
      : `column [${logic.target}] in Comparison`
    : `"${logic.target}"`;
  return `${logic.column} ${phrase} ${rhs}`;
}

/**
 * Validate grouped rule outcomes without mutating them. Used by the editor and
 * by callers that need an actionable repair state for a restored rule.
 */
export function validateRuleLogicConfiguration(
  rule: Pick<Rule, "logic" | "logicClauses" | "logicRelation" | "logicGroupTree">,
): { valid: boolean; errors: string[] } {
  const clauses = ruleLogicClauses(rule);
  if (clauses.length <= 1) {
    return { valid: true, errors: [] };
  }
  const resolved = resolveGroupedExpression(
    clauses,
    rule.logicRelation ?? null,
    rule.logicGroupTree ?? null,
    {
      label: "Rule outcome grouping",
      requireExplicitForMultiple: true,
      allowLegacyAnd: false,
    },
  );
  const errors = [...resolved.errors];
  if (clauses.some((clause) => clause.format === "column")) {
    errors.push("Multiple grouped outcomes support value-against-column clauses only.");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Human-readable summary of a rule's outcome clause(s) in required-state
 * language ("status must equal active"). A single legacy outcome renders
 * exactly as before; multiple outcomes include their full grouping expression.
 */
export function describeLogic(rule: Rule): string {
  const clauses = ruleLogicClauses(rule);
  if (clauses.length <= 1) {
    return describeLogicClause(clauses[0] ?? rule.logic);
  }
  if (rule.logicGroupTree) {
    return formatGroupTreeHierarchy(rule.logicGroupTree, (id) => {
      const index = clauses.findIndex((clause) => clause.id === id);
      return index >= 0 ? `outcome ${index + 1} (${describeLogicClause(clauses[index]!)})` : id;
    });
  }
  const relation = rule.logicRelation === "or" ? "OR" : "AND";
  return clauses.map((clause) => describeLogicClause(clause)).join(` ${relation} `);
}
