"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, Link2, RefreshCw, Share2, ShieldOff } from "lucide-react";

import {
  revokeMasterShareTokenAction,
  rotateMasterShareTokenAction,
} from "@/app/actions/timeliner";
import { TIMELINER_KEY } from "@/components/timeliner/use-timeliner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { showToast } from "@/components/ui/toast";

/**
 * "Compartir" for MASTER: one read-only link (`/m/<token>`) with the hitos of
 * every timeline.
 *
 * Unlike a per-timeline link, this one spans everything — whoever opens it
 * reads every project's name and dates. That makes it a team link, the
 * Timeliner counterpart of `/todos`, and the popover says so out loud rather
 * than letting someone hand it to a client by mistake.
 */
export function ShareMasterButton({ token }: { token: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const origin = useOrigin();

  const rotate = useMutation({
    mutationFn: async ({ existing }: { existing: boolean }) => {
      const res = await rotateMasterShareTokenAction();
      if (!res.ok) throw new Error(res.message);
      return { existing };
    },
    onSuccess: ({ existing }) => {
      qc.invalidateQueries({ queryKey: TIMELINER_KEY });
      showToast(
        existing
          ? {
              title: "Link nuevo generado",
              description: "El anterior dejó de funcionar.",
            }
          : { title: "Link creado", description: "Es el MASTER completo." },
      );
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const revoke = useMutation({
    mutationFn: async () => {
      const res = await revokeMasterShareTokenAction();
      if (!res.ok) throw new Error(res.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMELINER_KEY });
      showToast({
        title: "Dejaste de compartir",
        description: "El link ya no abre el MASTER.",
      });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const url = origin && token ? `${origin}/m/${token}` : null;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast({ title: "Link copiado", description: url });
    } catch {
      showToast({ title: "No pudimos copiar el link" });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Share2 />
          Compartir
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 space-y-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold">Link del MASTER</div>
          <p className="text-muted-foreground text-xs">
            Los hitos de todos los timelines en una sola página, en modo lectura
            y sin cuenta. Se actualiza sola, como los links por timeline.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-[11px] leading-relaxed">
            <span className="font-semibold">Es un link para el equipo.</span>{" "}
            Muestra <span className="font-semibold">todos</span> los proyectos —
            nombres y fechas incluidos. Si se lo pasás a un cliente, ve también
            los de los demás. Para un cliente usá el link del timeline que le
            corresponde.
          </p>
        </div>

        {token ? (
          <>
            <div className="bg-muted/40 flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1">
              <Link2 className="text-muted-foreground size-3.5 shrink-0" />
              <code className="truncate text-[11px]">{`/m/${token.slice(0, 8)}…`}</code>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="ml-auto size-6 shrink-0"
                onClick={copy}
                disabled={!url}
                aria-label="Copiar link"
              >
                <Copy className="size-3" />
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (
                    confirm(
                      "¿Generar un link nuevo? El que ya repartiste deja de funcionar.",
                    )
                  )
                    rotate.mutate({ existing: true });
                }}
                disabled={rotate.isPending}
              >
                <RefreshCw className="size-3.5" />
                Generar otro
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm("¿Dejar de compartir el MASTER?")) revoke.mutate();
                }}
                disabled={revoke.isPending}
              >
                <ShieldOff className="size-3.5" />
                Dejar de compartir
              </Button>
            </div>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => rotate.mutate({ existing: false })}
            disabled={rotate.isPending}
          >
            <Link2 />
            Crear link
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * `window.location.origin`, read through useSyncExternalStore so it is
 * available synchronously after hydration without a setState-in-effect.
 */
function useOrigin(): string | null {
  return React.useSyncExternalStore(
    () => () => {},
    () => (typeof window === "undefined" ? null : window.location.origin),
    () => null,
  );
}
