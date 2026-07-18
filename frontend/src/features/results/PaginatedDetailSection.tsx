/**
 * Bridge between `usePaginatedDetails` and the virtualized `DetailTable`.
 *
 * The section owns the page lifecycle (reset on runId/kind change, fetch
 * first page, surface loading/error) and the trigger to fetch more pages as
 * the user scrolls. The DetailTable handles windowing; this component
 * decides when to ask the backend for more rows.
 */
import { DetailTable } from "./DetailTable";
import { usePaginatedDetails } from "./usePaginatedDetails";

interface Props {
  runId: string;
  kind: "changed" | "violation";
  caption: string;
}

export function PaginatedDetailSection({ runId, kind, caption }: Props) {
  const { rows, total, hasMore, loading, loadingMore, error, isEmpty, loadMore } = usePaginatedDetails(runId, kind);

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
  if (isEmpty) {
    return <p role="status">No detail rows.</p>;
  }

  return (
    <>
      <DetailTable
        rows={rows}
        total={total}
        hasMore={hasMore}
        onReachEnd={loadMore}
        caption={caption}
      />
      {loadingMore && (
        <p role="status" aria-live="polite" className="busy-row">
          <span className="spinner" aria-hidden="true" /> Loading more…
        </p>
      )}
    </>
  );
}