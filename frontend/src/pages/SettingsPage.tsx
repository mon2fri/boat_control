/**
 * Settings page. Loads the editable settings from the backend, lets the user
 * edit them, and saves on submit. Shows loading, error, and unsaved-change
 * states explicitly so the user always knows whether their edits will
 * persist. Degrades gracefully to a read-only view when the backend has not
 * yet shipped the `/settings/` endpoint.
 *
 * The form binds to the canonical wire fields from
 * `docs/20260718_contract_api_final.md` §10:
 *   - `preset_source_paths` (array — first entry edited as text)
 *   - `rules_config_path`
 *   - `full_set_threshold`
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSaveSettings, useSettings } from "../features/settings/useSettings";
import { ConfigLoader } from "../features/configs/ConfigLoader";
import { ConfigManager } from "../features/configs/ConfigManager";
import type { AppSettings } from "../api/domain";

interface DraftSettings {
  presetSourcePath: string;
  rulesConfigPath: string;
  filtersConfigPath: string;
  fullSetThreshold: string;
}

function toDraft(s: AppSettings): DraftSettings {
  return {
    presetSourcePath: s.presetSourcePaths[0] ?? "",
    rulesConfigPath: s.rulesConfigPath,
    filtersConfigPath: s.filtersConfigPath,
    fullSetThreshold: String(s.fullSetThreshold),
  };
}

function validate(draft: DraftSettings): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!draft.presetSourcePath.trim()) errors.push("Preset source path is required.");
  if (!draft.rulesConfigPath.trim()) errors.push("Rules config path is required.");
  const threshold = Number(draft.fullSetThreshold);
  if (!Number.isFinite(threshold) || threshold <= 0 || !Number.isInteger(threshold)) {
    errors.push("Full-set confirmation threshold must be a positive integer.");
  }
  return { valid: errors.length === 0, errors };
}

export function SettingsPage() {
  const settings = useSettings();
  const save = useSaveSettings();
  // Track the last server snapshot we synced from so we only re-seed the
  // draft when the server hands us genuinely new data — not on every
  // render caused by local edits.
  const lastSyncedRef = useRef<AppSettings | null>(settings.data ?? null);
  const [draft, setDraft] = useState<DraftSettings | null>(
    settings.data ? toDraft(settings.data) : null,
  );
  const [submitted, setSubmitted] = useState(false);
  const [configLoadName, setConfigLoadName] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    if (lastSyncedRef.current === settings.data) return;
    lastSyncedRef.current = settings.data;
    setDraft(toDraft(settings.data));
  }, [settings.data]);

  const dirty = useMemo(
    () => Boolean(draft && settings.data && JSON.stringify(draft) !== JSON.stringify(toDraft(settings.data))),
    [draft, settings.data],
  );

  const validation = useMemo(() => (draft ? validate(draft) : { valid: true, errors: [] as string[] }), [draft]);

  if (settings.isLoading) {
    return (
      <section aria-labelledby="settings-title">
        <h2 id="settings-title">Settings</h2>
        <p role="status" aria-live="polite" className="busy-row">
          <span className="spinner" aria-hidden="true" /> Loading settings…
        </p>
      </section>
    );
  }

  if (settings.isError || !settings.data || !draft) {
    return (
      <section aria-labelledby="settings-title">
        <h2 id="settings-title">Settings</h2>
        <p className="alert alert--warn" role="status">
          Editable settings are not available in this build — the server has not yet
          shipped the <code>/settings/</code> endpoint. Read-only defaults are shown
          below.
        </p>
        <ReadOnlyDefaults />
      </section>
    );
  }

  function patch(next: Partial<DraftSettings>): void {
    setDraft((d) => (d ? { ...d, ...next } : d));
  }

  function handleConfigLoad(content: unknown): void {
    const data = content as Record<string, unknown> | null;
    if (!data) return;
    const src = (data.presetSourcePaths as string[] | undefined) ?? (data.presetSourcePath as string | undefined);
    patch({
      presetSourcePath: Array.isArray(src) ? (src[0] ?? "") : (typeof src === "string" ? src : ""),
      rulesConfigPath: (data.rulesConfigPath as string | undefined) ?? "",
      filtersConfigPath: (data.filtersConfigPath as string | undefined) ?? "",
      fullSetThreshold: String((data.fullSetThreshold as number | undefined) ?? 2000),
    });
    setSubmitted(false);
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    setSubmitted(true);
    if (!draft || !validation.valid) return;
    if (!settings.data) return;
    save.mutate({
      presetSourcePaths: [draft.presetSourcePath.trim(), ...settings.data.presetSourcePaths.slice(1)],
      rulesConfigPath: draft.rulesConfigPath.trim(),
      filtersConfigPath: draft.filtersConfigPath.trim(),
      fullSetThreshold: Number(draft.fullSetThreshold),
    });
  }

  function handleReset(): void {
    if (settings.data) setDraft(toDraft(settings.data));
    setSubmitted(false);
  }

  return (
    <section aria-labelledby="settings-title">
      <h2 id="settings-title">Settings</h2>
      <p className="field-hint">
        Edit application-wide configuration. Changes take effect for the next request —
        in-flight runs continue with the previous values.
      </p>

      <form className="card" onSubmit={handleSubmit} noValidate aria-describedby="settings-status">
        <div className="field">
          <label htmlFor="preset-source-path">Preset source path</label>
          <input
            id="preset-source-path"
            value={draft.presetSourcePath}
            onChange={(e) => patch({ presetSourcePath: e.target.value })}
            aria-invalid={submitted && !draft.presetSourcePath.trim()}
          />
          <span className="field-hint">Absolute path on the server. The server rejects paths outside its allowed root.</span>
        </div>

        <div className="field">
          <label htmlFor="rules-config-path">Rules config path</label>
          <input
            id="rules-config-path"
            value={draft.rulesConfigPath}
            onChange={(e) => patch({ rulesConfigPath: e.target.value })}
            aria-invalid={submitted && !draft.rulesConfigPath.trim()}
          />
        </div>

        <div className="field">
          <label htmlFor="filters-config-path">Filters config path</label>
          <input
            id="filters-config-path"
            value={draft.filtersConfigPath}
            onChange={(e) => patch({ filtersConfigPath: e.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="full-set-threshold">Full-set confirmation threshold (rows)</label>
          <input
            id="full-set-threshold"
            type="number"
            min={1}
            step={1}
            value={draft.fullSetThreshold}
            onChange={(e) => patch({ fullSetThreshold: e.target.value })}
            aria-invalid={submitted && (() => {
              const n = Number(draft.fullSetThreshold);
              return !Number.isFinite(n) || n <= 0 || !Number.isInteger(n);
            })()}
          />
        </div>

        <div id="settings-status" role="status" aria-live="polite">
          {!validation.valid && (submitted || dirty) && (
            <ul className="alert alert--error" aria-live="polite">
              {validation.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {dirty && validation.valid && (
            <p className="field-hint">Unsaved changes.</p>
          )}
          {save.isPending && <p> Saving…</p>}
          {save.isSuccess && <p className="alert alert--success">Settings saved.</p>}
          {save.isError && (
            <p className="alert alert--error" role="alert">
              Could not save settings: {save.error?.message ?? "unknown error"}
            </p>
          )}
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={handleReset} disabled={!dirty || save.isPending}>
            Reset
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!dirty || !validation.valid || save.isPending}
          >
            Save settings
          </button>
        </div>
      </form>

      <ConfigManager
        configType="settings"
        currentContent={{
          presetSourcePaths: [draft.presetSourcePath.trim(), ...settings.data.presetSourcePaths.slice(1)],
          rulesConfigPath: draft.rulesConfigPath.trim(),
          filtersConfigPath: draft.filtersConfigPath.trim(),
          fullSetThreshold: Number(draft.fullSetThreshold),
        }}
        onLoad={(name) => setConfigLoadName(name)}
        disabled={save.isPending}
        hasUnsavedChanges={dirty}
      />

      {configLoadName && (
        <ConfigLoader
          configType="settings"
          name={configLoadName}
          onLoad={handleConfigLoad}
          onDone={() => setConfigLoadName(null)}
        />
      )}
    </section>
  );
}

function ReadOnlyDefaults() {
  return (
    <dl className="card">
      <dt>Rules file</dt>
      <dd><code>config/rules/rules.yaml</code></dd>
      <dt>Saved filters directory</dt>
      <dd><code>config/filters/</code></dd>
      <dt>Uploaded files directory</dt>
      <dd><code>data/uploads/</code></dd>
      <dt>Run results directory</dt>
      <dd><code>data/results/</code></dd>
      <dt>Full-set confirmation threshold</dt>
      <dd>2,000 rows (server-owned)</dd>
    </dl>
  );
}