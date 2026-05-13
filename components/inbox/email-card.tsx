"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Archive,
  ArchiveRestore,
  Check,
  ExternalLink,
  ListPlus,
  Mail,
  Paperclip,
} from "lucide-react";

import { archiveEmailAction, markEmailReadAction } from "@/app/actions/emails";
import { convertEmailToTaskAction } from "@/app/actions/tasks";
import { EMAILS_INVALIDATION_KEY } from "@/components/inbox/use-emails";
import { TASKS_INVALIDATION_KEY } from "@/components/tasks/use-tasks";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import type { Email, EmailAiCategory } from "@/lib/gmail/types";
import { cn } from "@/lib/utils";

const CATEGORY_STYLE: Record<EmailAiCategory, string> = {
  URGENTE:
    "border-destructive/50 text-destructive bg-destructive/5",
  CLIENTE:
    "border-sky-500/50 text-sky-700 dark:text-sky-300 bg-sky-500/5",
  PROVEEDOR:
    "border-violet-500/50 text-violet-700 dark:text-violet-300 bg-violet-500/5",
  INTERNO:
    "border-emerald-500/50 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5",
  INFORMATIVO:
    "border-muted-foreground/30 text-muted-foreground",
  OTROS:
    "border-muted-foreground/30 text-muted-foreground",
};

function initialsFor(email: Email): string {
  const base = email.sender_name ?? email.sender_email ?? "?";
  return base
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function senderDisplay(email: Email): string {
  if (email.sender_name && email.sender_name.length > 0) return email.sender_name;
  return email.sender_email ?? "Sin remitente";
}

function gmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#inbox/${threadId}`;
}

function deadlineLabel(raw: string): string | null {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  try {
    return format(parseISO(`${match[1]}-${match[2]}-${match[3]}`), "d MMM", {
      locale: es,
    });
  } catch {
    return null;
  }
}

export function EmailCard({ email }: { email: Email }) {
  const queryClient = useQueryClient();

  const archiveMutation = useMutation({
    mutationFn: async (archived: boolean) => {
      const result = await archiveEmailAction({ id: email.id, archived });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMAILS_INVALIDATION_KEY });
    },
  });

  const readMutation = useMutation({
    mutationFn: async (read: boolean) => {
      const result = await markEmailReadAction({ id: email.id, read });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMAILS_INVALIDATION_KEY });
    },
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      const result = await convertEmailToTaskAction(email.id);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: TASKS_INVALIDATION_KEY });
      showToast({
        title: "Tarea creada",
        description: task.title,
        action: {
          label: "Ver",
          onClick: () => {
            window.location.href = "/tasks";
          },
        },
      });
    },
    onError: (err: Error) => {
      showToast({ title: "No se pudo crear", description: err.message });
    },
  });

  const received = parseISO(email.received_at);
  const timeLabel = format(received, "HH:mm");
  const ai = email.ai;
  const aiSummary = ai?.summary && ai.summary.length > 0 ? ai.summary : null;
  const aiDeadline = ai?.detected_deadline
    ? deadlineLabel(ai.detected_deadline)
    : null;

  const isUnread = !email.is_read;

  return (
    <li
      className={cn(
        "relative flex items-start gap-3 px-3 py-3 transition-colors",
        // Read mails get the subtle tint — unread stays clean so the
        // untouched ones stand out at a glance.
        !isUnread && "bg-sky-500/5",
        email.is_archived && "opacity-60",
      )}
    >
      {/* Strip on the left edge marks unread (in addition to clean bg). */}
      {isUnread ? (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-sky-500"
        />
      ) : null}

      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase",
          isUnread
            ? "bg-sky-500/15 text-sky-700 dark:text-sky-200"
            : "bg-muted text-muted-foreground",
        )}
      >
        {initialsFor(email)}
      </span>

      <a
        href={gmailThreadUrl(email.gmail_thread_id)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          if (isUnread) readMutation.mutate(true);
        }}
        className="min-w-0 flex-1 space-y-0.5"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              isUnread ? "font-semibold" : "text-muted-foreground font-medium",
            )}
          >
            {senderDisplay(email)}
          </span>
          <span className="text-muted-foreground shrink-0 text-[11px] font-mono tabular-nums">
            {timeLabel}
          </span>
        </div>
        {email.subject ? (
          <p
            className={cn(
              "line-clamp-1 text-sm leading-snug",
              isUnread ? "font-semibold" : "text-muted-foreground",
            )}
          >
            {email.subject}
          </p>
        ) : (
          <p className="text-muted-foreground line-clamp-1 text-sm italic">
            (sin asunto)
          </p>
        )}
        {aiSummary ? (
          <p className="text-muted-foreground line-clamp-2 text-xs leading-snug">
            {aiSummary}
          </p>
        ) : email.snippet || email.body_preview ? (
          <p className="text-muted-foreground line-clamp-1 text-xs">
            {email.snippet ?? email.body_preview}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {ai?.category ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                CATEGORY_STYLE[ai.category],
              )}
            >
              {ai.category.toLowerCase()}
            </span>
          ) : null}
          {ai?.campaign_code ? (
            <span className="inline-flex items-center rounded-full border border-violet-500/50 text-violet-700 dark:text-violet-300 bg-violet-500/5 px-1.5 py-0.5 text-[10px] font-mono">
              {ai.campaign_code}
            </span>
          ) : null}
          {typeof ai?.priority === "number" && ai.priority >= 70 ? (
            <span className="border-amber-500/60 text-amber-700 dark:text-amber-300 bg-amber-500/10 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              urgente {ai.priority}
            </span>
          ) : null}
          {aiDeadline ? (
            <span className="border-destructive/40 text-destructive bg-destructive/5 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
              vence {aiDeadline}
            </span>
          ) : null}
          {email.has_attachments ? (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
              <Paperclip className="size-3" />
              {email.attachments_meta?.length ?? 0}
            </span>
          ) : null}
          <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
            <ExternalLink className="size-3" />
            Abrir en Gmail
          </span>
        </div>
      </a>

      <div className="flex shrink-0 flex-col gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            readMutation.mutate(isUnread);
          }}
          disabled={readMutation.isPending}
          aria-label={isUnread ? "Marcar como leído" : "Marcar como no leído"}
          className="size-8"
          title={isUnread ? "Marcar como leído" : "Marcar como no leído"}
        >
          {isUnread ? <Check className="size-4" /> : <Mail className="size-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            convertMutation.mutate();
          }}
          disabled={convertMutation.isPending}
          aria-label="Crear tarea desde este mail"
          className="size-8"
          title="Crear tarea"
        >
          <ListPlus className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            archiveMutation.mutate(!email.is_archived);
          }}
          disabled={archiveMutation.isPending}
          aria-label={email.is_archived ? "Restaurar" : "Archivar"}
          className="size-8"
        >
          {email.is_archived ? (
            <ArchiveRestore className="size-4" />
          ) : (
            <Archive className="size-4" />
          )}
        </Button>
      </div>
    </li>
  );
}
