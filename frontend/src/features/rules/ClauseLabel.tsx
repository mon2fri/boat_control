/** Shared numbered badges: blue clauses and green groups. */
export function ClauseLabel({ label }: { label: string }) {
  const match = /^(Filter|Condition|Expectation|Group) (\d+)(?::\s*(.*))?$/i.exec(label);
  if (!match) return <>{label}</>;
  return (
    <span className="group-clause-label">
      <span className={`condition-number${match[1]!.toLowerCase() === "group" ? " group-number" : ""}`}>
        {match[1]} {match[2]}
      </span>
      {match[3] && <span>{match[3]}</span>}
    </span>
  );
}
