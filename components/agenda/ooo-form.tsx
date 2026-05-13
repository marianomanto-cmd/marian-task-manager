"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { z } from "zod";

import {
  createOooAction,
  deleteOooAction,
  updateOooAction,
} from "@/app/actions/ooo";
import { OOO_INVALIDATION_KEY } from "@/components/agenda/use-ooo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OooEntry } from "@/lib/ooo/types";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const formSchema = z
  .object({
    member_name: z.string().trim().min(1, "Falta el nombre").max(200),
    start_date: z.string().regex(dateRegex, "Formato YYYY-MM-DD"),
    end_date: z.string().regex(dateRegex, "Formato YYYY-MM-DD"),
    reason: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.end_date >= v.start_date, {
    path: ["end_date"],
    message: "Debe ser igual o posterior al inicio",
  });

type FormState = z.infer<typeof formSchema>;

function todayString(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function defaultsForEntry(entry: OooEntry | null | undefined): FormState {
  return {
    member_name: entry?.member_name ?? "",
    start_date: entry?.start_date ?? todayString(),
    end_date: entry?.end_date ?? todayString(),
    reason: entry?.reason ?? "",
  };
}

export type OOOFormProps = {
  entry?: OooEntry | null;
  defaultStartDate?: string;
  onSaved?: () => void;
  onDeleted?: () => void;
  onCancel?: () => void;
};

export function OOOForm({
  entry,
  defaultStartDate,
  onSaved,
  onDeleted,
  onCancel,
}: OOOFormProps) {
  const isEdit = Boolean(entry);
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<FormState>(() => {
    const base = defaultsForEntry(entry);
    if (!entry && defaultStartDate) {
      return { ...base, start_date: defaultStartDate, end_date: defaultStartDate };
    }
    return base;
  });
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<keyof FormState | "form", string>>
  >({});

  const saveMutation = useMutation({
    mutationFn: async (input: FormState) => {
      const payload = {
        member_name: input.member_name,
        start_date: input.start_date,
        end_date: input.end_date,
        reason: input.reason?.length ? input.reason : null,
      };
      const result = entry
        ? await updateOooAction({ id: entry.id, ...payload })
        : await createOooAction(payload);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: OOO_INVALIDATION_KEY });
      onSaved?.();
    },
    onError: (err: Error) => {
      setFieldErrors((prev) => ({ ...prev, form: err.message }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!entry) throw new Error("Nada para eliminar");
      const result = await deleteOooAction(entry.id);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: OOO_INVALIDATION_KEY });
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="ooo-name">Miembro del equipo</Label>
        <Input
          id="ooo-name"
          value={state.member_name}
          onChange={(e) =>
            setState((prev) => ({ ...prev, member_name: e.target.value }))
          }
          placeholder="Nombre o alias"
          aria-invalid={Boolean(fieldErrors.member_name)}
          required
        />
        {fieldErrors.member_name ? (
          <p className="text-destructive text-xs">{fieldErrors.member_name}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ooo-start">Desde</Label>
          <Input
            id="ooo-start"
            type="date"
            value={state.start_date}
            onChange={(e) =>
              setState((prev) => ({ ...prev, start_date: e.target.value }))
            }
            aria-invalid={Boolean(fieldErrors.start_date)}
            required
          />
          {fieldErrors.start_date ? (
            <p className="text-destructive text-xs">{fieldErrors.start_date}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ooo-end">Hasta</Label>
          <Input
            id="ooo-end"
            type="date"
            value={state.end_date}
            onChange={(e) =>
              setState((prev) => ({ ...prev, end_date: e.target.value }))
            }
            aria-invalid={Boolean(fieldErrors.end_date)}
            required
          />
          {fieldErrors.end_date ? (
            <p className="text-destructive text-xs">{fieldErrors.end_date}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ooo-reason">Motivo</Label>
        <Textarea
          id="ooo-reason"
          value={state.reason ?? ""}
          onChange={(e) =>
            setState((prev) => ({ ...prev, reason: e.target.value }))
          }
          placeholder="Opcional — vacaciones, licencia, viaje…"
          rows={2}
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
                : "Cargar OOO"}
          </Button>
        </div>
      </div>
    </form>
  );
}
