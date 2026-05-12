"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { format } from "date-fns";

import { listOooAction } from "@/app/actions/ooo";
import type { OooEntry } from "@/lib/ooo/types";

export type OooQueryResult =
  | { entries: OooEntry[]; authRequired: false; error: null }
  | { entries: []; authRequired: true; error: string }
  | { entries: []; authRequired: false; error: string };

export function oooEntriesQueryKey(rangeStart: Date, rangeEnd: Date) {
  return [
    "ooo-entries",
    format(rangeStart, "yyyy-MM-dd"),
    format(rangeEnd, "yyyy-MM-dd"),
  ] as const;
}

export const OOO_INVALIDATION_KEY = ["ooo-entries"] as const;

export function useOooEntries(
  rangeStart: Date,
  rangeEnd: Date,
): UseQueryResult<OooQueryResult> {
  return useQuery({
    queryKey: oooEntriesQueryKey(rangeStart, rangeEnd),
    staleTime: 60_000,
    queryFn: async (): Promise<OooQueryResult> => {
      const result = await listOooAction({
        rangeStart: format(rangeStart, "yyyy-MM-dd"),
        rangeEnd: format(rangeEnd, "yyyy-MM-dd"),
      });
      if (result.ok) {
        return { entries: result.data, authRequired: false, error: null };
      }
      if (result.code === "auth_required") {
        return { entries: [], authRequired: true, error: result.message };
      }
      return { entries: [], authRequired: false, error: result.message };
    },
  });
}
