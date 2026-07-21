import { useMemo, useState } from "react";
import type { Condition, GroupNode, LogicClause, LogicOperator, Rule, RuleDraft } from "../../api/domain";
import { ColumnField } from "../../components/ColumnField";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { SearchableMultiSelect, type MultiSelectOption } from "../../components/SearchableMultiSelect";
import { nextId } from "../../lib/id";
import { LOGIC_OPERATORS } from "./constants";
import { GroupingTreeEditor } from "./GroupingTreeEditor";
import { formatGroupTreeHierarchy } from "./groupingTree";

interface Props {
  /** Existing rule when editing; undefined when creating. */
  rule?: Rule;
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
  return { id: nextId("cond"), column: "", operator: "equals", values: [], value: "" };
}

function conditionValues(condition: Condition): string[] {
  return condition.values ?? (condition.value ? [condition.value] : []);
}

function isNumericOperator(operator: LogicOperator): boolean {
  return operator === "greater_than" || operator === "less_than";
}

/**
 * Create/update editor for a validation rule. Enforces the requirement rules:
 * optional conditions with a mandatory and/or join once there is more than one,
 * an optional grouping expression once there are three or more, and a mandatory
 * logic clause in either Value-against-Column or Column-against-Column format.
 * Guards against discarding unsaved edits.
 */
export function RuleEditor({ rule, columns, columnValues = {}, saving, error, onSave, onCancel }: Props) {
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
          A rule describes the <span className="text-green text-bold">required/expected state</span> for
          one column (and optionally a set of preconditions).
        </p>
        <p>
          <strong>Rows</strong> that <span className="text-green">match</span> the rule are
          <span className="text-green"> valid</span>;
          <strong>Rows</strong> that <span className="text-red">DO NOT match</span> are reported as
          <span className="text-red"> exceptions</span>.
        </p>
        <p>
          Example: <code className="greybox">status must equal to "active"</code> flags every row whose status is
          anything other than <code className="greybox">active</code>.
        </p>
        <p>
          <strong>Conditions</strong> narrow the rows the rule applies to (e.g. only check
          <code className="greybox">status</code> when <code className="greybox">region</code> is <code className="greybox">HBAP</code>);
          <strong>Logic</strong> clause is the actual required state.
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
          const valueOptions: MultiSelectOption[] = (columnValues[condition.column] ?? []).map((v) => ({
            value: v.value,
            label: v.starred ? `${v.value} *` : v.value,
            disabled: v.starred,
          }));
          return (
            <div key={condition.id} className="filter-row" role="group" aria-label={`Condition ${index + 1}`}>
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
                  selected={conditionValues(condition)}
                  onChange={(values) => updateCondition(condition.id, { values, value: values[0] ?? "" })}
                  placeholder={condition.column ? "Search or type values…" : "Pick a column first"}
                  disabled={!condition.column}
                  freeText
                  hint="Selected values are joined with OR within this condition."
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
              <code style={{ whiteSpace: "pre-wrap" }}>
                {draft.groupTree
                  ? formatGroupTreeHierarchy(draft.groupTree, (id) => {
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
            label={draft.logic.format === "column" ? "COLUMN in COMPARISON" : "COLUMN in COMPARISON"}
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
              label="BASELINE COLUMN"
              columns={columns}
              value={draft.logic.target}
              onChange={(target) => patch({ logic: { ...draft.logic, target } })}
            />
          ) : isNumericOperator(draft.logic.operator) ? (
            <div className="field">
              <label htmlFor="logic-value">Value</label>
              <input
                id="logic-value"
                type="number"
                step="any"
                value={draft.logic.target}
                onChange={(e) => patch({ logic: { ...draft.logic, target: e.target.value, values: e.target.value ? [e.target.value] : [] } })}
                placeholder="Enter any number"
              />
            </div>
          ) : (
            <SearchableMultiSelect
              label="Value"
              options={(columnValues[draft.logic.column] ?? []).map((v) => ({
                value: v.value,
                label: v.starred ? `${v.value} *` : v.value,
                disabled: v.starred,
              }))}
              selected={draft.logic.values ?? (draft.logic.target ? [draft.logic.target] : [])}
              onChange={(values) => {
                const normalized = [...new Set(values.map((v) => v.trim()).filter((v) => v.length > 0))];
                patch({ logic: { ...draft.logic, values: normalized, target: normalized[0] ?? "" } });
              }}
              placeholder={draft.logic.column ? "Search or type values…" : "Pick a column first"}
              disabled={!draft.logic.column}
              freeText
              hint="Multiple values are OR-ed for every operator."
            />
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
  if (!draft.logic.column.trim()) errors.push("Logic needs a column.");
  const logicValues = draft.logic.values?.filter((v) => v.trim()) ?? (draft.logic.target.trim() ? [draft.logic.target.trim()] : []);
  if (draft.logic.format === "column") {
    if (!draft.logic.target.trim()) {
      errors.push("Logic needs a compared column.");
    }
  } else {
    if (logicValues.length === 0) {
      errors.push("Logic needs a value.");
    } else if (isNumericOperator(draft.logic.operator) && !Number.isFinite(Number(logicValues[0]))) {
      errors.push("Logic needs a valid number.");
    }
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
  if (draft.logic.format === "column") {
    const rhs = `column ${draft.logic.target.trim() || "<baseline column>"}`;
    return `${col} ${phrase} ${rhs}`;
  }
  const values = draft.logic.values?.filter((v) => v.trim()) ?? (draft.logic.target.trim() ? [draft.logic.target.trim()] : []);
  if (values.length === 0) return `${col} ${phrase} "<value>"`;
  if (values.length === 1) return `${col} ${phrase} "${values[0]}"`;
  const joined = values.slice(0, -1).map((v) => `"${v}"`).join(" or ") + ` or "${values[values.length - 1]}"`;
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
