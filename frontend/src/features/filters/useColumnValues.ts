/**
 * On-demand column-values loader.
 *
 * The filter row editor calls this hook with the active column and search
 * term; the hook fetches a single page of distinct values, accumulates
 * results across pages when the user keeps scrolling, and exposes loading,
 * error, and empty states so the UI never has to guess.
 *
 * The hook also degrades gracefully when the backend has not shipped the
 * paginated endpoint (404): it falls back to the snapshot of values that
 * the prepare response already loaded.
 */
import { useEffect, useReducer, useRef } from "react";
import { fetchColumnValuesPage, type ColumnValuesPage } from "../../api/endpoints";
import type { ColumnValue } from "../../api/domain";

interface State {
  values: ColumnValue[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  offset: number;
  hasMore: boolean;
  total: number;
  /** True when the backend does not yet expose the paginated endpoint. */
  usingFallback: boolean;
}

type Action =
  | { type: "load-start"; append: boolean }
  | { type: "load-success"; page: ColumnValuesPage; append: boolean }
  | { type: "load-error"; message: string; append: boolean }
  | { type: "load-fallback" }
  | { type: "reset"; column: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return {
        values: [],
        loading: true,
        loadingMore: false,
        error: null,
        offset: 0,
        hasMore: true,
        total: 0,
        usingFallback: false,
      };
    case "load-start":
      return {
        ...state,
        loading: !action.append,
        loadingMore: action.append,
        error: null,
      };
    case "load-success":
      if (action.append) {
        const merged = [...state.values, ...action.page.values];
        return {
          ...state,
          loading: false,
          loadingMore: false,
          values: merged,
          offset: action.page.offset,
          hasMore: action.page.hasMore,
          total: action.page.total,
        };
      }
      return {
        ...state,
        loading: false,
        loadingMore: false,
        values: action.page.values,
        offset: action.page.offset,
        hasMore: action.page.hasMore,
        total: action.page.total,
      };
    case "load-error":
      return {
        ...state,
        loading: false,
        loadingMore: false,
        error: action.message,
      };
    case "load-fallback":
      return { ...state, usingFallback: true, loading: false };
  }
}

interface Options {
  fallbackValues?: ColumnValue[];
}

export function useColumnValues(
  sessionId: string | null,
  column: string | null,
  search: string,
  options: Options = {},
) {
  const [state, dispatch] = useReducer(reducer, {
    values: [],
    loading: true,
    loadingMore: false,
    error: null,
    offset: 0,
    hasMore: true,
    total: 0,
    usingFallback: false,
  });

  // Keep the latest search in a ref so the loadMore callback stays stable
  // and can read the current term without re-creating on every keystroke.
  // We update it inside a layout-style effect so we never write to a ref
  // during render.
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  // Reset whenever the active column changes.
  useEffect(() => {
    if (!sessionId || !column) return;
    dispatch({ type: "reset", column });
  }, [sessionId, column]);

  // Fetch the first page when column is set. Skipped while using fallback.
  useEffect(() => {
    if (!sessionId || !column) return;
    if (state.usingFallback) return;
    if (state.offset !== 0) return;
    const controller = new AbortController();
    dispatch({ type: "load-start", append: false });
    fetchColumnValuesPage(sessionId, column, {
      search: search,
      offset: 0,
      limit: 100,
      signal: controller.signal,
    })
      .then((page) => dispatch({ type: "load-success", page, append: false }))
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        if (/not\s*found|404/i.test(err.message)) {
          dispatch({ type: "load-fallback" });
          return;
        }
        dispatch({ type: "load-error", message: err.message, append: false });
      });
    return () => controller.abort();
    // The hook depends on the column and the immediate search term, but we
    // intentionally exclude page-level progress so we don't re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, column, state.usingFallback]);

  function loadMore(): void {
    if (!sessionId || !column) return;
    if (state.loadingMore || !state.hasMore || state.usingFallback) return;
    const controller = new AbortController();
    dispatch({ type: "load-start", append: true });
    fetchColumnValuesPage(sessionId, column, {
      search: searchRef.current,
      offset: state.offset + state.values.length,
      limit: 100,
      signal: controller.signal,
    })
      .then((page) => dispatch({ type: "load-success", page, append: true }))
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        dispatch({ type: "load-error", message: err.message, append: true });
      });
  }

  return {
    values: state.usingFallback ? options.fallbackValues ?? state.values : state.values,
    loading: state.loading,
    loadingMore: state.loadingMore,
    error: state.error,
    hasMore: state.hasMore && !state.usingFallback,
    total: state.total,
    isEmpty:
      !state.loading &&
      !state.loadingMore &&
      !state.error &&
      (state.usingFallback
        ? (options.fallbackValues?.length ?? 0) === 0
        : state.values.length === 0),
    usingFallback: state.usingFallback,
    loadMore,
  };
}
