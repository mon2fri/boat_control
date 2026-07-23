interface Props {
  columns: string[];
}

export function ComparisonColumnList({ columns }: Props) {
  return (
    <div className="comparison-columns">
      <p className="field-hint comparison-columns__label">Comparing columns</p>
      {columns.length > 0 ? (
        <ul className="chip-list" aria-label="Comparing columns">
          {columns.map((column) => (
            <li key={column}>
              <span className="tag">{column}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">No comparing columns.</p>
      )}
    </div>
  );
}
