"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Check, LinkIcon } from "lucide-react";

import { toggleTaskDoneAction } from "@/app/actions/tasks";
import { AssigneeAvatars } from "@/components/tasks/assignee-picker";
import { TASKS_INVALIDATION_KEY } from "@/components/tasks/use-tasks";
import {
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type Task,
  type TaskPriority,
} from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-sky-500/15 text-sky-700 dark:text-sky-200",
  high: "bg-rose-500/15 text-rose-700 dark:text-rose-200",
};

const STATUS_CLASSES = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-sky-500/15 text-sky-700 dark:text-sky-200",
  review: "bg-amber-500/15 text-amber-700 dark:text-amber-200",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
} as const;

function todayString(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function dueDateLabel(dueDate: string): { label: string; tone: "overdue" | "today" | "upcoming" } {
  const today = todayString();
  if (dueDate < today) {
    return { label: `Venció ${format(parseISO(dueDate), "d MMM", { locale: es })}`, tone: "overdue" };
  }
  if (dueDate === today) return { label: "Hoy", tone: "today" };
  return {
    label: format(parseISO(dueDate), "d MMM", { locale: es }),
    tone: "upcoming",
  };
}

const TONE_CLASSES = {
  overdue: "bg-destructive/15 text-destructive",
  today: "bg-amber-500/15 text-amber-700 dark:text-amber-200",
  upcoming: "bg-muted text-muted-foreground",
} as const;

export type TaskRowProps = {
  task: Task;
  onSelect: (task: Task) => void;
};

export function TaskRow({ task, onSelect }: TaskRowProps) {
  const queryClient = useQueryClient();
  const isDone = task.status === "done";

  const toggleMutation = useMutation({
    mutationFn: async (done: boolean) => {
      const result = await toggleTaskDoneAction(task.id, done);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASKS_INVALIDATION_KEY });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  const due = task.due_date ? dueDateLabel(task.due_date) : null;

  return (
    <li className="hover:bg-accent/40 group flex items-start gap-3 px-3 py-3">
      <button
        type="button"
        aria-label={isDone ? "Marcar como pendiente" : "Marcar como hecho"}
        onClick={(e) => {
          e.stopPropagation();
          toggleMutation.mutate(!isDone);
        }}
        disabled={toggleMutation.isPending}
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          isDone
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-foreground",
        )}
      >
        {isDone ? <Check className="size-3" /> : null}
      </button>

      <button
        type="button"
        onClick={() => onSelect(task)}
        className="flex-1 min-w-0 space-y-0.5 text-left"
      >
        <p
          className={cn(
            "text-sm font-medium leading-snug",
            isDone && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </p>
        {task.notes ? (
          <p className="text-muted-foreground line-clamp-1 text-xs">
            {task.notes}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {task.status !== "todo" ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                STATUS_CLASSES[task.status],
              )}
            >
              {TASK_STATUS_LABEL[task.status]}
            </span>
          ) : null}
          {task.priority !== "medium" ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                PRIORITY_CLASSES[task.priority],
              )}
            >
              {TASK_PRIORITY_LABEL[task.priority]}
            </span>
          ) : null}
          {due ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                TONE_CLASSES[due.tone],
              )}
            >
              {due.label}
            </span>
          ) : null}
          {task.assignees.length > 0 ? (
            <AssigneeAvatars keys={task.assignees} size="sm" />
          ) : null}
        </div>
      </button>
      {task.link ? (
        <a
          href={task.link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0 self-start opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Abrir link"
          title={task.link}
        >
          <LinkIcon className="size-3.5" />
        </a>
      ) : null}
    </li>
  );
}
