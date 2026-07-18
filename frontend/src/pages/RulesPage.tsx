import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RuleEditor } from "../features/rules/RuleEditor";
import { describeLogic, useCreateRule, useDeleteRule, useRules, useUpdateRule } from "../features/rules/useRules";
import type { Rule, RuleDraft } from "../api/domain";

type EditorState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; rule: Rule };

export function RulesPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useWorkflow();
  const rules = useRules();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();

  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = useState<Rule | null>(null);
  const initialized = useRef(false);

  const columns = state.header?.common ?? [];
  const selected = state.selectedRuleIndexes;

  // Default to all rules selected the first time the catalog loads.
  useEffect(() => {
    if (!initialized.current && rules.data && rules.data.length > 0) {
      initialized.current = true;
      dispatch({ type: "setSelectedRules", ruleIndexes: rules.data.map((r) => r.index) });
    }
  }, [rules.data, dispatch]);

  function toggle(index: string): void {
    const next = selected.includes(index)
      ? selected.filter((i) => i !== index)
      : [...selected, index];
    dispatch({ type: "setSelectedRules", ruleIndexes: next });
  }

  function handleSave(draft: RuleDraft): void {
    if (editor.mode === "edit") {
      updateRule.mutate(
        { index: editor.rule.index, draft },
        { onSuccess: () => setEditor({ mode: "closed" }) },
      );
    } else {
      createRule.mutate(draft, {
        onSuccess: (created) => {
          // Newly created rules join the selection by default.
          dispatch({ type: "setSelectedRules", ruleIndexes: [...selected, created.ruleId] });
          setEditor({ mode: "closed" });
        },
      });
    }
  }

  const saveError =
    editor.mode === "edit"
      ? updateRule.error?.message ?? null
      : createRule.error?.message ?? null;

  return (
    <section aria-labelledby="rules-title">
      <h2 id="rules-title">Validation rules</h2>

      {rules.isLoading && <p role="status">Loading rules…</p>}
      {rules.isError && (
        <p className="alert alert--error" role="alert">
          Could not load rules: {rules.error.message}
        </p>
      )}

      {rules.data && (
        <>
          <div className="card">
            <h3>Select rules for this run</h3>
            {rules.data.length === 0 ? (
              <p role="status">No rules configured yet. Add one below.</p>
            ) : (
              <ul className="rule-select-list" aria-label="Rules">
                {rules.data.map((rule) => (
                  <li key={rule.index}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.includes(rule.index)}
                        onChange={() => toggle(rule.index)}
                      />{" "}
                      <strong>{rule.index}</strong> — {rule.name}
                    </label>
                    <div className="rule-actions">
                      <code className="rule-logic">{describeLogic(rule)}</code>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setEditor({ mode: "edit", rule })}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger"
                        onClick={() => setPendingDelete(rule)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="dialog-actions">
              {editor.mode === "closed" && (
                <button type="button" className="btn" onClick={() => setEditor({ mode: "create" })}>
                  + Add rule
                </button>
              )}
              <button
                type="button"
                className="btn btn--primary"
                disabled={!state.header}
                onClick={() => void navigate("/results")}
              >
                Continue to run
              </button>
            </div>
            {!state.header && (
              <p className="field-hint">Upload files to run the selected rules.</p>
            )}
          </div>

          {editor.mode !== "closed" && (
            <RuleEditor
              {...(editor.mode === "edit" ? { rule: editor.rule } : {})}
              columns={columns}
              saving={createRule.isPending || updateRule.isPending}
              error={saveError}
              onSave={handleSave}
              onCancel={() => setEditor({ mode: "closed" })}
            />
          )}
        </>
      )}

      <ConfirmDialog
        title="Delete rule?"
        open={pendingDelete !== null}
        confirmLabel="Delete"
        confirmTone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            const index = pendingDelete.index;
            deleteRule.mutate(index, {
              onSuccess: () =>
                dispatch({
                  type: "setSelectedRules",
                  ruleIndexes: selected.filter((i) => i !== index),
                }),
            });
          }
          setPendingDelete(null);
        }}
      >
        <p>
          Delete rule <strong>{pendingDelete?.index}</strong> ({pendingDelete?.name})? This cannot
          be undone.
        </p>
      </ConfirmDialog>
    </section>
  );
}
