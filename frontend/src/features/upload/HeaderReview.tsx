import { useCallback, useMemo } from "react";
import type { HeaderReport } from "../../api/domain";
import { SearchableMultiSelect } from "../../components/SearchableMultiSelect";
import { KeyColumnSelector } from "../keys/KeyColumnSelector";

interface Props {
  report: HeaderReport;
  selectedColumns: string[];
  onSelectedColumnsChange: (columns: string[]) => void;
  keyColumns?: string[];
  onKeyColumnsChange?: (columns: string[]) => void;
  groupingColumns?: string[];
  onGroupingColumnsChange?: (columns: string[]) => void;
}

/**
 * Presents the outcome of header inspection: which columns are shared (and
 * therefore eligible for comparison/validation) and which exist in only one
 * file. Users can select which shared columns to include for comparison.
 */
export function HeaderReview({ report, selectedColumns, onSelectedColumnsChange, keyColumns = [], onKeyColumnsChange = () => {}, groupingColumns = [], onGroupingColumnsChange = () => {} }: Props) {
  const hasDifferences = report.file1Only.length > 0 || report.file2Only.length > 0;
  const deduplicatedFiles: string[] = [];
  if (report.file1Deduplicated) deduplicatedFiles.push(report.file1Name);
  if (report.file2Deduplicated) deduplicatedFiles.push(report.file2Name);
  const deduplicatedMessage = deduplicatedFiles.length
    ? `Matched existing file${deduplicatedFiles.length === 1 ? "" : "s"} on disk: ${deduplicatedFiles.join(", ")}. No new copy was stored.`
    : null;

  const sharedOptions = useMemo(
    () => report.common.map((c) => ({ value: c, label: c })),
    [report.common],
  );

  // The Grouping Columns dropdown must only offer columns the user picked in
  // the COLUMN FILTER (selectedColumns) — otherwise it would surface columns
  // that comparison and validation will ignore.
  const groupingOptions = useMemo(
    () => sharedOptions.filter((o) => selectedColumns.includes(o.value)),
    [sharedOptions, selectedColumns],
  );

  const includedSet = useMemo(() => new Set(selectedColumns), [selectedColumns]);
  const excludedColumns = useMemo(
    () => report.common.filter((c) => !includedSet.has(c)),
    [report.common, includedSet],
  );

  const handleFilterChange = useCallback(
    (columns: string[]) => onSelectedColumnsChange(columns),
    [onSelectedColumnsChange],
  );

  return (
    <section aria-labelledby="header-review-title">
      <h3 id="header-review-title" className="section-heading">Column preview</h3>
      <p className="section-hint" role="status">
        {report.common.length} shared column{report.common.length === 1 ? "" : "s"}.{" "}
        Comparison and validation run on shared columns only.
      </p>
      {hasDifferences && (
        <p className="alert alert--warn" role="alert">
          The files have differing columns: {report.file1Only.length} only in{" "}
          <strong>{report.file1Name}</strong>, {report.file2Only.length} only in{" "}
          <strong>{report.file2Name}</strong>. These are excluded from the run.
        </p>
      )}

      {deduplicatedMessage && (
        <p className="alert alert--info" role="status">
          {deduplicatedMessage}
        </p>
      )}

      <div className="header-columns">
        <HeaderColumnList
          title={`Shared (${report.common.length})`}
          tone="ok"
          names={report.common}
        />
        <HeaderColumnList
          title={`Only in ${report.file1Name} (${report.file1Only.length})`}
          tone="star"
          names={report.file1Only}
        />
        <HeaderColumnList
          title={`Only in ${report.file2Name} (${report.file2Only.length})`}
          tone="star"
          names={report.file2Only}
        />
      </div>

      <div className="card" style={{ marginTop: "var(--space)" }}>
        <h3 className="card-heading">Column filter</h3>
        <SearchableMultiSelect
          label="Select columns to include"
          options={sharedOptions}
          selected={selectedColumns}
          onChange={handleFilterChange}
          placeholder="Search shared columns…"
          hint="Pick columns for comparison and validation. Starts with all selected."
        />
      </div>

      <div className="header-columns" style={{ marginTop: "var(--space)" }}>
        <div className="card header-column-group">
          <h4 className="card-heading">Columns Included ({selectedColumns.length})</h4>
          {selectedColumns.length === 0 ? (
            <p className="field-hint">No columns selected</p>
          ) : (
            <ul aria-label="Columns Included" className="header-column-list">
              {selectedColumns.map((name) => (
                <li key={name}>
                  <span className="tag tag--included">{name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card header-column-group">
          <h4 className="card-heading">Columns Excluded ({excludedColumns.length})</h4>
          {excludedColumns.length === 0 ? (
            <p className="field-hint">All columns included</p>
          ) : (
            <ul aria-label="Columns Excluded" className="header-column-list">
              {excludedColumns.map((name) => (
                <li key={name}>
                  <span className="tag tag--excluded">{name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card-grid-2" style={{ marginTop: "var(--space)" }}>
        <KeyColumnSelector
          columns={selectedColumns}
          selected={keyColumns.filter((column) => selectedColumns.includes(column))}
          onChange={onKeyColumnsChange}
        />

        <section className="card">
          <h3 className="card-heading">Grouping Columns</h3>
          <p className="card-hint">
            Optional. Pick columns for group-level statistics.
          </p>
          <SearchableMultiSelect
            label="Select grouping columns"
            options={groupingOptions}
            selected={groupingColumns.filter((c) => selectedColumns.includes(c))}
            onChange={(cols) => onGroupingColumnsChange(cols.filter((c) => selectedColumns.includes(c)))}
            placeholder="Search columns…"
          />
          {groupingColumns.filter((c) => selectedColumns.includes(c)).length === 0 ? (
            <p className="field-hint" role="status">
              No grouping columns selected.
            </p>
          ) : (
            <ul aria-label="Selected grouping columns" className="chip-list">
              {groupingColumns.filter((c) => selectedColumns.includes(c)).map((column) => (
                <li key={column}>
                  <span className="tag">{column}</span>
                  <button
                    type="button"
                    className="btn chip-remove"
                    onClick={() => onGroupingColumnsChange(groupingColumns.filter((item) => item !== column))}
                    aria-label={`Remove grouping column ${column}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}

function HeaderColumnList({
  title,
  names,
  tone,
}: {
  title: string;
  names: string[];
  tone: "ok" | "star";
}) {
  return (
    <div className="card header-column-group">
      <h4 className="card-heading">{title}</h4>
      {names.length === 0 ? (
        <p className="field-hint">None</p>
      ) : (
        <ul aria-label={title} className="header-column-list">
          {names.map((name) => (
            <li key={name}>
              <span className={tone === "star" ? "tag tag--star" : "tag"}>{name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
