"use client";

import * as React from "react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";

import { DayDetailSheet } from "@/components/agenda/day-detail-sheet";
import { OOOForm } from "@/components/agenda/ooo-form";
import { useHolidays } from "@/components/agenda/use-holidays";
import { useOooEntries } from "@/components/agenda/use-ooo";
import { MonthGrid } from "@/components/calendar/month-grid";
import { TaskForm } from "@/components/tasks/task-form";
import { useTasks } from "@/components/tasks/use-tasks";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { HOLIDAY_COUNTRY_META, type Holiday } from "@/lib/holidays/types";
import type { OooEntry } from "@/lib/ooo/types";
import {
  colorForMemberKey,
  getMemberByKey,
  TEAM_MEMBERS,
} from "@/lib/team/members";
import type { Task, TaskPriority } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

const WEEK_STARTS_ON = 1 as const;

/**
 * Try to match the free-text member name to a known team member by display
 * name; falls back to a hash so unknown names still get a stable color.
 */
function memberColor(memberName: string): { bar: string; text: string } {
  const found = TEAM_MEMBERS.find(
    (m) => m.name.toLowerCase() === memberName.trim().toLowerCase(),
  );
  if (found) {
    const c = colorForMemberKey(found.key);
    return { bar: c.barBg, text: c.barText };
  }
  // Stable fallback hash for free-text names.
  let hash = 0;
  for (let i = 0; i < memberName.length; i += 1) {
    hash = (hash * 31 + memberName.charCodeAt(i)) | 0;
  }
  const fakeKey = TEAM_MEMBERS[Math.abs(hash) % TEAM_MEMBERS.length].key;
  const c = colorForMemberKey(fakeKey);
  return { bar: c.barBg, text: c.barText };
}

function buildHolidayIndex(holidays: Holiday[]): Map<string, Holiday[]> {
  const map = new Map<string, Holiday[]>();
  for (const h of holidays) {
    const list = map.get(h.date) ?? [];
    list.push(h);
    map.set(h.date, list);
  }
  return map;
}

/**
 * For each cell date returns the OOO entries active that day, sorted by the
 * member name so the visual order is stable across renders.
 */
function buildOooIndex(entries: OooEntry[]): Map<string, OooEntry[]> {
  const map = new Map<string, OooEntry[]>();
  for (const entry of entries) {
    // start/end are YYYY-MM-DD strings — string comparison is correct.
    let cursor = entry.start_date;
    while (cursor <= entry.end_date) {
      const list = map.get(cursor) ?? [];
      list.push(entry);
      map.set(cursor, list);
      cursor = addOneDay(cursor);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.member_name.localeCompare(b.member_name));
  }
  return map;
}

function addOneDay(dateKey: string): string {
  // Avoid Date roundtrip to keep wall-clock semantics intact.
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 3, medium: 2, low: 1 };

function buildTasksDueIndex(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.due_date) continue;
    const list = map.get(t.due_date) ?? [];
    list.push(t);
    map.set(t.due_date, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      const p = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      if (p !== 0) return p;
      return a.title.localeCompare(b.title);
    });
  }
  return map;
}

function initialFor(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : "?";
}

type TaskDueCardProps = {
  task: Task;
  onOpen: (task: Task) => void;
};

function TaskDueCard({ task, onOpen }: TaskDueCardProps) {
  const members = task.assignees
    .map((k) => getMemberByKey(k))
    .filter((m): m is NonNullable<typeof m> => m !== null);
  const visible = members.slice(0, 2);
  const overflow = Math.max(0, members.length - visible.length);
  const isDone = task.status === "done";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(task);
      }}
      title={`Vence: ${task.title}`}
      className={cn(
        "bg-card hover:bg-accent flex w-full items-center gap-1 overflow-hidden rounded border px-1 py-0.5 text-left text-[10px] leading-tight",
        task.priority === "high" && "border-rose-500/60",
        task.priority === "medium" && "border-amber-500/50",
        task.priority === "low" && "border-muted-foreground/30",
        isDone && "opacity-60",
      )}
    >
      {visible.length > 0 ? (
        <span className="flex shrink-0 -space-x-1">
          {visible.map((m) => {
            const c = colorForMemberKey(m.key);
            return (
              <span
                key={m.key}
                className={cn(
                  "border-card flex size-3.5 items-center justify-center rounded-full border text-[8px] font-semibold",
                  c.barBg,
                  c.barText,
                )}
                aria-label={m.name}
              >
                {initialFor(m.name)}
              </span>
            );
          })}
          {overflow > 0 ? (
            <span className="border-card bg-muted text-muted-foreground flex size-3.5 items-center justify-center rounded-full border text-[8px] font-semibold">
              +{overflow}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="border-card bg-muted text-muted-foreground flex size-3.5 shrink-0 items-center justify-center rounded-full border text-[8px]">
          ·
        </span>
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-medium",
          isDone && "line-through",
        )}
      >
        {task.title}
      </span>
    </button>
  );
}

function weekStartKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const local = new Date(y, m - 1, d);
  const ws = startOfWeek(local, { weekStartsOn: WEEK_STARTS_ON });
  return format(ws, "yyyy-MM-dd");
}

export default function AgendaPage() {
  const [monthAnchor, setMonthAnchor] = React.useState<Date>(() =>
    startOfMonth(new Date()),
  );
  const [selectedDateKey, setSelectedDateKey] = React.useState<string | null>(
    null,
  );
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createInitialDate, setCreateInitialDate] = React.useState<
    string | undefined
  >(undefined);
  const [editingEntry, setEditingEntry] = React.useState<OooEntry | null>(null);

  const range = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(monthAnchor), {
      weekStartsOn: WEEK_STARTS_ON,
    });
    const end = endOfWeek(endOfMonth(monthAnchor), {
      weekStartsOn: WEEK_STARTS_ON,
    });
    return { start, end };
  }, [monthAnchor]);

  const holidaysQuery = useHolidays(range.start, range.end);
  const oooQuery = useOooEntries(range.start, range.end);
  const tasksQuery = useTasks();

  const holidayIndex = React.useMemo(
    () => buildHolidayIndex(holidaysQuery.data ?? []),
    [holidaysQuery.data],
  );
  const oooByDay = React.useMemo(
    () => buildOooIndex(oooQuery.data?.entries ?? []),
    [oooQuery.data?.entries],
  );
  const tasksByDay = React.useMemo(
    () => buildTasksDueIndex(tasksQuery.data?.tasks ?? []),
    [tasksQuery.data?.tasks],
  );

  const [taskFormOpen, setTaskFormOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);

  function openTaskEdit(task: Task) {
    setEditingTask(task);
    setTaskFormOpen(true);
    setSelectedDateKey(null);
  }

  const selectedHolidays = selectedDateKey
    ? (holidayIndex.get(selectedDateKey) ?? [])
    : [];
  const selectedOoo = selectedDateKey
    ? (oooByDay.get(selectedDateKey) ?? [])
    : [];

  function openCreateForDate(dateKey?: string) {
    setCreateInitialDate(dateKey);
    setEditingEntry(null);
    setCreateOpen(true);
  }

  function openEdit(entry: OooEntry) {
    setEditingEntry(entry);
    setCreateInitialDate(undefined);
    setCreateOpen(true);
    setSelectedDateKey(null);
  }

  const refreshing = holidaysQuery.isFetching || oooQuery.isFetching;

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 md:px-6 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          {format(monthAnchor, "MMMM yyyy", { locale: es }).replace(/^\w/, (c) =>
            c.toUpperCase(),
          )}
        </h1>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMonthAnchor((m) => subMonths(m, 1))}
            aria-label="Mes anterior"
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMonthAnchor(startOfMonth(new Date()))}
          >
            Hoy
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMonthAnchor((m) => addMonths(m, 1))}
            aria-label="Mes siguiente"
          >
            <ChevronRight />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              holidaysQuery.refetch();
              oooQuery.refetch();
            }}
            disabled={refreshing}
            aria-label="Actualizar"
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} />
          </Button>
          <Button
            type="button"
            onClick={() => openCreateForDate()}
            className="hidden md:inline-flex"
          >
            <Plus />
            Cargar OOO
          </Button>
        </div>
      </header>

      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
        {(Object.keys(HOLIDAY_COUNTRY_META) as Array<keyof typeof HOLIDAY_COUNTRY_META>).map(
          (c) => {
            const meta = HOLIDAY_COUNTRY_META[c];
            return (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span
                  className={cn("inline-block size-2 rounded-full", meta.color)}
                  aria-hidden
                />
                {meta.label}
              </span>
            );
          },
        )}
      </div>

      {oooQuery.data?.authRequired ? (
        <p className="text-destructive text-sm" role="alert">
          Iniciá sesión para ver el OOO del equipo.
        </p>
      ) : null}
      {oooQuery.data?.error && !oooQuery.data.authRequired ? (
        <p className="text-destructive text-sm" role="alert">
          {oooQuery.data.error}
        </p>
      ) : null}
      {holidaysQuery.error ? (
        <p className="text-destructive text-sm" role="alert">
          {holidaysQuery.error.message}
        </p>
      ) : null}

      <MonthGrid
        month={monthAnchor}
        onSelectDate={(date) => setSelectedDateKey(format(date, "yyyy-MM-dd"))}
        renderCell={(date) => {
          const key = format(date, "yyyy-MM-dd");
          const dayHolidays = holidayIndex.get(key) ?? [];
          const dayOoo = oooByDay.get(key) ?? [];
          const dayTasks = tasksByDay.get(key) ?? [];
          if (
            dayHolidays.length === 0 &&
            dayOoo.length === 0 &&
            dayTasks.length === 0
          )
            return null;

          const rowStart = weekStartKey(key);

          return (
            <>
              {dayHolidays.length > 0 ? (
                <div className="flex items-center gap-1">
                  {dayHolidays.slice(0, 4).map((h) => (
                    <span
                      key={h.id}
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        HOLIDAY_COUNTRY_META[h.country].color,
                      )}
                      title={`${h.name} · ${HOLIDAY_COUNTRY_META[h.country].label}`}
                      aria-hidden
                    />
                  ))}
                </div>
              ) : null}

              {dayTasks.map((task) => (
                <TaskDueCard key={task.id} task={task} onOpen={openTaskEdit} />
              ))}

              {dayOoo.map((entry) => {
                const color = memberColor(entry.member_name);
                // Show the member name only on the leftmost cell of this OOO
                // within the visible row, so multi-day OOOs read as one bar.
                const labelStart =
                  entry.start_date > rowStart ? entry.start_date : rowStart;
                const showLabel = key === labelStart;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(entry);
                    }}
                    title={`${entry.member_name}${entry.reason ? ` — ${entry.reason}` : ""}`}
                    className={cn(
                      "block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight",
                      color.bar,
                      color.text,
                    )}
                  >
                    {showLabel ? entry.member_name : " "}
                  </button>
                );
              })}
            </>
          );
        }}
      />

      {(holidaysQuery.isLoading || oooQuery.isLoading) ? (
        <p className="text-muted-foreground text-sm">Cargando…</p>
      ) : null}

      <Button
        type="button"
        onClick={() => openCreateForDate()}
        className="fixed right-4 bottom-20 z-30 size-12 rounded-full shadow-lg md:hidden"
        size="icon"
        aria-label="Cargar OOO"
      >
        <Plus />
      </Button>

      <DayDetailSheet
        dateKey={selectedDateKey}
        holidays={selectedHolidays}
        oooEntries={selectedOoo}
        onClose={() => setSelectedDateKey(null)}
        onEditOoo={openEdit}
        onCreateOoo={(d) => {
          setSelectedDateKey(null);
          openCreateForDate(d);
        }}
      />

      <ResponsiveDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setEditingEntry(null);
            setCreateInitialDate(undefined);
          }
        }}
        title={editingEntry ? "Editar OOO" : "Cargar OOO"}
        description={
          editingEntry
            ? "Editá los datos o eliminá el OOO."
            : "Registrá un miembro fuera de oficina."
        }
      >
        <OOOForm
          entry={editingEntry}
          defaultStartDate={createInitialDate}
          onSaved={() => setCreateOpen(false)}
          onDeleted={() => setCreateOpen(false)}
          onCancel={() => setCreateOpen(false)}
        />
      </ResponsiveDialog>

      <ResponsiveDialog
        open={taskFormOpen}
        onOpenChange={(open) => {
          setTaskFormOpen(open);
          if (!open) setEditingTask(null);
        }}
        title={editingTask ? "Editar tarea" : "Nueva tarea"}
        description={
          editingTask
            ? "Editá los datos, comentá o eliminá."
            : "Sumá una tarea a la lista."
        }
        contentClassName="sm:max-w-2xl"
      >
        <TaskForm
          task={editingTask}
          onSaved={() => setTaskFormOpen(false)}
          onDeleted={() => setTaskFormOpen(false)}
          onCancel={() => setTaskFormOpen(false)}
        />
      </ResponsiveDialog>
    </section>
  );
}
