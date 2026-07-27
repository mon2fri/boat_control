import { useMemo, useState, useCallback } from "react";
import type { ComparisonSection, Family } from "../../api/domain";
import { SearchableMultiSelect } from "../../components/SearchableMultiSelect";
import { withColumnFamilies } from "../families/familyOptions";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface Props {
  sections: ComparisonSection[];
  onChange: (sections: ComparisonSection[]) => void;
  availableColumns: string[];
  families: Family[];
}

let nextId = 1;
function generateId(): string {
  return `cs-${nextId++}`;
}

/** Local draft held in editor state until the user presses "Done". */
interface Draft {
  id: string;
  name: string;
  columns: string[];
  extraColumns: string[];
}

export function ComparisonSectionEditor({ sections, onChange, availableColumns, families }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const availableOptions = withColumnFamilies(availableColumns, families);

  /**
   * Compute name counts from the *committed* sections only, excluding the
   * section currently being edited (if any). This ensures:
   * - A new draft sees the correct count for existing names.
   * - An existing section being renamed doesn't count its own old name.
   */
  const nameCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const editingId = draft?.id;
    for (const s of sections) {
      // Skip the section being edited so its old name doesn't conflict
      if (s.id === editingId) continue;
      const trimmed = s.name.trim().toLowerCase();
      if (trimmed) counts[trimmed] = (counts[trimmed] ?? 0) + 1;
    }
    return counts;
  }, [sections, draft?.id]);

  const validate = useCallback((d: Draft): string[] => {
    const errors: string[] = [];
    if (!d.name.trim()) {
      errors.push("Section name is required.");
    }
    if (d.columns.length === 0) {
      errors.push("At least one comparison column is required.");
    }
    const trimmedLower = d.name.trim().toLowerCase();
    const count = nameCounts[trimmedLower] ?? 0;
    if (trimmedLower && count > 0) {
      errors.push(`Duplicate section name "${d.name.trim()}". Name must be unique.`);
    }
    return errors;
  }, [nameCounts]);

  const handleDone = useCallback(() => {
    if (!draft) return;
    const errors = validate(draft);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    const committed: ComparisonSection = {
      id: draft.id,
      name: draft.name.trim(),
      columns: [...draft.columns],
      ...(draft.extraColumns.length > 0 ? { extraColumns: [...draft.extraColumns] } : {}),
    };
    // Check if this is an existing section being edited or a new one
    const existingIndex = sections.findIndex((s) => s.id === draft.id);
    let next: ComparisonSection[];
    if (existingIndex >= 0) {
      next = sections.map((s, i) => (i === existingIndex ? committed : s));
    } else {
      next = [...sections, committed];
    }
    onChange(next);
    setDraft(null);
    setValidationErrors([]);
  }, [draft, sections, onChange, validate]);

  const handleCancel = useCallback(() => {
    setDraft(null);
    setValidationErrors([]);
  }, []);

  const handleAdd = useCallback(() => {
    const id = generateId();
    setDraft({ id, name: "", columns: [], extraColumns: [] });
    setValidationErrors([]);
  }, []);

  const handleStartEdit = useCallback((id: string) => {
    const section = sections.find((s) => s.id === id);
    if (!section) return;
    // Create a local copy for editing
    setDraft({
      id: section.id,
      name: section.name,
      columns: [...section.columns],
      extraColumns: [...(section.extraColumns ?? [])],
    });
    setValidationErrors([]);
  }, [sections]);

  const handleRemove = useCallback((id: string) => {
    // If removing a draft that hasn't been committed yet, just discard it.
    if (draft && draft.id === id && !sections.some((s) => s.id === id)) {
      setDraft(null);
      setRemovingId(null);
      setValidationErrors([]);
      return;
    }
    // Otherwise, remove the committed section from parent state.
    onChange(sections.filter((s) => s.id !== id));
    setRemovingId(null);
    setDraft(null);
    setValidationErrors([]);
  }, [draft, sections, onChange]);

  const handleDraftChange = useCallback((updates: Partial<Pick<Draft, "name" | "columns" | "extraColumns">>) => {
    setDraft((prev) => (prev ? { ...prev, ...updates } : prev));
    setValidationErrors([]);
  }, []);

  const handleMove = useCallback((id: string, direction: -1 | 1) => {
    const idx = sections.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sections.length) return;
    const next = [...sections];
    [next[idx], next[targetIdx]] = [next[targetIdx]!, next[idx]!];
    onChange(next);
  }, [sections, onChange]);

  const editingId = draft?.id ?? null;

  if (sections.length === 0 && editingId === null) {
    return (
      <section className="card">
        <h3 className="card-heading">Attribute Comparing Sections</h3>
        <p className="field-hint">No custom sections defined. All target columns are compared together.</p>
        <button type="button" className="btn" onClick={handleAdd} style={{ marginTop: "var(--space)" }}>
          Add section
        </button>
      </section>
    );
  }

  return (
    <section className="card">
      <h3 className="card-heading">Attribute Comparing Sections</h3>
      <p className="card-hint">Define named sections that compare specific column subsets.</p>

      <ul className="comparison-section-list" style={{ listStyle: "none", padding: 0 }}>
        {sections.map((section, index) => {
          const isEditing = editingId === section.id;
          return (
            <li key={section.id} className="card" style={{ marginBottom: "var(--space)", padding: "var(--space)" }}>
              {isEditing && draft ? (
                <div className="comparison-section-edit">
                  <div className="field">
                    <label htmlFor={`cs-name-${section.id}`}>Section name</label>
                    <input
                      id={`cs-name-${section.id}`}
                      value={draft.name}
                      onChange={(e) => handleDraftChange({ name: e.target.value })}
                      placeholder="e.g. Financial columns"
                      autoFocus
                    />
                  </div>
                  <div className="field" style={{ marginTop: "var(--space)" }}>
                    <SearchableMultiSelect
                      label="Columns to compare in this section"
                      options={availableOptions}
                      selected={draft.columns}
                      onChange={(cols) => handleDraftChange({ columns: cols })}
                      placeholder="Search columns…"
                    />
                  </div>
                  <div className="field" style={{ marginTop: "var(--space)" }}>
                    <SearchableMultiSelect
                      label="Extra columns to display"
                      options={availableOptions}
                      selected={draft.extraColumns}
                      onChange={(extraColumns) => handleDraftChange({ extraColumns })}
                      placeholder="Search extra columns…"
                    />
                  </div>
                  {validationErrors.length > 0 && (
                    <div className="alert alert--warn" role="alert" style={{ marginTop: "var(--space)" }}>
                      {validationErrors.map((e, i) => <p key={i} style={{ margin: 0 }}>{e}</p>)}
                    </div>
                  )}
                  <div className="config-inline-row" style={{ marginTop: "var(--space)" }}>
                    <button type="button" className="btn btn--primary" onClick={handleDone}>
                      Done
                    </button>
                    <button type="button" className="btn" onClick={handleCancel}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn--danger" onClick={() => setRemovingId(section.id)}>
                      Remove section
                    </button>
                  </div>
                </div>
              ) : (
                <div className="comparison-section-display">
                  <div className="config-inline-row">
                    <strong>{section.name || "(unnamed section)"}</strong>
                    <span className="field-hint">{section.columns.length} column{section.columns.length !== 1 ? "s" : ""}</span>
                  </div>
                  {section.columns.length > 0 && (
                    <ul className="chip-list" style={{ marginTop: "var(--space-0)" }}>
                      {section.columns.map((col) => (
                        <li key={col}>
                          <span className="tag">{col}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="config-inline-row" style={{ marginTop: "var(--space)" }}>
                    <button type="button" className="btn" onClick={() => handleStartEdit(section.id)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={index === 0}
                      onClick={() => handleMove(section.id, -1)}
                      aria-label={`Move ${section.name} up`}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={index >= sections.length - 1}
                      onClick={() => handleMove(section.id, 1)}
                      aria-label={`Move ${section.name} down`}
                    >
                      ▼
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}

        {/* Render the new-draft row if adding a new section */}
        {draft && !sections.some((s) => s.id === draft.id) && (
          <li key={draft.id} className="card" style={{ marginBottom: "var(--space)", padding: "var(--space)" }}>
            <div className="comparison-section-edit">
              <div className="field">
                <label htmlFor={`cs-name-${draft.id}`}>Section name</label>
                <input
                  id={`cs-name-${draft.id}`}
                  value={draft.name}
                  onChange={(e) => handleDraftChange({ name: e.target.value })}
                  placeholder="e.g. Financial columns"
                  autoFocus
                />
              </div>
              <div className="field" style={{ marginTop: "var(--space)" }}>
                <SearchableMultiSelect
                  label="Columns to compare in this section"
                  options={availableOptions}
                  selected={draft.columns}
                  onChange={(cols) => handleDraftChange({ columns: cols })}
                  placeholder="Search columns…"
                />
              </div>
              <div className="field" style={{ marginTop: "var(--space)" }}>
                <SearchableMultiSelect
                  label="Extra columns to display"
                  options={availableOptions}
                  selected={draft.extraColumns}
                  onChange={(extraColumns) => handleDraftChange({ extraColumns })}
                  placeholder="Search extra columns…"
                />
              </div>
              {validationErrors.length > 0 && (
                <div className="alert alert--warn" role="alert" style={{ marginTop: "var(--space)" }}>
                  {validationErrors.map((e, i) => <p key={i} style={{ margin: 0 }}>{e}</p>)}
                </div>
              )}
              <div className="config-inline-row" style={{ marginTop: "var(--space)" }}>
                <button type="button" className="btn btn--primary" onClick={handleDone}>
                  Done
                </button>
                <button type="button" className="btn" onClick={handleCancel}>
                  Cancel
                </button>
                <button type="button" className="btn btn--danger" onClick={() => setRemovingId(draft.id)}>
                  Remove section
                </button>
              </div>
            </div>
          </li>
        )}
      </ul>

      {editingId === null && (
        <button type="button" className="btn" onClick={handleAdd} style={{ marginTop: "var(--space)" }}>
          Add section
        </button>
      )}

      <ConfirmDialog
        title="Remove section?"
        open={removingId !== null}
        confirmLabel="Remove"
        confirmTone="danger"
        onCancel={() => setRemovingId(null)}
        onConfirm={() => {
          if (removingId) handleRemove(removingId);
        }}
      >
        <p>Remove this comparison section? This cannot be undone.</p>
      </ConfirmDialog>
    </section>
  );
}
