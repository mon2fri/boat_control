import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { HeaderReport } from "../../api/domain";
import { SearchableMultiSelect } from "../../components/SearchableMultiSelect";
import { KeyColumnSelector } from "../keys/KeyColumnSelector";
import { FamilyEditor } from "../families/FamilyEditor";
import { useFamilies } from "../settings/useSettings";
import { withColumnFamilies } from "../families/familyOptions";

interface Props {
  report: HeaderReport;
  selectedColumns: string[];
  onSelectedColumnsChange: (columns: string[]) => void;
  keyColumns?: string[];
  onKeyColumnsChange?: (columns: string[]) => void;
  aggregationColumns?: string[];
  onAggregationColumnsChange?: (columns: string[]) => void;
  /** Rendered on the same row as the "Column preview" heading. */
  configManager?: ReactNode;
}

export function HeaderReview({ report, selectedColumns, onSelectedColumnsChange, keyColumns = [], onKeyColumnsChange = () => {}, aggregationColumns = [], onAggregationColumnsChange = () => {}, configManager }: Props) {
  const { data: families } = useFamilies();
  const [familyEditorOpen, setFamilyEditorOpen] = useState(false);

  const hasDifferences = report.file1Only.length > 0 || report.file2Only.length > 0;
  const deduplicatedFiles: string[] = [];
  if (report.file1Deduplicated) deduplicatedFiles.push(report.file1Name);
  if (report.file2Deduplicated) deduplicatedFiles.push(report.file2Name);
  const deduplicatedMessage = deduplicatedFiles.length
    ? `Matched existing file${deduplicatedFiles.length === 1 ? "" : "s"} on disk: ${deduplicatedFiles.join(", ")}. No new copy was stored.`
    : null;

  const sharedOptions = useMemo(
    () => withColumnFamilies(report.common, families ?? []),
    [report.common, families],
  );

  const aggregationOptions = useMemo(
    () => withColumnFamilies(selectedColumns, families ?? []),
    [selectedColumns, families],
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
      <div className="config-layout">
        <div>
          <h3 id="header-review-title" className="section-heading" style={{ margin: 0 }}>Column preview</h3>
          <p className="section-hint" role="status" style={{ marginTop: "var(--space)" }}>
            {report.common.length} shared column{report.common.length === 1 ? "" : "s"}.{" "}
            Comparison and validation run on shared columns only.
          </p>
        </div>
        {configManager && <div>{configManager}</div>}
      </div>
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
        <div className="card-grid-2">
          <SearchableMultiSelect
            label="Select columns to include"
            options={sharedOptions}
            selected={selectedColumns}
            onChange={handleFilterChange}
            placeholder="Search shared columns…"
            hint="Pick columns for comparison and validation. Starts with all selected."
          />

        </div>

        <button
          type="button"
          className="btn"
          style={{ marginTop: "var(--space)" }}
          onClick={() => setFamilyEditorOpen(true)}
        >
          Add column family
        </button>

      </div>

      {familyEditorOpen && (
        <div style={{ marginTop: "var(--space)" }}>
          <FamilyEditor
            kind="column"
            onClose={() => setFamilyEditorOpen(false)}
            onSaved={() => setFamilyEditorOpen(false)}
          />
        </div>
      )}

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
          families={families ?? []}
          selected={keyColumns.filter((column) => selectedColumns.includes(column))}
          onChange={onKeyColumnsChange}
        />

        <section className="card">
          <h3 className="card-heading">Aggregation Columns</h3>
          <p className="card-hint">
            Optional. Pick columns for group-level statistics.
          </p>
          <SearchableMultiSelect
            label="Select aggregation columns"
            options={aggregationOptions}
            selected={aggregationColumns.filter((c) => selectedColumns.includes(c))}
            onChange={(cols) => onAggregationColumnsChange(cols.filter((c) => selectedColumns.includes(c)))}
            placeholder="Search columns…"
          />
          {aggregationColumns.filter((c) => selectedColumns.includes(c)).length === 0 ? (
            <p className="field-hint" role="status">
              No aggregation columns selected.
            </p>
          ) : (
            <ul aria-label="Selected aggregation columns" className="chip-list">
              {aggregationColumns.filter((c) => selectedColumns.includes(c)).map((column) => (
                <li key={column}>
                  <span className="tag">{column}</span>
                  <button
                    type="button"
                    className="btn chip-remove"
                    onClick={() => onAggregationColumnsChange(aggregationColumns.filter((item) => item !== column))}
                    aria-label={`Remove aggregation column ${column}`}
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
