"use client";

import * as React from "react";
import { format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";

import type { CalendarEvent } from "@/lib/gcalendar/types";

type DayListProps = {
  anchor: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
};

export function DayList({ anchor, events, onSelectEvent }: DayListProps) {
  const today = React.useMemo(() => new Date(), []);

  const { allDay, timed } = React.useMemo(() => {
    const allDay: CalendarEvent[] = [];
    const timed: CalendarEvent[] = [];
    for (const event of events) {
      if (event.allDay) allDay.push(event);
      else timed.push(event);
    }
    timed.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return { allDay, timed };
  }, [events]);

  const isToday = isSameDay(anchor, today);

  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      <div className="border-b px-3 py-2">
        <p className="text-sm font-medium">
          {format(anchor, "EEEE d 'de' MMMM yyyy", { locale: es }).replace(
            /^\w/,
            (c) => c.toUpperCase(),
          )}
        </p>
        {isToday ? (
          <p className="text-primary text-xs font-medium">Hoy</p>
        ) : null}
      </div>

      {allDay.length > 0 ? (
        <div className="border-b px-3 py-2">
          <p className="text-muted-foreground mb-1.5 text-[10px] font-medium uppercase tracking-wider">
            Todo el día
          </p>
          <ul className="space-y-1">
            {allDay.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => onSelectEvent(event)}
                  className="bg-primary/10 text-primary hover:bg-primary/20 w-full truncate rounded px-2 py-1 text-left text-sm"
                >
                  {event.summary}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {timed.length === 0 && allDay.length === 0 ? (
        <p className="text-muted-foreground px-3 py-6 text-center text-sm">
          Sin eventos este día.
        </p>
      ) : null}

      {timed.length > 0 ? (
        <ul className="divide-border divide-y">
          {timed.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onSelectEvent(event)}
                className="hover:bg-accent/40 flex w-full items-start gap-3 px-3 py-2.5 text-left"
              >
                <span className="font-mono text-muted-foreground w-20 shrink-0 text-xs tabular-nums">
                  {format(new Date(event.start), "HH:mm")}
                  <br />
                  {format(new Date(event.end), "HH:mm")}
                </span>
                <span className="flex-1 space-y-0.5">
                  <span className="block text-sm font-medium leading-snug">
                    {event.summary}
                  </span>
                  {event.location ? (
                    <span className="text-muted-foreground block text-xs">
                      {event.location}
                    </span>
                  ) : null}
                </span>
                {event.meetingUrl ? (
                  <span className="bg-primary/15 text-primary shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase">
                    Meet
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
