"use client";

import * as React from "react";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";

import type { CalendarEvent } from "@/lib/gcalendar/types";
import { cn } from "@/lib/utils";

const WEEK_STARTS_ON = 1 as const;

type WeekListProps = {
  anchor: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
};

export function WeekList({ anchor, events, onSelectEvent }: WeekListProps) {
  const today = React.useMemo(() => new Date(), []);
  const weekStart = React.useMemo(
    () => startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON }),
    [anchor],
  );

  const byDay = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = format(new Date(event.start), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
    }
    return map;
  }, [events]);

  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 7 }).map((_, i) => {
        const date = addDays(weekStart, i);
        const key = format(date, "yyyy-MM-dd");
        const dayEvents = byDay.get(key) ?? [];
        const isToday = isSameDay(date, today);

        return (
          <div
            key={key}
            className={cn(
              "bg-card overflow-hidden rounded-lg border",
              isToday && "border-primary/40",
            )}
          >
            <div
              className={cn(
                "flex items-baseline justify-between border-b px-3 py-1.5",
                isToday && "bg-primary/10",
              )}
            >
              <span className="text-sm font-medium">
                {format(date, "EEEE d", { locale: es }).replace(/^\w/, (c) =>
                  c.toUpperCase(),
                )}
              </span>
              <span className="text-muted-foreground text-xs">
                {format(date, "d MMM", { locale: es })}
              </span>
            </div>
            {dayEvents.length === 0 ? (
              <p className="text-muted-foreground px-3 py-3 text-xs">
                Sin eventos
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {dayEvents.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => onSelectEvent(event)}
                      className="hover:bg-accent/40 flex w-full items-center gap-3 px-3 py-2 text-left text-sm"
                    >
                      <span className="font-mono text-muted-foreground w-20 shrink-0 text-xs tabular-nums">
                        {event.allDay
                          ? "Todo el día"
                          : `${format(new Date(event.start), "HH:mm")}–${format(new Date(event.end), "HH:mm")}`}
                      </span>
                      <span className="flex-1 truncate">{event.summary}</span>
                      {event.meetingUrl ? (
                        <span className="bg-primary/15 text-primary shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase">
                          Meet
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
