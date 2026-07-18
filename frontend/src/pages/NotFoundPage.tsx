import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="card" aria-labelledby="nf-title">
      <h2 id="nf-title">Page not found</h2>
      <p>The page you requested does not exist.</p>
      <Link to="/">Return to upload</Link>
    </section>
  );
}
