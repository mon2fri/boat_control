import { Link } from "react-router-dom";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteRun, loadRunHistory } from "../api/endpoints";
import { formatDateTime } from "../utils/format";

/**
 * History of the most recent runs (the backend retains up to ten). Each row
 * is a deep link to `/results/<run_id>` so the URL is shareable and the
 * page survives a refresh — the ResultsPage fetches the persisted run
 * document from the backend when the in-memory state is empty.
 */
export function HistoryPage() {
  const queryClient = useQueryClient();
  const [confirmingRunId, setConfirmingRunId] = useState<string | null>(null);
  const history = useQuery({
    queryKey: ["run-history"],
    queryFn: () => loadRunHistory(),
  });
  const removeRun = useMutation({
    mutationFn: (runId: string) => deleteRun(runId),
    onSuccess: async () => {
      setConfirmingRunId(null);
      await queryClient.invalidateQueries({ queryKey: ["run-history"] });
    },
  });

  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title">Run history</h2>
      <p>The last ten runs are kept. Open any run to review or export it.</p>

      {history.isLoading && <p role="status">Loading history…</p>}
      {history.isError && (
        <p className="alert alert--error" role="alert">
          Could not load history: {history.error.message}
        </p>
      )}
      {removeRun.isError && (
        <p className="alert alert--error" role="alert">
          Could not delete the run: {removeRun.error.message}
        </p>
      )}

      {history.data && history.data.length === 0 && (
        <p role="status">No runs saved yet. Complete a run to populate history.</p>
      )}

      {history.data && history.data.length > 0 && (
        <table className="data">
          <caption className="visually-hidden">Saved runs, most recent first</caption>
          <thead>
            <tr>
              <th scope="col">Report</th>
              <th scope="col">Files</th>
              <th scope="col">Created</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {history.data.map((run) => (
              <tr key={run.id}>
                <td>{run.reportName}</td>
                <td>
                  {run.file1Name} vs {run.file2Name}
                </td>
                <td>{formatDateTime(run.createdAt)}</td>
                <td>
                  <div className="history-actions">
                    <Link
                      to={`/results/${encodeURIComponent(run.id)}`}
                      className="btn"
                    >
                      Open
                    </Link>
                    {confirmingRunId === run.id ? (
                      <>
                        <button
                          type="button"
                          className="btn"
                          disabled={removeRun.isPending}
                          onClick={() => setConfirmingRunId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger"
                          disabled={removeRun.isPending}
                          onClick={() => removeRun.mutate(run.id)}
                        >
                          {removeRun.isPending ? "Deleting…" : "Confirm"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--danger"
                        onClick={() => setConfirmingRunId(run.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
