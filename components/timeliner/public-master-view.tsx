"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, RefreshCw } from "lucide-react";

import { getPublicMasterAction } from "@/app/actions/timeliner-public";
import { MasterView } from "@/components/timeliner/master-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import type { PublicMasterData } from "@/lib/timeliner/types";
import { cn } from "@/lib/utils";

/** How often the shared view pulls a fresh snapshot while the tab is visible. */
const REFRESH_MS = 15_000;

type ViewState = { kind: "ok"; data: PublicMasterData } | { kind: "gone" };

/**
 * The public MASTER: every timeline's hitos on one page, server-rendered once
 * and then kept current by polling — same contract as a per-timeline link,
 * and just as read-only. There is nothing to open here, so the project names
 * and hitos render as plain text rather than as links into the app.
 */
export function PublicMasterView({
  token,
  initial,
}: {
  token: string;
  initial: PublicMasterData;
}) {
  const query = useQuery<ViewState>({
    queryKey: ["public-master", token],
    initialData: { kind: "ok", data: initial },
    initialDataUpdatedAt: new Date(initial.fetched_at).getTime(),
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<ViewState> => {
      const res = await getPublicMasterAction(token);
      if (res.ok) return { kind: "ok", data: res.data };
      if (res.code === "forbidden" || res.code === "invalid_input") {
        return { kind: "gone" };
      }
      throw new Error(res.message);
    },
  });

  const state = query.data;

  if (state.kind === "gone") {
    return (
      <>
        <MasterHeader subtitle="Link no disponible" />
        <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
          <p className="text-sm font-medium">Este link ya no está disponible</p>
          <p className="text-muted-foreground mt-1 text-xs">
            El MASTER dejó de compartirse o se generó un link nuevo. Pedile el
            link actualizado al equipo.
          </p>
        </main>
      </>
    );
  }

  const { timelines, items, groups, fetched_at } = state.data;

  return (
    <>
      <MasterHeader subtitle="Todos los proyectos · sólo lectura" />

      <main className="mx-auto flex w-full max-w-[120rem] flex-col gap-4 px-4 py-4 md:px-6 md:py-6 lg:px-8">
        <div className="flex items-center justify-end gap-2">
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

        <MasterView timelines={timelines} items={items} groups={groups} />

        <p className="text-muted-foreground/70 text-[11px]">
          Vista de sólo lectura. Se actualiza sola: cualquier cambio que haga el
          equipo aparece acá en segundos.
        </p>
      </main>
    </>
  );
}

function MasterHeader({ subtitle }: { subtitle: string }) {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[120rem] items-center gap-3 px-4 md:px-6 lg:px-8">
        <span className="bg-primary text-primary-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-md">
          <LayoutGrid className="size-3.5" />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold">MASTER</div>
          <div className="text-muted-foreground text-[11px]">{subtitle}</div>
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/**
 * "Actualizado hace un rato", ticking every 10s. Rendered only after mount:
 * the elapsed time differs between server and browser, and a placeholder
 * beats a hydration mismatch.
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
