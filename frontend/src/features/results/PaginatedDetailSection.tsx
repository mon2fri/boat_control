import { useMemo, useState, useCallback } from "react";
import { DetailTable, filterDetailRows } from "./DetailTable";
import type { DetailRow } from "../../api/domain";
import { usePaginatedDetails } from "./usePaginatedDetails";

interface Props {
  runId: string;
  kind: "changed" | "violation";
  caption: string;
  keyColumnNames?: string[];
  exportRows?: DetailRow[];
  /**
   * When set, the paginated detail fetch is filtered to these columns so each
   * named section's table only shows its own rows. When omitted, every
   * change/violation row for the run is fetched.
   */
  sectionColumns?: string[];
  /** Extra comparison-file columns configured for this named section. */
  extraColumnNames?: string[];
}

export function PaginatedDetailSection({
  runId, kind, caption, keyColumnNames, exportRows, sectionColumns, extraColumnNames: configuredExtras,
}: Props) {
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const {
    rows, total, hasMore, loading, loadingMore, error, isEmpty, loadMore,
    availableFilters,
  } = usePaginatedDetails(runId, kind, filters, sectionColumns);

  const handleFilterChange = useCallback((key: string, values: string[]) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (values.length === 0) {
        delete next[key];
      } else {
        next[key] = values;
      }
      return next;
    });
  }, []);

  const columnFilters = useMemo(() => {
    const filters: { key: string; label: string; options: string[] }[] = [];
    for (const kc of keyColumnNames ?? []) {
      const options = availableFilters[`key_${kc}`] ?? [];
      filters.push({ key: `key_${kc}`, label: kc, options });
    }
    for (const [key, options] of Object.entries(availableFilters)) {
      if (!key.startsWith("extra_")) continue;
      if (configuredExtras && !configuredExtras.includes(key.slice(6))) continue;
      filters.push({ key, label: key.slice(6), options });
    }
    if (availableFilters["column"]) {
      filters.push({ key: "column", label: "COLUMN", options: availableFilters["column"] });
    }
    return filters;
  }, [keyColumnNames, availableFilters, configuredExtras]);

  const extraColumnNames = useMemo(
    () => configuredExtras ?? Object.keys(availableFilters)
      .filter((key) => key.startsWith("extra_"))
      .map((key) => key.slice(6)),
    [availableFilters, configuredExtras],
  );

  // When sectionColumns is supplied, also restrict the column-filter chips to
  // that section. After the section filter is applied, every remaining row's
  // column is one of these, so unrelated columns would never be selectable.
  const filteredExportRows = useMemo(() => {
    if (!exportRows) return rows;
    const sliced = filterDetailRows(exportRows, filters);
    if (!sectionColumns || sectionColumns.length === 0) return sliced;
    const set = new Set(sectionColumns);
    return sliced.filter((row) => set.has(row.column));
  }, [exportRows, filters, rows, sectionColumns]);

  if (loading && rows.length === 0) {
    return (
      <p role="status" aria-live="polite" className="busy-row">
        <span className="spinner" aria-hidden="true" /> Loading {caption.toLowerCase()}…
      </p>
    );
  }
  if (error) {
    return (
      <p className="alert alert--error" role="alert">
        Could not load {caption.toLowerCase()}: {error}
      </p>
    );
  }
  if (isEmpty && Object.keys(filters).length === 0) {
    return <p role="status">No detail rows.</p>;
  }

  return (
    <>
      <DetailTable
        rows={rows}
        exportRows={filteredExportRows}
        total={total}
        hasMore={hasMore}
        onReachEnd={loadMore}
        caption={caption}
        {...(keyColumnNames ? { keyColumnNames } : {})}
        extraColumnNames={extraColumnNames}
        columnFilters={columnFilters}
        activeFilters={filters}
        onFilterChange={handleFilterChange}
      />
      {isEmpty && (
        <p role="status">No detail rows match the current filters.</p>
      )}
      {loadingMore && (
        <p role="status" aria-live="polite" className="busy-row">
          <span className="spinner" aria-hidden="true" /> Loading more…
        </p>
      )}
    </>
  );
}
