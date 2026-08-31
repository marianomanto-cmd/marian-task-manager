"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import {
  deleteTimelineDependencyAction,
  updateTimelineDependencyAction,
} from "@/app/actions/timeliner";
import { TIMELINER_KEY } from "@/components/timeliner/use-timeliner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { showToast } from "@/components/ui/toast";
import {
  DEPENDENCY_TYPE_LABELS,
  type TimelineDependency,
  type TimelineDependencyType,
  type TimelineItem,
} from "@/lib/timeliner/types";
import { cn } from "@/lib/utils";

const TYPES = Object.keys(DEPENDENCY_TYPE_LABELS) as TimelineDependencyType[];

/**
 * What opens when you click an arrow. Links are made by dragging, so this is
 * only for the two things a drag can't say: which pair of endpoints the link
 * joins, and how many days of margin it keeps.
 *
 * Mounted under the arrow's id, so opening a different arrow gets fresh fields.
 */
export function DependencyEditor({
  dependency,
  from,
  to,
  onClose,
}: {
  dependency: TimelineDependency | null;
  from: TimelineItem | undefined;
  to: TimelineItem | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [depType, setDepType] = React.useState<TimelineDependencyType>(
    dependency?.dep_type ?? "FS",
  );
  const [lag, setLag] = React.useState<number>(dependency?.lag_days ?? 0);

  const invalidate = () => qc.invalidateQueries({ queryKey: TIMELINER_KEY });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await updateTimelineDependencyAction({
        id: dependency!.id,
        dep_type: depType,
        lag_days: lag,
      });
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      onClose();
      invalidate();
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await deleteTimelineDependencyAction(dependency!.id);
      if (!res.ok) throw new Error(res.message);
    },
    onSuccess: () => {
      onClose();
      invalidate();
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  return (
    <ResponsiveDialog
      open={dependency !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Dependencia"
      description={
        from && to ? `${from.title} → ${to.title}` : "Vínculo entre dos tareas"
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs font-medium">
            Tipo
          </label>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDepType(t)}
                className={cn(
                  "flex h-9 items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors",
                  depType === t
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent",
                )}
              >
                <span className="font-semibold">{t}</span>
                <span className="opacity-80">{DEPENDENCY_TYPE_LABELS[t]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-muted-foreground text-xs font-medium">
            Margen (días)
          </label>
          <Input
            type="number"
            value={lag}
            onChange={(e) => setLag(Number(e.target.value) || 0)}
          />
          <p className="text-muted-foreground text-[11px]">
            Días de aire entre las dos tareas. Negativo = se pisan.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="size-4" />
            Eliminar
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            Guardar
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
