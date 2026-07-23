import { useCallback, useState } from "react";
import { useConfigs, useCreateConfig, useDeleteConfig, useUpdateConfig } from "../settings/useSettings";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface ConfigManagerProps {
  configType: "rules" | "filters" | "rows-and-columns";
  onLoad: (name: string) => void;
  currentContent: unknown;
  disabled?: boolean;
  hasUnsavedChanges?: boolean;
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
  hasUnsavedChanges,
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

  const heading = title ?? "Load config for rows and columns";

  const selectedVersion = selectedName
    ? configs.data?.find((c) => c.name === selectedName)?.version ?? null
    : null;

  function handleLoad(name: string): void {
    if (!name) return;
    if (hasUnsavedChanges) {
      setPendingLoadName(name);
    } else {
      setSelectedName(name);
      onLoad(name);
    }
  }

  function handleSaveNew(): void {
    if (!saveName.trim()) return;
    create.mutate(
      { name: saveName.trim(), content: currentContent },
      {
        onSuccess: () => {
          setSaveName("");
          setShowSavePrompt(false);
        },
      },
    );
  }

  const handleSaveToConfig = useCallback(() => {
    if (!selectedName || selectedVersion === null) return;
    update.mutate({ name: selectedName, content: currentContent, version: selectedVersion });
  }, [selectedName, selectedVersion, currentContent, update]);

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
              disabled={disabled}
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
                    className="btn"
                    disabled={disabled}
                    onClick={() => {
                      handleLoad(selectedName);
                    }}
                  >
                    Load config
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={disabled || update.isPending}
                    onClick={handleSaveToConfig}
                  >
                    Save to config
                  </button>
                </>
              )}

              <button
                type="button"
                className="btn"
                disabled={disabled}
                onClick={() => setShowSavePrompt(true)}
              >
                Save new config
              </button>

              {selectedName && (
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={disabled || del.isPending}
                  onClick={() => setPendingDeleteName(selectedName)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {create.isSuccess && <p className="alert alert--success" style={{ marginTop: "var(--space)" }}>Saved as new config.</p>}
          {create.isError && (
            <p className="alert alert--error" style={{ marginTop: "var(--space)" }}>
              {create.error?.message?.includes("409") || create.error?.message?.includes("version")
                ? `Version conflict: "${saveName.trim()}" was modified elsewhere. Reload and retry.`
                : create.error?.message ?? "Save failed."}
            </p>
          )}
          {update.isSuccess && <p className="alert alert--success" style={{ marginTop: "var(--space)" }}>Saved to config.</p>}
          {update.isError && (
            <p className="alert alert--error" style={{ marginTop: "var(--space)" }}>
              {update.error?.message?.includes("409") || update.error?.message?.includes("version")
                ? `Version conflict: "${selectedName}" was modified elsewhere. Reload and retry.`
                : update.error?.message ?? "Save failed."}
            </p>
          )}
        </>
      )}

      {/* Save new config prompt */}
      <ConfirmDialog
        title="Save new config"
        open={showSavePrompt}
        confirmLabel="Save"
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
