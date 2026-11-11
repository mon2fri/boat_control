import { useMemo, useState } from "react";
import type { Condition, GroupNode, LogicClause, LogicOperator, Rule, RuleDraft } from "../../api/domain";
import { ColumnField } from "../../components/ColumnField";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { SectionHint } from "../../components/SectionHint";
import { SearchableMultiSelect, type MultiSelectOption } from "../../components/SearchableMultiSelect";
import { useFamilies } from "../settings/useSettings";
import { valueFamilyOptions, withColumnFamilies } from "../families/familyOptions";
import { nextId } from "../../lib/id";
import { LOGIC_OPERATORS } from "./constants";
import { GroupingTreeEditor } from "./GroupingTreeEditor";
import { formatGroupTreeHierarchy } from "./groupingTree";
import { PER_GROUPING_HELP_TEXT } from "./groupingEditorSupport";
import {
  clearLogicOutcomeGrouping,
  columnModeHasRetainedOutcomes,
  formatLogicOutcomeExpression,
  getRuleLogicClauses,
  getRuleLogicGrouping,
  isNumericLogicOperator as isNumericOperator,
  logicClauseValues,
  normalizeLogicClauseValues,
  outcomeAsCondition,
  outcomeLabel,
  repairLogicOutcomeTree,
  validateLogicOutcomes,
  type GroupedRuleDraft,
  type LogicOutcomeGrouping,
} from "./logicOutcomes";

interface Props {
  /** Existing rule when editing; undefined when creating. */
  rule?: Rule;
  /** Seed a new rule without treating it as an update to the source. */
  initialRule?: Rule;
  confirmDiscard?: boolean;
  columns: string[];
  columnValues?: Record<string, { value: string; starred: boolean }[]>;
  saving: boolean;
  error?: string | null;
  onSave: (draft: RuleDraft) => void;
  onCancel: () => void;
}

interface DraftState {
  name: string;
  description: string;
  conditions: Condition[];
  conditionJoin: "and" | "or" | "per_grouping" | null;
  /**
   * Legacy free-text grouping. Retained only so an in-flight edit does not
   * silently drop user input when loading a rule persisted with the old
   * format. New edits flow through `groupTree`.
   */
  conditionGrouping: string;
  groupTree: GroupNode | null;
  /** Legacy/primary logic clause. Kept as the single-expectation representation. */
  logic: LogicClause;
  /** Value-against-column expectations. The first clause mirrors `logic` in value mode. */
  logicClauses: LogicClause[];
  logicRelation: LogicOutcomeGrouping["mode"];
  logicGroupingTree: GroupNode | null;
  extraColumns: string[];
  hideComparison: boolean;
}

function initialDraft(rule?: Rule): DraftState {
  if (rule) {
    const clauses = getRuleLogicClauses(rule);
    const grouping = getRuleLogicGrouping(rule);
    return {
      name: rule.name,
      description: rule.description ?? "",
      conditions: rule.conditions,
      conditionJoin: rule.conditionJoin,
      conditionGrouping: rule.conditionGrouping ?? "",
      groupTree: rule.groupTree,
      logic: rule.logic,
      logicClauses: clauses.length > 0 ? clauses : [rule.logic],
      logicRelation: grouping.mode,
      logicGroupingTree: grouping.tree,
      extraColumns: rule.extraColumns ?? [],
      hideComparison: rule.hideComparison ?? false,
    };
  }
  const logic: LogicClause = {
    id: nextId("logic"),
    format: "value",
    column: "",
    operator: "equals",
    target: "",
  };
  return {
    name: "",
    description: "",
    conditions: [],
    conditionJoin: null,
    conditionGrouping: "",
    groupTree: null,
    logic,
    logicClauses: [logic],
    logicRelation: null,
    logicGroupingTree: null,
    extraColumns: [],
    hideComparison: false,
  };
}

function newCondition(): Condition {
  return { id: nextId("cond"), column: "", operator: "equals", values: [], value: "" };
}

function newLogicOutcome(): LogicClause {
  return {
    id: nextId("logic"),
    format: "value",
    column: "",
    operator: "equals",
    target: "",
  };
}

function conditionValues(condition: Condition): string[] {
  return condition.values ?? (condition.value ? [condition.value] : []);
}

