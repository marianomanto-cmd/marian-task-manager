export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high";

export type Task = {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** YYYY-MM-DD wall-clock day, or null. */
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  /** Optional free-form URL (Drive, Notion, Figma…). */
  link: string | null;
  /** team_members keys assigned to this task. */
  assignees: string[];
  /** team_members keys kept in the loop without owning the task. */
  notified: string[];
};

export const TASK_STATUSES: readonly TaskStatus[] = [
  "todo",
  "in_progress",
  "review",
  "done",
] as const;

export const TASK_PRIORITIES: readonly TaskPriority[] = [
  "low",
  "medium",
  "high",
] as const;

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Por hacer",
  in_progress: "En curso",
  review: "Revisión",
  done: "Listo",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};
