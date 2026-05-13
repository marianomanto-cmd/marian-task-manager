"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  createSavedFilterAction,
  deleteSavedFilterAction,
  listSavedFiltersAction,
} from "@/app/actions/saved-filters";
import type { InboxFilter, SavedFilter } from "@/lib/inbox/filter";

export const SAVED_FILTERS_KEY = ["saved-filters"] as const;

export function useSavedFilters(): UseQueryResult<SavedFilter[]> {
  return useQuery({
    queryKey: SAVED_FILTERS_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const result = await listSavedFiltersAction();
      if (!result.ok) return [];
      return result.data;
    },
  });
}

export function useCreateSavedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; criteria: InboxFilter }) => {
      const result = await createSavedFilterAction(input);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SAVED_FILTERS_KEY });
    },
  });
}

export function useDeleteSavedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteSavedFilterAction(id);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SAVED_FILTERS_KEY });
    },
  });
}
