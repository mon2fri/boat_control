/**
 * Bridge between `usePaginatedDetails` and the virtualized `DetailTable`.
 *
 * The section owns the page lifecycle (reset on runId/kind change, fetch
 * first page, surface loading/error) and the trigger to fetch more pages as
 * the user scrolls. The DetailTable handles windowing; this component
 * decides when to ask the backend for more rows.
 */
import { useState } from "react";
import { DetailTable } from "./DetailTable";
import { DetailFilterBar } from "./DetailFilterBar";
import { usePaginatedDetails } from "./usePaginatedDetails";

interface Props {
  runId: string;
  kind: "changed" | "violation";
  caption: string;
  keyColumnNames?: string[];
}

export function PaginatedDetailSection({ runId, kind, caption, keyColumnNames }: Props) {
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const {
    rows, total, hasMore, loading, loadingMore, error, isEmpty, loadMore,
    availableFilters,
  } = usePaginatedDetails(runId, kind, filters);

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
      {keyColumnNames && keyColumnNames.length > 0 && (
        <DetailFilterBar
          keyColumnNames={keyColumnNames}
          availableFilters={availableFilters}
          activeFilters={filters}
          onChange={setFilters}
        />
      )}
      <DetailTable
        rows={rows}
        total={total}
        hasMore={hasMore}
        onReachEnd={loadMore}
        caption={caption}
        {...(keyColumnNames ? { keyColumnNames } : {})}
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
