"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Share2, ShieldOff } from "lucide-react";

import {
  getShareTokenAction,
  revokeShareTokenAction,
  rotateShareTokenAction,
} from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { showToast } from "@/components/ui/toast";

const SHARE_KEY = ["projects-share-token"] as const;

export function ShareButton() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const tokenQuery = useQuery({
    queryKey: SHARE_KEY,
    staleTime: 60_000,
    enabled: open,
    queryFn: async () => {
      const result = await getShareTokenAction();
      if (!result.ok) throw new Error(result.message);
      return result.data.token;
    },
  });

  const rotateMutation = useMutation({
    mutationFn: async () => {
      const result = await rotateShareTokenAction();
      if (!result.ok) throw new Error(result.message);
      return result.data.token;
    },
    onSuccess: (token) => {
      qc.setQueryData(SHARE_KEY, token);
      showToast({
        title: "Link generado",
        description:
          "El link anterior dejó de funcionar. Copiá el nuevo y mandáselo al cliente.",
      });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      const result = await revokeShareTokenAction();
      if (!result.ok) throw new Error(result.message);
      return result.data.token;
    },
    onSuccess: (token) => {
      qc.setQueryData(SHARE_KEY, token);
      showToast({
        title: "Link revocado",
        description: "Nadie con el link anterior puede ver el board.",
      });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const token = tokenQuery.data ?? null;
  const url = useShareUrl(token);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast({ title: "Link copiado" });
    } catch {
      showToast({ title: "No pudimos copiar el link" });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Share2 className="size-3.5" />
          Compartir
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold">Compartir con cliente</div>
          <p className="text-muted-foreground text-xs">
            Link público de sólo lectura. No requiere login. Mostrá solamente
            tareas activas (las archivadas no se ven).
          </p>
        </div>

        {tokenQuery.isLoading ? (
          <p className="text-muted-foreground text-xs">Cargando…</p>
        ) : token && url ? (
          <>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5">
              <Link2 className="text-muted-foreground size-3.5 shrink-0" />
              <code className="truncate text-[11px]">{url}</code>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="ml-auto size-7"
                onClick={copy}
                aria-label="Copiar"
              >
                <Copy className="size-3.5" />
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
                      "¿Generar un link nuevo? El anterior deja de funcionar.",
                    )
                  )
                    rotateMutation.mutate();
                }}
                disabled={rotateMutation.isPending}
              >
                Rotar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm("¿Revocar el link compartido?"))
                    revokeMutation.mutate();
                }}
                disabled={revokeMutation.isPending}
              >
                <ShieldOff className="size-3.5" />
                Revocar
              </Button>
            </div>
          </>
        ) : (
          <Button
            type="button"
            className="w-full"
            onClick={() => rotateMutation.mutate()}
            disabled={rotateMutation.isPending}
          >
            <Link2 />
            Generar link
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function useShareUrl(token: string | null): string | null {
  // Read window.location.origin once on the client. We use useSyncExternalStore
  // so the value is available synchronously after hydration, no setState in effect.
  const origin = React.useSyncExternalStore(
    () => () => {},
    () =>
      typeof window === "undefined" ? null : window.location.origin,
    () => null,
  );
  if (!token || !origin) return null;
  return `${origin}/p/${token}`;
}
