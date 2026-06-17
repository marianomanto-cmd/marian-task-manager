"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getBriefsAction } from "@/app/actions/briefs";
import type { Brief } from "@/lib/briefs/types";

export const BRIEFS_KEY = ["briefs"] as const;

export type BriefsQueryResult = {
  data: Brief[];
  authRequired: boolean;
  error: string | null;
};

export function useBriefs(): UseQueryResult<BriefsQueryResult> {
  return useQuery({
    queryKey: BRIEFS_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<BriefsQueryResult> => {
      const result = await getBriefsAction();
      if (result.ok) {
        return { data: result.data, authRequired: false, error: null };
      }
      return {
        data: [],
        authRequired: result.code === "auth_required",
        error: result.message,
      };
    },
  });
}
