import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  importExceptionCommentary,
  loadExceptionTracking,
  loadExceptionTrackingDates,
  recertifyExceptions,
  type ExceptionTrackingQuery,
} from "../../api/endpoints";
import type { RecertifySelection } from "../../api/domain";
import { isValidIsoDate } from "../../lib/asOfDate";
import {
  EXCEPTION_TRACKING_DATES_KEY,
  EXCEPTION_TRACKING_KEY,
} from "./queryKeys";

function exceptionsKey(asOfDate: string, options: ExceptionTrackingQuery) {
  return [EXCEPTION_TRACKING_KEY[0], asOfDate, options] as const;
}

export function useExceptionTrackingDates() {
  return useQuery({
    queryKey: EXCEPTION_TRACKING_DATES_KEY,
    queryFn: () => loadExceptionTrackingDates(),
    retry: false,
    staleTime: 30_000,
  });
}

export function useTrackedExceptions(
  asOfDate: string,
  options: ExceptionTrackingQuery = {},
) {
  return useQuery({
    queryKey: exceptionsKey(asOfDate, options),
    queryFn: () => loadExceptionTracking(asOfDate, options),
    enabled: isValidIsoDate(asOfDate),
    retry: false,
  });
}

export function useImportCommentary(asOfDate: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importExceptionCommentary(asOfDate, file),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: [EXCEPTION_TRACKING_KEY[0], asOfDate] }),
        client.invalidateQueries({ queryKey: EXCEPTION_TRACKING_DATES_KEY }),
      ]);
    },
  });
}

/**
 * Explicit recertification of selected pending exceptions. Acceptance of
 * unchanged text is supported; uploading an unchanged XLSX template never
 * recertifies. Each row echoes its frozen `revision_token` concurrency guard.
 * The server validates atomically, is retry-safe, and reports repeats via
 * `already_accepted`.
 */
export function useRecertify(asOfDate: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (selections: RecertifySelection[]) => recertifyExceptions(asOfDate, selections),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: [EXCEPTION_TRACKING_KEY[0], asOfDate] }),
        client.invalidateQueries({ queryKey: EXCEPTION_TRACKING_DATES_KEY }),
      ]);
    },
  });
}
