"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { analyzePendingEmailsAction } from "@/app/actions/analyze";
import {
  EMAILS_INVALIDATION_KEY,
  PENDING_AI_INVALIDATION_KEY,
  SYNC_LOG_INVALIDATION_KEY,
} from "@/components/inbox/use-emails";
import { TASKS_INVALIDATION_KEY } from "@/components/tasks/use-tasks";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type AnalyzeButtonProps = {
  pendingCount?: number;
  className?: string;
};

export function AnalyzeButton({ pendingCount, className }: AnalyzeButtonProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await analyzePendingEmailsAction();
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: EMAILS_INVALIDATION_KEY }),
        queryClient.invalidateQueries({ queryKey: SYNC_LOG_INVALIDATION_KEY }),
        queryClient.invalidateQueries({ queryKey: PENDING_AI_INVALIDATION_KEY }),
        queryClient.invalidateQueries({ queryKey: TASKS_INVALIDATION_KEY }),
      ]);
      if (data.processed === 0) {
        showToast({
          title: "Sin pendientes",
          description: "No hay mails para analizar.",
          duration: 3500,
        });
        return;
      }
      const costLabel = data.estimatedCostUsd
        ? ` · ~$${data.estimatedCostUsd.toFixed(4)} USD`
        : "";
      const restLabel =
        data.pendingRemaining > 0
          ? ` · quedan ${data.pendingRemaining} pendientes`
          : "";
      const tasksLabel =
        data.tasksCreated > 0
          ? ` · ${data.tasksCreated} tarea${data.tasksCreated === 1 ? "" : "s"} creada${data.tasksCreated === 1 ? "" : "s"}`
          : "";
      showToast({
        title: `${data.processed} mail${data.processed === 1 ? "" : "s"} analizado${data.processed === 1 ? "" : "s"}`,
        description: `Claude clasificó la bandeja${tasksLabel}.${costLabel}${restLabel}`,
        duration: 8_000,
      });
    },
    onError: (err: Error) => {
      showToast({ title: "Análisis falló", description: err.message });
    },
  });

  const analyzing = mutation.isPending;
  const hasPending = typeof pendingCount === "number" && pendingCount > 0;
  const label = analyzing
    ? "Analizando…"
    : hasPending
      ? `Analizar (${pendingCount})`
      : "Analizar con IA";

  return (
    <Button
      type="button"
      variant={hasPending ? "default" : "outline"}
      onClick={() => mutation.mutate()}
      disabled={analyzing || pendingCount === 0}
      className={cn("min-w-[10rem]", className)}
      title={
        pendingCount === 0
          ? "Sin mails pendientes de clasificar"
          : "Clasificar los mails que aún no fueron analizados (consume tokens)"
      }
    >
      <Sparkles className={cn(analyzing && "animate-pulse")} />
      {label}
    </Button>
  );
}
