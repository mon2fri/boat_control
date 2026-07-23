import { useCallback, useMemo, useState } from "react";
import type { Family } from "../../api/domain";
import { useCreateFamily, useFamilies, useUpdateFamily } from "../settings/useSettings";
import { useWorkflow } from "../../state/WorkflowContext";

interface FamilyEditorProps {
  family?: Family | null;
  kind?: "column" | "value";
  preselectedOwner?: { kind: "column" | "column_family"; name: string } | null;
  onClose: () => void;
  onSaved: () => void;
}

const FAMILY_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

export function FamilyEditor({ family, kind: forcedKind, preselectedOwner, onClose, onSaved }: FamilyEditorProps) {
  const { state } = useWorkflow();
  const createFamily = useCreateFamily();
  const updateFamily = useUpdateFamily();
  const { data: allFamilies } = useFamilies();

  const availableColumns = state.header ? [...state.header.common] : [];
  const comparisonFileColumns = availableColumns;

  const columnFamilies = useMemo(
    () => (allFamilies ?? []).filter((f): f is Family & { kind: "column" } => f.kind === "column"),
    [allFamilies],
  );

  const isEditing = !!family;

  const [kind, setKind] = useState<"column" | "value">(family?.kind ?? forcedKind ?? "column");
  const [name, setName] = useState(family?.name ?? "");
  const [nameError, setNameError] = useState("");
  const [columns, setColumns] = useState<string[]>(
    family?.kind === "column" ? family.columns : [],
  );
  const [ownerKind, setOwnerKind] = useState<"column" | "column_family">(
    (family?.kind === "value" ? family.owner.kind : preselectedOwner?.kind) ?? "column",
  );
  const [ownerName, setOwnerName] = useState(
    (family?.kind === "value" ? family.owner.name : preselectedOwner?.name) ?? "",
  );
  const [values, setValues] = useState<string[]>(
    family?.kind === "value" ? family.values : [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const availableMembers = useMemo(() => {
    return availableColumns;
  }, [availableColumns]);

  const ownerOptions = useMemo(() => {
    if (ownerKind === "column") {
      return availableColumns.map((c) => ({ value: c, label: c }));
    }
    return (columnFamilies ?? []).map((f) => ({ value: f.name, label: f.name }));
  }, [ownerKind, availableColumns, columnFamilies]);

  const validate = useCallback((): string | null => {
    if (!name.trim()) return "Name is required.";
    if (!FAMILY_NAME_RE.test(name.trim())) {
      return "Name must start with a letter and contain only letters, digits, and underscores.";
    }
    if (kind === "column") {
      if (columns.length < 1) return "At least one column is required.";
    } else {
      if (!ownerName.trim()) return "Owner is required.";
      if (values.length < 1) return "At least one value is required.";
    }
    return null;
  }, [name, kind, columns, ownerName, values]);

  const handleSave = useCallback(async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEditing) {
        await updateFamily.mutateAsync({
          name: family!.name,
          data: {
            kind,
            name: name.trim(),
            ...(kind === "column" ? { columns } : { owner: { kind: ownerKind, name: ownerName.trim() }, values }),
            version: 1,
          },
        });
      } else {
        await createFamily.mutateAsync({
          kind,
          name: name.trim(),
          ...(kind === "column" ? { columns } : { owner: { kind: ownerKind, name: ownerName.trim() }, values }),
        });
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save family.");
    } finally {
      setSaving(false);
    }
  }, [validate, isEditing, family, updateFamily, createFamily, kind, name, columns, ownerKind, ownerName, values, onSaved, onClose]);

  return (
    <div className="card" role="dialog" aria-label={isEditing ? `Edit ${kind} family` : `Create ${kind} family`}>
      <h3 className="card-heading">
        {isEditing ? "Edit" : "New"} {kind === "column" ? "Column" : "Value"} Family
      </h3>

      {!forcedKind && !isEditing && (
        <div className="field">
          <label htmlFor="family-kind">Kind</label>
          <select
            id="family-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as "column" | "value")}
          >
            <option value="column">Column Family</option>
            <option value="value">Value Family</option>
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor="family-name">Name</label>
        <input
          id="family-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(FAMILY_NAME_RE.test(e.target.value) ? "" : "Invalid name format");
          }}
          aria-invalid={!!nameError}
        />
        {nameError && <span className="field-hint field-error">{nameError}</span>}
      </div>

      {kind === "column" && (
        <div className="field">
          <label>Columns</label>
          <div className="multi-select-chips">
            {availableMembers.map((col) => (
              <label key={col} className="chip-check">
                <input
                  type="checkbox"
                  checked={columns.includes(col)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setColumns((prev) => [...prev, col]);
                    } else if (columns.length > 1) {
                      setColumns((prev) => prev.filter((c) => c !== col));
                    }
                  }}
                />
                {col}
              </label>
            ))}
          </div>
          {columns.length === 0 && <span className="field-hint">Select at least one column.</span>}
        </div>
      )}

      {kind === "value" && (
        <>
          <div className="field">
            <label htmlFor="owner-kind">Owner kind</label>
            <select
              id="owner-kind"
              value={ownerKind}
              onChange={(e) => setOwnerKind(e.target.value as "column" | "column_family")}
            >
              <option value="column">Column</option>
              <option value="column_family">Column Family</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="owner-name">Owner</label>
            <select
              id="owner-name"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            >
              <option value="">Select owner...</option>
              {ownerOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Values</label>
            <div className="multi-select-chips">
              {comparisonFileColumns.length > 0 ? (
                <p className="field-hint">Add string values manually (file values not yet loaded).</p>
              ) : null}
            </div>
            <FamilyValueEditor values={values} onChange={setValues} />
          </div>
        </>
      )}

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleSave}
          disabled={saving || !!nameError}
        >
          {saving ? "Saving..." : isEditing ? "Update" : "Create"}
        </button>
      </div>
    </div>
  );
}

function FamilyValueEditor({ values, onChange }: { values: string[]; onChange: (vals: string[]) => void }) {
  const [input, setInput] = useState("");

  const addValue = useCallback(() => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  }, [input, values, onChange]);

  return (
    <div>
      <div className="field-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addValue();
            }
          }}
          placeholder="Type a value and press Enter"
        />
        <button type="button" className="btn" onClick={addValue} disabled={!input.trim()}>
          Add
        </button>
      </div>
      <ul className="chip-list" aria-label="Family values">
        {values.map((v, i) => (
          <li key={i}>
            <span className="tag">{v}</span>
            <button
              type="button"
              className="btn chip-remove"
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              aria-label={`Remove value ${v}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
