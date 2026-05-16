"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { listProjectItemsAction } from "@/app/actions/projects";
import type { ProjectItem } from "@/lib/projects/types";

export const PROJECT_ITEMS_KEY = ["project-items"] as const;

export type ProjectItemsQueryResult =
  | { items: ProjectItem[]; authRequired: false; error: null }
  | { items: []; authRequired: true; error: string }
  | { items: []; authRequired: false; error: string };

export function useProjectItems(): UseQueryResult<ProjectItemsQueryResult> {
  return useQuery({
    queryKey: PROJECT_ITEMS_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<ProjectItemsQueryResult> => {
      const result = await listProjectItemsAction();
      if (result.ok) {
        return { items: result.data, authRequired: false, error: null };
      }
      if (result.code === "auth_required") {
        return { items: [], authRequired: true, error: result.message };
      }
      return { items: [], authRequired: false, error: result.message };
    },
  });
}
