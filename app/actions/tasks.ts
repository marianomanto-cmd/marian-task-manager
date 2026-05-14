"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import { notifyTaskEvent } from "@/lib/slack/notify";
import { createClient } from "@/lib/supabase/server";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/types";

const SELECT_COLUMNS = `
  id, user_id, project_id, email_id, title, notes, status, priority,
  due_date, completed_at, created_at, updated_at, link,
  assignees:task_assignees(member_key),
  notified:task_notified(member_key)
`;

const statusSchema = z.enum(TASK_STATUSES as readonly [TaskStatus, ...TaskStatus[]]);
const prioritySchema = z.enum(
  TASK_PRIORITIES as readonly [TaskPriority, ...TaskPriority[]],
);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato YYYY-MM-DD");
const memberKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9_-]{1,32}$/, "Member key inválido");

const archiveModeSchema = z.enum(["active", "archive", "all"]).default("active");

const listSchema = z.object({
  statuses: z.array(statusSchema).optional(),
  priorities: z.array(prioritySchema).optional(),
  archiveMode: archiveModeSchema.optional(),
  assignee_keys: z.array(memberKeySchema).max(20).optional(),
});

const linkSchema = z.string().trim().max(2000);

const createSchema = z.object({
  title: z.string().trim().min(1, "Falta el título").max(500),
  notes: z.string().trim().max(8000).optional().nullable(),
  status: statusSchema.default("todo"),
  priority: prioritySchema.default("medium"),
  due_date: dateSchema.optional().nullable(),
  link: linkSchema.optional().nullable(),
  assignee_keys: z.array(memberKeySchema).max(20).default([]),
  notified_keys: z.array(memberKeySchema).max(20).default([]),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(500).optional(),
  notes: z.string().trim().max(8000).optional().nullable(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  due_date: dateSchema.optional().nullable(),
  link: linkSchema.optional().nullable(),
  assignee_keys: z.array(memberKeySchema).max(20).optional(),
  notified_keys: z.array(memberKeySchema).max(20).optional(),
});

export type CreateTaskInput = z.infer<typeof createSchema>;
export type UpdateTaskInput = z.infer<typeof updateSchema>;
export type ListTasksInput = z.infer<typeof listSchema>;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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
        message: "Iniciá sesión para gestionar tareas.",
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

function memberKeysFrom(field: unknown): string[] {
  return Array.isArray(field)
    ? field
        .map((a) => (a as { member_key?: string }).member_key)
        .filter((k): k is string => typeof k === "string")
    : [];
}

function normalizeTaskRow(raw: unknown): Task {
  const r = { ...(raw as Record<string, unknown>) };
  const assignees = memberKeysFrom(r.assignees);
  const notified = memberKeysFrom(r.notified);
  delete r.assignees;
  delete r.notified;
  return {
    ...(r as Omit<Task, "assignees" | "notified">),
    assignees,
    notified,
  };
}

/**
 * Best-effort activity write. Never throws — we don't want a logging error
 * to fail the parent task action.
 */
async function logActivity(
  supabase: SupabaseServerClient,
  args: {
    taskId: string | null;
    actorUserId: string;
    actorEmail: string | null;
    action:
      | "created"
      | "updated"
      | "status_changed"
      | "assigned"
      | "unassigned"
      | "commented"
      | "deleted";
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await supabase.from("task_activity").insert({
      task_id: args.taskId,
      actor_user_id: args.actorUserId,
      actor_email: args.actorEmail,
      action: args.action,
      payload: args.payload ?? {},
    });
  } catch {
    /* swallow */
  }
}

async function fetchTaskById(
  supabase: SupabaseServerClient,
  id: string,
): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data ? normalizeTaskRow(data) : null;
}

