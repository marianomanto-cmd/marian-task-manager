import type { calendar_v3 } from "googleapis";

import { getCalendarClient } from "@/lib/gcalendar/client";
import { mapEvent } from "@/lib/gcalendar/sync";
import type { CalendarEvent } from "@/lib/gcalendar/types";

const PRIMARY_CALENDAR_ID = "primary";

export type CreateEventInput = {
  summary: string;
  description?: string | null;
  /** ISO 8601 datetime string with timezone offset, e.g. 2026-05-12T15:00:00-03:00. */
  start: string;
  /** ISO 8601 datetime string with timezone offset. */
  end: string;
  attendees: string[];
  addMeet: boolean;
  /** IANA timezone id used for the event timestamps. */
  timezone: string;
};

export async function createEvent(input: CreateEventInput): Promise<CalendarEvent> {
  const calendar = await getCalendarClient();

  const requestBody: calendar_v3.Schema$Event = {
    summary: input.summary,
    description: input.description ?? undefined,
    start: { dateTime: input.start, timeZone: input.timezone },
    end: { dateTime: input.end, timeZone: input.timezone },
    attendees: input.attendees.map((email) => ({ email })),
  };

  if (input.addMeet) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: `agency-board-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const { data } = await calendar.events.insert({
    calendarId: PRIMARY_CALENDAR_ID,
    conferenceDataVersion: input.addMeet ? 1 : 0,
    sendUpdates: input.attendees.length > 0 ? "all" : "none",
    requestBody,
  });

  const mapped = mapEvent(data);
  if (!mapped) {
    throw new Error("Google Calendar returned an event without a usable id.");
  }
  return mapped;
}
