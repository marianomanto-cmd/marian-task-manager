"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  listMafeBoardAction,
  type ListMafeItemsInput,
  type MafeBoardData,
} from "@/app/actions/mafe";

export const MAFE_ITEMS_KEY = ["mafe-items"] as const;

export function mafeBoardKey(filter: ListMafeItemsInput) {
  return [...MAFE_ITEMS_KEY, filter.archiveMode ?? "active"] as const;
}

export type MafeBoardQueryResult =
  | { data: MafeBoardData; error: null }
  | { data: { items: []; meta: []; groups: [] }; error: string };

export function useMafeBoard(
  filter: ListMafeItemsInput = {},
): UseQueryResult<MafeBoardQueryResult> {
  return useQuery({
    queryKey: mafeBoardKey(filter),
    staleTime: 30_000,
    queryFn: async (): Promise<MafeBoardQueryResult> => {
      const result = await listMafeBoardAction(filter);
      if (result.ok) {
        return { data: result.data, error: null };
      }
      return {
        data: { items: [], meta: [], groups: [] },
        error: result.message,
      };
    },
  });
}
