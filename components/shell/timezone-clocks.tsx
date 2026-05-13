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

  return (
    <div
      className={cn(
        variant === "header"
          ? "hidden items-center gap-4 md:flex"
          : "flex items-center gap-3 overflow-x-auto",
        className,
      )}
    >
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
