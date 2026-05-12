"use server";

import { z } from "zod";

import { GoogleAuthRequiredError } from "@/lib/gcalendar/client";
import { createEvent } from "@/lib/gcalendar/create";
import { listEvents } from "@/lib/gcalendar/sync";
import type { CalendarEvent } from "@/lib/gcalendar/types";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "auth_required" | "invalid_input" | "unknown"; message: string };

const listEventsSchema = z.object({
  timeMin: z.string().datetime(),
  timeMax: z.string().datetime(),
});

export async function listCalendarEventsAction(input: {
  timeMin: string;
  timeMax: string;
}): Promise<ActionResult<CalendarEvent[]>> {
  const parsed = listEventsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      message: parsed.error.message,
    };
  }

  try {
    const events = await listEvents({
      timeMin: new Date(parsed.data.timeMin),
      timeMax: new Date(parsed.data.timeMax),
    });
    return { ok: true, data: events };
  } catch (err) {
    if (err instanceof GoogleAuthRequiredError) {
      return { ok: false, code: "auth_required", message: err.message };
    }
    return {
      ok: false,
      code: "unknown",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

const createEventSchema = z.object({
  summary: z.string().trim().min(1, "El título no puede estar vacío").max(300),
  description: z.string().trim().max(8000).optional().nullable(),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  attendees: z.array(z.string().email()).max(50).default([]),
  addMeet: z.boolean().default(false),
  timezone: z.string().min(1),
});

export type CreateEventActionInput = z.infer<typeof createEventSchema>;

export async function createCalendarEventAction(
  input: unknown,
): Promise<ActionResult<CalendarEvent>> {
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      message: parsed.error.message,
    };
  }

  if (new Date(parsed.data.end) <= new Date(parsed.data.start)) {
    return {
      ok: false,
      code: "invalid_input",
      message: "La hora de fin debe ser posterior a la de inicio.",
    };
  }

  try {
    const event = await createEvent(parsed.data);
    return { ok: true, data: event };
  } catch (err) {
    if (err instanceof GoogleAuthRequiredError) {
      return { ok: false, code: "auth_required", message: err.message };
    }
    return {
      ok: false,
      code: "unknown",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
