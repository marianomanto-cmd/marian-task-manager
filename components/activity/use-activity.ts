"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  listActivityAction,
  type ActivityListResult,
} from "@/app/actions/activity";

export const ACTIVITY_INVALIDATION_KEY = ["activity"] as const;

export function useActivity(
  limit: number = 50,
): UseQueryResult<ActivityListResult> {
  return useQuery({
    queryKey: ["activity", limit] as const,
    staleTime: 15_000,
    queryFn: async (): Promise<ActivityListResult> => {
      const result = await listActivityAction({ limit });
      if (!result.ok) return { entries: [], lastSeenAt: null };
      return result.data;
    },
  });
}