/**
 * Create/update editor for a validation rule. Enforces the requirement rules:
 * optional conditions with a mandatory and/or join once there is more than one,
 * an optional grouping expression once there are three or more, and a mandatory
 * logic clause in either Value-against-Column or Column-against-Column format.
 * Guards against discarding unsaved edits.
 */
export function RuleEditor({ rule, initialRule, confirmDiscard = true, columns, columnValues = {}, saving, error, onSave, onCancel }: Props) {
  const { data: families = [] } = useFamilies();
  const [draft, setDraft] = useState<DraftState>(() => initialDraft(rule ?? initialRule));
  const [pristine] = useState<DraftState>(() => initialDraft(rule ?? initialRule));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [conditionGroupingReset, setConditionGroupingReset] = useState(0);
  const [expectationGroupingReset, setExpectationGroupingReset] = useState(0);
  const [confirmSingleOutcome, setConfirmSingleOutcome] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(pristine), [draft, pristine]);
  const needsJoin = draft.conditions.length > 1;
  const canGroup = draft.conditions.length >= 3;
  const logicGrouping: LogicOutcomeGrouping = {
    mode: draft.logicRelation,
    tree: draft.logicGroupingTree,
  };
  const retainedColumnOutcomes = columnModeHasRetainedOutcomes(
    draft.logic.format,
    draft.logicClauses,
  );
  const outcomeValidation = validateLogicOutcomes(draft.logicClauses, logicGrouping);

  const validation = validateDraft(draft, needsJoin, Boolean(rule));
  const logicPreview = draft.logic.format === "value" && draft.logicClauses.length > 1
    ? formatLogicOutcomeExpression(draft.logicClauses, logicGrouping)
    : previewLogicDescription(draft);

  function patch(next: Partial<DraftState>): void {
    setDraft((d) => ({ ...d, ...next }));
  }

  function updateCondition(id: string, next: Partial<Condition>): void {
    patch({ conditions: draft.conditions.map((c) => (c.id === id ? { ...c, ...next } : c)) });
  }

  function updateLogicClause(id: string, next: Partial<LogicClause>): void {
    const clauses = draft.logicClauses.map((clause) =>
      clause.id === id ? { ...clause, ...next, format: "value" as const } : clause,
    );
    const primary = clauses[0] ?? draft.logic;
    patch({
      logicClauses: clauses,
      ...(draft.logic.format === "value"
        ? { logic: { ...primary, format: "value" as const } }
        : {}),
    });
  }

  function addLogicOutcome(): void {
    const clauses = [...draft.logicClauses, newLogicOutcome()];
    patch({
      logicClauses: clauses,
      logic: { ...clauses[0]!, format: "value" },
      // A newly authored multi-expectation expression requires an explicit choice.
      logicRelation: draft.logicRelation,
    });
  }

  function removeLogicOutcome(id: string): void {
    const clauses = draft.logicClauses.filter((clause) => clause.id !== id);
    if (clauses.length === 0) return;
    patch({
      logicClauses: clauses,
      logic: { ...clauses[0]!, format: "value" },
    });
  }

  function moveLogicOutcome(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= draft.logicClauses.length) return;
    const clauses = [...draft.logicClauses];
    const [moved] = clauses.splice(index, 1);
    clauses.splice(target, 0, moved!);
    patch({
      logicClauses: clauses,
      logic: { ...clauses[0]!, format: "value" },
    });
  }

  function useSingleOutcome(): void {
    const clauses = draft.logicClauses.slice(0, 1);
    patch({
      logicClauses: clauses,
      logic: { ...clauses[0]!, format: "value" },
      logicRelation: null,
      logicGroupingTree: null,
    });
    setConfirmSingleOutcome(false);
  }

  function selectLogicFormat(format: LogicClause["format"]): void {
    if (format === "column") {
      patch({
        logic: {
          ...draft.logic,
          format: "column",
          target: draft.logic.column,
          columnComparisonMode: "comparison_vs_baseline",
        },
      });
      return;
    }
    // Restore the retained value expectation list rather than discarding it.
    const primary = draft.logicClauses[0] ?? draft.logic;
    patch({ logic: { ...primary, format: "value" } });
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    setSubmitted(true);
    if (!validation.valid) return;
    onSave(toDraft(draft, rule));
  }

  function requestCancel(): void {
    if (isDirty && confirmDiscard) setConfirmCancel(true);
    else onCancel();
  }

  return (
    <form
      className="card"
      onSubmit={handleSubmit}
      noValidate
      aria-label={rule ? `Edit rule ${rule.index}` : "New rule"}
    >
      <div className="rule-editor-header">
        <h3 className="card-heading">{rule ? `Edit ${rule.index}` : "New rule"}</h3>
        {rule?.identifier && (
          <p className="rule-editor-identifier">
            <span>Rule Identifier:</span>
            <code>{rule.identifier}</code>
          </p>
        )}
      </div>

      <details className="rule-semantic-help">
        <summary>How rules work — what does this rule check?</summary>
        <p>
          A rule describes the <span className="text-green text-bold">required/expected state</span> for
          one column (and optionally a set of preconditions).
        </p>
        <p>
          <strong>Rows</strong> that <span className="text-green">match</span> the rule are
          <span className="text-green"> valid</span>.
        </p>
        <p>
          <strong>Rows</strong> that <span className="text-red">DO NOT match</span> are reported as
          <span className="text-red"> exceptions</span>.
        </p>
        <p>
          Example: <code className="greybox">status must equal to "active"</code> flags every row whose status is
          anything other than <code className="greybox">active</code>.
        </p>
        <p>
          <strong>Conditions</strong> narrow the rows the rule applies to (e.g. only check
          <code className="greybox">status</code> when <code className="greybox">region</code> is <code className="greybox">HBAP</code>).
        </p>
        <p>
          <strong>Logic</strong> clause is the actual required state. When one rule has
          multiple expectations, the expectation grouping decides whether the record
          satisfies the required state.
        </p>
        <p>
          <strong>Null and blank values:</strong> <code>equals</code> and <code>contains</code>
          never match; <code>not equal to</code> and <code>not contains</code> do match.
          This applies to Row Filters, Rule Conditions, and Rule Logic, including
          multi-value clauses. Whitespace-only text is treated literally (not trimmed).
        </p>
      </details>

      <div className="field">
        <label htmlFor="rule-name">Name</label>
        <input
          id="rule-name"
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
          aria-invalid={submitted && !draft.name.trim()}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="rule-desc">Description (optional)</label>
        <input id="rule-desc" value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
      </div>

      <fieldset>
        <legend>Conditions (optional)</legend>
        {draft.conditions.length === 0 && (
          <p className="field-hint">No conditions — the rule always evaluates its logic.</p>
        )}
        {draft.conditions.map((condition, index) => {
          const valueOptions: MultiSelectOption[] = [
            ...valueFamilyOptions(condition.column, families),
            ...(columnValues[condition.column] ?? []).map((v) => ({
              value: v.value,
              label: v.starred ? `${v.value} *` : v.value,
              disabled: v.starred,
            })),
          ];
          return (
            <div key={condition.id} className="filter-row rule-condition-row" role="group" aria-label={`Condition ${index + 1}`}>
              <span className="condition-number" aria-hidden="true">
                Condition {index + 1}
              </span>
              <ColumnField
                label="Column"
                columns={columns}
                value={condition.column}
                onChange={(column) => updateCondition(condition.id, { column, values: [], value: "" })}
              />
              <OperatorSelect
                label="Operator"
                value={condition.operator}
                onChange={(operator) => updateCondition(condition.id, { operator, values: [], value: "" })}
              />
              {isNumericOperator(condition.operator) ? (
                <div className="field">
                  <label htmlFor={`condition-value-${condition.id}`}>Value</label>
                  <input
                    id={`condition-value-${condition.id}`}
                    type="number"
                    step="any"
                    value={conditionValues(condition)[0] ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateCondition(condition.id, { values: value ? [value] : [], value });
                    }}
                    placeholder="Enter any number"
                    disabled={!condition.column}
                  />
                </div>
              ) : (
                <SearchableMultiSelect
                    label="Value"
                    options={valueOptions}
                    selectedFirst
                    hintTooltip
                    selected={conditionValues(condition)}
                    onChange={(values) => updateCondition(condition.id, { values, value: values[0] ?? "" })}
                    placeholder={condition.column ? "Search or type values…" : "Pick a column first"}
                    disabled={!condition.column}
                    freeText
                    hint="Multiple values: equals/contains match if ANY value matches; not equals/not contains match if NO value matches (i.e. not any). Null/blank never satisfies equals/contains; it satisfies not equals/not contains."
                  />
              )}
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => patch({ conditions: draft.conditions.filter((c) => c.id !== condition.id) })}
              >
                Remove
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="btn"
          onClick={() => patch({ conditions: [...draft.conditions, newCondition()] })}
        >
          + Add condition
        </button>

        {needsJoin && (
          <div className="field">
            <label htmlFor="cond-join">Combining Conditions with</label>
            <select
              id="cond-join"
              value={draft.conditionJoin ?? ""}
              onChange={(e) => {
                const val = e.target.value || null;
                patch({
                  conditionJoin: val as "and" | "or" | "per_grouping" | null,
                  ...(val !== "per_grouping" ? { groupTree: null } : {}),
                });
              }}
              aria-invalid={submitted && needsJoin && draft.conditionJoin === null}
            >
              <option value="">Choose…</option>
              <option value="and">AND — all must match</option>
              <option value="or">OR — any may match</option>
              <option value="per_grouping">PER GROUPING — custom groups</option>
            </select>
          </div>
        )}

        {canGroup && draft.conditionJoin === "per_grouping" && (
          <div className="field">
            <div className="group-tree-title-row">
              <span className="field-label">Condition groups</span>
              <SectionHint label="Condition groups help">{PER_GROUPING_HELP_TEXT}</SectionHint>
            </div>
            <GroupingTreeEditor
              key={conditionGroupingReset}
              conditions={draft.conditions}
              value={draft.groupTree}
              onChange={(groupTree) => patch({ groupTree })}
              groupingMode="per_grouping"
              showHelp={false}
              conditionLabel={(condition) => {
                const index = draft.conditions.findIndex(
                  (item) => item.id === condition.id,
                );
                const phrase = OPERATOR_PHRASE[condition.operator] ?? condition.operator;
                const values = conditionValues(condition).map((value) => `"${value}"`).join(" OR ");
                return index >= 0 ? `Condition ${index + 1}: ${condition.column || "<column>"} ${phrase} ${values || "<value>"}` : condition.id;
              }}
            />
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => { setConditionGroupingReset((version) => version + 1); patch({ groupTree: null, conditionJoin: null }); }}
              >
                Remove all groups
              </button>
            </div>
            <p className="field-hint" data-testid="grouping-preview">
              <span className="visually-hidden">Grouping: </span>
              <code style={{ whiteSpace: "pre-wrap" }}>
                {draft.groupTree
                  ? formatGroupTreeHierarchy(draft.groupTree, (id) => {
                      const c = draft.conditions.find((cc) => cc.id === id);
                      return c ? `condition ${draft.conditions.indexOf(c) + 1}` : id;
                    })
                  : "Add groups to define custom combining logic"}
              </code>
            </p>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Logic (required)</legend>
        <div className="mode-toggle" role="radiogroup" aria-label="Logic format">
          <label>
            <input
              type="radio"
              name="logic-format"
              checked={draft.logic.format === "value"}
              onChange={() => selectLogicFormat("value")}
            />{" "}
            Value against column
          </label>
          <label>
            <input
              type="radio"
              name="logic-format"
              checked={draft.logic.format === "column"}
              onChange={() => selectLogicFormat("column")}
            />{" "}
            Column against column
          </label>
        </div>

        {retainedColumnOutcomes && (
          <div className="alert alert--warn" role="status">
            <p style={{ marginTop: 0 }}>
              Column against column supports one expectation. {draft.logicClauses.length - 1} extra
              value expectation{draft.logicClauses.length - 1 === 1 ? " is" : "s are"} retained and
              will return if you switch back to Value against column.
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => setConfirmSingleOutcome(true)}
            >
              Discard extra expectations
            </button>
          </div>
        )}

        {draft.logic.format === "column" && (
          <div className="mode-toggle" role="radiogroup" aria-label="Column comparison source">
            <label>
              <input
                type="radio"
                name="column-comparison-mode"
                checked={(draft.logic.columnComparisonMode ?? "comparison_vs_baseline") === "comparison_vs_baseline"}
                onChange={() => patch({
                  logic: {
                    ...draft.logic,
                    columnComparisonMode: "comparison_vs_baseline",
                    target: draft.logic.column,
                  },
                })}
              />{" "}
              Same column: Comparison vs Baseline
            </label>
            <label>
              <input
                type="radio"
                name="column-comparison-mode"
                checked={draft.logic.columnComparisonMode === "comparison_vs_comparison"}
                onChange={() => patch({
                  logic: {
                    ...draft.logic,
                    columnComparisonMode: "comparison_vs_comparison",
                    target: "",
                  },
                })}
              />{" "}
              Different columns: Comparison vs Comparison
            </label>
          </div>
        )}

        {draft.logic.format === "column" ? (
          <div className="filter-row">
            <ColumnField
              label="COLUMN in COMPARISON"
              columns={columns}
              value={draft.logic.column}
              onChange={(column) => patch({
                logic: {
                  ...draft.logic,
                  column,
                  ...(
                    (draft.logic.columnComparisonMode ?? "comparison_vs_baseline") === "comparison_vs_baseline"
                      ? { target: column }
                      : {}
                  ),
                },
              })}
            />
            <OperatorSelect
              label="Operator"
              value={draft.logic.operator}
              onChange={(operator) => patch({ logic: { ...draft.logic, operator } })}
            />
            {draft.logic.columnComparisonMode === "comparison_vs_comparison" ? (
              <ColumnField
                label="SECOND COLUMN in COMPARISON"
                columns={columns}
                value={draft.logic.target}
                onChange={(target) => patch({ logic: { ...draft.logic, target } })}
              />
            ) : (
              <p className="field-hint">
                Compared with the same <strong>{draft.logic.column || "selected"}</strong> column in Baseline.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="logic-outcomes" role="group" aria-label="Expectations">
              {draft.logicClauses.map((clause, index) => {
                const multi = draft.logicClauses.length > 1;
                const valueOptions: MultiSelectOption[] = [
                  ...valueFamilyOptions(clause.column, families),
                  ...(columnValues[clause.column] ?? []).map((v) => ({
                    value: v.value,
                    label: v.starred ? `${v.value} *` : v.value,
                    disabled: v.starred,
                  })),
                ];
                return (
                  <div
                    key={clause.id}
                    className="filter-row rule-outcome-row"
                    role="group"
                    aria-label={`Expectation ${index + 1}`}
                  >
                    {multi && (
                      <span className="condition-number" aria-hidden="true">
                        Expectation {index + 1}
                      </span>
                    )}
                    <ColumnField
                      label={multi
                        ? `COLUMN in COMPARISON (expectation ${index + 1})`
                        : "COLUMN in COMPARISON"}
                      columns={columns}
                      value={clause.column}
                      onChange={(column) =>
                        updateLogicClause(clause.id, { column, values: [], target: "" })
                      }
                    />
                    <OperatorSelect
                      label="Operator"
                      value={clause.operator}
                      onChange={(operator) =>
                        updateLogicClause(clause.id, { operator })
                      }
                    />
                    {isNumericOperator(clause.operator) ? (
                      <div className="field">
                        <label htmlFor={index === 0 ? "logic-value" : `logic-value-${clause.id}`}>
                          Value
                        </label>
                        <input
                          id={index === 0 ? "logic-value" : `logic-value-${clause.id}`}
                          type="number"
                          step="any"
                          value={logicClauseValues(clause)[0] ?? ""}
                          onChange={(event) =>
                            updateLogicClause(clause.id, {
                              target: event.target.value,
                              values: event.target.value ? [event.target.value] : [],
                            })
                          }
                          placeholder="Enter any number"
                        />
                      </div>
                    ) : (
                      <SearchableMultiSelect
                        label="Value"
                        options={valueOptions}
                        selected={logicClauseValues(clause)}
                        onChange={(values) => {
                          const normalized = normalizeLogicClauseValues(values);
                          updateLogicClause(clause.id, {
                            values: normalized,
                            target: normalized[0] ?? "",
                          });
                        }}
                        placeholder={clause.column ? "Search or type values…" : "Pick a column first"}
                        disabled={!clause.column}
                        freeText
                        hintTooltip
                        hint="Multiple values: equals/contains match if ANY value matches; not equals/not contains match if NO value matches (i.e. not any). Null/blank never satisfies equals/contains; it satisfies not equals/not contains."
                      />
                    )}
                    {multi && (
                      <div className="rule-outcome-actions">
                        <button
                          type="button"
                          className="btn"
                          disabled={index === 0}
                          onClick={() => moveLogicOutcome(index, -1)}
                          aria-label={`Move expectation ${index + 1} up`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={index === draft.logicClauses.length - 1}
                          onClick={() => moveLogicOutcome(index, 1)}
                          aria-label={`Move expectation ${index + 1} down`}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger"
                          onClick={() => removeLogicOutcome(clause.id)}
                          aria-label={`Remove expectation ${index + 1}`}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button type="button" className="btn" onClick={addLogicOutcome}>
              + Add expectation
            </button>

            {draft.logicClauses.length > 1 && (
              <>
                <div className="field">
                  <label htmlFor="logic-join">Combining expectations with</label>
                  <select
                    id="logic-join"
                    value={draft.logicRelation ?? ""}
                    aria-invalid={draft.logicRelation === null}
                    onChange={(event) => {
                      const mode = (event.target.value || null) as LogicOutcomeGrouping["mode"];
                      patch({ logicRelation: mode });
                    }}
                  >
                    <option value="">Choose…</option>
                    <option value="and">AND — all must match</option>
                    <option value="or">OR — any may match</option>
                    <option value="custom">CUSTOM GROUPS — nested groups</option>
                  </select>
                </div>

                {draft.logicRelation === "custom" && (
                  <div className="field">
                    <div className="group-tree-title-row">
                      <span className="field-label">Expectation groups</span>
                      <SectionHint label="Expectation groups help">{PER_GROUPING_HELP_TEXT}</SectionHint>
                    </div>
                    <GroupingTreeEditor
                      key={expectationGroupingReset}
                      conditions={draft.logicClauses.map(outcomeAsCondition)}
                      value={draft.logicGroupingTree}
                      onChange={(tree) => patch({ logicGroupingTree: tree })}
                      groupingMode="per_grouping"
                      showHelp={false}
                      conditionLabel={(condition) => {
                        const index = draft.logicClauses.findIndex(
                          (clause) => clause.id === condition.id,
                        );
                        return index >= 0
                          ? outcomeLabel(draft.logicClauses[index]!, index)
                          : `<missing expectation ${condition.id}>`;
                      }}
                    />
                    <div className="dialog-actions">
                      <button
                        type="button"
                        className="btn btn--danger"
                        onClick={() => {
                          setExpectationGroupingReset((version) => version + 1);
                          const cleared = clearLogicOutcomeGrouping();
                          patch({
                            logicRelation: cleared.mode,
                            logicGroupingTree: cleared.tree,
                          });
                        }}
                      >
                        Remove all groups
                      </button>
                      {draft.logicGroupingTree
                        && (outcomeValidation.unknownIds.length > 0
                          || outcomeValidation.missingIds.length > 0
                          || outcomeValidation.structuralErrors.length > 0) && (
                        <button
                          type="button"
                          className="btn btn--primary"
                          onClick={() =>
                            patch({
                              logicGroupingTree: repairLogicOutcomeTree(
                                draft.logicClauses,
                                logicGrouping,
                              ).tree,
                            })
                          }
                        >
                          Remove stale expectation references
                        </button>
                      )}
                    </div>
                  </div>
                )}

              </>
            )}
          </>
        )}

        <p className="field-hint" data-testid="rule-logic-preview">
          <span className="visually-hidden">Rule description: </span>
          <code>{logicPreview}</code>
        </p>
        {draft.logic.format === "value"
          && draft.logicRelation === "custom"
          && draft.logicGroupingTree && (
            <p className="field-hint" data-testid="logic-grouping-preview">
              <span className="visually-hidden">Expectation grouping: </span>
              <code style={{ whiteSpace: "pre-wrap" }}>
                {formatGroupTreeHierarchy(draft.logicGroupingTree, (id) => {
                  const index = draft.logicClauses.findIndex((clause) => clause.id === id);
                  return index >= 0 ? `expectation ${index + 1}` : id;
                })}
              </code>
            </p>
          )}
      </fieldset>

      <ConfirmDialog
        title="Discard extra expectations?"
        open={confirmSingleOutcome}
        confirmLabel="Discard extra expectations"
        confirmTone="danger"
        onCancel={() => setConfirmSingleOutcome(false)}
        onConfirm={useSingleOutcome}
      >
        <p>
          Only the first expectation will remain. This removes the other expectations and their
          grouping from this rule.
        </p>
      </ConfirmDialog>

      <fieldset>
        <legend>Extra columns to display (optional)</legend>
        <SearchableMultiSelect
          label="Extra columns to display"
          options={withColumnFamilies(columns, families)}
          selected={draft.extraColumns}
          onChange={(extraColumns) => patch({ extraColumns })}
          placeholder="Search selected columns…"
          hint="Selected comparison columns appear in this rule's exception detail table."
        />
      </fieldset>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={draft.hideComparison}
          onChange={(event) => patch({ hideComparison: event.target.checked })}
        />
        <span>
          Hide comparison columns
        </span>
      </label>

      {submitted && !validation.valid && (
        <ul className="alert alert--error" aria-live="polite">
          {validation.errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={requestCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? "Saving…" : "Save rule"}
        </button>
      </div>

      <ConfirmDialog
        title="Discard unsaved changes?"
        open={confirmCancel}
        confirmLabel="Discard"
        confirmTone="danger"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          onCancel();
        }}
      >
        <p>This rule has unsaved edits. Discard them?</p>
      </ConfirmDialog>
    </form>
  );
}

function OperatorSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LogicOperator;
  onChange: (value: LogicOperator) => void;
}) {
  const id = useMemoId(label);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as LogicOperator)}>
        {LOGIC_OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Small stable id derived from a label (avoids importing useId in a tiny helper).
function useMemoId(label: string): string {
  return useMemo(() => `op-${label.toLowerCase().replace(/\s+/g, "-")}-${nextId()}`, [label]);
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateDraft(draft: DraftState, needsJoin: boolean, isEditing: boolean): ValidationResult {
  const errors: string[] = [];
  if (isEditing && !draft.name.trim()) errors.push("Rule name is required when editing a rule.");
  if (needsJoin && draft.conditionJoin === null) {
    errors.push("Choose AND, OR, or PER GROUPING to combine multiple conditions.");
  }
  if (needsJoin && draft.conditionJoin === "per_grouping") {
    if (!draft.groupTree) {
      errors.push("Add at least one group when using PER GROUPING.");
    } else {
      // Validate all conditions are grouped
      const grouped = collectConditionIdsFromTree(draft.groupTree);
      const missing = draft.conditions.filter((c) => !grouped.has(c.id));
      if (missing.length > 0) {
        errors.push(`All conditions must be grouped. ${missing.length} condition(s) not in any group.`);
      }
    }
  }
  for (const [i, c] of draft.conditions.entries()) {
    const values = conditionValues(c);
    if (!c.column.trim() || values.length === 0 || values.every((value) => !value.trim())) {
      errors.push(`Condition ${i + 1} needs a column and a value.`);
    } else if (isNumericOperator(c.operator) && !Number.isFinite(Number(values[0]))) {
      errors.push(`Condition ${i + 1} needs a valid number.`);
    }
  }
  const clauses = draft.logicClauses.length > 0 ? draft.logicClauses : [draft.logic];
  if (draft.logic.format === "column") {
    if (clauses.length > 1) {
      errors.push(
        "Column against column supports one expectation. Remove the extra expectations or switch back to Value against column.",
      );
    }
    if (!draft.logic.column.trim()) errors.push("Logic needs a column.");
    if (!draft.logic.target.trim()) {
      errors.push("Logic needs a compared column.");
    }
  } else if (clauses.length <= 1) {
    const clause = clauses[0]!;
    if (!clause.column.trim()) errors.push("Logic needs a column.");
    const logicValues = logicClauseValues(clause).filter((value) => value.trim());
    if (logicValues.length === 0) {
      errors.push("Logic needs a value.");
    } else if (isNumericOperator(clause.operator) && !Number.isFinite(Number(logicValues[0]))) {
      errors.push("Logic needs a valid number.");
    }
  } else {
    errors.push(
      ...validateLogicOutcomes(clauses, {
        mode: draft.logicRelation,
        tree: draft.logicGroupingTree,
      }).errors,
    );
  }
  return { valid: errors.length === 0, errors };
}

function collectConditionIdsFromTree(node: GroupNode): Set<string> {
  const ids = new Set<string>();
  const walk = (n: GroupNode) => {
    if (n.kind === "leaf") ids.add(n.conditionId);
    else n.children.forEach(walk);
  };
  walk(node);
  return ids;
}

function toDraft(draft: DraftState, rule?: Rule): RuleDraft {
  const clauses = draft.logicClauses.length > 0
    ? draft.logicClauses.map((clause) => ({ ...clause, format: "value" as const }))
    : [];
  const primary = draft.logic.format === "value"
    ? clauses[0] ?? { ...draft.logic, format: "value" as const }
    : draft.logic;
  const logic = primary.format === "column"
    && (primary.columnComparisonMode ?? "comparison_vs_baseline") === "comparison_vs_baseline"
      ? { ...primary, target: primary.column, columnComparisonMode: "comparison_vs_baseline" as const }
      : primary;
  const grouped: Partial<GroupedRuleDraft> = {};
  if (draft.logic.format === "value" && clauses.length > 1) {
    grouped.logicClauses = clauses;
    if (draft.logicRelation === "custom") {
      grouped.logicGroupTree = draft.logicGroupingTree;
      // Retain the earlier D-only alias so pre-integration component tests and
      // callers keep working; transport reads the canonical logicGroupTree.
      grouped.logicGroupingTree = draft.logicGroupingTree;
      if (draft.logicGroupingTree?.kind === "and" || draft.logicGroupingTree?.kind === "or") {
        // Preserve the root relation alongside the executable tree so an
        // unchanged custom rule keeps both fields it was loaded with.
        grouped.logicRelation = draft.logicGroupingTree.kind;
      }
    } else if (draft.logicRelation === "and" || draft.logicRelation === "or") {
      grouped.logicRelation = draft.logicRelation;
    }
  }
  return {
    ...(rule ? { index: rule.index } : {}),
    name: draft.name.trim(),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    conditions: draft.conditions,
    conditionJoin:
      draft.conditionJoin === "per_grouping"
        ? null
        : draft.conditions.length > 1
          ? draft.conditionJoin
          : null,
    // Persist only the executable tree. The legacy free-text field is never
    // split on whitespace; it is preserved as-is for old payloads only.
    conditionGrouping: null,
    groupTree: draft.groupTree,
    logic,
    ...grouped,
    extraColumns: draft.extraColumns,
    hideComparison: draft.hideComparison,
  };
}

/** Live preview string for the logic fieldset, in required-state language. */
function previewLogicDescription(draft: DraftState): string {
  const phrase = OPERATOR_PHRASE[draft.logic.operator] ?? draft.logic.operator.replace(/_/g, " ");
  const col = draft.logic.column.trim() || "<column>";
  if (draft.logic.format === "column") {
    const rhs = (draft.logic.columnComparisonMode ?? "comparison_vs_baseline") === "comparison_vs_baseline"
      ? `the same ${col} column in Baseline`
      : `column ${draft.logic.target.trim() || "<comparison column>"} in Comparison`;
    return `${col} ${phrase} ${rhs}`;
  }
  const values = draft.logic.values?.filter((v) => v.trim()) ?? (draft.logic.target.trim() ? [draft.logic.target.trim()] : []);
  if (values.length === 0) return `${col} ${phrase} "<value>"`;
  if (values.length === 1) return `${col} ${phrase} "${values[0]}"`;
  const connector = draft.logic.operator === "not_equals" || draft.logic.operator === "not_contains"
    ? " and "
    : " or ";
  const joined = values.slice(0, -1).map((v) => `"${v}"`).join(connector) + `${connector}"${values[values.length - 1]}"`;
  return `${col} ${phrase} ${joined}`;
}

const OPERATOR_PHRASE: Record<string, string> = {
  equals: "must equal",
  not_equals: "must not equal",
  contains: "must contain",
  not_contains: "must not contain",
  greater_than: "must be greater than",
  less_than: "must be less than",
};
