"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { AssigneeAvatars } from "@/components/tasks/assignee-picker";
import { TASK_PRIORITY_LABEL, type Task, type TaskPriority } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

const PRIORITY_CARD_BORDER: Record<TaskPriority, string> = {
  low: "border-l-muted-foreground/40",
  medium: "border-l-sky-500",
  high: "border-l-rose-500",
};

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-sky-500/15 text-sky-700 dark:text-sky-200",
  high: "bg-rose-500/15 text-rose-700 dark:text-rose-200",
};

function todayString(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function dueDateLabel(
  dueDate: string,
): { label: string; tone: "overdue" | "today" | "upcoming" } {
  const today = todayString();
  if (dueDate < today) {
    return {
      label: `Venció ${format(parseISO(dueDate), "d MMM", { locale: es })}`,
      tone: "overdue",
    };
  }
  if (dueDate === today) return { label: "Hoy", tone: "today" };
  return {
    label: format(parseISO(dueDate), "d MMM", { locale: es }),
    tone: "upcoming",
  };
}

const TONE_BADGE = {
  overdue: "bg-destructive/15 text-destructive",
  today: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  upcoming: "bg-muted text-muted-foreground",
} as const;

export function TaskCard({
  task,
  onClick,
  dragging,
}: {
  task: Task;
  onClick?: () => void;
  dragging?: boolean;
}) {
  const due = task.due_date ? dueDateLabel(task.due_date) : null;
  const isDone = task.status === "done";

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card flex cursor-pointer flex-col gap-2 rounded-lg border border-l-4 p-3 shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:shadow-md",
        PRIORITY_CARD_BORDER[task.priority],
        dragging && "rotate-2 opacity-60 shadow-lg",
        isDone && "opacity-75",
      )}
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
        <p className="text-muted-foreground line-clamp-2 text-xs leading-snug">
          {task.notes}
        </p>
      ) : null}

      {(task.priority !== "medium" || due) && (
        <div className="flex flex-wrap items-center gap-1">
          {task.priority !== "medium" ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                PRIORITY_BADGE[task.priority],
              )}
            >
              {TASK_PRIORITY_LABEL[task.priority]}
            </span>
          ) : null}
          {due ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                TONE_BADGE[due.tone],
              )}
            >
              {due.label}
            </span>
          ) : null}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        {task.assignees.length > 0 ? (
          <AssigneeAvatars keys={task.assignees} size="sm" />
        ) : (
          <span className="text-muted-foreground text-[10px] italic">
            Sin asignar
          </span>
        )}
      </div>
    </div>
  );
}
