/**
 * Worker D adapter for grouped value-against-column rule outcomes.
 *
 * Worker C owns the persisted `logic_clauses` / `logic_relation` /
 * `logic_grouping_tree` fields, their serialization, and legacy single-clause
 * compatibility. These helpers keep the visual editor on the agreed shape:
 * a non-empty ordered clause list plus either a flat AND/OR relation or a
 * custom executable tree.
 */
import type {
  Condition,
  GroupNode,
  LogicClause,
  LogicOperator,
  Rule,
  RuleDraft,
} from "../../api/domain";
import {
  buildFlatGroupingTree,
  formatGroupingExpression,
  pruneGroupingTree,
  validateCustomGrouping,
  type GroupingValidation,
} from "./groupingEditorSupport";

export type LogicOutcomeMode = "and" | "or" | "custom";

export interface LogicOutcomeGrouping {
  mode: LogicOutcomeMode | null;
  /** Retained across AND/OR/custom switches and single/column mode switches. */
  tree: GroupNode | null;
}

/** Structural extension pending Worker C's domain-type delivery. */
export type RuleWithLogicGrouping = Rule & {
  logicClauses?: LogicClause[];
  logicRelation?: "and" | "or" | null;
  logicGroupingTree?: GroupNode | null;
};

export type GroupedRuleDraft = RuleDraft & {
  logicClauses?: LogicClause[];
  logicRelation?: "and" | "or" | null;
  logicGroupingTree?: GroupNode | null;
};

const OPERATOR_PHRASE: Record<string, string> = {
  equals: "must equal",
  not_equals: "must not equal",
  contains: "must contain",
  not_contains: "must not contain",
  greater_than: "must be greater than",
  less_than: "must be less than",
};

export function isNumericLogicOperator(operator: LogicOperator): boolean {
  return operator === "greater_than" || operator === "less_than";
}

export function logicClauseValues(clause: LogicClause): string[] {
  return clause.values ?? (clause.target ? [clause.target] : []);
}

export function normalizeLogicClauseValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

/** Read the outcome clauses from either the new or legacy representation. */
export function getRuleLogicClauses(rule?: Rule): LogicClause[] {
  const extended = rule as RuleWithLogicGrouping | undefined;
  const declared = extended?.logicClauses?.filter(
    (clause) => clause.format === "value" && clause.id,
  );
  if (declared && declared.length > 0) return declared;
  return rule?.logic ? [rule.logic] : [];
}

/** Read the persisted grouping without inventing a tree for legacy rules. */
export function getRuleLogicGrouping(rule?: Rule): LogicOutcomeGrouping {
  const extended = rule as RuleWithLogicGrouping | undefined;
  const clauses = getRuleLogicClauses(rule);
  if (extended?.logicGroupingTree) {
    return { mode: "custom", tree: extended.logicGroupingTree };
  }
  if (clauses.length > 1) {
    return { mode: extended?.logicRelation ?? "and", tree: null };
  }
  return { mode: null, tree: null };
}

export function outcomeAsCondition(clause: LogicClause): Condition {
  const values = logicClauseValues(clause);
  return {
    id: clause.id,
    column: clause.column,
    operator: clause.operator,
    values,
    value: values[0] ?? "",
  };
}

export function outcomeLabel(clause: LogicClause, index: number): string {
  const phrase = OPERATOR_PHRASE[clause.operator] ?? clause.operator.replace(/_/g, " ");
  const column = clause.column.trim() || "<column>";
  const values = logicClauseValues(clause).filter((value) => value.trim().length > 0);
  const rendered = values.length > 0
    ? values.map((value) => `"${value}"`).join(" OR ")
    : "<value>";
  return `Outcome ${index + 1}: ${column} ${phrase} ${rendered}`;
}

export function formatLogicOutcomeExpression(
  clauses: LogicClause[],
  grouping: LogicOutcomeGrouping,
): string {
  if (clauses.length === 0) return "<add an expected outcome>";
  const labels = new Map(
    clauses.map((clause, index) => [clause.id, outcomeLabel(clause, index)]),
  );
  const labelFor = (id: string) => labels.get(id) ?? `<missing outcome ${id}>`;

  if (clauses.length === 1) return labelFor(clauses[0]!.id);
  if (grouping.mode === "custom") {
    return grouping.tree
      ? formatGroupingExpression(grouping.tree, labelFor)
      : "<add groups to define the outcome expression>";
  }
  if (grouping.mode === "and" || grouping.mode === "or") {
    return clauses
      .map((clause) => `(${labelFor(clause.id)})`)
      .join(` ${grouping.mode.toUpperCase()} `);
  }
  return clauses
    .map((clause) => `(${labelFor(clause.id)})`)
    .join(" [choose AND, OR, or CUSTOM GROUPS] ");
}

export interface LogicOutcomeValidation extends GroupingValidation {
  clauseErrors: string[];
}

export function validateLogicOutcomes(
  clauses: LogicClause[],
  grouping: LogicOutcomeGrouping,
): LogicOutcomeValidation {
  const clauseErrors: string[] = [];
  if (clauses.length === 0) {
    clauseErrors.push("Logic needs at least one expected outcome.");
  }
  clauses.forEach((clause, index) => {
    const values = logicClauseValues(clause).filter((value) => value.trim().length > 0);
    if (!clause.column.trim() || values.length === 0) {
      clauseErrors.push(`Outcome ${index + 1} needs a column and a value.`);
    } else if (
      isNumericLogicOperator(clause.operator)
      && !Number.isFinite(Number(values[0]))
    ) {
      clauseErrors.push(`Outcome ${index + 1} needs a valid number.`);
    }
  });

  if (clauses.length <= 1) {
    return {
      valid: clauseErrors.length === 0,
      errors: clauseErrors,
      clauseErrors,
      missingIds: [],
      unknownIds: [],
      duplicateIds: [],
      structuralErrors: [],
    };
  }

  let groupingResult: GroupingValidation;
  if (!grouping.mode) {
    groupingResult = {
      valid: false,
      errors: ["Choose AND, OR, or CUSTOM GROUPS to combine multiple expected outcomes."],
      missingIds: [],
      unknownIds: [],
      duplicateIds: [],
      structuralErrors: [],
    };
  } else if (grouping.mode === "custom") {
    groupingResult = validateCustomGrouping(
      grouping.tree,
      clauses.map((clause) => clause.id),
      "outcome",
    );
  } else {
    groupingResult = {
      valid: true,
      errors: [],
      missingIds: [],
      unknownIds: [],
      duplicateIds: [],
      structuralErrors: [],
    };
  }

  const errors = [...clauseErrors, ...groupingResult.errors];
  return { ...groupingResult, valid: errors.length === 0, errors, clauseErrors };
}

export function repairLogicOutcomeTree(
  clauses: LogicClause[],
  grouping: LogicOutcomeGrouping,
): LogicOutcomeGrouping {
  const allowed = new Set(clauses.map((clause) => clause.id));
  return { ...grouping, tree: pruneGroupingTree(grouping.tree, allowed) };
}

export function resetLogicOutcomeTree(
  clauses: LogicClause[],
  grouping: LogicOutcomeGrouping,
  kind: "and" | "or" = "and",
): LogicOutcomeGrouping {
  return {
    ...grouping,
    mode: "custom",
    tree: buildFlatGroupingTree(clauses.map((clause) => clause.id), kind),
  };
}

/** True when column-against-column mode is selected with extra retained outcomes. */
export function columnModeHasRetainedOutcomes(
  format: LogicClause["format"],
  clauses: LogicClause[],
): boolean {
  return format === "column" && clauses.length > 1;
}
