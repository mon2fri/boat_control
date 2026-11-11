import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GroupNode, GroupRelation, Rule } from "../../api/domain";
import { buildFlatGroupTree, resolveGroupedExpression } from "../../lib/grouping";
import { getRuleLogicClauses, getRuleLogicGrouping, outcomeLabel } from "./logicOutcomes";
import { describeLogic } from "./useRules";
import { ClauseLabel } from "./ClauseLabel";

export interface PreviewSection {
  title: string;
  clauses: { id: string; label: string }[];
  relation?: GroupRelation | null;
  tree?: GroupNode | null;
  errors?: string[];
  emptyText: string;
}
export interface GroupingPreviewData {
  title: string;
  description?: string;
  sections: PreviewSection[];
}

function TreeNode({ node, labels, groupIds }: { node: GroupNode; labels: Map<string, string>; groupIds: Map<GroupNode, number> }) {
  return (
    <li className="group-tree-node">
      {node.kind === "leaf" ? (
        <span className="group-tree-member-row"><ClauseLabel label={labels.get(node.conditionId) ?? "Unavailable clause"} /></span>
      ) : (
        <>
          <div className="group-tree-member-row">
            <ClauseLabel label={`Group ${groupIds.get(node)}`} />
            <span className="group-tree-type group-tree-type--group">{node.kind.toUpperCase()}</span>
          </div>
          <ul className="group-tree-children">
            {node.children.map((child, index) => <TreeNode key={index} node={child} labels={labels} groupIds={groupIds} />)}
          </ul>
        </>
      )}
    </li>
  );
}

function TreeSection({ title, clauses, relation, tree, errors = [], emptyText }: PreviewSection) {
  const resolved = resolveGroupedExpression(clauses, relation, tree, { label: `${title} grouping` });
  const issues = [...errors, ...resolved.errors];
  const root = issues.length === 0
    ? resolved.tree ?? buildFlatGroupTree(clauses, resolved.relation ?? "and")
    : null;
  const groupIds = new Map<GroupNode, number>();
  function numberGroups(node: GroupNode | null): void {
    if (!node || node.kind === "leaf") return;
    node.children.forEach(numberGroups);
    groupIds.set(node, groupIds.size + 1);
  }
  numberGroups(root);
  return (
    <section aria-label={title}>
      <h4>{title}</h4>
      {issues.length > 0 && <p className="alert alert--error" role="alert">{issues.join(" ")}</p>}
      {root ? (
        <ul className="group-tree-children group-tree-children--root">
          <TreeNode node={root} labels={new Map(clauses.map((clause) => [clause.id, clause.label]))} groupIds={groupIds} />
        </ul>
      ) : clauses.length > 0 ? (
        <ul>{clauses.map((clause) => <li key={clause.id}><ClauseLabel label={clause.label} /></li>)}</ul>
      ) : <p className="field-hint">{emptyText}</p>}
    </section>
  );
}

/** Hover/focus preview only: never changes selection or the saved rule. */
export function GroupingPreview({ label, data: input }: { label: string; data: GroupingPreviewData }) {
  const data = { ...input, sections: input.sections.map((section) => {
    const resolved = resolveGroupedExpression(section.clauses, section.relation, section.tree, { label: `${section.title} grouping` });
    const errors = [...(section.errors ?? []), ...resolved.errors];
    return { ...section, errors, tree: errors.length ? null : resolved.tree ?? buildFlatGroupTree(section.clauses, resolved.relation ?? "and") };
  }) };
  const id = useId();
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancelDismiss = () => clearTimeout(timer.current);
  const dismiss = () => {
    cancelDismiss();
    timer.current = setTimeout(() => setPosition(null), 120);
  };
  function show() {
    cancelDismiss();
    const rect = trigger.current!.getBoundingClientRect();
    const width = Math.min(1000, window.innerWidth - 32);
    const height = Math.min(500, window.innerHeight * 0.6);
    setPosition({
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
      top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - height - 16)),
    });
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close);
    };
  }, [position]);
  return (
    <>
      <button ref={trigger} type="button" className="rule-preview-eye"
        aria-label={label}
        data-grouping-preview={JSON.stringify(data)}
        aria-describedby={position ? id : undefined}
        onMouseEnter={show} onMouseLeave={dismiss} onFocus={show} onBlur={dismiss}
        onKeyDown={(event) => { if (event.key === "Escape") { cancelDismiss(); setPosition(null); } }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      {position && createPortal(
        <div id={id} role="tooltip" className="rule-grouping-preview" style={position}
          onMouseEnter={cancelDismiss} onMouseLeave={dismiss}>
          <h3>{data.title}</h3>
          {data.description && <p className="field-hint">{data.description}</p>}
          <div className="rule-grouping-preview__columns">
            {data.sections.map((section) => <TreeSection key={section.title} {...section} />)}
          </div>
        </div>, document.body,
      )}
    </>
  );
}


export function RuleGroupingPreview({ rule }: { rule: Rule }) {
  const conditions = rule.conditions.map((condition, index) => ({
    id: condition.id,
    label: `Condition ${index + 1}: ${condition.column} ${condition.operator.replaceAll("_", " ")} ${(condition.values ?? (condition.value ? [condition.value] : []))
      .map((value) => JSON.stringify(value))
      .join(condition.operator === "not_equals" || condition.operator === "not_contains" ? " AND " : " OR ")}`,
  }));
  const clauses = getRuleLogicClauses(rule);
  const grouping = getRuleLogicGrouping(rule);
  const expectations = clauses.map((clause, index) => ({
    id: clause.id,
    label: clause.format === "column"
      ? `Expectation ${index + 1}: ${describeLogic({ ...rule, logic: clause, logicClauses: [clause] })}`
      : outcomeLabel(clause, index),
  }));
  return <GroupingPreview label={`Preview grouping for ${rule.index} ${rule.name}`} data={{
    title: `${rule.index} — ${rule.name}`,
    ...(rule.description ? { description: rule.description } : {}),
    sections: [
      { title: "Conditions", clauses: conditions,
        relation: rule.conditionJoin === "per_grouping" ? null : rule.conditionJoin,
        tree: rule.groupTree, emptyText: "No conditions — applies to all records.",
        errors: (rule.conditionJoin === "per_grouping" || rule.conditionGrouping) && !rule.groupTree ? ["Condition grouping is missing. Repair the rule to view its tree."] : [],
      },
      { title: "Expectations", clauses: expectations,
        relation: grouping.mode === "custom" ? null : grouping.mode,
        tree: grouping.tree, errors: rule.logicGroupingErrors ?? [], emptyText: "No expectations configured.",
      },
    ],
  }} />;
}
