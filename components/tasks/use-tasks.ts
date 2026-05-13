"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { listTasksAction, type ListTasksInput } from "@/app/actions/tasks";
import type { Task } from "@/lib/tasks/types";

export type TasksQueryResult =
  | { tasks: Task[]; authRequired: false; error: null }
  | { tasks: []; authRequired: true; error: string }
  | { tasks: []; authRequired: false; error: string };

export function tasksQueryKey(filter: ListTasksInput) {
  return [
    "tasks",
    filter.statuses?.slice().sort().join(",") ?? "",
    filter.priorities?.slice().sort().join(",") ?? "",
  ] as const;
}

export const TASKS_INVALIDATION_KEY = ["tasks"] as const;

export function useTasks(
  filter: ListTasksInput = {},
): UseQueryResult<TasksQueryResult> {
  return useQuery({
    queryKey: tasksQueryKey(filter),
    staleTime: 30_000,
    queryFn: async (): Promise<TasksQueryResult> => {
      const result = await listTasksAction(filter);
      if (result.ok) {
        return { tasks: result.data, authRequired: false, error: null };
      }
      if (result.code === "auth_required") {
        return { tasks: [], authRequired: true, error: result.message };
      }
      return { tasks: [], authRequired: false, error: result.message };
    },
  });
}
