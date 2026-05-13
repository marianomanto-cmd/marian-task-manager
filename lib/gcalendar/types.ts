export type CalendarEventAttendee = {
  email: string;
  displayName: string | null;
  responseStatus: "accepted" | "declined" | "tentative" | "needsAction" | null;
  organizer: boolean;
  self: boolean;
};

export type CalendarEvent = {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  /**
   * ISO 8601 string (UTC). For all-day events this is a date at 00:00 in the
   * event's local timezone, normalized to an ISO timestamp at UTC midnight.
   */
  start: string;
  end: string;
  allDay: boolean;
  meetingUrl: string | null;
  htmlLink: string | null;
  attendees: CalendarEventAttendee[];
  status: "confirmed" | "tentative" | "cancelled" | null;
};
