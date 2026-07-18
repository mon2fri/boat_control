import { useMemo, useState } from "react";
import type { HeaderReport } from "../../api/domain";

interface Props {
  report: HeaderReport;
}

/**
 * Presents the outcome of header inspection: which columns are shared (and
 * therefore eligible for comparison/validation) and which exist in only one
 * file. All names come from user files, so they are rendered as React text —
 * never as HTML — and long lists are filterable rather than truncated.
 */
export function HeaderReview({ report }: Props) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (name: string) => !q || name.toLowerCase().includes(q);
    return {
      common: report.common.filter(match),
      file1Only: report.file1Only.filter(match),
      file2Only: report.file2Only.filter(match),
    };
  }, [report, query]);

  const hasDifferences = report.file1Only.length > 0 || report.file2Only.length > 0;

  return (
    <section aria-labelledby="header-review-title">
      <h3 id="header-review-title">Header review</h3>
      <p role="status">
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

      <div className="field">
        <label htmlFor="header-filter">Filter columns</label>
        <input
          id="header-filter"
          type="search"
          value={query}
          placeholder="Type to filter long header lists…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="header-columns">
        <HeaderColumnList
          title={`Shared (${groups.common.length})`}
          tone="ok"
          names={groups.common}
        />
        <HeaderColumnList
          title={`Only in ${report.file1Name} (${groups.file1Only.length})`}
          tone="star"
          names={groups.file1Only}
        />
        <HeaderColumnList
          title={`Only in ${report.file2Name} (${groups.file2Only.length})`}
          tone="star"
          names={groups.file2Only}
        />
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
      <h4>{title}</h4>
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
