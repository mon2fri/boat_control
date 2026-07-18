import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { DetailRow } from "../../api/domain";

interface StaticProps {
  rows: DetailRow[];
  caption: string;
  /**
   * Total row count to render against. Defaults to `rows.length`. Use the
   * server-supplied total when streaming pages, so the scroll area has the
   * correct height even when only a small window of rows is in memory.
   */
  total?: number;
  /** Triggered when the user scrolls within `loadMoreThreshold` rows of the end. */
  onReachEnd?: () => void;
  /** Whether more pages are available — disables the reach-end trigger when false. */
  hasMore?: boolean;
}

const ROW_HEIGHT = 34;
const LOAD_MORE_THRESHOLD = 50;

/**
 * Virtualized detail table for potentially large result sets (up to ~120k
 * rows). The table renders only the visible window from the supplied rows
 * array. When the parent provides `onReachEnd`, the table triggers it as
 * the user scrolls within `LOAD_MORE_THRESHOLD` rows of the end so the
 * parent can fetch the next page.
 */
export function DetailTable({
  rows,
  caption,
  total,
  onReachEnd,
  hasMore = false,
}: StaticProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is a sanctioned dep; its hook is safe here
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  // Track the last reported end so we don't spam loadMore on every scroll event.
  const lastTriggeredRef = useRef<number>(-1);

  useEffect(() => {
    if (!onReachEnd || !hasMore) return;
    const items = virtualizer.getVirtualItems();
    const last = items[items.length - 1];
    if (!last) return;
    if (rows.length - last.index > LOAD_MORE_THRESHOLD) return;
    if (lastTriggeredRef.current === rows.length) return;
    lastTriggeredRef.current = rows.length;
    onReachEnd();
  }, [rows.length, hasMore, onReachEnd, virtualizer]);

  if (rows.length === 0) {
    return <p role="status">No detail rows.</p>;
  }

  const items = virtualizer.getVirtualItems();
  // The virtualizer sizes against rows.length; if a server total is provided,
  // extend the rendered height with placeholder rows so the scrollbar reflects
  // the full result size.
  const renderedTotal = Math.max(virtualizer.getTotalSize(), (total ?? rows.length) * ROW_HEIGHT);

  return (
    <div
      ref={scrollRef}
      className="detail-scroll"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table className="data detail-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Row</th>
            <th scope="col">Column</th>
            <th scope="col">File 1</th>
            <th scope="col">File 2</th>
            <th scope="col">Kind</th>
          </tr>
        </thead>
        <tbody style={{ height: `${renderedTotal}px` }}>
          {items.map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            return (
              <tr
                key={item.key}
                data-index={item.index}
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <td>{row.rowKey}</td>
                <td>{row.column}</td>
                <td>{row.file1Value ?? "—"}</td>
                <td>{row.file2Value ?? "—"}</td>
                <td>{row.kind}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}