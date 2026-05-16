"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import { isAdminEmail } from "@/lib/auth/admin";
import {
  PROJECT_ITEM_CATEGORIES,
  PROJECT_ITEM_STATUSES,
  type ProjectItem,
  type ProjectItemCategory,
  type ProjectItemStatus,
} from "@/lib/projects/types";
import { createClient } from "@/lib/supabase/server";

const SELECT_COLUMNS = `
  id, user_id, project, title, category, status,
  due_date, link, position, created_at, updated_at
`;

const categorySchema = z.enum(
  PROJECT_ITEM_CATEGORIES as readonly [
    ProjectItemCategory,
    ...ProjectItemCategory[],
  ],
);
const statusSchema = z.enum(
  PROJECT_ITEM_STATUSES as readonly [ProjectItemStatus, ...ProjectItemStatus[]],
);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato YYYY-MM-DD");
const linkSchema = z.string().trim().max(2000);
const projectSchema = z.string().trim().min(1, "Falta el proyecto").max(120);
const titleSchema = z.string().trim().min(1, "Falta la tarea").max(500);

const createSchema = z.object({
  project: projectSchema,
  title: titleSchema,
  category: categorySchema.default("otros"),
  status: statusSchema.default("pending"),
  due_date: dateSchema.optional().nullable(),
  link: linkSchema.optional().nullable(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  project: projectSchema.optional(),
  title: titleSchema.optional(),
  category: categorySchema.optional(),
  status: statusSchema.optional(),
  due_date: dateSchema.optional().nullable(),
  link: linkSchema.optional().nullable(),
});

const renameProjectSchema = z.object({
  from: projectSchema,
  to: projectSchema,
});

export type CreateProjectItemInput = z.infer<typeof createSchema>;
export type UpdateProjectItemInput = z.infer<typeof updateSchema>;

async function requireAdmin(): Promise<
  | { ok: true; userId: string; email: string }
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
        message: "Iniciá sesión para administrar el board.",
      },
    };
  }
  if (!isAdminEmail(user.email)) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "forbidden",
        message: "Sólo Mariano puede editar el board de proyectos.",
      },
    };
  }
  return { ok: true, userId: user.id, email: user.email! };
}

async function requireReader(): Promise<
  | { ok: true; userId: string; isAdmin: boolean }
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
        message: "Iniciá sesión para ver el board.",
      },
    };
  }
  return { ok: true, userId: user.id, isAdmin: isAdminEmail(user.email) };
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

export async function listProjectItemsAction(): Promise<
  ActionResult<ProjectItem[]>
> {
  const auth = await requireReader();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_items")
      .select(SELECT_COLUMNS)
      .order("project", { ascending: true })
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { ok: true, data: (data ?? []) as ProjectItem[] };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createProjectItemAction(
  input: unknown,
): Promise<ActionResult<ProjectItem>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    // Append to the end of its project group.
    const { data: maxRow } = await supabase
      .from("project_items")
      .select("position")
      .eq("user_id", auth.userId)
      .eq("project", parsed.data.project)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = (maxRow?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from("project_items")
      .insert({
        user_id: auth.userId,
        project: parsed.data.project,
        title: parsed.data.title,
        category: parsed.data.category,
        status: parsed.data.status,
        due_date: parsed.data.due_date ?? null,
        link: parsed.data.link?.length ? parsed.data.link : null,
        position: nextPosition,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as ProjectItem };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function updateProjectItemAction(
  input: unknown,
): Promise<ActionResult<ProjectItem>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const patch: Record<string, unknown> = {};
    if (parsed.data.project !== undefined) patch.project = parsed.data.project;
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.category !== undefined) patch.category = parsed.data.category;
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    if (parsed.data.due_date !== undefined)
      patch.due_date = parsed.data.due_date ?? null;
    if (parsed.data.link !== undefined)
      patch.link = parsed.data.link?.length ? parsed.data.link : null;

    const { data, error } = await supabase
      .from("project_items")
      .update(patch)
      .eq("id", parsed.data.id)
      .eq("user_id", auth.userId)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as ProjectItem };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteProjectItemAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("project_items")
      .delete()
      .eq("id", parsed.data)
      .eq("user_id", auth.userId);
    if (error) throw new Error(error.message);
    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function renameProjectAction(
  input: unknown,
): Promise<ActionResult<{ from: string; to: string; count: number }>> {
  const parsed = renameProjectSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_items")
      .update({ project: parsed.data.to })
      .eq("user_id", auth.userId)
      .eq("project", parsed.data.from)
      .select("id");
    if (error) throw new Error(error.message);
    return {
      ok: true,
      data: {
        from: parsed.data.from,
        to: parsed.data.to,
        count: (data ?? []).length,
      },
    };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteProjectAction(
  project: string,
): Promise<ActionResult<{ project: string; count: number }>> {
  const parsed = projectSchema.safeParse(project);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_items")
      .delete()
      .eq("user_id", auth.userId)
      .eq("project", parsed.data)
      .select("id");
    if (error) throw new Error(error.message);
    return {
      ok: true,
      data: { project: parsed.data, count: (data ?? []).length },
    };
  } catch (err) {
    return asUnknown(err);
  }
}
