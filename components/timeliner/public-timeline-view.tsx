"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, RefreshCw } from "lucide-react";

import { getPublicTimelineAction } from "@/app/actions/timeliner-public";
import { SvarGantt } from "@/components/timeliner/svar-gantt";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  HOLIDAY_COUNTRIES,
  TIMELINE_OWNERS,
  type PublicTimelineData,
} from "@/lib/timeliner/types";
import { cn } from "@/lib/utils";

/** How often the shared view pulls a fresh snapshot while the tab is visible. */
const REFRESH_MS = 15_000;

type ViewState =
  | { kind: "ok"; data: PublicTimelineData }
  | { kind: "gone" };

/**
 * The client-facing timeline. Server-rendered once with `initial`, then kept
 * current by polling the same token-scoped read: the client watching the link
 * sees the team's edits within seconds, without reloading and without ever
 * getting a way to write.
 */
export function PublicTimelineView({
  token,
  initial,
}: {
  token: string;
  initial: PublicTimelineData;
}) {
  const query = useQuery<ViewState>({
    queryKey: ["public-timeline", token],
    initialData: { kind: "ok", data: initial },
    initialDataUpdatedAt: new Date(initial.fetched_at).getTime(),
    refetchInterval: REFRESH_MS,
    // Don't poll a tab nobody is looking at; refocusing pulls a fresh snapshot.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<ViewState> => {
      const res = await getPublicTimelineAction(token);
      if (res.ok) return { kind: "ok", data: res.data };
      // The link was revoked or rotated: stop showing the old snapshot.
      if (res.code === "forbidden" || res.code === "invalid_input") {
        return { kind: "gone" };
      }
      // Anything else is transient (network, server hiccup): keep the last
      // good snapshot on screen and let the next tick retry.
      throw new Error(res.message);
    },
  });

  const state = query.data;

  if (state.kind === "gone") {
    return (
      <>
        <ShareHeader title="Timeline" subtitle="Link no disponible" />
        <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
          <p className="text-sm font-medium">Este link ya no está disponible</p>
          <p className="text-muted-foreground mt-1 text-xs">
            El timeline dejó de compartirse o se generó un link nuevo. Pedile el
            link actualizado al equipo.
          </p>
        </main>
      </>
    );
  }

  const { timeline, groups, items, dependencies, holidays, fetched_at } =
    state.data;
  const activeCountries = HOLIDAY_COUNTRIES.filter((c) =>
    timeline.holiday_countries.includes(c.code),
  );

  return (
    <>
      <ShareHeader title={timeline.name} subtitle="Timeline · sólo lectura" />

      <main className="mx-auto flex w-full max-w-[120rem] flex-col gap-4 px-4 py-4 md:px-6 md:py-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Legend countries={activeCountries} weekends={timeline.weekends_enabled} />
          <div className="flex items-center gap-2">
            <LiveStamp fetchedAt={fetched_at} refreshing={query.isFetching} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw className={cn(query.isFetching && "animate-spin")} />
              Actualizar
            </Button>
          </div>
        </div>

        <SvarGantt
          key={timeline.id}
          timeline={timeline}
          groups={groups}
          items={items}
          dependencies={dependencies}
          holidays={holidays}
          readonly
        />

        <p className="text-muted-foreground/70 text-[11px]">
          Vista de sólo lectura. Se actualiza sola: cualquier cambio que haga el
          equipo aparece acá en segundos.
        </p>
      </main>
    </>
  );
}

function ShareHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[120rem] items-center gap-3 px-4 md:px-6 lg:px-8">
        <span className="bg-primary text-primary-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-md">
          <CalendarRange className="size-3.5" />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="text-muted-foreground text-[11px]">{subtitle}</div>
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/** Colour key: what the bars, the tinted columns and today's column mean. */
function Legend({
  countries,
  weekends,
}: {
  countries: readonly { code: string; label: string; dot: string }[];
  weekends: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
      {TIMELINE_OWNERS.map((o) => (
        <span key={o.code} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", o.dot)} />
          {o.label}
        </span>
      ))}
      {weekends ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-slate-500/60" />
          Fin de semana
        </span>
      ) : null}
      {countries.map((c) => (
        <span key={c.code} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", c.dot)} />
          Feriados {c.label}
        </span>
      ))}
    </div>
  );
}

/**
 * "Actualizado hace un rato", ticking every 10s. Rendered only after mount:
 * the elapsed time is different on the server and in the browser, and a
 * placeholder is better than a hydration mismatch.
 */
function LiveStamp({
  fetchedAt,
  refreshing,
}: {
  fetchedAt: string;
  refreshing: boolean;
}) {
  const [label, setLabel] = React.useState<string | null>(null);

  React.useEffect(() => {
    function tick() {
      setLabel(relativeLabel(new Date(fetchedAt)));
    }
    tick();
    const id = window.setInterval(tick, 10_000);
    return () => window.clearInterval(id);
  }, [fetchedAt]);

  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]">
      <span
        className={cn(
          "size-1.5 rounded-full bg-emerald-500",
          refreshing && "animate-pulse",
        )}
        aria-hidden
      />
      {refreshing ? "Actualizando…" : (label ?? "En vivo")}
    </span>
  );
}

function relativeLabel(when: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - when.getTime()) / 1000));
  if (seconds < 45) return "Actualizado recién";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return `Actualizado hace ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  const hours = Math.round(minutes / 60);
  return `Actualizado hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
}
