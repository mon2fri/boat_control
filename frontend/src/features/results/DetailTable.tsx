import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { DetailRow } from "../../api/domain";

interface Props {
  rows: DetailRow[];
  caption: string;
}

const ROW_HEIGHT = 34;

/**
 * Virtualized detail table for potentially large result sets (up to ~120k
 * rows). Only the visible window is rendered. All cell values originate from
 * user files and are rendered as React text.
 */
export function DetailTable({ rows, caption }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is a sanctioned dep; its hook is safe here
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (rows.length === 0) {
    return <p role="status">No detail rows.</p>;
  }

  const items = virtualizer.getVirtualItems();

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
        <tbody style={{ height: `${virtualizer.getTotalSize()}px` }}>
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
