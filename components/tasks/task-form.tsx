"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import {
  createTaskAction,
  deleteTaskAction,
  updateTaskAction,
} from "@/app/actions/tasks";
import { uploadTaskImageAction } from "@/app/actions/task-images";
import { useCurrentUser } from "@/components/hooks/use-user";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { TaskComments } from "@/components/tasks/task-comments";
import {
  TaskImages,
  taskImagesKey,
  type PendingImage,
} from "@/components/tasks/task-images";
import { TASKS_INVALIDATION_KEY } from "@/components/tasks/use-tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const formSchema = z.object({
  title: z.string().trim().min(1, "Falta el título").max(500),
  notes: z.string().trim().max(8000).optional(),
  status: z.enum(TASK_STATUSES as readonly [TaskStatus, ...TaskStatus[]]),
  priority: z.enum(TASK_PRIORITIES as readonly [TaskPriority, ...TaskPriority[]]),
  due_date: z
    .string()
    .regex(dateRegex)
    .optional()
    .or(z.literal("")),
  link: z.string().trim().max(2000).optional(),
  assignee_keys: z.array(z.string()).default([]),
  notified_keys: z.array(z.string()).default([]),
});

type FormState = z.infer<typeof formSchema>;

function defaults(entry: Task | null | undefined): FormState {
  return {
    title: entry?.title ?? "",
    notes: entry?.notes ?? "",
    status: entry?.status ?? "todo",
    priority: entry?.priority ?? "medium",
    due_date: entry?.due_date ?? "",
    link: entry?.link ?? "",
    assignee_keys: entry?.assignees ?? [],
    notified_keys: entry?.notified ?? [],
  };
}

export type TaskFormProps = {
  task?: Task | null;
  onSaved?: () => void;
  onDeleted?: () => void;
  onCancel?: () => void;
};

const selectClasses = cn(
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50",
  "flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px]",
);

