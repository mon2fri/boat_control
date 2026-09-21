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
import { mapRuleToWireDraft } from "../api/mapping";
import { mapRulesToConfigContent, resolveRulesConfig } from "../api/configContent";
import { importRulesConfig } from "../api/endpoints";
import { ApiError } from "../api/client";
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
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [configLoadName, setConfigLoadName] = useState<string | null>(null);
  const [loadedConfigData, setLoadedConfigData] = useState<unknown>(null);
  const [loadedConfigName, setLoadedConfigName] = useState<string | null>(null);
  const [configWarnings, setConfigWarnings] = useState<string[]>([]);
  const [configNotice, setConfigNotice] = useState<string | null>(null);
  const [configNoticeFading, setConfigNoticeFading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [ruleConflicts, setRuleConflicts] = useState<Array<Record<string, unknown>> | null>(null);
  const [conflictDecisions, setConflictDecisions] = useState<Record<string, string>>({});
  const [isApplyingConfig, setIsApplyingConfig] = useState(false);
  const queryClient = useQueryClient();
  const [catalogPage, setCatalogPage] = useState(0);
  const [syncedEnabledKey, setSyncedEnabledKey] = useState<string | null>(null);
  const [paginationNotice, setPaginationNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!configNotice) return;
    setConfigNoticeFading(false);
    const fadeTimer = window.setTimeout(() => setConfigNoticeFading(true), 3000);
    const removeTimer = window.setTimeout(() => setConfigNotice(null), 6000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [configNotice]);

  const columns = state.comparisonColumns.length > 0 ? state.comparisonColumns : (state.header?.common ?? []);
  const selected = state.selectedRuleIndexes;

  function handleRunComparison(): void {
    dispatch({ type: "setPage2Complete", complete: true });
    void navigate("/results");
  }

  const catalogPages = rules.pages;
  const currentServerPage = catalogPages[catalogPage] ?? catalogPages[0];
  const pinnedIds = new Set(rules.pinnedRuleIds);
  const visibleRules = currentServerPage
    ? rules.data.filter((rule) =>
        pinnedIds.has(rule.index) || currentServerPage.rules.some((pageRule) => pageRule.index === rule.index),
      )
    : [];

  useEffect(() => {
    const enabledKey = rules.data.filter((rule) => rule.enabled).map((rule) => rule.index).join(",");
    if (catalogPages.length === 1 && syncedEnabledKey === null) {
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

  useEffect(() => {
    // Keep four complete pages ahead of the current page. Each request adds
    // the next ten rules; the query hook handles the initial 50-rule buffer.
    const requiredPages = catalogPage + 5;
    if (
      catalogPages.length >= requiredPages ||
      !rules.hasNextPage ||
      rules.isFetchingNextPage
    ) return;
    void rules.fetchNextPage();
  }, [catalogPage, catalogPages.length, rules.hasNextPage, rules.isFetchingNextPage, rules.fetchNextPage]);

  const totalCatalogPages = Math.max(catalogPages.length, Math.ceil(rules.total / 10), 1);
  const hasNextCatalogPage = catalogPage + 1 < totalCatalogPages;
  const activeConflict = ruleConflicts?.[0];

  function goToNextCatalogPage(): void {
    if (catalogPage + 1 < catalogPages.length) {
      setCatalogPage((page) => page + 1);
      return;
    }
    if (!rules.hasNextPage || rules.isFetchingNextPage) return;
    void rules.fetchNextPage().then((result) => {
      if ((result.data?.pages.length ?? 0) > catalogPage + 1) {
        setCatalogPage((page) => page + 1);
      }
    });
  }

  const handleConfigContent = useCallback((content: unknown, name: string) => {
    setLoadedConfigData(content);
    setLoadedConfigName(name);
  }, []);
  const handleConfigDone = useCallback(() => setConfigLoadName(null), []);

  // Process loaded config content through the backend's atomic catalog import.
  useEffect(() => {
    if (!loadedConfigData) return;

    setIsApplyingConfig(true);
    setConfigError(null);
    const resolved = resolveRulesConfig(loadedConfigData, families, columns);
    if (resolved.warnings.length > 0) {
      setConfigWarnings(resolved.warnings.map((warning) => warning.message));
    }
    importRulesConfig(resolved.drafts.map(mapRuleToWireDraft), loadedConfigName)
      .then((result) => {
        setConfigNotice(`Configuration applied: ${result.imported} imported, ${result.reused} reused, ${result.enabled} enabled.`);
        dispatch({ type: "setSelectedRules", ruleIndexes: Object.keys(result.bindings) });
         setSyncedEnabledKey("config-import");
         setCatalogPage(0);
         void queryClient.invalidateQueries({ queryKey: RULES_KEY });
         setLoadedConfigData(null);
         setLoadedConfigName(null);
      })
      .catch((err: unknown) => {
        if (
          err instanceof ApiError &&
          err.status === 409 &&
          typeof err.detail === "object" &&
          err.detail !== null &&
          Array.isArray((err.detail as { conflicts?: unknown }).conflicts)
        ) {
          setRuleConflicts((err.detail as { conflicts: Array<Record<string, unknown>> }).conflicts);
          setConflictDecisions({});
          setIsApplyingConfig(false);
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to apply rule configuration.";
        setConfigError(message);
        setLoadedConfigData(null);
        setLoadedConfigName(null);
      })
      .finally(() => setIsApplyingConfig(false));
  }, [loadedConfigData, loadedConfigName, families, columns, queryClient, dispatch]);

  function resolveRuleConflict(decision: string, identifier: string): void {
    if (!loadedConfigData || !loadedConfigName) return;
    const decisions = { ...conflictDecisions, [identifier]: decision };
    setConflictDecisions(decisions);
    const remaining = (ruleConflicts ?? []).filter((item) => !decisions[String(item.rule_identifier)]);
    if (remaining.length > 0) {
      setRuleConflicts(remaining);
      return;
    }
    setRuleConflicts(null);
    setIsApplyingConfig(true);
    const resolved = resolveRulesConfig(loadedConfigData, families, columns);
    importRulesConfig(resolved.drafts.map(mapRuleToWireDraft), loadedConfigName, decisions)
      .then(() => {
        setConfigNotice("Configuration applied with the selected rule decisions.");
        void queryClient.invalidateQueries({ queryKey: RULES_KEY });
        setLoadedConfigData(null);
        setLoadedConfigName(null);
      })
      .catch((error: unknown) => setConfigError(error instanceof Error ? error.message : "Failed to apply rule configuration."))
      .finally(() => setIsApplyingConfig(false));
  }

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
           if (created.equivalentRuleId) {
             setConfigWarnings([
               `An equivalent rule already exists as ${created.equivalentRuleId}. The existing rule was kept instead of creating a duplicate.`,
             ]);
           }
           dispatch({ type: "setSelectedRules", ruleIndexes: [...selected, created.index] });
           if (draft.name.trim()) {
             setEditor({ mode: "closed" });
           } else {
             setConfigWarnings(["Rule saved as Unnamed. Enter a rule name and save again."]);
             setEditor({ mode: "edit", rule: created });
           }
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
          <div className="config-manager-stack">
            <ConfigManager
              configType="rules"
              currentContent={mapRulesToConfigContent(rules.data ?? [], families)}
              onLoad={(name) => setConfigLoadName(name)}
              disabled={disabled || rules.isPending || isApplyingConfig}
              hasUnsavedChanges={editor.mode !== "closed"}
              confirmBeforeLoad
              title="Load config for rules"
            />
            {configNotice && (
              <div className={`alert alert--warn config-notice${configNoticeFading ? " config-notice--fading" : ""}`} role="status">
                {configNotice}
              </div>
            )}
          </div>
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
                  <span>Page {catalogPage + 1} of {totalCatalogPages}</span>
                  <button
                    type="button"
                    className="btn"
                    disabled={rules.isFetchingNextPage || !hasNextCatalogPage}
                    onClick={goToNextCatalogPage}
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
                key={editor.mode === "edit" ? editor.rule.index : "create"}
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
        {activeConflict && (
          <ConfirmDialog
            title={activeConflict.kind === "deleted" ? "Rule was deleted" : "Rule was modified"}
            open
            cancelLabel={activeConflict.kind === "deleted" ? "Remove from Config" : "Maintain Original Rule"}
            confirmLabel={activeConflict.kind === "deleted" ? "Reinstate Rule" : "Accept Updated Rule"}
            onCancel={() => resolveRuleConflict(activeConflict.kind === "deleted" ? "remove" : "maintain_original", String(activeConflict.rule_identifier))}
            onConfirm={() => resolveRuleConflict(activeConflict.kind === "deleted" ? "reinstate" : "accept_updated", String(activeConflict.rule_identifier))}
          >
            <p>
              <strong>{String(activeConflict.name ?? "Unnamed rule")}</strong>
              {String(activeConflict.description ?? "") && `: ${String(activeConflict.description)}`}
            </p>
          </ConfirmDialog>
        )}
        </fieldset>

        <ConfirmDialog
          title="Delete rule?"
          open={pendingDelete !== null && !deleteAllConfirm}
          cancelLabel="Cancel"
          confirmLabel="Delete Rule"
          confirmTone="danger"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => setDeleteAllConfirm(true)}
        >
          <p>
            Delete rule <strong>{pendingDelete?.index}</strong> ({pendingDelete?.name})? This cannot
            be undone.
          </p>
        </ConfirmDialog>

        <ConfirmDialog
          title="Delete rule for all configurations?"
          open={pendingDelete !== null && deleteAllConfirm}
          cancelLabel="Cancel"
          confirmLabel="Delete for ALL Configs"
          confirmTone="danger"
          onCancel={() => {
            setDeleteAllConfirm(false);
            setPendingDelete(null);
          }}
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
            setDeleteAllConfirm(false);
            setPendingDelete(null);
          }}
        >
          <p>
            Delete <strong>{pendingDelete?.name}</strong> from the database and all configurations?
            This cannot be undone automatically.
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
              <span>Page {catalogPage + 1} of {totalCatalogPages}</span>
              <button
                type="button"
                className="btn"
                disabled={rules.isFetchingNextPage || !hasNextCatalogPage}
                onClick={goToNextCatalogPage}
              >
                {rules.isFetchingNextPage ? "Loading…" : "Next page"}
              </button>
            </div>
            {paginationNotice && <p className="alert alert--warn" role="status">{paginationNotice}</p>}
          </div>

          {editor.mode !== "closed" && (
            <RuleEditor
              key={editor.mode === "edit" ? editor.rule.index : "create"}
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

      <div className="config-manager-stack">
        <ConfigManager
          configType="rules"
          currentContent={mapRulesToConfigContent(rules.data ?? [], families)}
          onLoad={(name) => setConfigLoadName(name)}
          disabled={rules.isPending || isApplyingConfig}
          hasUnsavedChanges={editor.mode !== "closed"}
          confirmBeforeLoad
          title="Load config for rules"
        />
        {configNotice && (
          <div className={`alert alert--warn config-notice${configNoticeFading ? " config-notice--fading" : ""}`} role="status">
            {configNotice}
          </div>
        )}
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

      {activeConflict && (
        <ConfirmDialog
          title={activeConflict.kind === "deleted" ? "Rule was deleted" : "Rule was modified"}
          open
          cancelLabel={activeConflict.kind === "deleted" ? "Remove from Config" : "Maintain Original Rule"}
          confirmLabel={activeConflict.kind === "deleted" ? "Reinstate Rule" : "Accept Updated Rule"}
          onCancel={() => resolveRuleConflict(activeConflict.kind === "deleted" ? "remove" : "maintain_original", String(activeConflict.rule_identifier))}
          onConfirm={() => resolveRuleConflict(activeConflict.kind === "deleted" ? "reinstate" : "accept_updated", String(activeConflict.rule_identifier))}
        >
          <p>
            <strong>{String(activeConflict.name ?? "Unnamed rule")}</strong>
            {String(activeConflict.description ?? "") && `: ${String(activeConflict.description)}`}
          </p>
        </ConfirmDialog>
      )}

      <ConfirmDialog
        title="Delete rule?"
        open={pendingDelete !== null && !deleteAllConfirm}
        cancelLabel="Cancel"
        confirmLabel="Delete Rule"
        confirmTone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => setDeleteAllConfirm(true)}
      >
        <p>
          Delete rule <strong>{pendingDelete?.index}</strong> ({pendingDelete?.name})? This cannot
          be undone.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        title="Delete rule for all configurations?"
        open={pendingDelete !== null && deleteAllConfirm}
        cancelLabel="Cancel"
        confirmLabel="Delete for ALL Configs"
        confirmTone="danger"
        onCancel={() => {
          setDeleteAllConfirm(false);
          setPendingDelete(null);
        }}
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
          setDeleteAllConfirm(false);
          setPendingDelete(null);
        }}
      >
        <p>
          Delete <strong>{pendingDelete?.name}</strong> from the database and all configurations?
          This cannot be undone automatically.
        </p>
      </ConfirmDialog>
    </section>
  );
}
