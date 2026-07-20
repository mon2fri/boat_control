import { useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings } from "../api/domain";
import { useSaveSettings, useSettings } from "../features/settings/useSettings";

interface DraftSettings {
  applicationName: string;
  defaultRemotePath: string;
  ruleConfigPath: string;
  rowsAndColumnsConfigPath: string;
  filterConfigPath: string;
  fullSetConfirmationRows: string;
  runHistoryPath: string;
}

function toDraft(settings: AppSettings): DraftSettings {
  return {
    applicationName: settings.applicationName,
    defaultRemotePath: settings.defaultRemotePath,
    ruleConfigPath: settings.ruleConfigPath,
    rowsAndColumnsConfigPath: settings.rowsAndColumnsConfigPath,
    filterConfigPath: settings.filterConfigPath,
    fullSetConfirmationRows: String(settings.fullSetConfirmationRows),
    runHistoryPath: settings.runHistoryPath,
  };
}

function validate(draft: DraftSettings): string[] {
  const errors: string[] = [];
  if (!draft.applicationName.trim()) errors.push("Application name is required.");
  if (!draft.ruleConfigPath.trim()) errors.push("Rule Config Path is required.");
  if (!draft.rowsAndColumnsConfigPath.trim()) errors.push("Rows and Columns Config Path is required.");
  if (!draft.filterConfigPath.trim()) errors.push("Filter Config Path is required.");
  if (!draft.runHistoryPath.trim()) errors.push("Run history Path is required.");
  const rowLimit = Number(draft.fullSetConfirmationRows);
  if (!Number.isInteger(rowLimit) || rowLimit < 1) {
    errors.push("Full set confirmation (Rows) must be a positive integer.");
  }
  return errors;
}

export function SettingsPage() {
  const settings = useSettings();
  const save = useSaveSettings();
  const lastSyncedRef = useRef<AppSettings | null>(settings.data ?? null);
  const [draft, setDraft] = useState<DraftSettings | null>(
    settings.data ? toDraft(settings.data) : null,
  );
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!settings.data || lastSyncedRef.current === settings.data) return;
    lastSyncedRef.current = settings.data;
    setDraft(toDraft(settings.data));
  }, [settings.data]);

  const dirty = useMemo(
    () => Boolean(draft && settings.data && JSON.stringify(draft) !== JSON.stringify(toDraft(settings.data))),
    [draft, settings.data],
  );
  const errors = useMemo(() => (draft ? validate(draft) : []), [draft]);

  if (settings.isLoading) {
    return (
      <section aria-labelledby="settings-title">
        <h2 id="settings-title">Settings</h2>
        <p role="status" className="busy-row">
          <span className="spinner" aria-hidden="true" /> Loading settings…
        </p>
      </section>
    );
  }

  if (settings.isError || !settings.data || !draft) {
    return (
      <section aria-labelledby="settings-title">
        <h2 id="settings-title">Settings</h2>
        <p className="alert alert--error" role="alert">
          Could not load settings from the project <code>.config</code> file.
        </p>
      </section>
    );
  }

  function patch(next: Partial<DraftSettings>): void {
    setDraft((current) => (current ? { ...current, ...next } : current));
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    setSubmitted(true);
    if (!draft || errors.length > 0) return;
    save.mutate({
      applicationName: draft.applicationName.trim(),
      defaultRemotePath: draft.defaultRemotePath.trim(),
      ruleConfigPath: draft.ruleConfigPath.trim(),
      rowsAndColumnsConfigPath: draft.rowsAndColumnsConfigPath.trim(),
      filterConfigPath: draft.filterConfigPath.trim(),
      fullSetConfirmationRows: Number(draft.fullSetConfirmationRows),
      runHistoryPath: draft.runHistoryPath.trim(),
    });
  }

  const fields: Array<{
    id: string;
    label: string;
    key: Exclude<keyof DraftSettings, "fullSetConfirmationRows">;
  }> = [
    { id: "application-name", label: "Application name", key: "applicationName" },
    { id: "default-remote-path", label: "Default Remote Path", key: "defaultRemotePath" },
    { id: "rule-config-path", label: "Rule Config Path", key: "ruleConfigPath" },
    {
      id: "rows-columns-config-path",
      label: "Rows and Columns Config Path",
      key: "rowsAndColumnsConfigPath",
    },
    { id: "filter-config-path", label: "Filter Config Path", key: "filterConfigPath" },
  ];

  return (
    <section aria-labelledby="settings-title">
      <h2 id="settings-title">Settings</h2>
      <p className="field-hint">
        These values are stored in the project-root <code>.config</code> file.
      </p>
      <form className="card" onSubmit={handleSubmit} noValidate>
        {fields.map((field) => (
          <div className="field" key={field.id}>
            <label htmlFor={field.id}>{field.label}</label>
            <input
              id={field.id}
              value={draft[field.key]}
              onChange={(event) => patch({ [field.key]: event.target.value })}
            />
            {field.key === "defaultRemotePath" && (
              <span className="field-hint">Optional; leave empty when no remote source is configured.</span>
            )}
          </div>
        ))}

        <div className="field">
          <label htmlFor="full-set-confirmation-rows">Full set confirmation (Rows)</label>
          <input
            id="full-set-confirmation-rows"
            type="number"
            min={1}
            step={1}
            value={draft.fullSetConfirmationRows}
            onChange={(event) => patch({ fullSetConfirmationRows: event.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="run-history-path">Run history Path</label>
          <input
            id="run-history-path"
            value={draft.runHistoryPath}
            onChange={(event) => patch({ runHistoryPath: event.target.value })}
          />
        </div>

        <div role="status" aria-live="polite">
          {errors.length > 0 && (submitted || dirty) && (
            <ul className="alert alert--error">
              {errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          )}
          {dirty && errors.length === 0 && <p className="field-hint">Unsaved changes.</p>}
          {save.isPending && <p>Saving…</p>}
          {save.isSuccess && <p className="alert alert--success">Settings saved.</p>}
          {save.isError && <p className="alert alert--error">Could not save settings: {save.error.message}</p>}
        </div>

        <div className="dialog-actions">
          <button
            type="button"
            className="btn"
            disabled={!dirty || save.isPending}
            onClick={() => {
              setDraft(toDraft(settings.data));
              setSubmitted(false);
            }}
          >
            Reset
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!dirty || errors.length > 0 || save.isPending}
          >
            Save settings
          </button>
        </div>
      </form>
    </section>
  );
}
