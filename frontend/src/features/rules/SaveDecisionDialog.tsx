import { useEffect, useRef } from "react";
import type { Condition, LogicClause, Rule, RuleDraft } from "../../api/domain";
import { RECERTIFICATION_LABEL } from "../../api/domain";

export interface SaveDecisionConflict {
  originalRuleId: string;
  originalIdentifier: string;
  proposedIdentifier: string;
  extremeChanges: string[];
  serverMessage: string;
}

interface Props {
  /** Rule snapshot the edit started from. */
  original: Rule;
  /** Unsaved draft that triggered the decision prompt. Kept intact throughout. */
  draft: RuleDraft;
  conflict: SaveDecisionConflict;
  /** Error from the last retry (e.g. stale source); the dialog stays open. */
  retryError?: string | null;
  retrying: boolean;
  onModifyCurrent: () => void;
  onSaveAsNew: () => void;
  /** Close the prompt and return to editing. The draft is never discarded. */
  onBackToEditing: () => void;
}

function conditionText(condition: Condition): string {
  const values = condition.values ?? (condition.value ? [condition.value] : []);
  const rhs = values.length > 0 ? values.map((v) => `"${v}"`).join(" or ") : "<value>";
  return `${condition.column || "<column>"} ${condition.operator.replace(/_/g, " ")} ${rhs}`;
}

function expectationText(clause: LogicClause): string {
  if (clause.format === "column") {
    return `${clause.column || "<column>"} ${clause.operator.replace(/_/g, " ")} column ${clause.target || "<column>"}`;
  }
  const values = clause.values ?? (clause.target ? [clause.target] : []);
  const rhs = values.length > 0 ? values.map((v) => `"${v}"`).join(" or ") : "<value>";
  return `${clause.column || "<column>"} ${clause.operator.replace(/_/g, " ")} ${rhs}`;
}

function logicClausesOf(rule: Pick<Rule, "logic" | "logicClauses">): LogicClause[] {
  return rule.logicClauses && rule.logicClauses.length > 0 ? rule.logicClauses : [rule.logic];
}

function humanizeReason(reason: string): string {
  if (reason === "conditions_replaced") {
    return "None of the original conditions remains (including removal of all conditions).";
  }
  if (reason === "expectations_replaced") {
    return "None of the original expectations remains.";
  }
  return reason.replace(/_/g, " ");
}

/**
 * Extensive-edit decision prompt. Rendered *inside* the rule-editor overlay
 * (within the native modal dialog) so it stays visible and keyboard
 * accessible; a portal outside the modal's top layer could be inert/hidden.
 *
 * No choice is inferred by dismissal: Escape and backdrop clicks return to
 * editing with the draft intact. Only an explicit button saves anything.
 */
export function SaveDecisionDialog({
  original,
  draft,
  conflict,
  retryError,
  retrying,
  onModifyCurrent,
  onSaveAsNew,
  onBackToEditing,
}: Props) {
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  const beforeConditions = original.conditions;
  const afterConditions = draft.conditions;
  const beforeExpectations = logicClausesOf(original);
  const afterExpectations = logicClausesOf({
    logic: draft.logic,
    ...(draft.logicClauses ? { logicClauses: draft.logicClauses } : {}),
  });

  return (
    <div
      className="dialog-backdrop"
      onKeyDown={(event) => {
        if (event.key === "Escape") onBackToEditing();
      }}
    >
      {/* Backdrop click returns to editing; the draft is never discarded. */}
      <div className="dialog-backdrop-hit" onClick={onBackToEditing} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="save-decision-title"
        aria-describedby="save-decision-description"
        className="dialog-panel card"
      >
        <h2 id="save-decision-title">Extensive edit — modify current rule or save as new?</h2>
        <p id="save-decision-description">{conflict.serverMessage}</p>

        {conflict.extremeChanges.length > 0 && (
          <div className="field">
            <strong>Why this needs a decision</strong>
            <ul>
              {conflict.extremeChanges.map((reason) => (
                <li key={reason}>{humanizeReason(reason)}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="field">
          <strong>Canonical identifier</strong>
          <p className="field-hint">
            <code>{conflict.originalIdentifier}</code>
            {" → "}
            <code>{conflict.proposedIdentifier}</code>
          </p>
        </div>

        <div className="save-decision-comparison">
          <div>
            <h3>Before (current {original.index})</h3>
            <ComparisonBlock
              conditions={beforeConditions}
              expectations={beforeExpectations}
              grouping={original.conditionGrouping}
            />
          </div>
          <div>
            <h3>After (unsaved draft)</h3>
            <ComparisonBlock
              conditions={afterConditions}
              expectations={afterExpectations}
              grouping={draft.conditionGrouping}
            />
          </div>
        </div>

        <div className="field">
          <strong>What each choice means for commentary</strong>
          <ul>
            <li>
              <strong>Modify current</strong>: saves a new revision in the same lineage. Matching
              predecessor commentary carries forward marked “{RECERTIFICATION_LABEL}”.
            </li>
            <li>
              <strong>Save as new</strong>: creates a separate rule lineage. Commentary is not
              copied automatically and the source rule stays intact.
            </li>
            <li>
              <strong>Back to editing</strong>: saves nothing and keeps the draft.
            </li>
          </ul>
        </div>

        {retryError && (
          <p className="alert alert--error" role="alert">
            {retryError}
          </p>
        )}

        <div className="dialog-actions">
          <button
            ref={backRef}
            type="button"
            className="btn"
            onClick={onBackToEditing}
            disabled={retrying}
          >
            Back to editing
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onSaveAsNew}
            disabled={retrying}
          >
            {retrying ? "Saving…" : "Save as new"}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onModifyCurrent}
            disabled={retrying}
          >
            {retrying ? "Saving…" : "Modify current"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ComparisonBlock({
  conditions,
  expectations,
  grouping,
}: {
  conditions: Condition[];
  expectations: LogicClause[];
  grouping: string | null;
}) {
  return (
    <div>
      <p className="field-hint">Conditions ({conditions.length})</p>
      {conditions.length === 0 ? (
        <p className="field-hint">No conditions — always evaluates its logic.</p>
      ) : (
        <ul>
          {conditions.map((condition) => (
            <li key={condition.id}>
              <code>{conditionText(condition)}</code>
            </li>
          ))}
        </ul>
      )}
      <p className="field-hint">Expectations ({expectations.length})</p>
      <ul>
        {expectations.map((clause) => (
          <li key={clause.id}>
            <code>{expectationText(clause)}</code>
          </li>
        ))}
      </ul>
      {grouping && (
        <p className="field-hint">
          Grouping: <code>{grouping}</code>
        </p>
      )}
    </div>
  );
}
