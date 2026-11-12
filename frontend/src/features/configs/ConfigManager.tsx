import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  configDetailKey,
  configListKey,
  useConfigs,
  useCreateConfig,
  useDeleteConfig,
  useUpdateConfig,
} from "../settings/useSettings";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ConfigLoadNotice } from "./ConfigLoadNotice";

/** Minimum freeze after a save starts, so the saving state is always
 * observable and a load cannot apply not-yet-refreshed cache. */
const SAVE_FREEZE_MS = 2000;

interface ConfigManagerProps {
  configType: "rules" | "filters" | "rows-and-columns";
  onLoad: (name: string) => void;
  currentContent: unknown;
  disabled?: boolean;
  /** Prevent saving when the current editor configuration is incomplete/invalid. */
  saveDisabled?: boolean;
  hasUnsavedChanges?: boolean;
  /** Some config types replace committed server state even without editor dirtiness. */
  confirmBeforeLoad?: boolean;
  /** Title displayed on the card heading. */
  title?: string;
}

/**
 * Compact configuration card for saving, loading, and deleting named configs.
 * Replaces the old expanded "Manage configs" UI with a single compact card.
 */
export function ConfigManager({
  configType,
  onLoad,
  currentContent,
  disabled,
  saveDisabled = false,
  hasUnsavedChanges,
  confirmBeforeLoad = false,
  title,
}: ConfigManagerProps) {
  const configs = useConfigs(configType);
  const create = useCreateConfig(configType);
  const update = useUpdateConfig(configType);
  const del = useDeleteConfig(configType);
  const [selectedName, setSelectedName] = useState("");
  const [saveName, setSaveName] = useState("");
  const [pendingLoadName, setPendingLoadName] = useState<string | null>(null);
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [showSaveToConfigConfirm, setShowSaveToConfigConfirm] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  // Target of the in-progress save, shown as "Saving to config: xxx".
  const [savingName, setSavingName] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // Extra freeze beyond the mutation itself: fast saves would otherwise
  // flash the disabled state for milliseconds, and the buttons would enable
  // before the invalidated config cache has refetched.
  const [cooling, setCooling] = useState(false);
  const coolingTimer = useRef<number | null>(null);
  const saveInFlight = useRef(false);
  useEffect(() => () => {
    if (coolingTimer.current !== null) window.clearTimeout(coolingTimer.current);
  }, []);

  const heading = title ?? "Load config for rows and columns";

  const selectedVersion = selectedName
    ? configs.data?.find((c) => c.name === selectedName)?.version ?? null
    : null;

  // Either save path in flight (or cooling down): block the dropdown and
  // every action so a load cannot apply stale cached content mid-save.
  // isPending alone is not enough — it clears the moment the mutation
  // settles, while the invalidated config cache may still be refetching.
  const saving = create.isPending || update.isPending || cooling;

  /** Refresh the saved config's cache entries, then end the freeze. The
   * "Saving to config: xxx" message stays up through the whole freeze and is
   * swapped for "Saved to config: xxx" exactly when the buttons enable. */
  async function finishSave(name: string, startedAt: number, ok: boolean): Promise<void> {
    saveInFlight.current = false;
    if (ok) {
      try {
        await Promise.all([
          queryClient.refetchQueries({ queryKey: configDetailKey(configType, name) }),
          queryClient.refetchQueries({ queryKey: configListKey(configType) }),
        ]);
      } catch {
        // The save itself succeeded; a refresh failure just leaves the
        // normal query error states to surface on next load. Either way the
        // saved message below is accurate about the save.
      }
    }
    const remaining = SAVE_FREEZE_MS - (Date.now() - startedAt);
    const done = () => {
      coolingTimer.current = null;
      setCooling(false);
      setSavingName(null);
      if (ok) setSavedMessage(`Saved to config: ${name}`);
    };
    if (remaining <= 0) {
      done();
      return;
    }
    if (coolingTimer.current !== null) window.clearTimeout(coolingTimer.current);
    coolingTimer.current = window.setTimeout(done, remaining);
  }

  function handleLoad(name: string): void {
    if (!name) return;
    if (hasUnsavedChanges || confirmBeforeLoad) {
      setPendingLoadName(name);
    } else {
      setSelectedName(name);
      onLoad(name);
    }
  }

  function handleSaveNew(): void {
    const name = saveName.trim();
    if (!name || saveInFlight.current) return;
    saveInFlight.current = true;
    setSavedMessage(null);
    setSavingName(name);
    setCooling(true);
    const startedAt = Date.now();
    create.mutate(
      { name, content: currentContent },
      {
        onSuccess: () => {
          setSaveName("");
          setShowSavePrompt(false);
          void finishSave(name, startedAt, true);
        },
        onError: () => {
          void finishSave(name, startedAt, false);
        },
      },
    );
  }

  const handleSaveToConfig = useCallback(() => {
    if (!selectedName || selectedVersion === null || saveInFlight.current) return;
    saveInFlight.current = true;
    setSavedMessage(null);
    setSavingName(selectedName);
    setCooling(true);
    const startedAt = Date.now();
    const name = selectedName;
    setShowSaveToConfigConfirm(false);
    update.mutate(
      { name, content: currentContent, version: selectedVersion },
      {
        onSuccess: () => {
          void finishSave(name, startedAt, true);
        },
        onError: () => {
          void finishSave(name, startedAt, false);
        },
      },
    );
  }, [selectedName, selectedVersion, currentContent, update, configType, queryClient]);

  return (
    <div className="card">
      <h3 className="card-heading">{heading}</h3>

      {configs.isPending && <p role="status" className="card-hint">Loading configs…</p>}
      {configs.isError && <p className="alert alert--error">Could not load configs.</p>}

      {configs.data && (
        <>
          <div className="config-inline-row">
            <select
              id={`${configType}-config-select`}
              value={selectedName}
              onChange={(e) => {
                setSelectedName(e.target.value);
              }}
              disabled={disabled || saving}
            >
              {configs.data.length === 0 ? (
                <option value="">(new config)</option>
              ) : (
                <>
                  <option value="">-- Select --</option>
                  {configs.data.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} (v{c.version})
                    </option>
                  ))}
                </>
              )}
            </select>

            <div className="config-inline-actions">
              {selectedName && (
                <>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={disabled || saving}
                    onClick={() => {
                      handleLoad(selectedName);
                    }}
                  >
                    Load config
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={disabled || saveDisabled || saving}
                    onClick={() => setShowSaveToConfigConfirm(true)}
                  >
                    Save to config
                  </button>
                </>
              )}

              <button
                type="button"
                className="btn"
                disabled={disabled || saveDisabled || saving}
                onClick={() => setShowSavePrompt(true)}
              >
                 Save to new config
              </button>

              {selectedName && (
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={disabled || del.isPending || saving}
                  onClick={() => setPendingDeleteName(selectedName)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {saving && (
            <p role="status" aria-live="polite" className="busy-row">
              <span className="spinner" aria-hidden="true" />{" "}
              {savingName ? `Saving to config: ${savingName}…` : "Saving config…"}
            </p>
          )}
          <ConfigLoadNotice message={savedMessage} />

          {create.isError && (
            <p className="alert alert--error" style={{ marginTop: "var(--space)" }}>
              {create.error?.message?.includes("409") || create.error?.message?.includes("version")
                ? `Version conflict: "${saveName.trim()}" was modified elsewhere. Reload and retry.`
                : create.error?.message ?? "Save failed."}
            </p>
          )}
          {update.isError && (
            <p className="alert alert--error" style={{ marginTop: "var(--space)" }}>
              {update.error?.message?.includes("409") || update.error?.message?.includes("version")
                ? `Version conflict: "${selectedName}" was modified elsewhere. Reload and retry.`
                : update.error?.message ?? "Save failed."}
            </p>
          )}
          {del.isError && (
            <p className="alert alert--error" style={{ marginTop: "var(--space)" }}>
              {del.error?.message ?? "Delete failed."}
            </p>
          )}
        </>
      )}

      {/* Save new config prompt */}
      <ConfirmDialog
        title="Save new config"
        open={showSavePrompt}
        confirmLabel="Save"
        confirmDisabled={saving}
        onCancel={() => {
          setShowSavePrompt(false);
          setSaveName("");
        }}
        onConfirm={handleSaveNew}
      >
        <div className="field">
          <label htmlFor={`${configType}-config-save-name`}>Config name</label>
          <input
            id={`${configType}-config-save-name`}
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="my-config"
            autoFocus
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        title="Save to config?"
        open={showSaveToConfigConfirm}
        confirmLabel="Save"
        confirmDisabled={saving}
        onCancel={() => setShowSaveToConfigConfirm(false)}
        onConfirm={handleSaveToConfig}
      >
        <p>
          Replace the saved content of <strong>{selectedName}</strong> with the current configuration?
        </p>
      </ConfirmDialog>

      {/* Load config with unsaved changes */}
      <ConfirmDialog
        title="Discard unsaved changes?"
        open={pendingLoadName !== null}
        confirmLabel="Discard and load"
        confirmTone="danger"
        onCancel={() => setPendingLoadName(null)}
        onConfirm={() => {
          if (pendingLoadName) {
            setSelectedName(pendingLoadName);
            setPendingLoadName(null);
            onLoad(pendingLoadName);
          }
        }}
      >
        <p>
          Loading a named configuration discards your current edits. Save first or cancel to keep
          your changes.
        </p>
      </ConfirmDialog>

      {/* Delete config confirmation */}
      <ConfirmDialog
        title="Remove config?"
        open={pendingDeleteName !== null}
        confirmLabel="Remove"
        confirmTone="danger"
        onCancel={() => setPendingDeleteName(null)}
        onConfirm={() => {
          if (pendingDeleteName) {
            del.mutate(pendingDeleteName, {
              onSuccess: () => {
                setSelectedName("");
                setPendingDeleteName(null);
              },
              onError: () => {
                setPendingDeleteName(null);
              },
            });
          }
        }}
      >
        <p>
          Delete config <strong>{pendingDeleteName}</strong>? This cannot be undone.
        </p>
      </ConfirmDialog>
    </div>
  );
}
