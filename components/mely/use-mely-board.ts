"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  listMelyBoardAction,
  type ListMelyItemsInput,
  type MelyBoardData,
} from "@/app/actions/mely";

export const MELY_ITEMS_KEY = ["mely-items"] as const;

export function melyBoardKey(filter: ListMelyItemsInput) {
  return [...MELY_ITEMS_KEY, filter.archiveMode ?? "active"] as const;
}

export type MelyBoardQueryResult =
  | { data: MelyBoardData; error: null }
  | { data: { items: []; meta: []; groups: [] }; error: string };

export function useMelyBoard(
  filter: ListMelyItemsInput = {},
): UseQueryResult<MelyBoardQueryResult> {
  return useQuery({
    queryKey: melyBoardKey(filter),
    staleTime: 30_000,
    queryFn: async (): Promise<MelyBoardQueryResult> => {
      const result = await listMelyBoardAction(filter);
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
