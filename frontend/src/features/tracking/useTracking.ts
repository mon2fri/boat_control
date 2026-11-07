import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  importExceptionCommentary,
  loadExceptionTracking,
  loadExceptionTrackingDates,
  type ExceptionTrackingQuery,
} from "../../api/endpoints";
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