async function setAssigneesAndLog(
  supabase: SupabaseServerClient,
  taskId: string,
  taskTitle: string,
  nextKeys: string[],
  currentKeys: string[],
  actorUserId: string,
  actorEmail: string | null,
  options: { notifyAssigned?: boolean } = {},
): Promise<{ added: string[]; removed: string[] }> {
  const currentSet = new Set(currentKeys);
  const nextSet = new Set(nextKeys);
  const toAdd = [...nextSet].filter((k) => !currentSet.has(k));
  const toRemove = [...currentSet].filter((k) => !nextSet.has(k));

  if (toAdd.length > 0) {
    const { error } = await supabase.from("task_assignees").insert(
      toAdd.map((member_key) => ({
        task_id: taskId,
        member_key,
        assigned_by: actorUserId,
      })),
    );
    if (error) throw new Error(error.message);
    for (const member_key of toAdd) {
      await logActivity(supabase, {
        taskId,
        actorUserId,
        actorEmail,
        action: "assigned",
        payload: { member_key },
      });
      if (options.notifyAssigned) {
        await notifyTaskEvent({
          kind: "assigned",
          taskId,
          title: taskTitle,
          newAssigneeKey: member_key,
          actorEmail,
        });
      }
    }
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", taskId)
      .in("member_key", toRemove);
    if (error) throw new Error(error.message);
    for (const member_key of toRemove) {
      await logActivity(supabase, {
        taskId,
        actorUserId,
        actorEmail,
        action: "unassigned",
        payload: { member_key },
      });
    }
  }

  return { added: toAdd, removed: toRemove };
}

/**
 * Diffs the task's "notified" set and persists it. Notified people are kept
 * in the loop but don't own the task — we don't write task_activity rows for
 * them (the feed tracks ownership), only Slack DMs for newly added ones when
 * `options.notify` is set.
 */
async function setNotifiedMembers(
  supabase: SupabaseServerClient,
  taskId: string,
  taskTitle: string,
  nextKeys: string[],
  currentKeys: string[],
  actorUserId: string,
  actorEmail: string | null,
  options: { notify?: boolean } = {},
): Promise<void> {
  const currentSet = new Set(currentKeys);
  const nextSet = new Set(nextKeys);
  const toAdd = [...nextSet].filter((k) => !currentSet.has(k));
  const toRemove = [...currentSet].filter((k) => !nextSet.has(k));

  if (toAdd.length > 0) {
    const { error } = await supabase.from("task_notified").insert(
      toAdd.map((member_key) => ({
        task_id: taskId,
        member_key,
        notified_by: actorUserId,
      })),
    );
    if (error) throw new Error(error.message);
    if (options.notify) {
      for (const member_key of toAdd) {
        await notifyTaskEvent({
          kind: "notified",
          taskId,
          title: taskTitle,
          newNotifiedKey: member_key,
          actorEmail,
        });
      }
    }
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("task_notified")
      .delete()
      .eq("task_id", taskId)
      .in("member_key", toRemove);
    if (error) throw new Error(error.message);
  }
}

