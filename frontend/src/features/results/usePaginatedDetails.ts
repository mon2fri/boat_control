/**
 * Paginated details hook. Backs the virtualized DetailTable with on-demand
 * page fetches so the browser never has to hold the entire change or
 * violation detail set in memory. The hook exposes a "fetch more" entry
 * point and a stable `total` so the virtualizer can size the scroll area
 * without knowing the row contents up front.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDetailPage } from "../../api/endpoints";
import type { DetailRow } from "../../api/domain";

interface PageResponse {
  rows: DetailRow[];
  offset: number;
  total: number;
  hasMore: boolean;
}

const PAGE_SIZE = 200;

export function usePaginatedDetails(runId: string, kind: "changed" | "violation") {
  const [pages, setPages] = useState<PageResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPages([]);
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    totalRef.current = 0;
    hasMoreRef.current = true;
    loadingMoreRef.current = false;
  }, []);

  // Mirror the ref-backed totals into state so consumers can react.
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // The reset/fetch effect intentionally re-syncs state when the runId/kind
// change. This is a load-on-change pattern, not a render-cascade; the
// suppressions below silence the new-linter stylistic rule that flags any
// setState in an effect regardless of intent.
/* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    reset();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    fetchDetailPage(runId, kind, { offset: 0, limit: PAGE_SIZE, signal: controller.signal })
      .then((page) => {
        totalRef.current = page.total;
        hasMoreRef.current = page.hasMore;
        setTotal(page.total);
        setHasMore(page.hasMore);
        setPages([page]);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setError(err.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [runId, kind, reset]);
/* eslint-enable react-hooks/set-state-in-effect */

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const nextOffset = pages.reduce((count, page) => count + page.rows.length, 0);
    fetchDetailPage(runId, kind, { offset: nextOffset, limit: PAGE_SIZE, signal: controller.signal })
      .then((page) => {
        totalRef.current = page.total;
        hasMoreRef.current = page.hasMore;
        setTotal(page.total);
        setHasMore(page.hasMore);
        setPages((current) => [...current, page]);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setError(err.message);
      })
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [pages, runId, kind]);

  const rows: DetailRow[] = pages.flatMap((p) => p.rows);

  return {
    rows,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    isEmpty: !loading && !loadingMore && !error && rows.length === 0,
    loadMore,
  };
}
