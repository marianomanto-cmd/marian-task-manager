"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import { createClient } from "@/lib/supabase/server";

export type TaskComment = {
  id: string;
  task_id: string;
  author_user_id: string | null;
  author_email: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS =
  "id, task_id, author_user_id, author_email, body, created_at, updated_at";

const idSchema = z.string().uuid();

const createSchema = z.object({
  task_id: z.string().uuid(),
  body: z.string().trim().min(1, "El comentario no puede estar vacío").max(8000),
});

async function requireUser(): Promise<
  | { ok: true; userId: string; email: string | null }
  | { ok: false; result: ActionResult<never> }
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
        message: "Iniciá sesión para comentar.",
      },
    };
  }
  return { ok: true, userId: user.id, email: user.email ?? null };
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

export async function listCommentsAction(
  taskId: string,
): Promise<ActionResult<TaskComment[]>> {
  const parsed = idSchema.safeParse(taskId);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("task_comments")
      .select(SELECT_COLUMNS)
      .eq("task_id", parsed.data)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { ok: true, data: (data ?? []) as TaskComment[] };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createCommentAction(
  input: unknown,
): Promise<ActionResult<TaskComment>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("task_comments")
      .insert({
        task_id: parsed.data.task_id,
        author_user_id: auth.userId,
        author_email: auth.email,
        body: parsed.data.body,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    const preview = parsed.data.body.slice(0, 200);

    // Best-effort activity log.
    try {
      await supabase.from("task_activity").insert({
        task_id: parsed.data.task_id,
        actor_user_id: auth.userId,
        actor_email: auth.email,
        action: "commented",
        payload: { comment_id: data.id, preview: preview.slice(0, 100) },
      });
    } catch {
      /* swallow */
    }

    return { ok: true, data: data as TaskComment };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteCommentAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    // RLS already restricts delete to the comment's own author.
    const { error } = await supabase
      .from("task_comments")
      .delete()
      .eq("id", parsed.data)
      .eq("author_user_id", auth.userId);
    if (error) throw new Error(error.message);
    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}
