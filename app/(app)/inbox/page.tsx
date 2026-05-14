"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  differenceInCalendarDays,
  format,
  formatDistanceToNow,
  parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import { Inbox, RefreshCw } from "lucide-react";

import { AnalyzeButton } from "@/components/inbox/analyze-button";
import { EmailCard } from "@/components/inbox/email-card";
import { FilterPopover } from "@/components/inbox/filter-popover";
import { SavedFilterChips } from "@/components/inbox/saved-filter-chips";
import { SyncButton } from "@/components/inbox/sync-button";
import {
  EMAILS_INVALIDATION_KEY,
  PENDING_AI_INVALIDATION_KEY,
  SYNC_LOG_INVALIDATION_KEY,
  useEmails,
  useLastSync,
  usePendingAiCount,
} from "@/components/inbox/use-emails";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Email } from "@/lib/gmail/types";
import type { InboxFilter } from "@/lib/inbox/filter";
import { cn } from "@/lib/utils";

type ReadFilter = "all" | "unread" | "read";

type DayGroup = {
  key: string;
  label: string;
  emails: Email[];
};

function groupByDay(emails: Email[]): DayGroup[] {
  const today = new Date();
  const groups = new Map<string, DayGroup>();
  for (const email of emails) {
    const received = parseISO(email.received_at);
    const key = format(received, "yyyy-MM-dd");
    if (!groups.has(key)) {
      const diff = differenceInCalendarDays(today, received);
      let label: string;
      if (diff <= 0) label = "Hoy";
      else if (diff === 1) label = "Ayer";
      else if (diff < 7)
        label = format(received, "EEEE", { locale: es }).replace(/^\w/, (c) =>
          c.toUpperCase(),
        );
      else label = format(received, "d 'de' MMMM", { locale: es });
      groups.set(key, { key, label, emails: [] });
    }
    groups.get(key)!.emails.push(email);
  }
  return Array.from(groups.values());
}

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = React.useState<InboxFilter>({ archived: false });

  const readFilter: ReadFilter = filter.readState ?? "all";

  function setReadFilter(value: ReadFilter) {
    setFilter((prev) => ({
      ...prev,
      readState: value === "all" ? undefined : value,
    }));
  }

  function toggleArchived() {
    setFilter((prev) => ({ ...prev, archived: !prev.archived }));
  }

  const emailsQuery = useEmails(filter);
  const lastSyncQuery = useLastSync();
  const pendingAiQuery = usePendingAiCount();
  const emails = React.useMemo(
    () => emailsQuery.data?.emails ?? [],
    [emailsQuery.data?.emails],
  );
  const groups = React.useMemo(() => groupByDay(emails), [emails]);

  const lastSync = lastSyncQuery.data;
  const lastSyncLabel = lastSync?.finishedAt
    ? `Última sync ${formatDistanceToNow(parseISO(lastSync.finishedAt), {
        addSuffix: true,
        locale: es,
      })}${
        lastSync.messagesInserted > 0
          ? ` · ${lastSync.messagesInserted} nuevo${lastSync.messagesInserted === 1 ? "" : "s"}`
          : ""
      }${
        lastSync.messagesProcessedAi > 0
          ? ` · ${lastSync.messagesProcessedAi} procesado${lastSync.messagesProcessedAi === 1 ? "" : "s"} por IA`
          : ""
      }${
        lastSync.estimatedCostUsd > 0
          ? ` · ~$${lastSync.estimatedCostUsd.toFixed(4)} USD`
          : ""
      }`
    : "Todavía no sincronizaste";

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 md:px-6 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            Bandeja
          </h1>
          <p className="text-muted-foreground text-xs">{lastSyncLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Tabs
            value={readFilter}
            onValueChange={(v) => setReadFilter(v as ReadFilter)}
          >
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="unread">Sin leer</TabsTrigger>
              <TabsTrigger value="read">Leídos</TabsTrigger>
            </TabsList>
          </Tabs>
          <FilterPopover filter={filter} onChange={setFilter} />
          <Button
            type="button"
            variant={filter.archived ? "default" : "outline"}
            size="sm"
            onClick={toggleArchived}
          >
            {filter.archived ? "Mostrando archivados" : "Ver archivados"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: EMAILS_INVALIDATION_KEY });
              queryClient.invalidateQueries({ queryKey: SYNC_LOG_INVALIDATION_KEY });
              queryClient.invalidateQueries({ queryKey: PENDING_AI_INVALIDATION_KEY });
            }}
            disabled={emailsQuery.isFetching}
            aria-label="Refrescar lista"
          >
            <RefreshCw
              className={cn(emailsQuery.isFetching && "animate-spin")}
            />
          </Button>
          <AnalyzeButton pendingCount={pendingAiQuery.data ?? undefined} />
          <SyncButton />
        </div>
      </header>

      <SavedFilterChips current={filter} onApply={setFilter} />

      {emailsQuery.data?.authRequired ? (
        <div className="bg-amber-500/10 text-amber-800 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 px-3 py-2 text-sm">
          <span>Google necesita autorización nueva para leer tu Gmail.</span>
          <Button asChild size="sm" variant="outline">
            <Link href="/login">Volver a iniciar sesión</Link>
          </Button>
        </div>
      ) : null}

      {emailsQuery.data?.error && !emailsQuery.data.authRequired ? (
        <p className="text-destructive text-sm" role="alert">
          {emailsQuery.data.error}
        </p>
      ) : null}

      {lastSync?.error ? (
        <p className="text-destructive text-xs" role="alert">
          Última sync con error: {lastSync.error}
        </p>
      ) : null}

      {emailsQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando mails…</p>
      ) : groups.length === 0 ? (
        <div className="bg-muted/30 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Inbox className="text-muted-foreground size-8" />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {filter.archived ? "No hay mails archivados" : "Sin mails todavía"}
            </p>
            <p className="text-muted-foreground text-xs">
              {filter.archived
                ? "Volvé a la bandeja principal para archivar."
                : "Tocá Sincronizar para traer los últimos 50."}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.key} className="space-y-2">
              <h2 className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
                {group.label}
              </h2>
              <ul className="divide-border bg-card divide-y rounded-lg border">
                {group.emails.map((email) => (
                  <EmailCard key={email.id} email={email} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
