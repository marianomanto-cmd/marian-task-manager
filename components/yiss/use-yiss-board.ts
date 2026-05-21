"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  listYissBoardAction,
  type ListYissItemsInput,
  type YissBoardData,
} from "@/app/actions/yiss";

export const YISS_ITEMS_KEY = ["yiss-items"] as const;

export function yissBoardKey(filter: ListYissItemsInput) {
  return [...YISS_ITEMS_KEY, filter.archiveMode ?? "active"] as const;
}

export type YissBoardQueryResult =
  | { data: YissBoardData; error: null }
  | { data: { items: []; meta: []; groups: [] }; error: string };

export function useYissBoard(
  filter: ListYissItemsInput = {},
): UseQueryResult<YissBoardQueryResult> {
  return useQuery({
    queryKey: yissBoardKey(filter),
    staleTime: 30_000,
    queryFn: async (): Promise<YissBoardQueryResult> => {
      const result = await listYissBoardAction(filter);
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
