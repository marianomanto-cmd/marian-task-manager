"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import { createClient } from "@/lib/supabase/server";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/types";

const SELECT_COLUMNS =
  "id, user_id, project_id, email_id, title, notes, status, priority, due_date, completed_at, created_at, updated_at";

const statusSchema = z.enum(TASK_STATUSES as readonly [TaskStatus, ...TaskStatus[]]);
const prioritySchema = z.enum(
  TASK_PRIORITIES as readonly [TaskPriority, ...TaskPriority[]],
);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato YYYY-MM-DD");

const listSchema = z.object({
  statuses: z.array(statusSchema).optional(),
  priorities: z.array(prioritySchema).optional(),
});

const createSchema = z.object({
  title: z.string().trim().min(1, "Falta el título").max(500),
  notes: z.string().trim().max(8000).optional().nullable(),
  status: statusSchema.default("todo"),
  priority: prioritySchema.default("medium"),
  due_date: dateSchema.optional().nullable(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(500).optional(),
  notes: z.string().trim().max(8000).optional().nullable(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  due_date: dateSchema.optional().nullable(),
});

export type CreateTaskInput = z.infer<typeof createSchema>;
export type UpdateTaskInput = z.infer<typeof updateSchema>;
export type ListTasksInput = z.infer<typeof listSchema>;

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
        message: "Iniciá sesión para gestionar tareas.",
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

export async function listTasksAction(
  input: ListTasksInput = {},
): Promise<ActionResult<Task[]>> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    let query = supabase.from("tasks").select(SELECT_COLUMNS);

    if (parsed.data.statuses && parsed.data.statuses.length > 0) {
      query = query.in("status", parsed.data.statuses);
    }
    if (parsed.data.priorities && parsed.data.priorities.length > 0) {
      query = query.in("priority", parsed.data.priorities);
    }

    // Open tasks first (by due then created), done last.
    const { data, error } = await query
      .order("status", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { ok: true, data: (data ?? []) as Task[] };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createTaskAction(
  input: unknown,
): Promise<ActionResult<Task>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: auth.userId,
        title: parsed.data.title,
        notes: parsed.data.notes ?? null,
        status: parsed.data.status,
        priority: parsed.data.priority,
        due_date: parsed.data.due_date ?? null,
        completed_at: parsed.data.status === "done" ? new Date().toISOString() : null,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as Task };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function updateTaskAction(
  input: unknown,
): Promise<ActionResult<Task>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();

    // Fetch current to compute completed_at transitions in one place.
    const { data: current, error: fetchErr } = await supabase
      .from("tasks")
      .select("status, completed_at")
      .eq("id", parsed.data.id)
      .eq("user_id", auth.userId)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);

    const patch: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes ?? null;
    if (parsed.data.priority !== undefined) patch.priority = parsed.data.priority;
    if (parsed.data.due_date !== undefined) {
      patch.due_date = parsed.data.due_date ?? null;
    }
    if (parsed.data.status !== undefined) {
      patch.status = parsed.data.status;
      if (parsed.data.status === "done" && current.status !== "done") {
        patch.completed_at = new Date().toISOString();
      } else if (parsed.data.status !== "done" && current.status === "done") {
        patch.completed_at = null;
      }
    }

    const { data, error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", parsed.data.id)
      .eq("user_id", auth.userId)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as Task };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function toggleTaskDoneAction(
  id: string,
  done: boolean,
): Promise<ActionResult<Task>> {
  const idSchema = z.string().uuid();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tasks")
      .update({
        status: done ? "done" : "todo",
        completed_at: done ? new Date().toISOString() : null,
      })
      .eq("id", parsed.data)
      .eq("user_id", auth.userId)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as Task };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteTaskAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const idSchema = z.string().uuid();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", parsed.data)
      .eq("user_id", auth.userId);
    if (error) throw new Error(error.message);
    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}

function aiToTaskPriority(score: number | null | undefined): TaskPriority {
  if (typeof score !== "number") return "medium";
  if (score >= 70) return "high";
  if (score < 30) return "low";
  return "medium";
}

function deadlineToDueDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function truncateTitle(s: string, max = 200): string {
  if (s.length <= max) return s.trim();
  // Cut at the last sentence boundary inside the budget, else hard cut.
  const slice = s.slice(0, max);
  const lastDot = slice.lastIndexOf(". ");
  if (lastDot > max * 0.4) return `${slice.slice(0, lastDot + 1).trim()}`;
  return `${slice.trim()}…`;
}

export async function convertEmailToTaskAction(
  emailId: string,
): Promise<ActionResult<Task>> {
  const idSchema = z.string().uuid();
  const parsed = idSchema.safeParse(emailId);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();

    // RLS already restricts to own emails; the explicit user_id filter is
    // belt-and-suspenders.
    const { data: email, error: emailErr } = await supabase
      .from("emails")
      .select(
        "id, subject, snippet, body_preview, ai:email_ai(summary, priority, detected_deadline, suggested_action)",
      )
      .eq("id", parsed.data)
      .eq("user_id", auth.userId)
      .single();
    if (emailErr) throw new Error(emailErr.message);
    if (!email) throw new Error("Mail no encontrado.");

    const aiField = email.ai;
    const ai = Array.isArray(aiField)
      ? (aiField[0] as {
          summary: string | null;
          priority: number | null;
          detected_deadline: string | null;
        } | undefined)
      : (aiField as
          | {
              summary: string | null;
              priority: number | null;
              detected_deadline: string | null;
            }
          | null
          | undefined);

    const title = truncateTitle(
      (ai?.summary && ai.summary.length > 0
        ? ai.summary
        : email.subject) ?? "(sin asunto)",
    );
    const priority = aiToTaskPriority(ai?.priority);
    const due_date = deadlineToDueDate(ai?.detected_deadline);
    const notes =
      (email.snippet ?? email.body_preview ?? "").slice(0, 1000) || null;

    const { data: created, error: insertErr } = await supabase
      .from("tasks")
      .insert({
        user_id: auth.userId,
        email_id: email.id,
        title,
        notes,
        status: "todo",
        priority,
        due_date,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (insertErr) throw new Error(insertErr.message);
    return { ok: true, data: created as Task };
  } catch (err) {
    return asUnknown(err);
  }
}
