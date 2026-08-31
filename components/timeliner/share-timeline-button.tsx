"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, RefreshCw, Share2, ShieldOff } from "lucide-react";

import {
  revokeTimelineShareTokenAction,
  rotateTimelineShareTokenAction,
} from "@/app/actions/timeliner";
import { TIMELINER_KEY } from "@/components/timeliner/use-timeliner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { showToast } from "@/components/ui/toast";
import type { Timeline } from "@/lib/timeliner/types";

/**
 * "Compartir" for one timeline: hands out a read-only link (`/t/<token>`) the
 * client opens without an account. The link shows this timeline only, and the
 * page it opens refreshes itself, so what the client sees follows the board.
 */
export function ShareTimelineButton({ timeline }: { timeline: Timeline }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const origin = useOrigin();

  // `existing` says whether this replaces a link already out there, which is
  // the difference between "here's your link" and "the old one just died".
  const rotate = useMutation({
    mutationFn: async ({ existing }: { existing: boolean }) => {
      const res = await rotateTimelineShareTokenAction(timeline.id);
      if (!res.ok) throw new Error(res.message);
      return { timeline: res.data, existing };
    },
    onSuccess: ({ existing }) => {
      qc.invalidateQueries({ queryKey: TIMELINER_KEY });
      showToast(
        existing
          ? {
              title: "Link nuevo generado",
              description: "El anterior dejó de funcionar.",
            }
          : { title: "Link creado", description: "Ya lo podés compartir." },
      );
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const revoke = useMutation({
    mutationFn: async () => {
      const res = await revokeTimelineShareTokenAction(timeline.id);
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMELINER_KEY });
      showToast({
        title: "Dejaste de compartir",
        description: "El link ya no abre este timeline.",
      });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const token = timeline.share_token;
  const path = token ? `/t/${token}` : null;
  const url = origin && path ? `${origin}${path}` : null;

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
          <div className="text-sm font-semibold">Link para el cliente</div>
          <p className="text-muted-foreground text-xs">
            Muestra sólo este timeline, en modo lectura y sin cuenta. La página
            se actualiza sola, así que el cliente ve los cambios apenas los
            hacés.
          </p>
        </div>

        {token ? (
          <>
            <div className="bg-muted/40 flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1">
              <Link2 className="text-muted-foreground size-3.5 shrink-0" />
              <code className="truncate text-[11px]">{`/t/${token.slice(0, 8)}…`}</code>
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
                  if (confirm("¿Dejar de compartir este timeline?"))
                    revoke.mutate();
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