export function TaskForm({ task, onSaved, onDeleted, onCancel }: TaskFormProps) {
  const isEdit = Boolean(task);
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const [state, setState] = React.useState<FormState>(() => defaults(task));
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<keyof FormState | "form", string>>
  >({});
  // Images pasted before the task is saved — uploaded once we have a task id.
  const [pendingImages, setPendingImages] = React.useState<PendingImage[]>([]);
  const pendingRef = React.useRef<PendingImage[]>([]);
  React.useEffect(() => {
    pendingRef.current = pendingImages;
  }, [pendingImages]);
  React.useEffect(() => {
    // Revoke any object URLs still around when the form unmounts.
    return () => {
      pendingRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

  function removePending(id: string) {
    setPendingImages((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function handlePaste(event: React.ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length === 0) return; // let normal text paste through
    event.preventDefault();
    setPendingImages((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        blob: file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: async (input: FormState) => {
      const payload = {
        title: input.title,
        notes: input.notes?.length ? input.notes : null,
        status: input.status,
        priority: input.priority,
        due_date:
          input.due_date && input.due_date.length > 0 ? input.due_date : null,
        link: input.link && input.link.length > 0 ? input.link : null,
        assignee_keys: input.assignee_keys,
        notified_keys: input.notified_keys,
      };
      const result = task
        ? await updateTaskAction({ id: task.id, ...payload })
        : await createTaskAction(payload);
      if (!result.ok) throw new Error(result.message);
      const savedTask = result.data;

      // Now that the task exists, push up any images pasted into the form.
      for (const image of pendingImages) {
        const fd = new FormData();
        fd.append("taskId", savedTask.id);
        fd.append("file", image.blob, "pasted-image");
        const uploaded = await uploadTaskImageAction(fd);
        if (!uploaded.ok) throw new Error(uploaded.message);
      }
      return savedTask;
    },
    onSuccess: async (savedTask) => {
      pendingImages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPendingImages([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TASKS_INVALIDATION_KEY }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({
          queryKey: taskImagesKey(savedTask.id),
        }),
      ]);
      onSaved?.();
    },
    onError: (err: Error) => {
      setFieldErrors((prev) => ({ ...prev, form: err.message }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!task) throw new Error("Nada para eliminar");
      const result = await deleteTaskAction(task.id);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TASKS_INVALIDATION_KEY }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]);
      onDeleted?.();
    },
    onError: (err: Error) => {
      setFieldErrors((prev) => ({ ...prev, form: err.message }));
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    const parsed = formSchema.safeParse(state);
    if (!parsed.success) {
      const next: typeof fieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string") {
          next[key as keyof typeof next] = issue.message;
        }
      }
      setFieldErrors(next);
      return;
    }
    saveMutation.mutate(parsed.data);
  }

  const submitting = saveMutation.isPending || deleteMutation.isPending;

  // Assigned and notified are mutually exclusive: a task changes hands, so
  // adding someone to one role pulls them out of the other.
  function setAssignees(keys: string[]) {
    setState((prev) => ({
      ...prev,
      assignee_keys: keys,
      notified_keys: prev.notified_keys.filter((k) => !keys.includes(k)),
    }));
  }
  function setNotified(keys: string[]) {
    setState((prev) => ({
      ...prev,
      notified_keys: keys,
      assignee_keys: prev.assignee_keys.filter((k) => !keys.includes(k)),
    }));
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={handleSubmit}
        onPaste={handlePaste}
        className="flex flex-col gap-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="task-title">Título</Label>
          <Input
            id="task-title"
            value={state.title}
            onChange={(e) =>
              setState((prev) => ({ ...prev, title: e.target.value }))
            }
            placeholder="¿Qué hay que hacer?"
            aria-invalid={Boolean(fieldErrors.title)}
            required
          />
          {fieldErrors.title ? (
            <p className="text-destructive text-xs">{fieldErrors.title}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-notes">Notas</Label>
          <Textarea
            id="task-notes"
            value={state.notes ?? ""}
            onChange={(e) =>
              setState((prev) => ({ ...prev, notes: e.target.value }))
            }
            placeholder="Detalles, links, contexto…"
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Imágenes</Label>
          <TaskImages
            taskId={task?.id ?? null}
            pending={pendingImages}
            onRemovePending={removePending}
            disabled={submitting}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Asignados</Label>
          <AssigneePicker
            value={state.assignee_keys}
            onChange={setAssignees}
            disabled={submitting}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Notificados</Label>
          <AssigneePicker
            value={state.notified_keys}
            onChange={setNotified}
            disabled={submitting}
          />
          <p className="text-muted-foreground text-xs">
            Reciben las novedades por Slack sin ser responsables de la tarea.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="task-status">Estado</Label>
            <select
              id="task-status"
              value={state.status}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  status: e.target.value as TaskStatus,
                }))
              }
              className={selectClasses}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-priority">Prioridad</Label>
            <select
              id="task-priority"
              value={state.priority}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  priority: e.target.value as TaskPriority,
                }))
              }
              className={selectClasses}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-due">Vence</Label>
          <Input
            id="task-due"
            type="date"
            value={state.due_date ?? ""}
            onChange={(e) =>
              setState((prev) => ({ ...prev, due_date: e.target.value }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-link">Link</Label>
          <Input
            id="task-link"
            type="url"
            placeholder="https://drive.google.com/…"
            value={state.link ?? ""}
            onChange={(e) =>
              setState((prev) => ({ ...prev, link: e.target.value }))
            }
          />
        </div>

        {fieldErrors.form ? (
          <p className="text-destructive text-sm" role="alert">
            {fieldErrors.form}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {isEdit ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={submitting}
            >
              Eliminar
            </Button>
          ) : (
            <span aria-hidden />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {onCancel ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancelar
              </Button>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Guardando…"
                : isEdit
                  ? "Guardar cambios"
                  : "Crear tarea"}
            </Button>
          </div>
        </div>
      </form>

      {task ? (
        <TaskComments
          taskId={task.id}
          currentUserId={currentUser.data?.id ?? null}
        />
      ) : null}
    </div>
  );
}
