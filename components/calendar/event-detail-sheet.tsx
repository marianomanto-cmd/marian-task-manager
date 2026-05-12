"use client";

import * as React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Check, ExternalLink, MapPin, Video, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsDesktop } from "@/components/hooks/use-is-desktop";
import type {
  CalendarEvent,
  CalendarEventAttendee,
} from "@/lib/gcalendar/types";
import { cn } from "@/lib/utils";

function statusBadge(status: CalendarEventAttendee["responseStatus"]) {
  switch (status) {
    case "accepted":
      return { label: "Aceptó", className: "text-emerald-600", icon: Check };
    case "declined":
      return { label: "Rechazó", className: "text-destructive", icon: X };
    case "tentative":
      return { label: "Tal vez", className: "text-amber-600", icon: Check };
    default:
      return { label: "Pendiente", className: "text-muted-foreground", icon: Check };
  }
}

function formatRange(event: CalendarEvent): string {
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (event.allDay) {
    return format(start, "EEEE d 'de' MMMM", { locale: es });
  }
  const sameDay = start.toDateString() === end.toDateString();
  const dateStr = format(start, "EEEE d 'de' MMMM", { locale: es });
  const timeStr = `${format(start, "HH:mm")} – ${format(end, "HH:mm")}`;
  return sameDay
    ? `${dateStr} · ${timeStr}`
    : `${format(start, "d MMM HH:mm", { locale: es })} – ${format(end, "d MMM HH:mm", { locale: es })}`;
}

export type EventDetailSheetProps = {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EventDetailSheet({
  event,
  open,
  onOpenChange,
}: EventDetailSheetProps) {
  const isDesktop = useIsDesktop();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          isDesktop ? "sm:max-w-md" : "max-h-[85vh]",
        )}
      >
        {event ? (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="pr-8 text-base">{event.summary}</SheetTitle>
              <SheetDescription className="text-xs">
                {formatRange(event)}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm">
              {event.location ? (
                <div className="flex items-start gap-2">
                  <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  <span>{event.location}</span>
                </div>
              ) : null}

              {event.meetingUrl ? (
                <Button asChild className="w-full">
                  <a
                    href={event.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Video />
                    Unirse al Meet
                  </a>
                </Button>
              ) : null}

              {event.description ? (
                <div className="space-y-1.5">
                  <p className="text-muted-foreground text-xs font-medium uppercase">
                    Descripción
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    {event.description}
                  </p>
                </div>
              ) : null}

              {event.attendees.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-muted-foreground text-xs font-medium uppercase">
                    Asistentes ({event.attendees.length})
                  </p>
                  <ul className="space-y-1">
                    {event.attendees.map((attendee) => {
                      const badge = statusBadge(attendee.responseStatus);
                      const Icon = badge.icon;
                      return (
                        <li
                          key={attendee.email}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="truncate">
                            {attendee.displayName ?? attendee.email}
                            {attendee.organizer ? (
                              <span className="text-muted-foreground ml-1 text-xs">
                                · organizador
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1 text-xs",
                              badge.className,
                            )}
                          >
                            <Icon className="size-3" />
                            {badge.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>

            {event.htmlLink ? (
              <div className="border-t p-4">
                <Button asChild variant="ghost" className="w-full">
                  <a
                    href={event.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink />
                    Abrir en Google Calendar
                  </a>
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
