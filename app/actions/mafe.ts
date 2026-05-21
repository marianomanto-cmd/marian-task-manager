"use server";

import { createServerClient } from "@supabase/ssr";
import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import {
  MAFE_COLORS,
  MAFE_ITEM_CATEGORIES,
  MAFE_ITEM_STATUSES,
  mafePickStableColor,
  type MafeColor,
  type MafeGroup,
  type MafeItem,
  type MafeItemCategory,
  type MafeItemStatus,
  type MafeProjectMeta,
} from "@/lib/mafe/types";

const ITEM_COLUMNS = `
  id, project, title, description, category, status,
  due_date, link, position, archived_at, created_at, updated_at
`;
const META_COLUMNS = "project, color, emoji, group:grp, position";

const categorySchema = z.enum(
  MAFE_ITEM_CATEGORIES as readonly [MafeItemCategory, ...MafeItemCategory[]],
);
const statusSchema = z.enum(
  MAFE_ITEM_STATUSES as readonly [MafeItemStatus, ...MafeItemStatus[]],
);
const colorSchema = z.enum(
  MAFE_COLORS as readonly [MafeColor, ...MafeColor[]],
);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato YYYY-MM-DD");
const linkSchema = z.string().trim().max(2000);
const projectSchema = z.string().trim().min(1, "Falta el proyecto").max(120);
const titleSchema = z.string().trim().min(1, "Falta la tarea").max(500);
const descriptionSchema = z.string().trim().max(4000);
const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Falta el nombre del grupo")
  .max(120);

const archiveModeSchema = z.enum(["active", "archive"]).default("active");

const listSchema = z.object({
  archiveMode: archiveModeSchema.optional(),
});

const createItemSchema = z.object({
  project: projectSchema,
  title: titleSchema,
  category: categorySchema.default("otros"),
  status: statusSchema.default("pending"),
  due_date: dateSchema.optional().nullable(),
  link: linkSchema.optional().nullable(),
  description: descriptionSchema.optional().nullable(),
});

const createProjectSchema = z.object({
  name: projectSchema,
  group: z.string().trim().max(120).nullable().optional(),
  title: titleSchema,
  category: categorySchema.default("otros"),
});

const updateItemSchema = z.object({
  id: z.string().uuid(),
  project: projectSchema.optional(),
  title: titleSchema.optional(),
  description: descriptionSchema.optional().nullable(),
  category: categorySchema.optional(),
  status: statusSchema.optional(),
  due_date: dateSchema.optional().nullable(),
  link: linkSchema.optional().nullable(),
});

const renameProjectSchema = z.object({
  from: projectSchema,
  to: projectSchema,
});

const archiveProjectSchema = z.object({
  project: projectSchema,
  archive: z.boolean(),
});

const reorderItemsSchema = z.object({
  project: projectSchema,
  ids: z.array(z.string().uuid()).max(500),
});

const metaUpdateSchema = z.object({
  project: projectSchema,
  color: colorSchema.optional(),
  emoji: z.string().trim().max(8).nullable().optional(),
  group: z.string().trim().max(120).nullable().optional(),
});

export type ListMafeItemsInput = z.infer<typeof listSchema>;

/**
 * Anon Supabase client (no cookies, no session). Board - Mafe is a public,
 * no-login board, so every request goes through the anon role regardless of
 * whether an agency member happens to be signed in. RLS on the mafe_* tables
 * is permissive for anon.
 */
function mafeClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    },
  );
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

export type MafeBoardData = {
  items: MafeItem[];
  meta: MafeProjectMeta[];
  groups: MafeGroup[];
};

