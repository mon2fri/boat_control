import type { GroupNode, RuleResult } from "../../api/domain";
import { formatFilterRow } from "../filters/formatFilterRow";
import { GroupingPreview, type PreviewSection } from "../rules/RuleGroupingPreview";
import type { AppliedFilterSummaryInput } from "./appliedFilterSummary";

/** Read only the bounded, numbered hierarchy saved by older runs; never parse predicates. */
function savedHierarchy(text: string, noun: string): GroupNode {
  if (text.length > 100000) throw new Error("Saved grouping is too large.");
  const definitions = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^(Overall|Group \d+):\s*(.+)$/i.exec(line.trim());
    if (!match || definitions.has(match[1]!.toLowerCase())) throw new Error("Saved grouping is malformed.");
    definitions.set(match[1]!.toLowerCase(), match[2]!);
  }
  let count = 0;
  function parse(expression: string, seen: Set<string>): GroupNode {
    if (++count > 1000 || seen.size > 50) throw new Error("Saved grouping is too complex.");
    const parts = expression.trim().split(/\s+(AND|OR)\s+/i);
    if (parts.length > 1) {
      const operator = parts[1]!.toLowerCase();
      if (parts.some((part, index) => index % 2 === 1 && part.toLowerCase() !== operator)) {
        throw new Error("Saved grouping has ambiguous operators.");
      }
      return { kind: operator as "and" | "or", children: parts.filter((_, index) => index % 2 === 0).map((part) => parse(part, seen)) };
    }
    const leaf = new RegExp(`^${noun} ([1-9]\\d*)$`, "i").exec(expression.trim());
    if (leaf) return { kind: "leaf", conditionId: `c${Number(leaf[1]) - 1}` };
    const key = expression.trim().toLowerCase();
    const definition = definitions.get(key);
    if (!/^group \d+$/.test(key) || !definition || seen.has(key)) throw new Error("Saved grouping references an unavailable group.");
    return parse(definition, new Set([...seen, key]));
  }
  const overall = definitions.get("overall");
  if (!overall) throw new Error("Saved grouping has no overall expression.");
  return parse(overall, new Set());
}

function snapshotSection(title: string, noun: string, labels: string[] | undefined,
  tree: GroupNode | null | undefined, hierarchy: string | undefined, fallback: string | undefined): PreviewSection {
  const clauses = (labels ?? (fallback ? [`${noun} 1: ${fallback}`] : []))
    .map((label, index) => ({ id: `c${index}`, label }));
  const errors: string[] = [];
  let root = tree ?? null;
  if (!root && hierarchy) {
    try { root = savedHierarchy(hierarchy, noun); }
    catch { errors.push("The saved grouping tree is unavailable. The original clauses are shown below."); }
  } else if (!root && clauses.length > 1) {
    errors.push("This historical run has no saved grouping tree. The original clauses are shown below.");
  }
  return { title, clauses, tree: root, errors,
    emptyText: title === "Conditions"
      ? labels ? "No conditions — applies to all records." : "Condition metadata unavailable for this saved run."
      : "Expectation metadata unavailable for this saved run." };
}

export function RuleResultGroupingPreview({ result }: { result: RuleResult }) {
  return <GroupingPreview label={`Preview grouping for ${result.ruleIndex} ${result.ruleName}`} data={{
    title: `${result.ruleIndex} — ${result.ruleName}`,
    ...(result.ruleDescription ? { description: result.ruleDescription } : {}),
    sections: [
      snapshotSection("Conditions", "Condition", result.conditionClauses, result.conditionTree, result.conditionGroupings, result.conditionSummary),
      snapshotSection("Expectations", "Expectation", result.expectationClauses, result.expectationTree, result.expectationGroupings, result.logicSummary),
    ],
  }} />;
}

export function OverallGroupingPreview(input: AppliedFilterSummaryInput) {
  return <GroupingPreview label="Preview overall filter grouping" data={{ title: "Overall result — Filters", sections: [{
    title: "Filters",
    clauses: (input.filtersApplied ?? []).map((filter, index) => ({ id: filter.id, label: `Filter ${index + 1}: ${formatFilterRow(filter)}` })),
    tree: input.filtersGroupTree ?? null, relation: input.filtersRelation ?? null,
    errors: input.filtersGroupingErrors ?? [], emptyText: "No filtering rows applied.",
  }] }} />;
}
