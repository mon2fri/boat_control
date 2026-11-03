import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  importExceptionCommentary,
  loadExceptionTracking,
  loadExceptionTrackingDates,
} from "../../api/endpoints";
import { isValidIsoDate } from "../../lib/asOfDate";

const DATES_KEY = ["exception-tracking-dates"] as const;

function exceptionsKey(asOfDate: string) {
  return ["exception-tracking", asOfDate] as const;
}

export function useExceptionTrackingDates() {
  return useQuery({
    queryKey: DATES_KEY,
    queryFn: () => loadExceptionTrackingDates(),
    retry: false,
    staleTime: 30_000,
  });
}

export function useTrackedExceptions(asOfDate: string) {
  return useQuery({
    queryKey: exceptionsKey(asOfDate),
    queryFn: () => loadExceptionTracking(asOfDate),
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
        client.invalidateQueries({ queryKey: exceptionsKey(asOfDate) }),
        client.invalidateQueries({ queryKey: DATES_KEY }),
      ]);
    },
  });
}
