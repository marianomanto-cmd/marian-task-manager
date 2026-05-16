"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";

import { AGENCY_TIMEZONES } from "@/lib/timezones";
import { cn } from "@/lib/utils";

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
}

function getServerSnapshot(): number | null {
  return null;
}

function useNow(): Date | null {
  const tick = React.useSyncExternalStore(
    subscribe,
    () => Date.now(),
    getServerSnapshot,
  );
  return tick === null ? null : new Date(tick);
}

export function TimezoneClocks({
  variant = "header",
  className,
}: {
  variant?: "header" | "compact";
  className?: string;
}) {
  const now = useNow();

  // Date is shown in the user's local zone. Stays the same across clocks
  // for the vast majority of the day; using PTY (the agency's HQ tz) keeps
  // it stable for the team rather than flipping with the visitor's zone.
  const dateLabel = now
    ? formatInTimeZone(now, "America/Panama", "EEE d MMM").replace(".", "")
    : "—";

  return (
    <div
      className={cn(
        variant === "header"
          ? "hidden items-center gap-3 md:flex"
          : "flex items-center gap-3 overflow-x-auto",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col leading-tight",
          variant === "header" ? "items-end pr-2 border-r" : "items-start",
        )}
        title="Fecha actual (Panamá)"
      >
        <span className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
          Hoy
        </span>
        <span className="text-sm font-medium capitalize tabular-nums">
          {dateLabel}
        </span>
      </div>
      {AGENCY_TIMEZONES.map((tz) => {
        const time = now ? formatInTimeZone(now, tz.ianaTz, "HH:mm") : "--:--";
        return (
          <div
            key={tz.id}
            className={cn(
              "flex flex-col leading-tight",
              variant === "header" ? "items-center" : "items-start",
            )}
            title={`${tz.label} (${tz.ianaTz})`}
          >
            <span className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
              {tz.id}
            </span>
            <span className="font-mono text-sm tabular-nums">{time}</span>
          </div>
        );
      })}
    </div>
  );
}
