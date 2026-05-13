"use client";

import { Bell, ExternalLink, X } from "lucide-react";

import { useUpcomingMeetingAlerts } from "@/components/calendar/use-upcoming-alerts";
import { Button } from "@/components/ui/button";

function describeCountdown(minutes: number): string {
  if (minutes <= 0) return "Empieza ahora";
  if (minutes === 1) return "Arranca en 1 min";
  return `Arranca en ${minutes} min`;
}

export function MeetingAlertBanner() {
  const { alerts, dismiss } = useUpcomingMeetingAlerts();
  if (alerts.length === 0) return null;
  const alert = alerts[0];
  const rest = alerts.length - 1;

  return (
    <div className="bg-primary/10 border-primary/30 border-y">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 md:px-6">
        <Bell className="text-primary size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">
            {alert.event.summary}
          </p>
          <p className="text-muted-foreground text-xs">
            {describeCountdown(alert.minutesUntil)}
            {rest > 0 ? ` · +${rest} más en la próxima media hora` : ""}
          </p>
        </div>
        {alert.event.meetingUrl ? (
          <Button asChild size="sm" className="shrink-0">
            <a
              href={alert.event.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="size-3" />
              Unirse
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => dismiss(alert.event.id)}
          aria-label="Descartar alerta"
          className="size-7 shrink-0"
        >
          <X className="size-3" />
        </Button>
      </div>
    </div>
  );
}
