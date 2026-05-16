"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  listProjectBoardAction,
  type ListProjectItemsInput,
  type ProjectBoardData,
} from "@/app/actions/projects";

export const PROJECT_ITEMS_KEY = ["project-items"] as const;

export function projectBoardKey(filter: ListProjectItemsInput) {
  return [...PROJECT_ITEMS_KEY, filter.archiveMode ?? "active"] as const;
}

export type ProjectBoardQueryResult =
  | { data: ProjectBoardData; authRequired: false; error: null }
  | { data: { items: []; meta: [] }; authRequired: true; error: string }
  | { data: { items: []; meta: [] }; authRequired: false; error: string };

export function useProjectBoard(
  filter: ListProjectItemsInput = {},
): UseQueryResult<ProjectBoardQueryResult> {
  return useQuery({
    queryKey: projectBoardKey(filter),
    staleTime: 30_000,
    queryFn: async (): Promise<ProjectBoardQueryResult> => {
      const result = await listProjectBoardAction(filter);
      if (result.ok) {
        return { data: result.data, authRequired: false, error: null };
      }
      if (result.code === "auth_required") {
        return {
          data: { items: [], meta: [] },
          authRequired: true,
          error: result.message,
        };
      }
      return {
        data: { items: [], meta: [] },
        authRequired: false,
        error: result.message,
      };
    },
  });
}
