"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { syncGmailAction } from "@/app/actions/sync";
import { showToast } from "@/components/ui/toast";
import {
  EMAILS_INVALIDATION_KEY,
  PENDING_AI_INVALIDATION_KEY,
  SYNC_LOG_INVALIDATION_KEY,
} from "@/components/inbox/use-emails";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CLIENT_COOLDOWN_MS = 30_000;
const TICK_MS = 1_000;

export function SyncButton({
  onAuthRequired,
  className,
}: {
  onAuthRequired?: () => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [cooldownEndsAt, setCooldownEndsAt] = React.useState<number | null>(
    null,
  );
  const [now, setNow] = React.useState<number>(() => Date.now());

  React.useEffect(() => {
    if (cooldownEndsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [cooldownEndsAt]);

  const remainingMs =
    cooldownEndsAt !== null ? Math.max(cooldownEndsAt - now, 0) : 0;
  const inCooldown = remainingMs > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await syncGmailAction();
      if (!result.ok) {
        throw Object.assign(new Error(result.message), { code: result.code });
      }
      return result.data;
    },
    onSuccess: async (data) => {
      setCooldownEndsAt(Date.now() + CLIENT_COOLDOWN_MS);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: EMAILS_INVALIDATION_KEY }),
        queryClient.invalidateQueries({ queryKey: SYNC_LOG_INVALIDATION_KEY }),
        queryClient.invalidateQueries({ queryKey: PENDING_AI_INVALIDATION_KEY }),
      ]);
      const pendingNote =
        data.pendingAi > 0
          ? ` · ${data.pendingAi} sin analizar`
          : "";
      if (data.inserted > 0) {
        showToast({
          title: `${data.inserted} mail${data.inserted === 1 ? "" : "s"} nuevo${data.inserted === 1 ? "" : "s"}`,
          description: data.resetHistory
            ? `Cursor expirado, rehice un pull inicial.${pendingNote}`
            : `Procesados ${data.fetched}, salteados ${data.skipped}.${pendingNote}`,
        });
      } else {
        showToast({
          title: "Bandeja al día",
          description:
            (data.fetched === 0
              ? "No hubo cambios desde la última sync."
              : `Salteados ${data.skipped} ya cacheados.`) + pendingNote,
          duration: 3500,
        });
      }
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === "auth_required") {
        onAuthRequired?.();
        return;
      }
      if (err.code === "rate_limited") {
        showToast({ title: "Demasiado seguido", description: err.message });
        return;
      }
      showToast({ title: "Sync falló", description: err.message });
    },
  });

  const syncing = mutation.isPending;
  const disabled = syncing || inCooldown;
  const label = syncing
    ? "Sincronizando…"
    : inCooldown
      ? `Esperá ${Math.ceil(remainingMs / 1000)}s`
      : "Sincronizar";

  return (
    <Button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={disabled}
      className={cn("min-w-[8rem]", className)}
    >
      <RefreshCw className={cn(syncing && "animate-spin")} />
      {label}
    </Button>
  );
}
