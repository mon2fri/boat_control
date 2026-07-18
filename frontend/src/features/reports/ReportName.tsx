import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { loadRun, renameRun } from "../../api/endpoints";
import type { RunResult } from "../../api/domain";
import { validateReportName } from "../../lib/reportName";

interface Props {
  runId: string;
  name: string;
  onRenamed: (result: RunResult) => void;
}

/**
 * Displays the report name with a pencil affordance. Double-clicking the name
 * (or activating Edit) opens an inline editor. The name is validated client
 * side before the rename request; the server persists and re-sanitizes it.
 *
 * After a successful rename the full run document is reloaded so the UI's
 * `result` stays consistent with the persisted JSON.
 */
export function ReportName({ runId, name, onRenamed }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [syncedName, setSyncedName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const client = useQueryClient();

  // Reset the draft when the persisted name changes (React's render-time
  // state-adjustment pattern — no effect needed).
  if (name !== syncedName) {
    setSyncedName(name);
    setDraft(name);
  }

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const rename = useMutation({
    mutationFn: async (reportName: string) => {
      await renameRun(runId, reportName);
      return loadRun(runId);
    },
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["run-history"] });
      onRenamed(result);
      setEditing(false);
    },
  });

  const validation = validateReportName(draft);

  function commit(): void {
    if (!validation.valid) return;
    void rename.mutateAsync(draft.trim());
  }

  if (!editing) {
    return (
      <div className="report-name">
        <button
          type="button"
          className="report-name__trigger"
          onDoubleClick={() => setEditing(true)}
          onClick={() => setEditing(true)}
          title="Double-click or press Enter to rename"
          aria-label={`Rename report ${name}`}
        >
          {name}
        </button>
        <button
          type="button"
          className="btn pencil"
          aria-label="Edit report name"
          onClick={() => setEditing(true)}
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <div className="report-name-edit">
      <label htmlFor="report-name-input" className="visually-hidden">
        Report name
      </label>
      <input
        id="report-name-input"
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }}
        aria-invalid={!validation.valid}
        aria-describedby="report-name-error"
      />
      <button type="button" className="btn btn--primary" onClick={commit} disabled={!validation.valid || rename.isPending}>
        Save
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          setDraft(name);
          setEditing(false);
        }}
      >
        Cancel
      </button>
      {!validation.valid && (
        <span id="report-name-error" className="alert alert--error" role="alert">
          {validation.error}
        </span>
      )}
      {rename.isError && (
        <span className="alert alert--error" role="alert">
          Rename failed: {rename.error.message}
        </span>
      )}
    </div>
  );
}
