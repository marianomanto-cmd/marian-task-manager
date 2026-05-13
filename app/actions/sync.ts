"use server";

import type { ActionResult } from "@/lib/actions/result";
import { GoogleAuthRequiredError } from "@/lib/google/auth";
import {
  getCurrentHistoryId,
  getMessage,
  listInitialMessageIds,
  listMessageIdsFromHistory,
} from "@/lib/gmail/sync";
import { createClient } from "@/lib/supabase/server";

const RATE_LIMIT_MS = 20_000;
const INITIAL_PULL_SIZE = 50;
const MAX_MESSAGES_PER_SYNC = 100;
const FETCH_BATCH_SIZE = 10;

export type SyncResult = {
  syncLogId: string;
  fetched: number;
  inserted: number;
  skipped: number;
  pendingAi: number;
  resetHistory: boolean;
  durationMs: number;
};

export async function syncGmailAction(): Promise<ActionResult<SyncResult>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: "auth_required",
      message: "Iniciá sesión para sincronizar el correo.",
    };
  }

  const upsert = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id }, { onConflict: "user_id" });
  if (upsert.error) {
    return { ok: false, code: "unknown", message: upsert.error.message };
  }

  const { data: settings, error: readErr } = await supabase
    .from("user_settings")
    .select("gmail_history_id, last_synced_at")
    .eq("user_id", user.id)
    .single();
  if (readErr) {
    return { ok: false, code: "unknown", message: readErr.message };
  }

  if (settings?.last_synced_at) {
    const elapsed = Date.now() - new Date(settings.last_synced_at).getTime();
    if (elapsed < RATE_LIMIT_MS) {
      const remaining = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
      return {
        ok: false,
        code: "rate_limited",
        message: `Esperá ${remaining}s antes de volver a sincronizar.`,
      };
    }
  }

  const { data: syncLogRow, error: openErr } = await supabase
    .from("sync_log")
    .insert({ user_id: user.id })
    .select("id")
    .single();
  if (openErr || !syncLogRow) {
    return {
      ok: false,
      code: "unknown",
      message: openErr?.message ?? "No se pudo abrir el sync_log.",
    };
  }
  const syncLogId = syncLogRow.id;

  const startedAt = Date.now();
  let resetHistory = false;

  try {
    let messageIds: string[] = [];
    let nextHistoryId: string | null = null;
    let readChanges: Map<string, boolean> = new Map();

    if (!settings?.gmail_history_id) {
      messageIds = await listInitialMessageIds(INITIAL_PULL_SIZE);
    } else {
      const delta = await listMessageIdsFromHistory(settings.gmail_history_id);
      if ("reset" in delta) {
        resetHistory = true;
        messageIds = await listInitialMessageIds(INITIAL_PULL_SIZE);
      } else {
        messageIds = delta.messageIds;
        nextHistoryId = delta.latestHistoryId;
        readChanges = delta.readChanges;
      }
    }

    // Apply UNREAD label changes that Gmail observed since last sync, so
    // reading a mail in Gmail flips the flag here too.
    if (readChanges.size > 0) {
      const readIds: string[] = [];
      const unreadIds: string[] = [];
      for (const [gid, isRead] of readChanges) {
        if (isRead) readIds.push(gid);
        else unreadIds.push(gid);
      }
      if (readIds.length > 0) {
        await supabase
          .from("emails")
          .update({ is_read: true })
          .eq("user_id", user.id)
          .in("gmail_message_id", readIds);
      }
      if (unreadIds.length > 0) {
        await supabase
          .from("emails")
          .update({ is_read: false })
          .eq("user_id", user.id)
          .in("gmail_message_id", unreadIds);
      }
    }

    let toFetch: string[] = [];
    if (messageIds.length > 0) {
      const { data: existing } = await supabase
        .from("emails")
        .select("gmail_message_id")
        .eq("user_id", user.id)
        .in("gmail_message_id", messageIds);
      const have = new Set(
        (existing ?? []).map((r) => r.gmail_message_id as string),
      );
      toFetch = messageIds.filter((id) => !have.has(id));
    }
    const skipped = messageIds.length - toFetch.length;
    toFetch = toFetch.slice(0, MAX_MESSAGES_PER_SYNC);

    type Parsed = NonNullable<Awaited<ReturnType<typeof getMessage>>>;
    const parsed: Parsed[] = [];
    for (let i = 0; i < toFetch.length; i += FETCH_BATCH_SIZE) {
      const batch = toFetch.slice(i, i + FETCH_BATCH_SIZE);
      const results = await Promise.all(batch.map((id) => getMessage(id)));
      for (const r of results) if (r) parsed.push(r);
    }

    let inserted = 0;
    if (parsed.length > 0) {
      const { data: rows, error: insertErr } = await supabase
        .from("emails")
        .insert(
          parsed.map((m) => ({
            user_id: user.id,
            gmail_message_id: m.gmail_message_id,
            gmail_thread_id: m.gmail_thread_id,
            sender_name: m.sender_name,
            sender_email: m.sender_email,
            subject: m.subject,
            snippet: m.snippet,
            body_preview: m.body_preview,
            received_at: m.received_at,
            has_attachments: m.has_attachments,
            attachments_meta: m.attachments_meta,
            is_read: m.is_read,
          })),
        )
        .select("id");
      if (insertErr) throw new Error(insertErr.message);
      inserted = rows?.length ?? 0;
    }

    if (!nextHistoryId) {
      nextHistoryId = await getCurrentHistoryId();
    }
    await supabase
      .from("user_settings")
      .update({
        gmail_history_id: nextHistoryId,
        last_synced_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    const { count: pendingAi } = await supabase
      .from("emails")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("id", "in", `(select email_id from email_ai)`);

    const durationMs = Date.now() - startedAt;
    await supabase
      .from("sync_log")
      .update({
        finished_at: new Date().toISOString(),
        messages_fetched: messageIds.length,
        messages_inserted: inserted,
        messages_skipped_already_processed: skipped,
      })
      .eq("id", syncLogId);

    return {
      ok: true,
      data: {
        syncLogId,
        fetched: messageIds.length,
        inserted,
        skipped,
        pendingAi: pendingAi ?? 0,
        resetHistory,
        durationMs,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";

    await supabase
      .from("sync_log")
      .update({
        finished_at: new Date().toISOString(),
        error: message,
      })
      .eq("id", syncLogId);

    if (err instanceof GoogleAuthRequiredError) {
      return { ok: false, code: "auth_required", message: err.message };
    }
    return { ok: false, code: "unknown", message };
  }
}
