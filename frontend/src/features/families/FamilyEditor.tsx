import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Family } from "../../api/domain";
import { fetchColumnValuesPage } from "../../api/endpoints";
import { useCreateFamily, useFamilies, useUpdateFamily } from "../settings/useSettings";
import { SearchableMultiSelect } from "../../components/SearchableMultiSelect";
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
  const sessionId = state.header?.sessionId ?? null;
  const createFamily = useCreateFamily();
  const updateFamily = useUpdateFamily();
  const { data: allFamilies } = useFamilies();

  const availableColumns = state.header ? [...state.header.common] : [];

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

  const initialOwners = family?.kind === "value" ? family.owners : preselectedOwner ? [{ kind: preselectedOwner.kind, name: preselectedOwner.name }] : [];
  const [owners, setOwners] = useState<{ kind: "column" | "column_family"; name: string }[]>(initialOwners);

  const [values, setValues] = useState<string[]>(
    family?.kind === "value" ? family.values : [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fetchedColumnValues, setFetchedColumnValues] = useState<Record<string, { value: string; starred: boolean }[]>>({});
  const abortRef = useRef<AbortController | null>(null);

  const ownerColumnNames = owners.filter((o) => o.kind === "column").map((o) => o.name);

  // Fetch distinct values from selected owner columns whenever the selection changes.
  useEffect(() => {
    if (!sessionId || ownerColumnNames.length === 0) {
      setFetchedColumnValues({});
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    Promise.all(
      ownerColumnNames.map((col) =>
        fetchColumnValuesPage(sessionId, col, { limit: 1000, signal: controller.signal })
          .then((page) => ({ column: col, values: page.values }))
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      const acc: Record<string, { value: string; starred: boolean }[]> = {};
      for (const r of results) {
        if (r) acc[r.column] = r.values;
      }
      setFetchedColumnValues(acc);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionId, ownerColumnNames]);

  const valueOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: { value: string; label: string }[] = [];
    for (const col of ownerColumnNames) {
      const vals = fetchedColumnValues[col];
      if (!vals) continue;
      for (const v of vals) {
        if (!seen.has(v.value)) {
          seen.add(v.value);
          result.push({ value: v.value, label: v.value });
        }
      }
    }
    return result;
  }, [fetchedColumnValues, ownerColumnNames]);

  const ownerOptions = useMemo(() => {
    const colOpts = availableColumns.map((c) => ({ value: c, label: c, group: "column" as const }));
    const familyOpts = columnFamilies.map((f) => ({ value: f.name, label: f.name, group: "column_family" as const }));
    return [...colOpts, ...familyOpts];
  }, [availableColumns, columnFamilies]);

  const ownerSelected = owners.map((o) => o.name);

  const handleOwnerChange = useCallback((names: string[]) => {
    const selected = names.map((n) => {
      const opt = ownerOptions.find((o) => o.value === n);
      return { kind: (opt?.group ?? "column") as "column" | "column_family", name: n };
    });
    setOwners(selected);
  }, [ownerOptions]);

  const validate = useCallback((): string | null => {
    if (!name.trim()) return "Name is required.";
    if (!FAMILY_NAME_RE.test(name.trim())) {
      return "Name must start with a letter and contain only letters, digits, and underscores.";
    }
    if (kind === "column") {
      if (columns.length < 1) return "At least one column is required.";
    } else {
      if (owners.length < 1) return "At least one owner is required.";
      if (values.length < 1) return "At least one value is required.";
    }
    return null;
  }, [name, kind, columns, owners, values]);

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
            ...(kind === "column" ? { columns } : { owners, values }),
            version: 1,
          },
        });
      } else {
        await createFamily.mutateAsync({
          kind,
          name: name.trim(),
          ...(kind === "column" ? { columns } : { owners, values }),
        });
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save family.");
    } finally {
      setSaving(false);
    }
  }, [validate, isEditing, family, updateFamily, createFamily, kind, name, columns, owners, values, onSaved, onClose]);

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
        <SearchableMultiSelect
          label="Columns"
          options={availableColumns.map((c) => ({ value: c, label: c }))}
          selected={columns}
          onChange={(vals) => setColumns(vals)}
          placeholder="Search columns…"
        />
      )}
      {kind === "column" && columns.length === 0 && <span className="field-hint">Select at least one column.</span>}

      {kind === "value" && (
        <>
          <SearchableMultiSelect
            label="Owner columns"
            options={ownerOptions}
            selected={ownerSelected}
            onChange={handleOwnerChange}
            placeholder="Search columns or column families…"
          />
          {owners.length === 0 && <span className="field-hint">Select at least one owner.</span>}

          <SearchableMultiSelect
            label="Values"
            options={valueOptions}
            selected={values}
            onChange={setValues}
            placeholder="Search values or type comma-separated…"
            freeText
          />
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

