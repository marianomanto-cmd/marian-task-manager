"use client";

import * as React from "react";
import Link from "next/link";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";

import { DayList } from "@/components/calendar/day-list";
import { EventDetailSheet } from "@/components/calendar/event-detail-sheet";
import { MeetingForm } from "@/components/calendar/meeting-form";
import { MonthGrid } from "@/components/calendar/month-grid";
import { useCalendarEvents } from "@/components/calendar/use-calendar-events";
import { WeekList } from "@/components/calendar/week-list";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CalendarEvent } from "@/lib/gcalendar/types";
import { cn } from "@/lib/utils";

const WEEK_STARTS_ON = 1 as const;

type CalendarView = "month" | "week" | "day";

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

function getRange(view: CalendarView, anchor: Date): { start: Date; end: Date } {
  switch (view) {
    case "month":
      return {
        start: startOfWeek(startOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON }),
        end: endOfWeek(endOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON }),
      };
    case "week":
      return {
        start: startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON }),
        end: endOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON }),
      };
    case "day":
      return { start: startOfDay(anchor), end: endOfDay(anchor) };
  }
}

function getTitle(view: CalendarView, anchor: Date): string {
  switch (view) {
    case "month":
      return format(anchor, "MMMM yyyy", { locale: es }).replace(/^\w/, (c) =>
        c.toUpperCase(),
      );
    case "week": {
      const start = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
      const end = endOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
      const sameMonth = start.getMonth() === end.getMonth();
      const sameYear = start.getFullYear() === end.getFullYear();
      if (sameMonth) {
        return `${format(start, "d")} – ${format(end, "d 'de' MMMM yyyy", { locale: es })}`;
      }
      if (sameYear) {
        return `${format(start, "d MMM", { locale: es })} – ${format(end, "d MMM yyyy", { locale: es })}`;
      }
      return `${format(start, "d MMM yyyy", { locale: es })} – ${format(end, "d MMM yyyy", { locale: es })}`;
    }
    case "day":
      return format(anchor, "EEEE d 'de' MMMM yyyy", { locale: es }).replace(
        /^\w/,
        (c) => c.toUpperCase(),
      );
  }
}

function shiftAnchor(view: CalendarView, anchor: Date, direction: -1 | 1): Date {
  if (view === "month") {
    return direction === -1 ? subMonths(anchor, 1) : addMonths(anchor, 1);
  }
  if (view === "week") {
    return direction === -1 ? subWeeks(anchor, 1) : addWeeks(anchor, 1);
  }
  return direction === -1 ? subDays(anchor, 1) : addDays(anchor, 1);
}

export default function CalendarPage() {
  const [view, setView] = React.useState<CalendarView>("month");
  const [anchor, setAnchor] = React.useState<Date>(() => startOfMonth(new Date()));
  const [activeEvent, setActiveEvent] = React.useState<CalendarEvent | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  const range = React.useMemo(() => getRange(view, anchor), [view, anchor]);

  const eventsQuery = useCalendarEvents(range.start, range.end);
  const events = React.useMemo(
    () => eventsQuery.data?.events ?? [],
    [eventsQuery.data?.events],
  );
  const eventsByDay = React.useMemo(() => groupEventsByDay(events), [events]);

  function goToday() {
    const now = new Date();
    if (view === "month") setAnchor(startOfMonth(now));
    else if (view === "week") setAnchor(startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON }));
    else setAnchor(startOfDay(now));
  }

  function handleViewChange(next: string) {
    const nextView = next as CalendarView;
    setView(nextView);
    // Re-anchor so the new view stays centered on the user's current focus.
    if (nextView === "month") setAnchor((a) => startOfMonth(a));
    else if (nextView === "week")
      setAnchor((a) => startOfWeek(a, { weekStartsOn: WEEK_STARTS_ON }));
    else setAnchor((a) => startOfDay(a));
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-4 md:px-6 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          {getTitle(view, anchor)}
        </h1>
        <div className="flex flex-wrap items-center gap-1">
          <Tabs value={view} onValueChange={handleViewChange}>
            <TabsList>
              <TabsTrigger value="month">Mes</TabsTrigger>
              <TabsTrigger value="week">Semana</TabsTrigger>
              <TabsTrigger value="day">Día</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setAnchor((a) => shiftAnchor(view, a, -1))}
              aria-label="Anterior"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goToday}
            >
              Hoy
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setAnchor((a) => shiftAnchor(view, a, 1))}
              aria-label="Siguiente"
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

      {view === "month" ? (
        <MonthGrid
          month={anchor}
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
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setView("day");
                      setAnchor(startOfDay(date));
                    }}
                    className="text-muted-foreground hover:text-foreground px-1.5 text-left text-[11px]"
                  >
                    +{overflow} más
                  </button>
                ) : null}
              </>
            );
          }}
        />
      ) : null}

      {view === "week" ? (
        <WeekList
          anchor={anchor}
          events={events}
          onSelectEvent={setActiveEvent}
        />
      ) : null}

      {view === "day" ? (
        <DayList
          anchor={anchor}
          events={events}
          onSelectEvent={setActiveEvent}
        />
      ) : null}

      {eventsQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando eventos…</p>
      ) : null}

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
