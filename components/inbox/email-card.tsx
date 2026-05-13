"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Archive, ArchiveRestore, ExternalLink, Paperclip } from "lucide-react";

import { archiveEmailAction } from "@/app/actions/emails";
import { EMAILS_INVALIDATION_KEY } from "@/components/inbox/use-emails";
import { Button } from "@/components/ui/button";
import type { Email } from "@/lib/gmail/types";
import { cn } from "@/lib/utils";

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

  const received = parseISO(email.received_at);
  const timeLabel = format(received, "HH:mm");

  return (
    <li
      className={cn(
        "flex items-start gap-3 px-3 py-3",
        email.is_archived && "opacity-60",
      )}
    >
      <span
        aria-hidden
        className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase"
      >
        {initialsFor(email)}
      </span>

      <a
        href={gmailThreadUrl(email.gmail_thread_id)}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 space-y-0.5"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">
            {senderDisplay(email)}
          </span>
          <span className="text-muted-foreground shrink-0 text-[11px] font-mono tabular-nums">
            {timeLabel}
          </span>
        </div>
        {email.subject ? (
          <p className="line-clamp-1 text-sm leading-snug">{email.subject}</p>
        ) : (
          <p className="text-muted-foreground line-clamp-1 text-sm italic">
            (sin asunto)
          </p>
        )}
        {email.snippet || email.body_preview ? (
          <p className="text-muted-foreground line-clamp-1 text-xs">
            {email.snippet ?? email.body_preview}
          </p>
        ) : null}
        <div className="flex items-center gap-2 pt-1">
          {email.has_attachments ? (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
              <Paperclip className="size-3" />
              {email.attachments_meta?.length ?? 0} adj.
            </span>
          ) : null}
          <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
            <ExternalLink className="size-3" />
            Abrir en Gmail
          </span>
        </div>
      </a>

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
        className="size-8 shrink-0"
      >
        {email.is_archived ? (
          <ArchiveRestore className="size-4" />
        ) : (
          <Archive className="size-4" />
        )}
      </Button>
    </li>
  );
}
