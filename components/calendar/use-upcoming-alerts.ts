"use client";

import * as React from "react";
import { addHours, startOfHour } from "date-fns";

import { useCalendarEvents } from "@/components/calendar/use-calendar-events";
import { showToast } from "@/components/ui/toast";
import type { CalendarEvent } from "@/lib/gcalendar/types";

const TICK_INTERVAL_MS = 30_000;
const IMMINENT_WINDOW_MIN = 15;
const TOAST_WINDOW_MIN = 5;

export type ActiveMeetingAlert = {
  event: CalendarEvent;
  minutesUntil: number;
};

function subscribeTick(onChange: () => void) {
  const id = setInterval(onChange, TICK_INTERVAL_MS);
  return () => clearInterval(id);
}

function getTickSnapshot(): number {
  return Math.floor(Date.now() / TICK_INTERVAL_MS);
}

function getTickServerSnapshot(): number {
  return 0;
}

function useTick(): number {
  return React.useSyncExternalStore(
    subscribeTick,
    getTickSnapshot,
    getTickServerSnapshot,
  );
}

export function useUpcomingMeetingAlerts(): {
  alerts: ActiveMeetingAlert[];
  dismiss: (eventId: string) => void;
} {
  // Snap range to startOfHour so the React Query key only changes hourly.
  const range = React.useMemo(() => {
    const start = startOfHour(new Date());
    return { start, end: addHours(start, 25) };
  }, []);

  const eventsQuery = useCalendarEvents(range.start, range.end);
  const tick = useTick();
  // Derive `now` from the external tick so this hook stays pure during render.
  // Loses up to 30s of precision, fine for minute-rounded countdowns.
  const now = tick * TICK_INTERVAL_MS;

  const [dismissed, setDismissed] = React.useState<Set<string>>(
    () => new Set(),
  );
  const toastedRef = React.useRef<Set<string>>(new Set());

  const alerts = React.useMemo<ActiveMeetingAlert[]>(() => {
    const events = eventsQuery.data?.events ?? [];
    return events
      .filter((e) => !e.allDay && !dismissed.has(e.id))
      .map((e) => ({
        event: e,
        minutesUntil: Math.round(
          (new Date(e.start).getTime() - now) / 60_000,
        ),
      }))
      .filter(
        ({ minutesUntil }) =>
          minutesUntil >= -2 && minutesUntil <= IMMINENT_WINDOW_MIN,
      )
      .sort((a, b) => a.minutesUntil - b.minutesUntil);
  }, [eventsQuery.data?.events, dismissed, now]);

  React.useEffect(() => {
    for (const alert of alerts) {
      if (alert.minutesUntil < 0 || alert.minutesUntil > TOAST_WINDOW_MIN) {
        continue;
      }
      if (toastedRef.current.has(alert.event.id)) continue;
      toastedRef.current.add(alert.event.id);
      showToast({
        title: `${alert.event.summary} en ${Math.max(alert.minutesUntil, 1)} min`,
        description: alert.event.meetingUrl
          ? "El link de Meet está listo."
          : undefined,
        action: alert.event.meetingUrl
          ? {
              label: "Unirse",
              onClick: () => {
                window.open(alert.event.meetingUrl!, "_blank", "noopener");
              },
            }
          : undefined,
        duration: 10_000,
      });
    }
  }, [alerts]);

  const dismiss = React.useCallback((eventId: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(eventId);
      return next;
    });
  }, []);

  return { alerts, dismiss };
}