export async function listTasksAction(
  input: ListTasksInput = {},
): Promise<ActionResult<Task[]>> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUser();
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

    // Filter by assignee: pull matching task ids from task_assignees and
    // restrict the main query. Tasks with no assignees are excluded when
    // a filter is set — that matches the "show me my pending" intent.
    if (parsed.data.assignee_keys && parsed.data.assignee_keys.length > 0) {
      const { data: rows, error: aErr } = await supabase
        .from("task_assignees")
        .select("task_id")
        .in("member_key", parsed.data.assignee_keys);
      if (aErr) throw new Error(aErr.message);
      const ids = Array.from(
        new Set((rows ?? []).map((r) => r.task_id as string)),
      );
      if (ids.length === 0) {
        return { ok: true, data: [] };
      }
      query = query.in("id", ids);
    }

    // Archive split: a task is "archived" when it was completed >7 days ago.
    // The default active view excludes those; the archive view shows only them.
    const archiveMode = parsed.data.archiveMode ?? "active";
    const cutoffIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    if (archiveMode === "active") {
      query = query.or(`completed_at.is.null,completed_at.gt.${cutoffIso}`);
    } else if (archiveMode === "archive") {
      query = query.not("completed_at", "is", null).lt("completed_at", cutoffIso);
    }

    const { data, error } = await query
      .order("status", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { ok: true, data: (data ?? []).map(normalizeTaskRow) };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createTaskAction(
  input: unknown,
): Promise<ActionResult<Task>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data: insertRow, error } = await supabase
      .from("tasks")
      .insert({
        user_id: auth.userId,
        title: parsed.data.title,
        notes: parsed.data.notes ?? null,
        status: parsed.data.status,
        priority: parsed.data.priority,
        due_date: parsed.data.due_date ?? null,
        link: parsed.data.link?.length ? parsed.data.link : null,
        completed_at:
          parsed.data.status === "done" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (!insertRow) throw new Error("Insert no devolvió fila.");

    const taskId = insertRow.id as string;

    // Persist initial assignees (if any) and log them. We skip the per-key
    // "assigned" Slack DM on create — we send a single combined "created"
    // notification below to avoid spamming.
    if (parsed.data.assignee_keys.length > 0) {
      await setAssigneesAndLog(
        supabase,
        taskId,
        parsed.data.title,
        parsed.data.assignee_keys,
        [],
        auth.userId,
        auth.email,
      );
    }

    // Persist initial notified members. No per-key DM — the combined
    // "created" notification below covers them too.
    if (parsed.data.notified_keys.length > 0) {
      await setNotifiedMembers(
        supabase,
        taskId,
        parsed.data.title,
        parsed.data.notified_keys,
        [],
        auth.userId,
        auth.email,
      );
    }

    await logActivity(supabase, {
      taskId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      action: "created",
      payload: { title: parsed.data.title },
    });

    await notifyTaskEvent({
      kind: "created",
      taskId,
      title: parsed.data.title,
      assigneeKeys: parsed.data.assignee_keys,
      notifiedKeys: parsed.data.notified_keys,
      actorEmail: auth.email,
    });

    const refreshed = await fetchTaskById(supabase, taskId);
    if (!refreshed) throw new Error("No se pudo releer la tarea creada.");
    return { ok: true, data: refreshed };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function updateTaskAction(
  input: unknown,
): Promise<ActionResult<Task>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();

    // Read current state for completed_at transition logic + activity diffs.
    const { data: current, error: fetchErr } = await supabase
      .from("tasks")
      .select(
        "id, status, completed_at, title, notes, priority, due_date, link, assignees:task_assignees(member_key), notified:task_notified(member_key)",
      )
      .eq("id", parsed.data.id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);

    const currentKeys = memberKeysFrom(current.assignees);
    const currentNotifiedKeys = memberKeysFrom(current.notified);

    const patch: Record<string, unknown> = {};
    const changedFields: string[] = [];

    if (
      parsed.data.title !== undefined &&
      parsed.data.title !== current.title
    ) {
      patch.title = parsed.data.title;
      changedFields.push("title");
    }
    if (
      parsed.data.notes !== undefined &&
      (parsed.data.notes ?? null) !== (current.notes ?? null)
    ) {
      patch.notes = parsed.data.notes ?? null;
      changedFields.push("notes");
    }
    if (
      parsed.data.priority !== undefined &&
      parsed.data.priority !== current.priority
    ) {
      patch.priority = parsed.data.priority;
      changedFields.push("priority");
    }
    if (
      parsed.data.due_date !== undefined &&
      (parsed.data.due_date ?? null) !== (current.due_date ?? null)
    ) {
      patch.due_date = parsed.data.due_date ?? null;
      changedFields.push("due_date");
    }
    if (parsed.data.link !== undefined) {
      const nextLink = parsed.data.link?.length ? parsed.data.link : null;
      if (nextLink !== (current.link ?? null)) {
        patch.link = nextLink;
        changedFields.push("link");
      }
    }
    let statusChange: { from: TaskStatus; to: TaskStatus } | null = null;
    if (
      parsed.data.status !== undefined &&
      parsed.data.status !== current.status
    ) {
      patch.status = parsed.data.status;
      statusChange = { from: current.status as TaskStatus, to: parsed.data.status };
      if (parsed.data.status === "done" && current.status !== "done") {
        patch.completed_at = new Date().toISOString();
      } else if (parsed.data.status !== "done" && current.status === "done") {
        patch.completed_at = null;
      }
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase
        .from("tasks")
        .update(patch)
        .eq("id", parsed.data.id);
      if (error) throw new Error(error.message);
    }

    if (parsed.data.assignee_keys !== undefined) {
      await setAssigneesAndLog(
        supabase,
        parsed.data.id,
        current.title as string,
        parsed.data.assignee_keys,
        currentKeys,
        auth.userId,
        auth.email,
        { notifyAssigned: true },
      );
    }

    if (parsed.data.notified_keys !== undefined) {
      await setNotifiedMembers(
        supabase,
        parsed.data.id,
        current.title as string,
        parsed.data.notified_keys,
        currentNotifiedKeys,
        auth.userId,
        auth.email,
        { notify: true },
      );
    }

    if (statusChange) {
      await logActivity(supabase, {
        taskId: parsed.data.id,
        actorUserId: auth.userId,
        actorEmail: auth.email,
        action: "status_changed",
        payload: statusChange,
      });
    }
    // Only log generic 'updated' for non-status field changes.
    const nonStatusFields = changedFields.filter((f) => f !== "status");
    if (nonStatusFields.length > 0) {
      await logActivity(supabase, {
        taskId: parsed.data.id,
        actorUserId: auth.userId,
        actorEmail: auth.email,
        action: "updated",
        payload: { fields: nonStatusFields },
      });
    }

    // Slack: announce status change + field edits using the member sets we
    // just wrote (i.e. the new keys).
    const finalKeys =
      parsed.data.assignee_keys !== undefined
        ? parsed.data.assignee_keys
        : currentKeys;
    const finalNotifiedKeys =
      parsed.data.notified_keys !== undefined
        ? parsed.data.notified_keys
        : currentNotifiedKeys;
    if (statusChange) {
      await notifyTaskEvent({
        kind: "status_changed",
        taskId: parsed.data.id,
        title: current.title as string,
        assigneeKeys: finalKeys,
        notifiedKeys: finalNotifiedKeys,
        from: statusChange.from,
        to: statusChange.to,
        actorEmail: auth.email,
      });
    }
    if (nonStatusFields.length > 0) {
      await notifyTaskEvent({
        kind: "updated",
        taskId: parsed.data.id,
        title: current.title as string,
        assigneeKeys: finalKeys,
        notifiedKeys: finalNotifiedKeys,
        fields: nonStatusFields,
        actorEmail: auth.email,
      });
    }

    const refreshed = await fetchTaskById(supabase, parsed.data.id);
    if (!refreshed) throw new Error("No se pudo releer la tarea.");
    return { ok: true, data: refreshed };
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

  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data: current, error: readErr } = await supabase
      .from("tasks")
      .select(
        "status, title, assignees:task_assignees(member_key), notified:task_notified(member_key)",
      )
      .eq("id", parsed.data)
      .single();
    if (readErr) throw new Error(readErr.message);

    const nextStatus: TaskStatus = done ? "done" : "todo";
    const { error } = await supabase
      .from("tasks")
      .update({
        status: nextStatus,
        completed_at: done ? new Date().toISOString() : null,
      })
      .eq("id", parsed.data);
    if (error) throw new Error(error.message);

    await logActivity(supabase, {
      taskId: parsed.data,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      action: "status_changed",
      payload: { from: current.status as TaskStatus, to: nextStatus },
    });

    await notifyTaskEvent({
      kind: "status_changed",
      taskId: parsed.data,
      title: current.title as string,
      assigneeKeys: memberKeysFrom(current.assignees),
      notifiedKeys: memberKeysFrom(current.notified),
      from: current.status as TaskStatus,
      to: nextStatus,
      actorEmail: auth.email,
    });

    const refreshed = await fetchTaskById(supabase, parsed.data);
    if (!refreshed) throw new Error("No se pudo releer la tarea.");
    return { ok: true, data: refreshed };
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

  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    // Capture title for the activity payload before the row vanishes.
    const { data: current } = await supabase
      .from("tasks")
      .select("title")
      .eq("id", parsed.data)
      .single();

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", parsed.data);
    if (error) throw new Error(error.message);

    await logActivity(supabase, {
      taskId: null,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      action: "deleted",
      payload: { title: current?.title ?? "(sin título)" },
    });

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

  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
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
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    await logActivity(supabase, {
      taskId: created.id,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      action: "created",
      payload: { title, source: "email", email_id: email.id },
    });

    const refreshed = await fetchTaskById(supabase, created.id);
    if (!refreshed) throw new Error("No se pudo releer la tarea.");
    return { ok: true, data: refreshed };
  } catch (err) {
    return asUnknown(err);
  }
}
