import { notFound } from "next/navigation";
import { format, isPast, isToday, isTomorrow, parseISO, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ExternalLink } from "lucide-react";

import { ProjectAvatar } from "@/components/projects/project-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { loadSharedBoard, type SharedProjectItem } from "@/lib/projects/share";
import {
  PROJECT_COLOR_CLASS,
  PROJECT_ITEM_CATEGORY_CLASS,
  PROJECT_ITEM_CATEGORY_LABEL,
  PROJECT_ITEM_STATUS_BAR,
  PROJECT_ITEM_STATUS_CLASS,
  PROJECT_ITEM_STATUS_DOT,
  PROJECT_ITEM_STATUS_LABEL,
  defaultProjectMeta,
  type ProjectMeta,
} from "@/lib/projects/types";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Board · Agency Board",
  robots: { index: false, follow: false },
};

export default async function SharedBoardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadSharedBoard(token);
  if (!data) notFound();

  const metaByProject = new Map<string, ProjectMeta>();
  for (const m of data.meta) metaByProject.set(m.project, m);

  const grouped = new Map<string, SharedProjectItem[]>();
  for (const it of data.items) {
    if (!grouped.has(it.project)) grouped.set(it.project, []);
    grouped.get(it.project)!.push(it);
  }
  const groups = Array.from(grouped.entries()).sort(([a], [b]) => {
    const pa = metaByProject.get(a)?.position ?? 1e6;
    const pb = metaByProject.get(b)?.position ?? 1e6;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b, "es");
  });

  const totals = countByStatus(data.items);

  return (
    <>
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:px-6">
          <span className="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded-md text-xs font-bold">
            AB
          </span>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold">Board de pendientes</div>
            <div className="text-muted-foreground text-[11px]">
              Vista compartida · sólo lectura
            </div>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-3 py-4 md:px-6 md:py-6">
        <section className="mb-4 flex flex-wrap items-center gap-3">
          <StatusSummary totals={totals} />
        </section>

        {groups.length === 0 ? (
          <div className="bg-muted/30 rounded-lg border border-dashed py-16 text-center">
            <p className="text-sm font-medium">No hay tareas activas</p>
            <p className="text-muted-foreground text-xs">
              Cuando se carguen tareas las vas a ver acá.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(([project, items]) => {
              const meta = metaByProject.get(project) ?? defaultProjectMeta(project);
              const palette = PROJECT_COLOR_CLASS[meta.color];
              return (
                <section
                  key={project}
                  className="bg-card overflow-hidden rounded-xl border shadow-sm"
                >
                  <header
                    className={cn(
                      "flex items-center gap-2 border-b px-3 py-2.5",
                      palette.soft,
                    )}
                  >
                    <ProjectAvatar
                      project={project}
                      color={meta.color}
                      emoji={meta.emoji}
                      size="md"
                    />
                    <h2 className="truncate text-sm font-semibold tracking-tight md:text-base">
                      {project}
                    </h2>
                    <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
                      {items.length} tareas
                    </span>
                  </header>
                  <div>
                    {items.map((it) => (
                      <SharedRow key={it.id} item={it} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <p className="text-muted-foreground/70 mt-6 text-[11px]">
          Este link es de sólo lectura. Si querés sumarte al espacio del equipo
          pedile acceso a Mariano.
        </p>
      </main>
    </>
  );
}

function SharedRow({ item }: { item: SharedProjectItem }) {
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
      <div className="hidden gap-3 pl-4 pr-3 py-2.5 md:grid md:grid-cols-[1fr_130px_130px_130px] md:items-center">
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
            "inline-flex h-6 items-center justify-center rounded-full border px-2 text-[10px] font-semibold uppercase tracking-wide",
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

      <div className="flex flex-col gap-2 pl-3 pr-3 py-3 md:hidden">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-medium leading-snug">
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
              "inline-flex h-6 items-center justify-center rounded-full border px-2 text-[10px] font-semibold uppercase tracking-wide",
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

function StatusSummary({
  totals,
}: {
  totals: Record<"pending" | "ongoing" | "waiting" | "done", number>;
}) {
  const keys: Array<"pending" | "ongoing" | "waiting" | "done"> = [
    "pending",
    "ongoing",
    "waiting",
    "done",
  ];
  const total = keys.reduce((acc, k) => acc + totals[k], 0);
  return (
    <>
      <div className="text-sm font-medium">{total} tareas activas</div>
      <div className="flex items-center gap-3">
        {keys.map((k) =>
          totals[k] > 0 ? (
            <span
              key={k}
              className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
            >
              <span
                className={cn("size-2 rounded-full", PROJECT_ITEM_STATUS_DOT[k])}
              />
              {PROJECT_ITEM_STATUS_LABEL[k]} · {totals[k]}
            </span>
          ) : null,
        )}
      </div>
    </>
  );
}

function countByStatus(items: SharedProjectItem[]) {
  const out = { pending: 0, ongoing: 0, waiting: 0, done: 0 };
  for (const it of items) out[it.status]++;
  return out;
}

function formatDueLabel(value: string | null): string {
  if (!value) return "Sin fecha";
  const date = parseISO(value);
  if (isToday(date)) return "Hoy";
  if (isTomorrow(date)) return "Mañana";
  return format(date, "d MMM", { locale: es });
}

function dueTone(value: string | null): string {
  if (!value) return "bg-muted/40 text-muted-foreground border-transparent";
  const date = parseISO(value);
  const today = startOfDay(new Date());
  if (date < today && !isToday(date) && isPast(date))
    return "bg-rose-500/15 text-rose-700 border-rose-500/40 dark:text-rose-200";
  if (isToday(date) || isTomorrow(date))
    return "bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-200";
  return "bg-muted/40 text-foreground border-border";
}
