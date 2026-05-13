"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import { createClient } from "@/lib/supabase/server";

export type ActivityAction =
  | "created"
  | "updated"
  | "status_changed"
  | "assigned"
  | "unassigned"
  | "commented"
  | "deleted";

export type ActivityEntry = {
  id: string;
  task_id: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  action: ActivityAction;
  payload: Record<string, unknown>;
  created_at: string;
  task_title: string | null;
};

const inputSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  taskId: z.string().uuid().optional(),
});

export type ListActivityInput = z.infer<typeof inputSchema>;

async function requireUser(): Promise<
  { ok: true } | { ok: false; result: ActionResult<never> }
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
        message: "Iniciá sesión para ver el feed de actividad.",
      },
    };
  }
  return { ok: true };
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

export async function listActivityAction(
  input: ListActivityInput = {},
): Promise<ActionResult<ActivityEntry[]>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    let query = supabase
      .from("task_activity")
      .select(
        "id, task_id, actor_user_id, actor_email, action, payload, created_at, task:tasks(title)",
      )
      .order("created_at", { ascending: false })
      .limit(parsed.data.limit ?? 50);

    if (parsed.data.taskId) {
      query = query.eq("task_id", parsed.data.taskId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      const taskField = r.task;
      const taskTitle =
        Array.isArray(taskField) && taskField.length > 0
          ? ((taskField[0] as { title?: string }).title ?? null)
          : taskField && typeof taskField === "object"
            ? ((taskField as { title?: string }).title ?? null)
            : null;
      return {
        id: r.id as string,
        task_id: (r.task_id as string | null) ?? null,
        actor_user_id: (r.actor_user_id as string | null) ?? null,
        actor_email: (r.actor_email as string | null) ?? null,
        action: r.action as ActivityAction,
        payload:
          (r.payload as Record<string, unknown> | null) ?? ({} as Record<string, unknown>),
        created_at: r.created_at as string,
        task_title: taskTitle,
      } satisfies ActivityEntry;
    });

    return { ok: true, data: rows };
  } catch (err) {
    return asUnknown(err);
  }
}
