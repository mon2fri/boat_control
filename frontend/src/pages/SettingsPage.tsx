/**
 * Read-only view of the application configuration. The backend does not
 * expose a settings endpoint in this release; the UI shows the configured
 * paths that the server reads at boot. Editing is a server-side operation.
 */
export function SettingsPage() {
  return (
    <section aria-labelledby="settings-title">
      <h2 id="settings-title">Settings</h2>
      <p className="field-hint">
        Configuration is read at server startup from the files below. Edits require a server
        restart.
      </p>
      <dl className="card">
        <dt>Rules file</dt>
        <dd><code>config/rules/rules.yaml</code></dd>
        <dt>Saved filters directory</dt>
        <dd><code>config/filters/</code></dd>
        <dt>Uploaded files directory</dt>
        <dd><code>data/uploads/</code></dd>
        <dt>Run results directory</dt>
        <dd><code>data/results/</code></dd>
        <dt>Full-set confirmation threshold</dt>
        <dd>2,000 rows (server-owned)</dd>
      </dl>
    </section>
  );
}
