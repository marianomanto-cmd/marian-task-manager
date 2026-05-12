"use client";

import * as React from "react";
import Link from "next/link";
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

import { EventDetailSheet } from "@/components/calendar/event-detail-sheet";
import { MeetingForm } from "@/components/calendar/meeting-form";
import { MonthGrid } from "@/components/calendar/month-grid";
import { useCalendarEvents } from "@/components/calendar/use-calendar-events";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { CalendarEvent } from "@/lib/gcalendar/types";
import { cn } from "@/lib/utils";

const WEEK_STARTS_ON = 1 as const;

function groupEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = format(new Date(event.start), "yyyy-MM-dd");
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }
  return map;
}

export default function CalendarPage() {
  const [monthAnchor, setMonthAnchor] = React.useState(() =>
    startOfMonth(new Date()),
  );
  const [activeEvent, setActiveEvent] = React.useState<CalendarEvent | null>(
    null,
  );
  const [createOpen, setCreateOpen] = React.useState(false);

  const range = React.useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(monthAnchor), {
      weekStartsOn: WEEK_STARTS_ON,
    });
    const gridEnd = endOfWeek(endOfMonth(monthAnchor), {
      weekStartsOn: WEEK_STARTS_ON,
    });
    return { gridStart, gridEnd };
  }, [monthAnchor]);

  const eventsQuery = useCalendarEvents(range.gridStart, range.gridEnd);
  const eventsByDay = React.useMemo(
    () => groupEventsByDay(eventsQuery.data?.events ?? []),
    [eventsQuery.data?.events],
  );

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-4 md:px-6 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {format(monthAnchor, "MMMM yyyy", { locale: es }).replace(/^\w/, (c) =>
              c.toUpperCase(),
            )}
          </h1>
        </div>
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
            onClick={() => eventsQuery.refetch()}
            disabled={eventsQuery.isFetching}
            aria-label="Actualizar"
          >
            <RefreshCw
              className={cn(eventsQuery.isFetching && "animate-spin")}
            />
          </Button>
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="hidden md:inline-flex"
          >
            <Plus />
            Nueva reunión
          </Button>
        </div>
      </header>

      {eventsQuery.data?.authRequired ? (
        <div className="bg-amber-500/10 text-amber-800 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 px-3 py-2 text-sm">
          <span>
            Google necesita autorización nueva para leer tu calendario.
          </span>
          <Button asChild size="sm" variant="outline">
            <Link href="/login">Volver a iniciar sesión</Link>
          </Button>
        </div>
      ) : null}

      {eventsQuery.data?.error && !eventsQuery.data.authRequired ? (
        <p className="text-destructive text-sm" role="alert">
          {eventsQuery.data.error}
        </p>
      ) : null}

      <MonthGrid
        month={monthAnchor}
        renderCell={(date) => {
          const key = format(date, "yyyy-MM-dd");
          const dayEvents = eventsByDay.get(key) ?? [];
          if (dayEvents.length === 0) return null;
          const visible = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - visible.length;
          return (
            <>
              {visible.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveEvent(event);
                  }}
                  className="bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px]"
                >
                  {!event.allDay ? (
                    <span className="font-mono shrink-0">
                      {format(new Date(event.start), "HH:mm")}
                    </span>
                  ) : null}
                  <span className="truncate">{event.summary}</span>
                </button>
              ))}
              {overflow > 0 ? (
                <span className="text-muted-foreground px-1.5 text-[11px]">
                  +{overflow} más
                </span>
              ) : null}
            </>
          );
        }}
      />

      {eventsQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando eventos…</p>
      ) : null}

      {/* Mobile FAB */}
      <Button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="fixed right-4 bottom-20 z-30 size-12 rounded-full shadow-lg md:hidden"
        size="icon"
        aria-label="Nueva reunión"
      >
        <Plus />
      </Button>

      <EventDetailSheet
        event={activeEvent}
        open={activeEvent !== null}
        onOpenChange={(open) => {
          if (!open) setActiveEvent(null);
        }}
      />

      <ResponsiveDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nueva reunión"
        description="Creá un evento en tu Google Calendar."
      >
        <MeetingForm
          onCreated={() => setCreateOpen(false)}
          onCancel={() => setCreateOpen(false)}
        />
      </ResponsiveDialog>
    </section>
  );
}
