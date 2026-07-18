import { Link } from "react-router-dom";

/** Shown when a page requires an uploaded session that is not present yet. */
export function RequireSession({ children }: { children: React.ReactNode }) {
  return (
    <section className="card" role="status">
      <h2>No files loaded yet</h2>
      <p>{children}</p>
      <Link to="/">Go to upload</Link>
    </section>
  );
}
