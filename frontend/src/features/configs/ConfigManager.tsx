import { useState } from "react";
import { useConfigs, useCreateConfig, useDeleteConfig } from "../settings/useSettings";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface ConfigManagerProps {
  configType: "settings" | "rules" | "filters";
  onLoad: (name: string) => void;
  currentContent: unknown;
  disabled?: boolean;
  hasUnsavedChanges?: boolean;
}

export function ConfigManager({ configType, onLoad, currentContent, disabled, hasUnsavedChanges }: ConfigManagerProps) {
  const configs = useConfigs(configType);
  const create = useCreateConfig(configType);
  const del = useDeleteConfig(configType);
  const [saveName, setSaveName] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [pendingLoadName, setPendingLoadName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const label = configType.charAt(0).toUpperCase() + configType.slice(1);

  function handleLoad(name: string): void {
    if (hasUnsavedChanges) {
      setPendingLoadName(name);
    } else {
      setSelectedName(name);
      onLoad(name);
    }
  }

  if (!open) {
    return (
      <p>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          Manage {label} configs
        </button>
      </p>
    );
  }

  return (
    <div className="card">
      <div className="dialog-actions" style={{ marginBottom: 0 }}>
        <h3>{label} configs</h3>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      {configs.isPending && <p role="status">Loading configs…</p>}
      {configs.isError && <p className="alert alert--error">Could not load configs.</p>}

      {configs.data && (
        <>
          {configs.data.length === 0 ? (
            <p className="field-hint">No named configs saved yet.</p>
          ) : (
            <div className="field">
              <label htmlFor={`${configType}-config-select`}>Load saved config</label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <select
                  id={`${configType}-config-select`}
                  value={selectedName}
                  onChange={(e) => handleLoad(e.target.value)}
                  disabled={disabled}
                  style={{ flex: 1 }}
                >
                  <option value="">-- Select --</option>
                  {configs.data.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} (v{c.version})
                    </option>
                  ))}
                </select>
                {selectedName && (
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={del.isPending}
                    onClick={() => del.mutate(selectedName, { onSuccess: () => setSelectedName("") })}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor={`${configType}-config-save-name`}>Save current as</label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                id={`${configType}-config-save-name`}
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="config-name"
                disabled={disabled}
              />
              <button
                type="button"
                className="btn btn--primary"
                disabled={!saveName.trim() || create.isPending || disabled}
                onClick={() => {
                  create.mutate(
                    { name: saveName.trim(), content: currentContent },
                    { onSuccess: () => setSaveName("") },
                  );
                }}
              >
                Save
              </button>
            </div>
            {create.isSuccess && <p className="alert alert--success">Saved.</p>}
            {create.isError && (
              <p className="alert alert--error">
                {create.error?.message?.includes("409") || create.error?.message?.includes("version")
                  ? `Version conflict: "${saveName.trim()}" was modified elsewhere. Reload the page and retry.`
                  : create.error?.message ?? "Save failed."}
              </p>
            )}
          </div>
        </>
      )}

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
    </div>
  );
}
