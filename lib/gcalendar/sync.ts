import type { calendar_v3 } from "googleapis";

import { getCalendarClient } from "@/lib/gcalendar/client";
import type {
  CalendarEvent,
  CalendarEventAttendee,
} from "@/lib/gcalendar/types";

const PRIMARY_CALENDAR_ID = "primary";

function toIso(
  point: calendar_v3.Schema$EventDateTime | undefined,
): { iso: string; allDay: boolean } | null {
  if (!point) return null;
  if (point.dateTime) return { iso: point.dateTime, allDay: false };
  if (point.date) {
    // All-day events come as YYYY-MM-DD. Anchor at UTC midnight so JS Date
    // comparisons are stable across timezones.
    return { iso: `${point.date}T00:00:00.000Z`, allDay: true };
  }
  return null;
}

function mapAttendee(
  attendee: calendar_v3.Schema$EventAttendee,
): CalendarEventAttendee {
  return {
    email: attendee.email ?? "",
    displayName: attendee.displayName ?? null,
    responseStatus:
      (attendee.responseStatus as CalendarEventAttendee["responseStatus"]) ??
      null,
    organizer: attendee.organizer === true,
    self: attendee.self === true,
  };
}

function extractMeetingUrl(event: calendar_v3.Schema$Event): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  const entry = event.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video" && e.uri,
  );
  return entry?.uri ?? null;
}

export function mapEvent(event: calendar_v3.Schema$Event): CalendarEvent | null {
  if (!event.id) return null;
  const start = toIso(event.start);
  const end = toIso(event.end);
  if (!start || !end) return null;

  return {
    id: event.id,
    summary: event.summary ?? "(sin título)",
    description: event.description ?? null,
    location: event.location ?? null,
    start: start.iso,
    end: end.iso,
    allDay: start.allDay || end.allDay,
    meetingUrl: extractMeetingUrl(event),
    htmlLink: event.htmlLink ?? null,
    attendees: (event.attendees ?? []).map(mapAttendee),
    status: (event.status as CalendarEvent["status"]) ?? null,
  };
}

export type ListEventsOptions = {
  timeMin: Date;
  timeMax: Date;
  maxResults?: number;
};

export async function listEvents(
  options: ListEventsOptions,
): Promise<CalendarEvent[]> {
  const calendar = await getCalendarClient();
  const { data } = await calendar.events.list({
    calendarId: PRIMARY_CALENDAR_ID,
    timeMin: options.timeMin.toISOString(),
    timeMax: options.timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: options.maxResults ?? 250,
  });

  return (data.items ?? [])
    .map(mapEvent)
    .filter((e): e is CalendarEvent => e !== null);
}
