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
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { HOLIDAY_COUNTRY_META, type Holiday } from "@/lib/holidays/types";
import type { OooEntry } from "@/lib/ooo/types";
import { cn } from "@/lib/utils";

const WEEK_STARTS_ON = 1 as const;

const MEMBER_PALETTE: Array<{ bar: string; text: string }> = [
  { bar: "bg-sky-500/80", text: "text-sky-50" },
  { bar: "bg-emerald-500/80", text: "text-emerald-50" },
  { bar: "bg-amber-500/80", text: "text-amber-50" },
  { bar: "bg-rose-500/80", text: "text-rose-50" },
  { bar: "bg-violet-500/80", text: "text-violet-50" },
  { bar: "bg-teal-500/80", text: "text-teal-50" },
];

function memberColor(name: string): { bar: string; text: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return MEMBER_PALETTE[Math.abs(hash) % MEMBER_PALETTE.length];
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

  const holidayIndex = React.useMemo(
    () => buildHolidayIndex(holidaysQuery.data ?? []),
    [holidaysQuery.data],
  );
  const oooByDay = React.useMemo(
    () => buildOooIndex(oooQuery.data?.entries ?? []),
    [oooQuery.data?.entries],
  );

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
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-4 md:px-6 md:py-6">
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
          if (dayHolidays.length === 0 && dayOoo.length === 0) return null;

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
    </section>
  );
}
