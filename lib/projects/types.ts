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
  description: string | null;
  category: ProjectItemCategory;
  status: ProjectItemStatus;
  /** YYYY-MM-DD wall-clock day, or null. */
  due_date: string | null;
  link: string | null;
  position: number;
  archived_at: string | null;
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

export const PROJECT_ITEM_STATUS_DOT: Record<ProjectItemStatus, string> = {
  pending: "bg-rose-500",
  ongoing: "bg-emerald-500",
  waiting: "bg-sky-500",
  done: "bg-muted-foreground/40",
};

/**
 * Pill styling for status chips. Pending=red, ongoing=green, waiting=blue,
 * done=muted.
 */
export const PROJECT_ITEM_STATUS_CLASS: Record<ProjectItemStatus, string> = {
  pending:
    "bg-rose-500/15 text-rose-700 border-rose-500/40 dark:text-rose-200",
  ongoing:
    "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-200",
  waiting:
    "bg-sky-500/15 text-sky-700 border-sky-500/40 dark:text-sky-200",
  done: "bg-muted text-muted-foreground border-border",
};

/**
 * Left-edge bar token per status. Lets the row carry status color without
 * eating horizontal real estate.
 */
export const PROJECT_ITEM_STATUS_BAR: Record<ProjectItemStatus, string> = {
  pending: "bg-rose-500",
  ongoing: "bg-emerald-500",
  waiting: "bg-sky-500",
  done: "bg-muted-foreground/30",
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

/** Solid dot color per category, for the low-noise category indicator. */
export const PROJECT_ITEM_CATEGORY_DOT: Record<ProjectItemCategory, string> = {
  mp: "bg-violet-500",
  trafico: "bg-amber-500",
  creativo: "bg-fuchsia-500",
  reporting: "bg-teal-500",
  otros: "bg-muted-foreground/40",
};

export type ProjectColor =
  | "slate"
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
  | "fuchsia"
  | "teal"
  | "indigo"
  | "orange";

export const PROJECT_COLORS: readonly ProjectColor[] = [
  "slate",
  "sky",
  "emerald",
  "amber",
  "rose",
  "violet",
  "fuchsia",
  "teal",
  "indigo",
  "orange",
] as const;

export type ProjectMeta = {
  project: string;
  color: ProjectColor;
  emoji: string | null;
  /** Client this project belongs to, or null/undefined if unassigned. */
  client?: string | null;
  position: number;
};

export type Client = {
  name: string;
  position: number;
  /**
   * URL segment for this client's public link (`copa` -> /copa). Null only
   * for rows created before slugs existed.
   */
  slug?: string | null;
};

/**
 * Tailwind class tokens per project color. `chip` is the header avatar bg,
 * `bar` is a solid fill, `ring` is the focus ring, `soft` is the row tint.
 */
export const PROJECT_COLOR_CLASS: Record<
  ProjectColor,
  { chip: string; bar: string; ring: string; soft: string }
> = {
  slate: {
    chip: "bg-slate-500/15 text-slate-700 dark:text-slate-200",
    bar: "bg-slate-500",
    ring: "ring-slate-500/30",
    soft: "bg-slate-500/5",
  },
  sky: {
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-200",
    bar: "bg-sky-500",
    ring: "ring-sky-500/30",
    soft: "bg-sky-500/5",
  },
  emerald: {
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
    bar: "bg-emerald-500",
    ring: "ring-emerald-500/30",
    soft: "bg-emerald-500/5",
  },
  amber: {
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-200",
    bar: "bg-amber-500",
    ring: "ring-amber-500/30",
    soft: "bg-amber-500/5",
  },
  rose: {
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-200",
    bar: "bg-rose-500",
    ring: "ring-rose-500/30",
    soft: "bg-rose-500/5",
  },
  violet: {
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-200",
    bar: "bg-violet-500",
    ring: "ring-violet-500/30",
    soft: "bg-violet-500/5",
  },
  fuchsia: {
    chip: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200",
    bar: "bg-fuchsia-500",
    ring: "ring-fuchsia-500/30",
    soft: "bg-fuchsia-500/5",
  },
  teal: {
    chip: "bg-teal-500/15 text-teal-700 dark:text-teal-200",
    bar: "bg-teal-500",
    ring: "ring-teal-500/30",
    soft: "bg-teal-500/5",
  },
  indigo: {
    chip: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-200",
    bar: "bg-indigo-500",
    ring: "ring-indigo-500/30",
    soft: "bg-indigo-500/5",
  },
  orange: {
    chip: "bg-orange-500/15 text-orange-700 dark:text-orange-200",
    bar: "bg-orange-500",
    ring: "ring-orange-500/30",
    soft: "bg-orange-500/5",
  },
};

export function pickStableColor(seed: string): ProjectColor {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}

export function defaultProjectMeta(project: string): ProjectMeta {
  return {
    project,
    color: pickStableColor(project),
    emoji: null,
    client: null,
    position: 0,
  };
}

export function projectInitial(project: string, emoji: string | null): string {
  if (emoji && emoji.trim().length > 0) return emoji;
  const trimmed = project.trim();
  if (trimmed.length === 0) return "·";
  // Use the first 2 letters; uppercase. Plays well with short codes.
  return trimmed.slice(0, 2).toUpperCase();
}

export type DensityMode = "comfortable" | "compact";
