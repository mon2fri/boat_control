import { useMemo, useState } from "react";
import type { Condition, GroupNode, LogicClause, LogicOperator, Rule, RuleDraft } from "../../api/domain";
import { ColumnField } from "../../components/ColumnField";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { nextId } from "../../lib/id";
import { LOGIC_OPERATORS } from "./constants";
import { GroupingTreeEditor } from "./GroupingTreeEditor";
import { formatGroupTree } from "./groupingTree";

interface Props {
  /** Existing rule when editing; undefined when creating. */
  rule?: Rule;
  columns: string[];
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
  logic: LogicClause;
}

function initialDraft(rule?: Rule): DraftState {
  if (rule) {
    return {
      name: rule.name,
      description: rule.description ?? "",
      conditions: rule.conditions,
      conditionJoin: rule.conditionJoin,
      conditionGrouping: rule.conditionGrouping ?? "",
      groupTree: rule.groupTree,
      logic: rule.logic,
    };
  }
  return {
    name: "",
    description: "",
    conditions: [],
    conditionJoin: null,
    conditionGrouping: "",
    groupTree: null,
    logic: { id: nextId("logic"), format: "value", column: "", operator: "equals", target: "" },
  };
}

function newCondition(): Condition {
  return { id: nextId("cond"), column: "", operator: "equals", value: "" };
}

/**
 * Create/update editor for a validation rule. Enforces the requirement rules:
 * optional conditions with a mandatory and/or join once there is more than one,
 * an optional grouping expression once there are three or more, and a mandatory
 * logic clause in either Value-against-Column or Column-against-Column format.
 * Guards against discarding unsaved edits.
 */