export async function listMafeBoardAction(
  input: ListMafeItemsInput = {},
): Promise<ActionResult<MafeBoardData>> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = mafeClient();
    let itemsQuery = supabase
      .from("mafe_project_items")
      .select(ITEM_COLUMNS)
      .order("project", { ascending: true })
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    const archiveMode = parsed.data.archiveMode ?? "active";
    if (archiveMode === "active") {
      itemsQuery = itemsQuery.is("archived_at", null);
    } else {
      itemsQuery = itemsQuery.not("archived_at", "is", null);
    }

    const [itemsRes, metaRes, groupsRes] = await Promise.all([
      itemsQuery,
      supabase
        .from("mafe_projects_meta")
        .select(META_COLUMNS)
        .order("position", { ascending: true })
        .order("project", { ascending: true }),
      supabase
        .from("mafe_groups")
        .select("name, position")
        .order("position", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (itemsRes.error) throw new Error(itemsRes.error.message);
    if (metaRes.error) throw new Error(metaRes.error.message);
    if (groupsRes.error) throw new Error(groupsRes.error.message);

    return {
      ok: true,
      data: {
        items: (itemsRes.data ?? []) as MafeItem[],
        meta: (metaRes.data ?? []) as MafeProjectMeta[],
        groups: (groupsRes.data ?? []) as MafeGroup[],
      },
    };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createMafeItemAction(
  input: unknown,
): Promise<ActionResult<MafeItem>> {
  const parsed = createItemSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = mafeClient();
    const { data: maxRow } = await supabase
      .from("mafe_project_items")
      .select("position")
      .eq("project", parsed.data.project)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = (maxRow?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from("mafe_project_items")
      .insert({
        project: parsed.data.project,
        title: parsed.data.title,
        description: parsed.data.description?.length
          ? parsed.data.description
          : null,
        category: parsed.data.category,
        status: parsed.data.status,
        due_date: parsed.data.due_date ?? null,
        link: parsed.data.link?.length ? parsed.data.link : null,
        position: nextPosition,
      })
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as MafeItem };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createMafeProjectAction(
  input: unknown,
): Promise<ActionResult<{ project: string; item: MafeItem }>> {
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = mafeClient();
    const name = parsed.data.name;

    const [existingMeta, existingItem] = await Promise.all([
      supabase
        .from("mafe_projects_meta")
        .select("project")
        .eq("project", name)
        .maybeSingle(),
      supabase
        .from("mafe_project_items")
        .select("id")
        .eq("project", name)
        .limit(1)
        .maybeSingle(),
    ]);
    if (existingMeta.data || existingItem.data)
      return asInvalid(`Ya existe un proyecto llamado "${name}".`);

    const { data: maxRow } = await supabase
      .from("mafe_projects_meta")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (maxRow?.position ?? -1) + 1;

    const group = parsed.data.group?.length ? parsed.data.group : null;
    const { error: metaError } = await supabase
      .from("mafe_projects_meta")
      .insert({
        project: name,
        color: mafePickStableColor(name),
        emoji: null,
        grp: group,
        position,
      });
    if (metaError) throw new Error(metaError.message);

    const { data: item, error: itemError } = await supabase
      .from("mafe_project_items")
      .insert({
        project: name,
        title: parsed.data.title,
        category: parsed.data.category,
        status: "pending",
        position: 0,
      })
      .select(ITEM_COLUMNS)
      .single();
    if (itemError) throw new Error(itemError.message);

    return { ok: true, data: { project: name, item: item as MafeItem } };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function updateMafeItemAction(
  input: unknown,
): Promise<ActionResult<MafeItem>> {
  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = mafeClient();
    const patch: Record<string, unknown> = {};
    if (parsed.data.project !== undefined) patch.project = parsed.data.project;
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.description !== undefined)
      patch.description = parsed.data.description?.length
        ? parsed.data.description
        : null;
    if (parsed.data.category !== undefined) patch.category = parsed.data.category;
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    if (parsed.data.due_date !== undefined)
      patch.due_date = parsed.data.due_date ?? null;
    if (parsed.data.link !== undefined)
      patch.link = parsed.data.link?.length ? parsed.data.link : null;

    const { data, error } = await supabase
      .from("mafe_project_items")
      .update(patch)
      .eq("id", parsed.data.id)
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as MafeItem };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function archiveMafeItemAction(
  id: string,
  archive: boolean,
): Promise<ActionResult<MafeItem>> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = mafeClient();
    const { data, error } = await supabase
      .from("mafe_project_items")
      .update({ archived_at: archive ? new Date().toISOString() : null })
      .eq("id", parsed.data)
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as MafeItem };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteMafeItemAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = mafeClient();
    const { error } = await supabase
      .from("mafe_project_items")
      .delete()
      .eq("id", parsed.data);
    if (error) throw new Error(error.message);
    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function renameMafeProjectAction(
  input: unknown,
): Promise<ActionResult<{ from: string; to: string; count: number }>> {
  const parsed = renameProjectSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = mafeClient();
    const { data, error } = await supabase
      .from("mafe_project_items")
      .update({ project: parsed.data.to })
      .eq("project", parsed.data.from)
      .select("id");
    if (error) throw new Error(error.message);

    await supabase
      .from("mafe_projects_meta")
      .update({ project: parsed.data.to })
      .eq("project", parsed.data.from);

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

export async function deleteMafeProjectAction(
  project: string,
): Promise<ActionResult<{ project: string; count: number }>> {
  const parsed = projectSchema.safeParse(project);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = mafeClient();
    const { data, error } = await supabase
      .from("mafe_project_items")
      .delete()
      .eq("project", parsed.data)
      .select("id");
    if (error) throw new Error(error.message);

    await supabase
      .from("mafe_projects_meta")
      .delete()
      .eq("project", parsed.data);

    return {
      ok: true,
      data: { project: parsed.data, count: (data ?? []).length },
    };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function archiveMafeProjectAction(
  input: unknown,
): Promise<ActionResult<{ project: string; count: number }>> {
  const parsed = archiveProjectSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = mafeClient();
    let q = supabase
      .from("mafe_project_items")
      .update({
        archived_at: parsed.data.archive ? new Date().toISOString() : null,
      })
      .eq("project", parsed.data.project);
    q = parsed.data.archive
      ? q.is("archived_at", null)
      : q.not("archived_at", "is", null);

    const { data, error } = await q.select("id");
    if (error) throw new Error(error.message);

    return {
      ok: true,
      data: { project: parsed.data.project, count: (data ?? []).length },
    };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function reorderMafeItemsAction(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = reorderItemsSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = mafeClient();
    await Promise.all(
      parsed.data.ids.map((id, idx) =>
        supabase
          .from("mafe_project_items")
          .update({ position: idx })
          .eq("id", id)
          .eq("project", parsed.data.project),
      ),
    );
    return { ok: true, data: { count: parsed.data.ids.length } };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function updateMafeMetaAction(
  input: unknown,
): Promise<ActionResult<MafeProjectMeta>> {
  const parsed = metaUpdateSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = mafeClient();
    const patch: Record<string, unknown> = {
      project: parsed.data.project,
    };
    if (parsed.data.color !== undefined) patch.color = parsed.data.color;
    if (parsed.data.emoji !== undefined)
      patch.emoji = parsed.data.emoji?.length ? parsed.data.emoji : null;
    if (parsed.data.group !== undefined)
      patch.grp = parsed.data.group?.length ? parsed.data.group : null;

    const { data, error } = await supabase
      .from("mafe_projects_meta")
      .upsert(patch, { onConflict: "project" })
      .select(META_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as MafeProjectMeta };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createMafeGroupAction(
  input: unknown,
): Promise<ActionResult<MafeGroup>> {
  const parsed = groupNameSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = mafeClient();
    const { data: maxRow } = await supabase
      .from("mafe_groups")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (maxRow?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from("mafe_groups")
      .upsert({ name: parsed.data, position }, { onConflict: "name" })
      .select("name, position")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as MafeGroup };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteMafeGroupAction(
  input: unknown,
): Promise<ActionResult<{ name: string }>> {
  const parsed = groupNameSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = mafeClient();
    const { error } = await supabase
      .from("mafe_groups")
      .delete()
      .eq("name", parsed.data);
    if (error) throw new Error(error.message);

    // Unassign any projects that referenced this group.
    await supabase
      .from("mafe_projects_meta")
      .update({ grp: null })
      .eq("grp", parsed.data);

    return { ok: true, data: { name: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}
