import { useRules } from "../rules/useRules";

/** Show the exact rule IDs submitted by Run now, independent of catalog pagination. */
export function EnabledRunRules({ ruleIndexes }: { ruleIndexes: string[] }) {
  const catalog = useRules();
  const byIndex = new Map(catalog.data.map((rule) => [rule.index, rule]));
  return (
    <section aria-labelledby="enabled-run-rules-title" className="enabled-run-rules">
      <h4 id="enabled-run-rules-title">Enabled rules ({ruleIndexes.length})</h4>
      {ruleIndexes.length === 0 ? (
        <p className="field-hint">No rules enabled. This run will compare files without rule validation.</p>
      ) : (
        <ul aria-label="Enabled rules for this run">
          {ruleIndexes.map((index) => (
            <li key={index}>
              <strong>{index}</strong> — {byIndex.get(index)?.name
                ?? (catalog.isPending ? "Loading rule name…" : "Rule name unavailable")}
            </li>
          ))}
        </ul>
      )}
      {ruleIndexes.length > 0 && catalog.isError && (
        <p role="alert" className="field-hint">Could not load rule names. The rule indices above still identify the rules selected for this run.</p>
      )}
    </section>
  );
}
