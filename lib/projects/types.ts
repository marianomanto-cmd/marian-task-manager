export type ProjectItemCategory =
  | "mp"
  | "trafico"
  | "creativo"
  | "reporting"
  | "otros";

export type ProjectItemStatus = "pending" | "ongoing" | "waiting" | "done";

export type ProjectItem = {
  id: string;
  user_id: string;
  project: string;
  title: string;
  category: ProjectItemCategory;
  status: ProjectItemStatus;
  /** YYYY-MM-DD wall-clock day, or null. */
  due_date: string | null;
  link: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export const PROJECT_ITEM_CATEGORIES: readonly ProjectItemCategory[] = [
  "mp",
  "trafico",
  "creativo",
  "reporting",
  "otros",
] as const;

export const PROJECT_ITEM_STATUSES: readonly ProjectItemStatus[] = [
  "pending",
  "ongoing",
  "waiting",
  "done",
] as const;

export const PROJECT_ITEM_CATEGORY_LABEL: Record<ProjectItemCategory, string> = {
  mp: "MP",
  trafico: "Tráfico",
  creativo: "Creativo",
  reporting: "Reporting",
  otros: "Otros",
};

export const PROJECT_ITEM_STATUS_LABEL: Record<ProjectItemStatus, string> = {
  pending: "Pending",
  ongoing: "Ongoing",
  waiting: "Waiting",
  done: "Done",
};

/**
 * Color tokens for status pills. Pending=red, ongoing=green, waiting=blue,
 * done=gray, per the spec.
 */
export const PROJECT_ITEM_STATUS_CLASS: Record<ProjectItemStatus, string> = {
  pending:
    "bg-rose-500/15 text-rose-700 border-rose-500/40 dark:text-rose-200",
  ongoing:
    "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-200",
  waiting:
    "bg-sky-500/15 text-sky-700 border-sky-500/40 dark:text-sky-200",
  done:
    "bg-muted text-muted-foreground border-border",
};

export const PROJECT_ITEM_STATUS_DOT: Record<ProjectItemStatus, string> = {
  pending: "bg-rose-500",
  ongoing: "bg-emerald-500",
  waiting: "bg-sky-500",
  done: "bg-muted-foreground/40",
};

export const PROJECT_ITEM_CATEGORY_CLASS: Record<ProjectItemCategory, string> = {
  mp: "bg-violet-500/15 text-violet-700 border-violet-500/40 dark:text-violet-200",
  trafico:
    "bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-200",
  creativo:
    "bg-fuchsia-500/15 text-fuchsia-700 border-fuchsia-500/40 dark:text-fuchsia-200",
  reporting:
    "bg-teal-500/15 text-teal-700 border-teal-500/40 dark:text-teal-200",
  otros: "bg-muted text-muted-foreground border-border",
};
