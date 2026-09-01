"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getTimelinerAction, type TimelinerData } from "@/app/actions/timeliner";

export const TIMELINER_KEY = ["timeliner"] as const;

export type TimelinerQueryResult =
  | { data: TimelinerData; authRequired: false; error: null }
  | {
      data: {
        timelines: [];
        groups: [];
        items: [];
        holidays: [];
        master_share_token: null;
      };
      authRequired: boolean;
      error: string;
    };

export function useTimeliner(): UseQueryResult<TimelinerQueryResult> {
  return useQuery({
    queryKey: TIMELINER_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<TimelinerQueryResult> => {
      const result = await getTimelinerAction();
      if (result.ok) {
        return { data: result.data, authRequired: false, error: null };
      }
      return {
        data: {
          timelines: [],
          groups: [],
          items: [],
          holidays: [],
          master_share_token: null,
        },
        authRequired: result.code === "auth_required",
        error: result.message,
      };
    },
  });
}
