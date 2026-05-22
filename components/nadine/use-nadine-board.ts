"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  listNadineBoardAction,
  type ListNadineItemsInput,
  type NadineBoardData,
} from "@/app/actions/nadine";

export const NADINE_ITEMS_KEY = ["nadine-items"] as const;

export function nadineBoardKey(filter: ListNadineItemsInput) {
  return [...NADINE_ITEMS_KEY, filter.archiveMode ?? "active"] as const;
}

export type NadineBoardQueryResult =
  | { data: NadineBoardData; error: null }
  | { data: { items: []; meta: []; groups: [] }; error: string };

export function useNadineBoard(
  filter: ListNadineItemsInput = {},
): UseQueryResult<NadineBoardQueryResult> {
  return useQuery({
    queryKey: nadineBoardKey(filter),
    staleTime: 30_000,
    queryFn: async (): Promise<NadineBoardQueryResult> => {
      const result = await listNadineBoardAction(filter);
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
