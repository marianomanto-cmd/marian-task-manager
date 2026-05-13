"use server";

import { batchClassify } from "@/lib/anthropic/classify";
import type { ActionResult } from "@/lib/actions/result";
import { createClient } from "@/lib/supabase/server";

const MAX_AI_PER_RUN = 30;
const AI_BATCH_SIZE = 10;

export type AnalyzeResult = {
  syncLogId: string;
  processed: number;
  pendingRemaining: number;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  failedBatches: number;
  errorSummary: string | null;
};

/**
 * Manual AI classification — runs Claude on emails that don't yet have an
 * email_ai row. Capped at MAX_AI_PER_RUN per call. Never invoked from sync;
 * the user has to press the dedicated button so they always know when
 * Anthropic tokens are being spent.
 *
 * Opens a sync_log row with messages_fetched = 0 so cost tracking still
 * lives in one place.
 */
export async function analyzePendingEmailsAction(): Promise<
  ActionResult<AnalyzeResult>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: "auth_required",
      message: "Iniciá sesión para analizar la bandeja.",
    };
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

  try {
    const { count: totalPending } = await supabase
      .from("emails")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("id", "in", `(select email_id from email_ai)`);

    const { data: pendingRows, error: pendingErr } = await supabase
      .from("emails")
      .select(
        "id, sender_name, sender_email, subject, snippet, body_preview, received_at",
      )
      .eq("user_id", user.id)
      .not("id", "in", `(select email_id from email_ai)`)
      .order("received_at", { ascending: false })
      .limit(MAX_AI_PER_RUN);
    if (pendingErr) throw new Error(pendingErr.message);

    const rows = pendingRows ?? [];
    if (rows.length === 0) {
      await supabase
        .from("sync_log")
        .update({
          finished_at: new Date().toISOString(),
          messages_processed_ai: 0,
        })
        .eq("id", syncLogId);
      return {
        ok: true,
        data: {
          syncLogId,
          processed: 0,
          pendingRemaining: totalPending ?? 0,
          tokensInput: 0,
          tokensOutput: 0,
          estimatedCostUsd: 0,
          failedBatches: 0,
          errorSummary: null,
        },
      };
    }

    const inputs = rows.map((r) => ({
      id: r.id,
      from: r.sender_name
        ? `${r.sender_name} <${r.sender_email ?? ""}>`
        : (r.sender_email ?? "unknown"),
      subject: r.subject ?? "",
      body_preview: r.body_preview ?? r.snippet ?? "",
    }));

    const outcome = await batchClassify(inputs, AI_BATCH_SIZE);

    if (outcome.results.length > 0) {
      const insertRows = outcome.results.map((r) => ({
        email_id: r.id,
        category: r.category,
        summary: r.summary,
        priority: r.priority,
        campaign_code: r.campaign_code,
        detected_deadline: r.detected_deadline,
        suggested_action: r.suggested_action,
        requires_response: r.requires_response,
        model_version: outcome.modelVersion,
        prompt_version: outcome.promptVersion,
        tokens_input: 0,
        tokens_output: 0,
      }));
      const { error: insertErr } = await supabase
        .from("email_ai")
        .upsert(insertRows, { onConflict: "email_id", ignoreDuplicates: true });
      if (insertErr) throw new Error(insertErr.message);
    }

    const processed = outcome.results.length;
    const failedSummary =
      outcome.failedBatches.length > 0
        ? outcome.failedBatches.map((b) => b.error).join(" | ")
        : null;

    await supabase
      .from("sync_log")
      .update({
        finished_at: new Date().toISOString(),
        messages_processed_ai: processed,
        total_tokens_input: outcome.tokensInput,
        total_tokens_output: outcome.tokensOutput,
        estimated_cost_usd: outcome.estimatedCostUsd,
        error: failedSummary,
      })
      .eq("id", syncLogId);

    return {
      ok: true,
      data: {
        syncLogId,
        processed,
        pendingRemaining: Math.max((totalPending ?? rows.length) - processed, 0),
        tokensInput: outcome.tokensInput,
        tokensOutput: outcome.tokensOutput,
        estimatedCostUsd: outcome.estimatedCostUsd,
        failedBatches: outcome.failedBatches.length,
        errorSummary: failedSummary,
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
    return { ok: false, code: "unknown", message };
  }
}
