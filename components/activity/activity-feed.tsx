"use client";

import * as React from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { useActivity } from "@/components/activity/use-activity";
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/tasks/types";
import { displayNameForEmail, getMemberByKey } from "@/lib/team/members";
import { cn } from "@/lib/utils";
import type { ActivityEntry, ActivityAction } from "@/app/actions/activity";

function describe(entry: ActivityEntry): string {
  const actor = displayNameForEmail(entry.actor_email);
  const taskRef = entry.task_title
    ? `"${entry.task_title.length > 60 ? entry.task_title.slice(0, 57) + "…" : entry.task_title}"`
    : "una tarea";

  const action = entry.action as ActivityAction;
  const payload = entry.payload ?? {};

  switch (action) {
    case "created":
      return `${actor} creó ${taskRef}`;
    case "deleted": {
      const title = (payload.title as string | undefined) ?? "(sin título)";
      return `${actor} eliminó la tarea "${title}"`;
    }
    case "status_changed": {
      const to = payload.to as TaskStatus | undefined;
      const label = to ? TASK_STATUS_LABEL[to] : "otro estado";
      return `${actor} cambió ${taskRef} a ${label}`;
    }
    case "assigned": {
      const memberKey = payload.member_key as string | undefined;
      const memberName = memberKey
        ? (getMemberByKey(memberKey)?.name ?? memberKey)
        : "alguien";
      return `${actor} asignó ${taskRef} a ${memberName}`;
    }
    case "unassigned": {
      const memberKey = payload.member_key as string | undefined;
      const memberName = memberKey
        ? (getMemberByKey(memberKey)?.name ?? memberKey)
        : "alguien";
      return `${actor} desasignó a ${memberName} de ${taskRef}`;
    }
    case "commented": {
      const preview = (payload.preview as string | undefined) ?? "";
      return `${actor} comentó en ${taskRef}${preview ? `: "${preview}"` : ""}`;
    }
    case "updated": {
      const fields = (payload.fields as string[] | undefined) ?? [];
      if (fields.length === 0) {
        return `${actor} editó ${taskRef}`;
      }
      const labels = fields.map(fieldLabel).join(", ");
      return `${actor} actualizó ${labels} en ${taskRef}`;
    }
    default:
      return `${actor} hizo algo en ${taskRef}`;
  }
}

function fieldLabel(field: string): string {
  switch (field) {
    case "title":
      return "el título";
    case "notes":
      return "las notas";
    case "priority":
      return "la prioridad";
    case "due_date":
      return "la fecha de vencimiento";
    default:
      return field;
  }
}

function initialsFor(actor: string): string {
  return actor
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ActivityFeed() {
  const { data, isLoading, error } = useActivity(50);

  if (isLoading) {
    return (
      <p className="text-muted-foreground text-sm">Cargando actividad…</p>
    );
  }
  if (error) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {error instanceof Error ? error.message : "Error desconocido"}
      </p>
    );
  }
  const entries = data?.entries ?? [];
  const lastSeenAt = data?.lastSeenAt ?? null;
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No hay actividad reciente.
      </p>
    );
  }
  const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;

  return (
    <ul className="divide-border divide-y">
      {entries.map((entry) => {
        const actor = displayNameForEmail(entry.actor_email);
        const initials = initialsFor(actor);
        const text = describe(entry);
        const createdMs = new Date(entry.created_at).getTime();
        const isUnseen = createdMs > lastSeenMs;
        const relative = formatDistanceToNow(parseISO(entry.created_at), {
          addSuffix: true,
          locale: es,
        });
        return (
          <li
            key={entry.id}
            className={cn(
              "flex items-start gap-3 px-3 py-3",
              isUnseen && "bg-sky-500/5",
            )}
          >
            <span
              aria-hidden
              className="bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase"
            >
              {initials}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p
                className={cn(
                  "text-sm leading-snug",
                  isUnseen && "font-medium",
                )}
              >
                {text}
              </p>
              <p className="text-muted-foreground text-[10px]">{relative}</p>
            </div>
            {isUnseen ? (
              <span
                aria-hidden
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-500"
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
