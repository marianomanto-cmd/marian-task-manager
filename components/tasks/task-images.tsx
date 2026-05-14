"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import {
  deleteTaskImageAction,
  listTaskImagesAction,
} from "@/app/actions/task-images";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { showToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type PendingImage = {
  id: string;
  blob: Blob;
  previewUrl: string;
};

export function taskImagesKey(taskId: string) {
  return ["task-images", taskId] as const;
}

function Thumb({
  url,
  pending,
  onView,
  onRemove,
}: {
  url: string;
  pending?: boolean;
  onView: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onView}
        className={cn(
          "block size-16 overflow-hidden rounded border",
          pending && "ring-primary/40 ring-2",
        )}
        title={pending ? "Sin guardar — se sube al guardar la tarea" : "Ver imagen"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Imagen de la tarea" className="size-full object-cover" />
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Quitar imagen"
          className="bg-background absolute -top-1.5 -right-1.5 rounded-full border p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

export function TaskImages({
  taskId,
  pending,
  onRemovePending,
  disabled,
}: {
  taskId: string | null;
  pending: PendingImage[];
  onRemovePending: (id: string) => void;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [viewing, setViewing] = React.useState<string | null>(null);

  const imagesQuery = useQuery({
    queryKey: taskId ? taskImagesKey(taskId) : ["task-images", "new"],
    enabled: Boolean(taskId),
    queryFn: async () => {
      const result = await listTaskImagesAction(taskId as string);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteTaskImageAction(id);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: taskImagesKey(taskId) });
      }
    },
    onError: (err: Error) => {
      showToast({ title: "No se pudo eliminar", description: err.message });
    },
  });

  const existing = imagesQuery.data ?? [];
  const hasAny = existing.length > 0 || pending.length > 0;

  return (
    <div className="space-y-1.5">
      {hasAny ? (
        <div className="flex flex-wrap gap-2">
          {existing.map((img) => (
            <Thumb
              key={img.id}
              url={img.url}
              onView={() => setViewing(img.url)}
              onRemove={
                disabled ? undefined : () => deleteMutation.mutate(img.id)
              }
            />
          ))}
          {pending.map((img) => (
            <Thumb
              key={img.id}
              url={img.previewUrl}
              pending
              onView={() => setViewing(img.previewUrl)}
              onRemove={disabled ? undefined : () => onRemovePending(img.id)}
            />
          ))}
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Pegá imágenes con Ctrl+V. Se suben al guardar la tarea.
      </p>

      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
      >
        <DialogContent className="max-w-3xl p-2 sm:max-w-3xl">
          <DialogTitle className="sr-only">Imagen de la tarea</DialogTitle>
          {viewing ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={viewing}
              alt="Imagen de la tarea"
              className="max-h-[80vh] w-full rounded object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
