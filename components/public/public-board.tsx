import {
  format,
  isPast,
  isToday,
  isTomorrow,
  parseISO,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ExternalLink } from "lucide-react";

import { ProjectAvatar } from "@/components/projects/project-avatar";
import {
  PROJECT_COLOR_CLASS,
  PROJECT_ITEM_CATEGORY_CLASS,
  PROJECT_ITEM_CATEGORY_LABEL,
  PROJECT_ITEM_STATUS_BAR,
  PROJECT_ITEM_STATUS_CLASS,
  PROJECT_ITEM_STATUS_DOT,
  PROJECT_ITEM_STATUS_LABEL,
  type ProjectColor,
  type ProjectItemCategory,
  type ProjectItemStatus,
} from "@/lib/projects/types";
import { cn } from "@/lib/utils";

/**
 * Read-only board rendering shared by every client-facing surface: the
 * per-client links (/copa, /cmi, …), the /todos overview, and the legacy
 * token link (/p/<token>).
 */

export type PublicRowItem = {
  id: string;
  title: string;
  description: string | null;
  category: ProjectItemCategory;
  status: ProjectItemStatus;
  due_date: string | null;
  link: string | null;
};

export type StatusTotals = Record<ProjectItemStatus, number>;

const STATUS_KEYS: readonly ProjectItemStatus[] = [
  "pending",
  "ongoing",
  "waiting",
  "done",
] as const;

export function countByStatus(items: readonly { status: ProjectItemStatus }[]) {
  const out: StatusTotals = { pending: 0, ongoing: 0, waiting: 0, done: 0 };
  for (const item of items) out[item.status]++;
  return out;
}

export function formatDueLabel(value: string | null): string {
  if (!value) return "Sin fecha";
  const date = parseISO(value);
  if (isToday(date)) return "Hoy";
  if (isTomorrow(date)) return "Mañana";
  return format(date, "d MMM", { locale: es });
}

export function dueTone(value: string | null): string {
  if (!value) return "bg-muted/40 text-muted-foreground border-transparent";
  const date = parseISO(value);
  const today = startOfDay(new Date());
  if (date < today && !isToday(date) && isPast(date))
    return "bg-rose-500/15 text-rose-700 border-rose-500/40 dark:text-rose-200";
  if (isToday(date) || isTomorrow(date))
    return "bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-200";
  return "bg-muted/40 text-foreground border-border";
}

/** One task. Desktop gets a four-column grid; mobile stacks into chips. */
export function PublicBoardRow({ item }: { item: PublicRowItem }) {
  const due = formatDueLabel(item.due_date);
  const tone = dueTone(item.due_date);

  return (
    <div className="group relative border-b last:border-b-0">
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          PROJECT_ITEM_STATUS_BAR[item.status],
        )}
      />
      <div className="hidden gap-3 py-2.5 pr-3 pl-4 md:grid md:grid-cols-[1fr_130px_130px_130px] md:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{item.title}</span>
            {item.link ? (
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="text-sky-600 hover:text-sky-500 dark:text-sky-300"
                aria-label="Abrir link"
              >
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </div>
          {item.description ? (
            <p className="text-muted-foreground truncate text-[11px]">
              {item.description}
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            "inline-flex h-6 items-center justify-center rounded-full border px-2 text-[10px] font-semibold tracking-wide uppercase",
            PROJECT_ITEM_CATEGORY_CLASS[item.category],
          )}
        >
          {PROJECT_ITEM_CATEGORY_LABEL[item.category]}
        </span>
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium",
            PROJECT_ITEM_STATUS_CLASS[item.status],
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              PROJECT_ITEM_STATUS_DOT[item.status],
            )}
          />
          {PROJECT_ITEM_STATUS_LABEL[item.status]}
        </span>
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium",
            tone,
          )}
        >
          <CalendarDays className="size-3" />
          {due}
        </span>
      </div>

      <div className="flex flex-col gap-2 py-3 pr-3 pl-3 md:hidden">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] leading-snug font-medium">
                {item.title}
              </span>
              {item.link ? (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-600 dark:text-sky-300"
                  aria-label="Abrir link"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
            {item.description ? (
              <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                {item.description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium",
              PROJECT_ITEM_STATUS_CLASS[item.status],
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                PROJECT_ITEM_STATUS_DOT[item.status],
              )}
            />
            {PROJECT_ITEM_STATUS_LABEL[item.status]}
          </span>
          <span
            className={cn(
              "inline-flex h-6 items-center justify-center rounded-full border px-2 text-[10px] font-semibold tracking-wide uppercase",
              PROJECT_ITEM_CATEGORY_CLASS[item.category],
            )}
          >
            {PROJECT_ITEM_CATEGORY_LABEL[item.category]}
          </span>
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium",
              tone,
            )}
          >
            <CalendarDays className="size-3" />
            {due}
          </span>
        </div>
      </div>
    </div>
  );
}

/** "N tareas activas" plus a dot per status. */
export function StatusSummary({ totals }: { totals: StatusTotals }) {
  const total = STATUS_KEYS.reduce((acc, key) => acc + totals[key], 0);
  return (
    <>
      <div className="text-sm font-medium">{total} tareas activas</div>
      <div className="flex flex-wrap items-center gap-3">
        {STATUS_KEYS.map((key) =>
          totals[key] > 0 ? (
            <span
              key={key}
              className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  PROJECT_ITEM_STATUS_DOT[key],
                )}
              />
              {PROJECT_ITEM_STATUS_LABEL[key]} · {totals[key]}
            </span>
          ) : null,
        )}
      </div>
    </>
  );
}

/** One project: a colored header and its tasks. */
export function PublicProjectCard({
  project,
  color,
  emoji,
  items,
}: {
  project: string;
  color: ProjectColor;
  emoji: string | null;
  items: readonly PublicRowItem[];
}) {
  const palette = PROJECT_COLOR_CLASS[color];
  return (
    <section className="bg-card overflow-hidden rounded-xl border shadow-sm">
      <header
        className={cn(
          "flex items-center gap-2 border-b px-3 py-2.5",
          palette.soft,
        )}
      >
        <ProjectAvatar
          project={project}
          color={color}
          emoji={emoji}
          size="md"
        />
        <h3 className="truncate text-sm font-semibold tracking-tight md:text-base">
          {project}
        </h3>
        <span className="text-muted-foreground ml-auto shrink-0 text-[11px] tabular-nums">
          {items.length === 1 ? "1 tarea" : `${items.length} tareas`}
        </span>
      </header>
      {items.length === 0 ? (
        <p className="text-muted-foreground px-3 py-4 text-xs">
          Sin tareas activas.
        </p>
      ) : (
        <div>
          {items.map((item) => (
            <PublicBoardRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

export function PublicBoardHeader({
  initials,
  title,
  subtitle,
  action,
}: {
  initials: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 md:px-6">
        <span className="bg-primary text-primary-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold">
          {initials}
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="text-muted-foreground text-[11px]">{subtitle}</div>
        </div>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
    </header>
  );
}

export function PublicBoardEmpty() {
  return (
    <div className="bg-muted/30 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm font-medium">No hay tareas activas</p>
      <p className="text-muted-foreground text-xs">
        Cuando se carguen tareas las vas a ver acá.
      </p>
    </div>
  );
}
