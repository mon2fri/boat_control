import { useMemo, useState } from "react";
import type { Condition, LogicClause, LogicOperator, Rule, RuleDraft } from "../../api/domain";
import { ColumnField } from "../../components/ColumnField";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { nextId } from "../../lib/id";
import { LOGIC_OPERATORS } from "./constants";

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
  conditionJoin: "and" | "or" | null;
  conditionGrouping: string;
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
      logic: rule.logic,
    };
  }
  return {
    name: "",
    description: "",
    conditions: [],
    conditionJoin: null,
    conditionGrouping: "",
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
      <h3>{rule ? `Edit ${rule.index}` : "New rule"}</h3>

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
            <label htmlFor="cond-join">Combine conditions with</label>
            <select
              id="cond-join"
              value={draft.conditionJoin ?? ""}
              onChange={(e) => patch({ conditionJoin: (e.target.value || null) as "and" | "or" | null })}
              aria-invalid={submitted && needsJoin && draft.conditionJoin === null}
            >
              <option value="">Choose…</option>
              <option value="and">AND — all must match</option>
              <option value="or">OR — any may match</option>
            </select>
          </div>
        )}

        {canGroup && (
          <div className="field">
            <label htmlFor="cond-group">
              Custom grouping (optional, e.g. <code>(1 AND 2) OR 3</code>)
            </label>
            <input
              id="cond-group"
              value={draft.conditionGrouping}
              onChange={(e) => patch({ conditionGrouping: e.target.value })}
              placeholder="Leave blank to apply the join above uniformly"
            />
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
    errors.push("Choose AND or OR to combine multiple conditions.");
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
    conditionJoin: draft.conditions.length > 1 ? draft.conditionJoin : null,
    conditionGrouping: draft.conditions.length >= 3 && draft.conditionGrouping.trim()
      ? draft.conditionGrouping.trim()
      : null,
    logic: draft.logic,
  };
}
