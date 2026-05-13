"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fromZonedTime } from "date-fns-tz";
import { X } from "lucide-react";
import { z } from "zod";

import {
  createCalendarEventAction,
  type CreateEventActionInput,
} from "@/app/actions/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  summary: z.string().trim().min(1, "Falta el título").max(300),
  description: z.string().trim().max(8000).optional(),
  startLocal: z
    .string()
    .min(1, "Elegí fecha y hora")
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
      "Formato inválido. Esperaba YYYY-MM-DDTHH:mm",
    ),
  durationMinutes: z.coerce.number().int().min(5).max(8 * 60),
  attendees: z.array(z.string().email()).max(50),
  addMeet: z.boolean(),
});

type FormState = z.infer<typeof formSchema>;

const DURATION_OPTIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 h" },
  { value: 90, label: "1 h 30" },
  { value: 120, label: "2 h" },
];

function defaultStartLocal(now: Date): string {
  // Round up to next half-hour, keep it as the local "YYYY-MM-DDTHH:mm" string.
  const next = new Date(now);
  next.setSeconds(0, 0);
  const extra = 30 - (next.getMinutes() % 30);
  next.setMinutes(next.getMinutes() + (extra === 30 ? 30 : extra));
  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  const hh = String(next.getHours()).padStart(2, "0");
  const mi = String(next.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export type MeetingFormProps = {
  onCreated?: () => void;
  onCancel?: () => void;
};

export function MeetingForm({ onCreated, onCancel }: MeetingFormProps) {
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<FormState>(() => ({
    summary: "",
    description: "",
    startLocal: defaultStartLocal(new Date()),
    durationMinutes: 30,
    attendees: [],
    addMeet: true,
  }));
  const [attendeeDraft, setAttendeeDraft] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<keyof FormState | "attendees" | "form", string>>
  >({});

  const mutation = useMutation({
    mutationFn: async (input: CreateEventActionInput) => {
      const result = await createCalendarEventAction(input);
      if (!result.ok) {
        throw new Error(result.message || "No se pudo crear la reunión");
      }
      return result.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      onCreated?.();
    },
    onError: (err: Error) => {
      setFieldErrors((prev) => ({ ...prev, form: err.message }));
    },
  });

  function addAttendeeFromDraft() {
    const raw = attendeeDraft.trim().replace(/,$/, "");
    if (!raw) return;
    const parsed = z.string().email().safeParse(raw);
    if (!parsed.success) {
      setFieldErrors((prev) => ({ ...prev, attendees: "Email inválido" }));
      return;
    }
    if (state.attendees.includes(parsed.data)) {
      setAttendeeDraft("");
      return;
    }
    setState((prev) => ({ ...prev, attendees: [...prev.attendees, parsed.data] }));
    setAttendeeDraft("");
    setFieldErrors((prev) => ({ ...prev, attendees: undefined }));
  }

  function removeAttendee(email: string) {
    setState((prev) => ({
      ...prev,
      attendees: prev.attendees.filter((a) => a !== email),
    }));
  }

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

    const timezone = getBrowserTimezone();
    const startUtc = fromZonedTime(parsed.data.startLocal, timezone);
    const endUtc = new Date(
      startUtc.getTime() + parsed.data.durationMinutes * 60_000,
    );

    mutation.mutate({
      summary: parsed.data.summary,
      description: parsed.data.description?.length
        ? parsed.data.description
        : null,
      start: startUtc.toISOString(),
      end: endUtc.toISOString(),
      attendees: parsed.data.attendees,
      addMeet: parsed.data.addMeet,
      timezone,
    });
  }

  const submitting = mutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="meeting-summary">Título</Label>
        <Input
          id="meeting-summary"
          value={state.summary}
          onChange={(e) =>
            setState((prev) => ({ ...prev, summary: e.target.value }))
          }
          placeholder="Reunión con cliente"
          aria-invalid={Boolean(fieldErrors.summary)}
          required
        />
        {fieldErrors.summary ? (
          <p className="text-destructive text-xs">{fieldErrors.summary}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="meeting-description">Descripción</Label>
        <Textarea
          id="meeting-description"
          value={state.description ?? ""}
          onChange={(e) =>
            setState((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder="Opcional"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="meeting-start">Inicio</Label>
          <Input
            id="meeting-start"
            type="datetime-local"
            value={state.startLocal}
            onChange={(e) =>
              setState((prev) => ({ ...prev, startLocal: e.target.value }))
            }
            aria-invalid={Boolean(fieldErrors.startLocal)}
            required
          />
          {fieldErrors.startLocal ? (
            <p className="text-destructive text-xs">{fieldErrors.startLocal}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meeting-duration">Duración</Label>
          <select
            id="meeting-duration"
            value={state.durationMinutes}
            onChange={(e) =>
              setState((prev) => ({
                ...prev,
                durationMinutes: Number(e.target.value),
              }))
            }
            className={cn(
              "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px]",
            )}
          >
            {DURATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="meeting-attendees">Asistentes</Label>
        <div className="flex flex-wrap gap-1.5">
          {state.attendees.map((email) => (
            <span
              key={email}
              className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs"
            >
              {email}
              <button
                type="button"
                onClick={() => removeAttendee(email)}
                aria-label={`Quitar ${email}`}
                className="hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <Input
          id="meeting-attendees"
          value={attendeeDraft}
          onChange={(e) => {
            setAttendeeDraft(e.target.value);
            setFieldErrors((prev) => ({ ...prev, attendees: undefined }));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addAttendeeFromDraft();
            }
          }}
          onBlur={addAttendeeFromDraft}
          placeholder="email@dominio.com"
          aria-invalid={Boolean(fieldErrors.attendees)}
        />
        {fieldErrors.attendees ? (
          <p className="text-destructive text-xs">{fieldErrors.attendees}</p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Enter o coma para agregar.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="meeting-meet">Agregar Google Meet</Label>
          <span className="text-muted-foreground text-xs">
            Genera el link automáticamente con la invitación.
          </span>
        </div>
        <Switch
          id="meeting-meet"
          checked={state.addMeet}
          onCheckedChange={(checked) =>
            setState((prev) => ({ ...prev, addMeet: checked }))
          }
        />
      </div>

      {fieldErrors.form ? (
        <p className="text-destructive text-sm" role="alert">
          {fieldErrors.form}
        </p>
      ) : null}

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
          {submitting ? "Creando…" : "Crear reunión"}
        </Button>
      </div>
    </form>
  );
}
