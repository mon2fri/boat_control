import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { loadRun, loadRunHistory } from "../api/endpoints";
import { useWorkflow } from "../state/WorkflowContext";

/**
 * History of the most recent runs (the backend retains up to ten). Selecting a
 * run loads its saved JSON result and shows it on the results page.
 */
export function HistoryPage() {
  const navigate = useNavigate();
  const { dispatch } = useWorkflow();
  const history = useQuery({
    queryKey: ["run-history"],
    queryFn: () => loadRunHistory(),
  });

  const load = useMutation({
    mutationFn: (id: string) => loadRun(id),
    onSuccess: (result) => {
      dispatch({ type: "setResult", result });
      void navigate("/results");
    },
  });

  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title">Run history</h2>
      <p>The last ten runs are kept. Load any run to review or export it.</p>

      {history.isLoading && <p role="status">Loading history…</p>}
      {history.isError && (
        <p className="alert alert--error" role="alert">
          Could not load history: {history.error.message}
        </p>
      )}
      {load.isError && (
        <p className="alert alert--error" role="alert">
          Could not load that run: {load.error.message}
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
                <td>{run.createdAt}</td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => load.mutate(run.id)}
                    disabled={load.isPending}
                  >
                    Load
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
