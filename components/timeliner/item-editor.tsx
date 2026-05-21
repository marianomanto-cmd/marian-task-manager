"use client";

import * as React from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag, ListTodo, Trash2 } from "lucide-react";

import {
  createTimelineItemAction,
  deleteTimelineItemAction,
  updateTimelineItemAction,
} from "@/app/actions/timeliner";
import { OwnerPicker } from "@/components/timeliner/owner-picker";
import { TIMELINER_KEY } from "@/components/timeliner/use-timeliner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { showToast } from "@/components/ui/toast";
import type {
  TimelineGroup,
  TimelineItem,
  TimelineItemKind,
} from "@/lib/timeliner/types";
import { cn } from "@/lib/utils";

const selectClass = cn(
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50",
  "h-9 w-full rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]",
);

export function ItemEditor({
  open,
  onOpenChange,
  timelineId,
  groups,
  item,
  defaultStart,
  defaultKind = "task",
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  timelineId: string;
  groups: TimelineGroup[];
  item: TimelineItem | null;
  /** YYYY-MM-DD default start when creating. */
  defaultStart: string;
  defaultKind?: TimelineItemKind;
}) {
  const qc = useQueryClient();
  const editing = item !== null;

  const [title, setTitle] = React.useState(item?.title ?? "");
  const [groupId, setGroupId] = React.useState<string>(item?.group_id ?? "");
  const [ownerKey, setOwnerKey] = React.useState<string | null>(
    item?.owner_key ?? null,
  );
  const [kind, setKind] = React.useState<TimelineItemKind>(
    item?.kind ?? defaultKind,
  );
  const [start, setStart] = React.useState(item?.start_date ?? defaultStart);
  const [duration, setDuration] = React.useState<number>(
    item
      ? differenceInCalendarDays(parseISO(item.end_date), parseISO(item.start_date)) + 1
      : 3,
  );

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: TIMELINER_KEY });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const days = kind === "milestone" ? 1 : Math.max(1, duration);
      const end = format(addDays(parseISO(start), days - 1), "yyyy-MM-dd");
      if (editing) {
        const res = await updateTimelineItemAction({
          id: item!.id,
          group_id: groupId || null,
          title: title.trim(),
          owner_key: ownerKey,
          start_date: start,
          end_date: end,
          kind,
        });
        if (!res.ok) throw new Error(res.message);
        return res.data;
      }
      const res = await createTimelineItemAction({
        timeline_id: timelineId,
        group_id: groupId || null,
        title: title.trim(),
        owner_key: ownerKey,
        start_date: start,
        end_date: end,
        kind,
      });
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      onOpenChange(false);
      invalidate();
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await deleteTimelineItemAction(item!.id);
      if (!res.ok) throw new Error(res.message);
    },
    onSuccess: () => {
      onOpenChange(false);
      invalidate();
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const canSave = title.trim().length > 0 && !saveMutation.isPending;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar" : "Nuevo elemento"}
      description="Tarea con duración o hito en una fecha puntual."
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <KindButton
            active={kind === "task"}
            onClick={() => setKind("task")}
            icon={<ListTodo className="size-4" />}
            label="Tarea"
          />
          <KindButton
            active={kind === "milestone"}
            onClick={() => setKind("milestone")}
            icon={<Flag className="size-4" />}
            label="Hito"
          />
        </div>

        <div className="space-y-1">
          <label className="text-muted-foreground text-xs font-medium">
            Título
          </label>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (canSave) saveMutation.mutate();
              }
            }}
            placeholder={kind === "milestone" ? "Ej: Kickoff" : "Ej: Diseño de piezas"}
          />
        </div>

        <div className="space-y-1">
          <label className="text-muted-foreground text-xs font-medium">
            Owner
          </label>
          <OwnerPicker value={ownerKey} onChange={setOwnerKey} />
        </div>

        <div className="space-y-1">
          <label className="text-muted-foreground text-xs font-medium">
            Grupo
          </label>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className={selectClass}
            aria-label="Grupo"
          >
            <option value="">Sin grupo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className={cn("grid gap-2", kind === "task" ? "grid-cols-2" : "grid-cols-1")}>
          <div className="space-y-1">
            <label className="text-muted-foreground text-xs font-medium">
              {kind === "milestone" ? "Fecha" : "Inicio"}
            </label>
            <Input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value || start)}
            />
          </div>
          {kind === "task" ? (
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs font-medium">
                Duración (días)
              </label>
              <Input
                type="number"
                min={1}
                value={duration}
                onChange={(e) =>
                  setDuration(Math.max(1, Number(e.target.value) || 1))
                }
              />
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {editing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm("¿Eliminar este elemento?")) deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="size-4" />
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!canSave}
          >
            {editing ? "Guardar" : "Agregar"}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function KindButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background hover:bg-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
