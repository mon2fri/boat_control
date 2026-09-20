import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkflow } from "../state/WorkflowContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RuleEditor } from "../features/rules/RuleEditor";
import { useCreateRule, useDeleteRule, useReorderRules, useRules, useSetRulesEnabled, useUpdateRule } from "../features/rules/useRules";
import { SortableRuleList } from "../features/rules/SortableRuleList";
import { useFamilies } from "../features/settings/useSettings";
import { useQueryClient } from "@tanstack/react-query";
import { ConfigLoader } from "../features/configs/ConfigLoader";
import { ConfigManager } from "../features/configs/ConfigManager";
import { mapRulesToConfigContent } from "../api/configContent";
import { importRulesConfig } from "../api/endpoints";
import type { Rule, RuleDraft } from "../api/domain";

const RULES_KEY = ["rules"] as const;

type EditorState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; rule: Rule };

export function RulesPage({ embedded = false, disabled = false, columnValues = {} }: { embedded?: boolean; disabled?: boolean; columnValues?: Record<string, { value: string; starred: boolean }[]> }) {
  const navigate = useNavigate();
  const { state, dispatch, reset } = useWorkflow();
  const rules = useRules();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();
  const reorderRules = useReorderRules();
  const setRulesEnabled = useSetRulesEnabled();

  const familiesQuery = useFamilies();
  const families = familiesQuery.data ?? [];

  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = useState<Rule | null>(null);
  const [configLoadName, setConfigLoadName] = useState<string | null>(null);
  const [loadedConfigData, setLoadedConfigData] = useState<unknown>(null);
  const [configWarnings, setConfigWarnings] = useState<string[]>([]);
  const [configError, setConfigError] = useState<string | null>(null);
  const [isApplyingConfig, setIsApplyingConfig] = useState(false);
  const queryClient = useQueryClient();
  const [catalogPage, setCatalogPage] = useState(0);
  const [syncedEnabledKey, setSyncedEnabledKey] = useState<string | null>(null);
  const [paginationNotice, setPaginationNotice] = useState<string | null>(null);

  const columns = state.comparisonColumns.length > 0 ? state.comparisonColumns : (state.header?.common ?? []);
  const selected = state.selectedRuleIndexes;

  function handleRunComparison(): void {
    dispatch({ type: "setPage2Complete", complete: true });
    void navigate("/results");
  }

  const catalogPages = rules.pages;
  const currentServerPage = catalogPages[catalogPage] ?? catalogPages[0];
  const pinnedIds = new Set(rules.pinnedRuleIds);
  const pinnedRules = rules.data.filter((rule) => pinnedIds.has(rule.index));
  const visibleRules = currentServerPage
    ? [...new Map([...pinnedRules, ...currentServerPage.rules].map((rule) => [rule.index, rule])).values()]
    : [];

  useEffect(() => {
    const enabledKey = rules.data.filter((rule) => rule.enabled).map((rule) => rule.index).join(",");
    if (catalogPages.length === 1 && enabledKey !== syncedEnabledKey) {
      setSyncedEnabledKey(enabledKey);
      dispatch({
        type: "setSelectedRules",
        ruleIndexes: rules.data.filter((rule) => rule.enabled).map((rule) => rule.index),
      });
    }
  }, [catalogPages.length, rules.data, syncedEnabledKey, dispatch]);

  useEffect(() => {
    if (!rules.isError || paginationNotice) return;
    const message = rules.error instanceof Error ? rules.error.message : String(rules.error);
    if (!message.includes("cursor") && !message.includes("Catalog changed") && !message.includes("409")) return;
    setPaginationNotice("The catalog changed while paging. The first page was refreshed.");
    setCatalogPage(0);
    void queryClient.invalidateQueries({ queryKey: RULES_KEY });
  }, [rules.isError, rules.error, paginationNotice, queryClient]);

  const handleConfigContent = useCallback((content: unknown) => {
    setLoadedConfigData(content);
  }, []);
  const handleConfigDone = useCallback(() => setConfigLoadName(null), []);

  // Process loaded config content through the backend's atomic catalog import.
  useEffect(() => {
    if (!loadedConfigData) return;

    setIsApplyingConfig(true);
    setConfigError(null);
    importRulesConfig(loadedConfigData)
      .then((result) => {
        setConfigWarnings([`Configuration applied: ${result.imported} imported, ${result.reused} reused, ${result.enabled} enabled.`]);
        setCatalogPage(0);
        void queryClient.invalidateQueries({ queryKey: RULES_KEY });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to apply rule configuration.";
        setConfigError(message);
      })
      .finally(() => {
        setIsApplyingConfig(false);
        setLoadedConfigData(null);
      });
  }, [loadedConfigData, queryClient]);

  function toggle(index: string): void {
    const next = selected.includes(index)
      ? selected.filter((i) => i !== index)
      : [...selected, index];
    dispatch({ type: "setSelectedRules", ruleIndexes: next });
    setRulesEnabled.mutate(
      { ruleIds: [index], enabled: !selected.includes(index) },
      { onError: () => dispatch({ type: "setSelectedRules", ruleIndexes: selected }) },
    );
  }

  function toggleAll(ruleIds: string[], enabled: boolean): void {
    const next = enabled
      ? [...new Set([...selected, ...ruleIds])]
      : selected.filter((id) => !ruleIds.includes(id));
    dispatch({ type: "setSelectedRules", ruleIndexes: next });
    setRulesEnabled.mutate(
      { ruleIds, enabled },
      { onError: () => dispatch({ type: "setSelectedRules", ruleIndexes: selected }) },
    );
  }

  function handleSave(draft: RuleDraft): void {
    if (editor.mode === "edit") {
      updateRule.mutate(
        { index: editor.rule.index, draft },
        {
          onSuccess: (updated) => {
            if (updated.resultingRuleId && updated.previousRuleId) {
              dispatch({
                type: "setSelectedRules",
                ruleIndexes: selected
                  .map((id) => id === updated.previousRuleId ? updated.resultingRuleId! : id),
              });
            }
            setEditor({ mode: "closed" });
          },
        },
      );
    } else {
      createRule.mutate(draft, {
        onSuccess: (created) => {
           dispatch({ type: "setSelectedRules", ruleIndexes: [...selected, created.index] });
          setEditor({ mode: "closed" });
        },
      });
    }
  }

  function handleClearPage(): void {
    reset();
  }

  const saveError =
    editor.mode === "edit"
      ? updateRule.error?.message ?? null
      : createRule.error?.message ?? null;

  if (embedded) {
    return (
      <section id="validation-rules" aria-labelledby="rules-title">
        <fieldset disabled={disabled} className="validation-rules__fieldset">
        <div className="config-layout">
          <div>
            <h3 id="rules-title" className="section-heading">Validation rules</h3>
            <p className="section-hint">Define rules to validate rows after comparison.</p>
          </div>
          <ConfigManager
            configType="rules"
            currentContent={mapRulesToConfigContent(rules.data ?? [], families)}
            onLoad={(name) => setConfigLoadName(name)}
            disabled={disabled || rules.isPending || isApplyingConfig}
            hasUnsavedChanges={editor.mode !== "closed"}
            title="Load config for rules"
          />
        </div>

        <div className="rules-layout">
          <div className="card rule-select-panel">
            <h4 className="section-heading" style={{ fontSize: "0.9rem", fontWeight: 600 }}>Select rules for this run</h4>
            {rules.isLoading && <p role="status">Loading rules…</p>}
            {rules.isError && (
              <p className="alert alert--error" role="alert">
                Could not load rules: {rules.error.message}
              </p>
            )}
            {rules.data && (
              <>
                {rules.data.length === 0 ? (
                  <p role="status">No rules configured yet. Add one below.</p>
                ) : (
                  <SortableRuleList
                    rules={visibleRules}
                    selected={selected}
                    validColumns={columns}
                    disabled={disabled || reorderRules.isPending}
                    onToggle={toggle}
                    onToggleAll={toggleAll}
                    onEdit={(rule) => setEditor({ mode: "edit", rule })}
                    onDelete={setPendingDelete}
                    onReorder={(ruleIds) => reorderRules.mutate(ruleIds)}
                    serverPaged
                  />
                )}
                <div className="config-inline-row">
                  <button type="button" className="btn" disabled={catalogPage === 0} onClick={() => setCatalogPage((page) => page - 1)}>Previous</button>
                  <span>Catalog page {catalogPage + 1}</span>
                  <button
                    type="button"
                    className="btn"
                    disabled={rules.isFetchingNextPage || (!rules.hasNextPage && catalogPage >= catalogPages.length - 1)}
                    onClick={() => {
                      if (catalogPage < catalogPages.length - 1) setCatalogPage((page) => page + 1);
                      else void rules.fetchNextPage().then(() => setCatalogPage((page) => page + 1));
                    }}
                  >
                    {rules.isFetchingNextPage ? "Loading…" : "Next page"}
                  </button>
                </div>
                {paginationNotice && <p className="alert alert--warn" role="status">{paginationNotice}</p>}
                {editor.mode === "closed" && (
                  <button type="button" className="btn" onClick={() => setEditor({ mode: "create" })}>
                    + Add rule
                  </button>
                )}
              </>
            )}
          </div>

          <div>
            {editor.mode !== "closed" ? (
              <RuleEditor
                {...(editor.mode === "edit" ? { rule: editor.rule } : {})}
                columns={columns}
                columnValues={columnValues}
                saving={createRule.isPending || updateRule.isPending}
                error={saveError}
                onSave={handleSave}
                onCancel={() => setEditor({ mode: "closed" })}
              />
            ) : (
              <div className="card">
                <p className="card-hint">Select a rule to edit, or add a new rule.</p>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ marginTop: "calc(var(--space) * 2)" }}>
          <div className="config-inline-row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={disabled || !state.header}
              onClick={handleRunComparison}
            >
              Run comparison and validation
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={handleClearPage}
            >
              Clear current page
            </button>
            {!state.header && (
              <p className="field-hint">Upload files to run the selected rules.</p>
            )}
          </div>
        </div>

        {configLoadName && (
          <ConfigLoader
            configType="rules"
            name={configLoadName}
            onLoad={handleConfigContent}
            onDone={handleConfigDone}
          />
        )}

        {isApplyingConfig && (
          <p role="status" aria-live="polite" className="busy-row">
            <span className="spinner" aria-hidden="true" /> Applying config…
          </p>
        )}

        {configWarnings.length > 0 && (
          <div className="alert alert--warn" role="alert">
            {configWarnings.map((w, i) => (
              <p key={i} style={{ margin: 0 }}>{w}</p>
            ))}
          </div>
        )}

        {configError && (
          <p className="alert alert--error" role="alert">
            {configError}
          </p>
        )}
        </fieldset>

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

  return (
    <section aria-labelledby="rules-title">
      <h2 id="rules-title" className="section-heading">Validation rules</h2>

      {rules.isLoading && <p role="status">Loading rules…</p>}
      {rules.isError && (
        <p className="alert alert--error" role="alert">
          Could not load rules: {rules.error.message}
        </p>
      )}

      {rules.data && (
        <>
          <div className="card">
            <h3 className="card-heading">Select rules for this run</h3>
            {rules.data.length === 0 ? (
              <p role="status">No rules configured yet. Add one below.</p>
            ) : (
             <SortableRuleList
                rules={visibleRules}
                selected={selected}
                validColumns={columns}
                disabled={reorderRules.isPending}
                onToggle={toggle}
                onToggleAll={toggleAll}
                onEdit={(rule) => setEditor({ mode: "edit", rule })}
                onDelete={setPendingDelete}
                onReorder={(ruleIds) => reorderRules.mutate(ruleIds)}
                serverPaged
              />
            )}
            {editor.mode === "closed" && (
           <button type="button" className="btn" onClick={() => setEditor({ mode: "create" })}>
                + Add rule
              </button>
            )}
            <div className="config-inline-row">
              <button type="button" className="btn" disabled={catalogPage === 0} onClick={() => setCatalogPage((page) => page - 1)}>Previous</button>
              <span>Catalog page {catalogPage + 1}</span>
              <button
                type="button"
                className="btn"
                disabled={rules.isFetchingNextPage || (!rules.hasNextPage && catalogPage >= catalogPages.length - 1)}
                onClick={() => {
                  if (catalogPage < catalogPages.length - 1) setCatalogPage((page) => page + 1);
                  else void rules.fetchNextPage().then(() => setCatalogPage((page) => page + 1));
                }}
              >
                {rules.isFetchingNextPage ? "Loading…" : "Next page"}
              </button>
            </div>
            {paginationNotice && <p className="alert alert--warn" role="status">{paginationNotice}</p>}
          </div>

          {editor.mode !== "closed" && (
            <RuleEditor
              {...(editor.mode === "edit" ? { rule: editor.rule } : {})}
              columns={columns}
              columnValues={columnValues}
              saving={createRule.isPending || updateRule.isPending}
              error={saveError}
              onSave={handleSave}
              onCancel={() => setEditor({ mode: "closed" })}
            />
          )}
        </>
      )}

      <div className="card" style={{ marginTop: "calc(var(--space) * 2)" }}>
        <div className="config-inline-row">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!state.header}
            onClick={handleRunComparison}
          >
            Run comparison and validation
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={handleClearPage}
          >
            Clear current page
          </button>
          {!state.header && (
            <p className="field-hint">Upload files to run the selected rules.</p>
          )}
        </div>
      </div>

      <ConfigManager
        configType="rules"
        currentContent={mapRulesToConfigContent(rules.data ?? [], families)}
        onLoad={(name) => setConfigLoadName(name)}
        disabled={rules.isPending || isApplyingConfig}
        hasUnsavedChanges={editor.mode !== "closed"}
        title="Load config for rules"
      />

      {configLoadName && (
        <ConfigLoader
          configType="rules"
          name={configLoadName}
          onLoad={handleConfigContent}
          onDone={handleConfigDone}
        />
      )}

      {isApplyingConfig && (
        <p role="status" aria-live="polite" className="busy-row">
          <span className="spinner" aria-hidden="true" /> Applying config…
        </p>
      )}

      {configWarnings.length > 0 && (
        <div className="alert alert--warn" role="alert">
          {configWarnings.map((w, i) => (
            <p key={i} style={{ margin: 0 }}>{w}</p>
          ))}
        </div>
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
