"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { listCalendarEventsAction } from "@/app/actions/calendar";
import type { CalendarEvent } from "@/lib/gcalendar/types";

export type CalendarEventsResult =
  | { events: CalendarEvent[]; authRequired: false; error: null }
  | { events: []; authRequired: true; error: string }
  | { events: []; authRequired: false; error: string };

export function calendarEventsQueryKey(timeMin: Date, timeMax: Date) {
  return ["calendar-events", timeMin.toISOString(), timeMax.toISOString()] as const;
}

export function useCalendarEvents(
  timeMin: Date,
  timeMax: Date,
): UseQueryResult<CalendarEventsResult> {
  return useQuery({
    queryKey: calendarEventsQueryKey(timeMin, timeMax),
    staleTime: 60_000,
    queryFn: async (): Promise<CalendarEventsResult> => {
      const result = await listCalendarEventsAction({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
      });
      if (result.ok) {
        return { events: result.data, authRequired: false, error: null };
      }
      if (result.code === "auth_required") {
        return { events: [], authRequired: true, error: result.message };
      }
      return { events: [], authRequired: false, error: result.message };
    },
  });
}
