"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import type { Email, EmailAi } from "@/lib/gmail/types";
import { createClient } from "@/lib/supabase/server";

const AI_COLUMNS =
  "email_id, category, summary, priority, campaign_code, detected_deadline, suggested_action, requires_response, model_version, prompt_version, processed_at";

const SELECT_COLUMNS = `
  id, user_id, gmail_message_id, gmail_thread_id, project_id,
  sender_name, sender_email, subject, snippet, body_preview,
  received_at, has_attachments, attachments_meta, is_archived, is_read,
  created_at,
  ai:email_ai(${AI_COLUMNS})
`;

const listSchema = z.object({
  archived: z.boolean().optional(),
  /**
   * 'unread' → only is_read = false rows.
   * 'read'   → only is_read = true rows.
   * undefined → no filter.
   */
  readState: z.enum(["unread", "read"]).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const archiveSchema = z.object({
  id: z.string().uuid(),
  archived: z.boolean(),
});

const readSchema = z.object({
  id: z.string().uuid(),
  read: z.boolean(),
});

export type ListEmailsInput = z.infer<typeof listSchema>;

async function requireUserId(): Promise<
  { ok: true; userId: string } | { ok: false; result: ActionResult<never> }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "auth_required",
        message: "Iniciá sesión para ver la bandeja.",
      },
    };
  }
  return { ok: true, userId: user.id };
}

function asInvalid(message: string): ActionResult<never> {
  return { ok: false, code: "invalid_input", message };
}

function asUnknown(err: unknown): ActionResult<never> {
  return {
    ok: false,
    code: "unknown",
    message: err instanceof Error ? err.message : "Error desconocido",
  };
}

function normalizeEmailRow(raw: unknown): Email {
  const r = raw as Record<string, unknown>;
  const aiField = r.ai;
  let ai: EmailAi | null = null;
  if (Array.isArray(aiField)) {
    ai = (aiField[0] as EmailAi | undefined) ?? null;
  } else if (aiField && typeof aiField === "object") {
    ai = aiField as EmailAi;
  }
  return { ...(r as Omit<Email, "ai">), ai };
}

export async function listEmailsAction(
  input: ListEmailsInput = {},
): Promise<ActionResult<Email[]>> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    let query = supabase
      .from("emails")
      .select(SELECT_COLUMNS)
      .eq("user_id", auth.userId)
      .order("received_at", { ascending: false })
      .limit(parsed.data.limit ?? 100);

    if (parsed.data.archived !== undefined) {
      query = query.eq("is_archived", parsed.data.archived);
    }
    if (parsed.data.readState === "unread") {
      query = query.eq("is_read", false);
    } else if (parsed.data.readState === "read") {
      query = query.eq("is_read", true);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true, data: (data ?? []).map(normalizeEmailRow) };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function markEmailReadAction(
  input: unknown,
): Promise<ActionResult<Email>> {
  const parsed = readSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("emails")
      .update({ is_read: parsed.data.read })
      .eq("id", parsed.data.id)
      .eq("user_id", auth.userId)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: normalizeEmailRow(data) };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function archiveEmailAction(
  input: unknown,
): Promise<ActionResult<Email>> {
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("emails")
      .update({ is_archived: parsed.data.archived })
      .eq("id", parsed.data.id)
      .eq("user_id", auth.userId)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: normalizeEmailRow(data) };
  } catch (err) {
    return asUnknown(err);
  }
}

export type LastSyncSummary = {
  finishedAt: string | null;
  durationMs: number | null;
  messagesInserted: number;
  messagesFetched: number;
  messagesProcessedAi: number;
  estimatedCostUsd: number;
  error: string | null;
};

export async function getLastSyncAction(): Promise<
  ActionResult<LastSyncSummary | null>
> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sync_log")
      .select(
        "started_at, finished_at, messages_inserted, messages_fetched, messages_processed_ai, estimated_cost_usd, error",
      )
      .eq("user_id", auth.userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return { ok: true, data: null };

    const startedMs = new Date(data.started_at).getTime();
    const finishedMs = data.finished_at
      ? new Date(data.finished_at).getTime()
      : null;

    return {
      ok: true,
      data: {
        finishedAt: data.finished_at,
        durationMs: finishedMs !== null ? finishedMs - startedMs : null,
        messagesInserted: data.messages_inserted ?? 0,
        messagesFetched: data.messages_fetched ?? 0,
        messagesProcessedAi: data.messages_processed_ai ?? 0,
        estimatedCostUsd: Number(data.estimated_cost_usd ?? 0),
        error: data.error ?? null,
      },
    };
  } catch (err) {
    return asUnknown(err);
  }
}
