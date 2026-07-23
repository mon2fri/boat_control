import { useState } from "react";
import type { Family } from "../api/domain";
import { useFamilies, useDeleteFamily } from "../features/settings/useSettings";
import { FamilyEditor } from "../features/families/FamilyEditor";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function FamiliesPage() {
  const { data: families, isLoading, isError } = useFamilies();
  const deleteFamily = useDeleteFamily();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFamily, setEditingFamily] = useState<Family | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Family | null>(null);

  const columnFamilies = (families ?? []).filter((f): f is Family & { kind: "column" } => f.kind === "column");
  const valueFamilies = (families ?? []).filter((f): f is Family & { kind: "value" } => f.kind === "value");

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteFamily.mutateAsync(deleteTarget.name);
    } catch {
      // error handled by query
    }
    setDeleteTarget(null);
  };

  return (
    <section aria-labelledby="families-title">
      <div className="config-layout">
        <h2 id="families-title" className="section-heading">Column/Value Families</h2>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setEditingFamily(null);
            setEditorOpen(true);
          }}
        >
          Add family
        </button>
      </div>

      {editorOpen && (
        <FamilyEditor
          family={editingFamily}
          onClose={() => {
            setEditorOpen(false);
            setEditingFamily(null);
          }}
          onSaved={() => {}}
        />
      )}

      {isLoading && <p role="status" className="busy-row"><span className="spinner" aria-hidden="true" /> Loading families...</p>}
      {isError && <p className="alert alert--error" role="alert">Could not load families.</p>}

      <h3 className="section-heading" style={{ marginTop: "var(--space)" }}>Column Families</h3>
      {columnFamilies.length === 0 ? (
        <p className="field-hint">No column families defined.</p>
      ) : (
        <div className="family-list">
          {columnFamilies.map((f) => (
            <div key={f.name} className="card">
              <div className="family-card-header">
                <strong>{f.name}</strong>
                <span className="field-hint">{f.columns.length} column{f.columns.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="chip-list">
                {f.columns.map((col) => (
                  <span key={col} className="tag">{col}</span>
                ))}
              </div>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setEditingFamily(f);
                    setEditorOpen(true);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => setDeleteTarget(f)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="section-heading" style={{ marginTop: "var(--space)" }}>Value Families</h3>
      {valueFamilies.length === 0 ? (
        <p className="field-hint">No value families defined.</p>
      ) : (
        <div className="family-list">
          {valueFamilies.map((f) => (
            <div key={f.name} className="card">
              <div className="family-card-header">
                <strong>{f.name}</strong>
                <span className="field-hint">
                  Owner: {f.owner.kind === "column_family" ? "family:" : ""}{f.owner.name}
                </span>
              </div>
              <div className="chip-list">
                {f.values.map((val) => (
                  <span key={val} className="tag">{val}</span>
                ))}
              </div>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setEditingFamily(f);
                    setEditorOpen(true);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => setDeleteTarget(f)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Remove family "${deleteTarget.name}"` : ""}
        confirmLabel="Remove"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      >
        {deleteTarget && (
          <>
            <p>Are you sure you want to remove the {deleteTarget.kind} family <strong>{deleteTarget.name}</strong>?</p>
            {deleteTarget.kind === "column" && deleteTarget.columns.length > 0 && (
              <p className="field-hint">Saved rules and configurations that reference this family may stop working.</p>
            )}
          </>
        )}
      </ConfirmDialog>
    </section>
  );
}