export function RuleEditor({ rule, columns, saving, error, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<DraftState>(() => initialDraft(rule));
  const [pristine] = useState<DraftState>(() => initialDraft(rule));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(pristine), [draft, pristine]);
  const needsJoin = draft.conditions.length > 1;
  const canGroup = draft.conditions.length >= 3;

  const validation = validateDraft(draft, needsJoin);
  const logicPreview = previewLogicDescription(draft);

  function patch(next: Partial<DraftState>): void {
    setDraft((d) => ({ ...d, ...next }));
  }

  function updateCondition(id: string, next: Partial<Condition>): void {
    patch({ conditions: draft.conditions.map((c) => (c.id === id ? { ...c, ...next } : c)) });
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    setSubmitted(true);
    if (!validation.valid) return;
    onSave(toDraft(draft, rule));
  }

  function requestCancel(): void {
    if (isDirty) setConfirmCancel(true);
    else onCancel();
  }

  return (
    <form
      className="card"
      onSubmit={handleSubmit}
      noValidate
      aria-label={rule ? `Edit rule ${rule.index}` : "New rule"}
    >
      <h3 className="card-heading">{rule ? `Edit ${rule.index}` : "New rule"}</h3>

      <details className="rule-semantic-help">
        <summary>How rules work — what does this rule check?</summary>
        <p>
          A rule describes the <strong>required state</strong> for one column
          (and optionally a set of preconditions). Rows that match the rule are
          valid; rows that <em>do not</em> match are reported as violations.
          Example: <code>status must equal "active"</code> flags every row whose
          status is anything other than <code>active</code>.
        </p>
        <p>
          Conditions narrow the rows the rule applies to (e.g. only check
          <code> status</code> when <code>region</code> is <code>EMEA</code>);
          the <em>logic</em> clause is the actual required state.
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
        {draft.conditions.map((condition, index) => (
          <div key={condition.id} className="filter-row" role="group" aria-label={`Condition ${index + 1}`}>
            <ColumnField
              label="Column"
              columns={columns}
              value={condition.column}
              onChange={(column) => updateCondition(condition.id, { column })}
            />
            <OperatorSelect
              label="Operator"
              value={condition.operator}
              onChange={(operator) => updateCondition(condition.id, { operator })}
            />
            <div className="field">
              <label htmlFor={`cond-val-${condition.id}`}>Value</label>
              <input
                id={`cond-val-${condition.id}`}
                value={condition.value}
                onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
              />
            </div>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => patch({ conditions: draft.conditions.filter((c) => c.id !== condition.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => patch({ conditions: [...draft.conditions, newCondition()] })}
        >
          + Add condition
        </button>

        {needsJoin && (
          <div className="field">
            <label htmlFor="cond-join">Combining above conditions with</label>
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
            <label>
              Grouping
            </label>
            <GroupingTreeEditor
              conditions={draft.conditions}
              value={draft.groupTree}
              onChange={(groupTree) => patch({ groupTree })}
              groupingMode="per_grouping"
            />
            <p className="field-hint" data-testid="grouping-preview">
              <span className="visually-hidden">Grouping: </span>
              <code>
                {draft.groupTree
                  ? formatGroupTree(draft.groupTree, (id) => {
                      const c = draft.conditions.find((cc) => cc.id === id);
                      return c ? `cond ${draft.conditions.indexOf(c) + 1}` : id;
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
              onChange={() => patch({ logic: { ...draft.logic, format: "value", target: "" } })}
            />{" "}
            Value against column
          </label>
          <label>
            <input
              type="radio"
              name="logic-format"
              checked={draft.logic.format === "column"}
              onChange={() => patch({ logic: { ...draft.logic, format: "column", target: "" } })}
            />{" "}
            Column against column
          </label>
        </div>

        <div className="filter-row">
          <ColumnField
            label="Column"
            columns={columns}
            value={draft.logic.column}
            onChange={(column) => patch({ logic: { ...draft.logic, column } })}
          />
          <OperatorSelect
            label="Operator"
            value={draft.logic.operator}
            onChange={(operator) => patch({ logic: { ...draft.logic, operator } })}
          />
          {draft.logic.format === "column" ? (
            <ColumnField
              label="Compared column"
              columns={columns}
              value={draft.logic.target}
              onChange={(target) => patch({ logic: { ...draft.logic, target } })}
            />
          ) : (
            <div className="field">
              <label htmlFor="logic-value">Value</label>
              <input
                id="logic-value"
                value={draft.logic.target}
                onChange={(e) => patch({ logic: { ...draft.logic, target: e.target.value } })}
                placeholder="Literal value (choose “Others” to type any value)"
              />
            </div>
          )}
        </div>
        <p className="field-hint" data-testid="rule-logic-preview">
          <span className="visually-hidden">Rule description: </span>
          <code>{logicPreview}</code>
        </p>
      </fieldset>

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

function validateDraft(draft: DraftState, needsJoin: boolean): ValidationResult {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("Name is required.");
  if (needsJoin && draft.conditionJoin === null) {
    errors.push("Choose AND, OR, or PER GROUPING to combine multiple conditions.");
  }
  if (needsJoin && draft.conditionJoin === "per_grouping" && !draft.groupTree) {
    errors.push("Add at least one group when using PER GROUPING.");
  }
  for (const [i, c] of draft.conditions.entries()) {
    if (!c.column.trim() || !c.value.trim()) {
      errors.push(`Condition ${i + 1} needs a column and a value.`);
    }
  }
  if (!draft.logic.column.trim()) errors.push("Logic needs a column.");
  if (!draft.logic.target.trim()) {
    errors.push(draft.logic.format === "column" ? "Logic needs a compared column." : "Logic needs a value.");
  }
  return { valid: errors.length === 0, errors };
}

function toDraft(draft: DraftState, rule?: Rule): RuleDraft {
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
    logic: draft.logic,
  };
}

/** Live preview string for the logic fieldset, in required-state language. */
function previewLogicDescription(draft: DraftState): string {
  const phrase = OPERATOR_PHRASE[draft.logic.operator] ?? draft.logic.operator.replace(/_/g, " ");
  const col = draft.logic.column.trim() || "<column>";
  const rhs =
    draft.logic.format === "column"
      ? `column ${draft.logic.target.trim() || "<compared column>"}`
      : `"${draft.logic.target.trim() || "<value>"}"`;
  return `${col} ${phrase} ${rhs}`;
}

const OPERATOR_PHRASE: Record<string, string> = {
  equals: "must equal",
  not_equals: "must not equal",
  contains: "must contain",
  not_contains: "must not contain",
  greater_than: "must be greater than",
  less_than: "must be less than",
};
